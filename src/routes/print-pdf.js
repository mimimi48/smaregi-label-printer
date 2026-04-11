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
  // 印刷ページはインラインスクリプトが必要なのでCSPを緩和
  res.removeHeader('Content-Security-Policy');
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
    const widthMm = profile.widthMm;
    const heightMm = profile.heightMm;

    const images = [];

    for (const item of items) {
      if (!item?.productName || !item?.janCode) continue;
      if (!/^\d{8,14}$/.test(item.janCode)) continue;
      const quantity = Math.min(Math.max(1, item.quantity || 1), 50);
      const png = await renderLabel({ productName: item.productName, janCode: item.janCode }, profile);
      const base64 = png.toString('base64');

      for (let i = 0; i < quantity; i++) {
        images.push(base64);
      }
    }

    if (images.length === 0) {
      return res.status(400).json({ error: '有効な商品がありません' });
    }

    const labelsHtml = images.map((b64) =>
      `<div class="label"><img src="data:image/png;base64,${b64}"></div>`
    ).join('\n');

    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ラベル印刷</title>
<style>
  @page { margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: white; }
  .label {
    page-break-after: always;
    break-after: page;
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .label:last-child {
    page-break-after: auto;
    break-after: auto;
  }
  .label img {
    display: block;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  @media screen {
    body { background: #eee; display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 16px; }
    .label { background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.15); width: auto; height: auto; padding: 16px; }
    .print-btn {
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
      padding: 14px 40px; background: #4466cc; color: white; border: none;
      border-radius: 10px; font-size: 18px; font-weight: bold; cursor: pointer;
      z-index: 100;
    }
  }
  @media print { .print-btn { display: none !important; } }
</style>
</head>
<body>
${labelsHtml}
<button class="print-btn" id="printBtn">印刷する</button>
<script>document.getElementById('printBtn').addEventListener('click',function(){window.print()});</script>
</body>
</html>`;

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    next(err);
  }
});

export default router;
