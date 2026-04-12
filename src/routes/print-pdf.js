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
 * AirPrint用: ラベル画像を正しい用紙サイズのPDFとして返す
 * iOSがPDFのページサイズをそのまま使うため、用紙サイズ不一致が起きない
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

    // アイテム数と合計枚数を制限
    items = items.slice(0, 50);
    const totalPages = items.reduce((sum, i) => sum + Math.min(Math.max(1, i.quantity || 1), 50), 0);
    if (totalPages > 200) {
      return res.status(400).json({ error: '一度に印刷できるのは200枚までです' });
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

        // ラベル画像をページ全体にフィット（アスペクト比維持）
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

    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', 'inline; filename="labels.pdf"');
    res.set('Cache-Control', 'no-cache');
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    next(err);
  }
});

export default router;
