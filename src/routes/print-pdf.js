import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { renderLabel } from '../label/renderer.js';
import { getConfig } from '../config.js';
import { getProfile } from '../printer/profiles.js';

const router = Router();

/**
 * POST /api/print-pdf
 * AirPrint用: ラベル画像をHTMLページとして返す
 * iOSのSafariで開いて共有→プリントで印刷
 * Body: { items: [{ productName, janCode, quantity }] }
 */
router.post('/', async (req, res, next) => {
  try {
    // JSONまたはフォーム送信に対応
    let items = req.body.items;
    if (typeof items === 'string') {
      items = JSON.parse(items);
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: '印刷する商品を指定してください' });
    }

    const config = getConfig();
    const profile = getProfile(config.printerModel, config.labelSize);
    const w = profile.widthMm;
    const h = profile.heightMm;

    // nonce-based CSP（インラインスクリプト用）
    const nonce = randomBytes(16).toString('base64');
    res.set('Content-Security-Policy',
      `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'none'`
    );
    res.set('Content-Type', 'text/html; charset=utf-8');

    // ストリーミングレスポンス（メモリ効率向上）
    res.write(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ラベル印刷</title>
<style>
  @page {
    margin: 0;
    size: ${w}mm ${h}mm;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: white; }
  .label {
    page-break-after: always;
    break-after: page;
    width: ${w}mm;
    height: ${h}mm;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .label:last-child {
    page-break-after: auto;
    break-after: auto;
  }
  .label img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .size-hint {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: #f0c040;
    color: #333;
    text-align: center;
    padding: 12px 16px;
    font-size: 15px;
    font-weight: bold;
    z-index: 200;
    line-height: 1.5;
  }
  .size-hint small {
    display: block;
    font-weight: normal;
    font-size: 13px;
    margin-top: 4px;
  }
  @media screen {
    body { background: #eee; display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 60px 16px 80px; }
    .label { background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.15); padding: 8px; border-radius: 4px; width: auto; height: auto; max-width: 90vw; }
    .label img { width: auto; height: auto; max-width: 100%; max-height: 60vh; }
    .print-btn {
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
      padding: 14px 40px; background: #4466cc; color: white; border: none;
      border-radius: 10px; font-size: 18px; font-weight: bold; cursor: pointer;
      z-index: 100;
    }
  }
  @media print {
    .print-btn, .size-hint { display: none !important; }
  }
</style>
</head>
<body>
<div class="size-hint">
  用紙サイズを「${w} x ${h}mm」に設定してください
  <small>印刷オプション → 用紙サイズ → ${w} x ${h}mm を選択</small>
</div>
`);

    let hasLabels = false;

    for (const item of items) {
      if (!item?.productName || typeof item.productName !== 'string' || item.productName.length > 200) continue;
      if (!item?.janCode || !/^\d{8,14}$/.test(item.janCode)) continue;

      const quantity = Math.min(Math.max(1, item.quantity || 1), 50);
      const png = await renderLabel({ productName: item.productName, janCode: item.janCode }, profile);
      const base64 = png.toString('base64');

      for (let i = 0; i < quantity; i++) {
        res.write(`<div class="label"><img src="data:image/png;base64,${base64}"></div>\n`);
        hasLabels = true;
      }
    }

    if (!hasLabels) {
      res.end(`<p>有効な商品がありません</p></body></html>`);
      return;
    }

    res.end(`<button class="print-btn" id="printBtn">印刷する</button>
<script nonce="${nonce}">
document.getElementById('printBtn').addEventListener('click',function(){window.print()});
Promise.all(Array.from(document.images).map(function(img){
  if(img.complete)return Promise.resolve();
  return new Promise(function(r){img.onload=r;img.onerror=r});
})).then(function(){setTimeout(function(){window.print()},400)});
</script>
</body>
</html>`);
  } catch (err) {
    next(err);
  }
});

export default router;
