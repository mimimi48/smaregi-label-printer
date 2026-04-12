import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { PDFDocument } from 'pdf-lib';
import { renderLabel } from '../label/renderer.js';
import { getConfig } from '../config.js';
import { getProfile } from '../printer/profiles.js';

const router = Router();

// 1mm = 2.835pt (72pt/inch / 25.4mm/inch)
const MM_TO_PT = 72 / 25.4;

/**
 * POST /api/print-pdf
 * AirPrint用: ラベルPDFを埋め込んだ印刷ページを返す
 * Body: { items: [{ productName, janCode, quantity }] }
 */
router.post('/', async (req, res, next) => {
  try {
    let items = req.body.items;
    if (typeof items === 'string') {
      items = JSON.parse(items);
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: '印刷する商品を指定してください' });
    }

    const config = getConfig();
    const profile = getProfile(config.printerModel, config.labelSize);
    const pageWidth = profile.widthMm * MM_TO_PT;
    const pageHeight = profile.heightMm * MM_TO_PT;

    const pdfDoc = await PDFDocument.create();

    for (const item of items) {
      if (!item?.productName || typeof item.productName !== 'string' || item.productName.length > 200) continue;
      if (!item?.janCode || !/^\d{8,14}$/.test(item.janCode)) continue;

      const quantity = Math.min(Math.max(1, item.quantity || 1), 50);
      const png = await renderLabel({ productName: item.productName, janCode: item.janCode }, profile);
      const pngImage = await pdfDoc.embedPng(png);

      for (let i = 0; i < quantity; i++) {
        const page = pdfDoc.addPage([pageWidth, pageHeight]);

        const imgAspect = pngImage.width / pngImage.height;
        const pageAspect = pageWidth / pageHeight;

        let drawWidth, drawHeight, drawX, drawY;
        if (imgAspect > pageAspect) {
          drawWidth = pageWidth;
          drawHeight = pageWidth / imgAspect;
          drawX = 0;
          drawY = (pageHeight - drawHeight) / 2;
        } else {
          drawHeight = pageHeight;
          drawWidth = pageHeight * imgAspect;
          drawX = (pageWidth - drawWidth) / 2;
          drawY = 0;
        }

        page.drawImage(pngImage, {
          x: drawX,
          y: drawY,
          width: drawWidth,
          height: drawHeight,
        });
      }
    }

    if (pdfDoc.getPageCount() === 0) {
      return res.status(400).json({ error: '有効な商品がありません' });
    }

    const pdfBytes = await pdfDoc.save();
    const pdfBase64 = Buffer.from(pdfBytes).toString('base64');
    const pageCount = pdfDoc.getPageCount();
    const nonce = randomBytes(16).toString('base64');

    res.set('Content-Security-Policy',
      `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; frame-src blob: data:; frame-ancestors 'none'`
    );
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ラベル印刷 (${pageCount}枚)</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    background: #f5f5f5;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
  }
  .toolbar {
    position: sticky;
    top: 0;
    z-index: 10;
    background: white;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #ddd;
    gap: 12px;
  }
  .toolbar-info {
    font-size: 15px;
    font-weight: 600;
    color: #333;
  }
  .btn-print {
    padding: 10px 28px;
    background: #4466cc;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    flex-shrink: 0;
  }
  .btn-print:active { background: #3355bb; }
  .pdf-container {
    flex: 1;
    display: flex;
    justify-content: center;
    padding: 16px;
  }
  .pdf-container iframe {
    width: 100%;
    max-width: 600px;
    height: calc(100dvh - 80px);
    border: 1px solid #ddd;
    border-radius: 8px;
    background: white;
  }
</style>
</head>
<body>
<div class="toolbar">
  <span class="toolbar-info">${pageCount}枚のラベル</span>
  <button class="btn-print" id="printBtn">プリント</button>
</div>
<div class="pdf-container">
  <iframe id="pdfFrame" src="data:application/pdf;base64,${pdfBase64}"></iframe>
</div>
<script nonce="${nonce}">
document.getElementById('printBtn').addEventListener('click', function() {
  var frame = document.getElementById('pdfFrame');
  try {
    frame.contentWindow.focus();
    frame.contentWindow.print();
  } catch(e) {
    // クロスオリジンでiframe印刷できない場合はPDFを直接開く
    var blob = new Blob([Uint8Array.from(atob('${pdfBase64}'), function(c){return c.charCodeAt(0)})], {type:'application/pdf'});
    window.open(URL.createObjectURL(blob), '_blank');
  }
});
</script>
</body>
</html>`);
  } catch (err) {
    next(err);
  }
});

export default router;
