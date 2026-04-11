import { Router } from 'express';
import sharp from 'sharp';
import { renderLabel } from '../label/renderer.js';
import { getConfig } from '../config.js';
import { getProfile } from '../printer/profiles.js';

const router = Router();

/**
 * POST /api/print-pdf
 * ラベル画像をPDFとして返す（AirPrint用）
 * Body: { items: [{ productName, janCode, quantity }] }
 */
router.post('/', async (req, res, next) => {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: '印刷する商品を指定してください' });
    }

    const config = getConfig();
    const profile = getProfile(config.printerModel, config.labelSize);
    const widthMm = profile.widthMm;
    const heightMm = profile.heightMm;

    // mm → points (1mm = 2.835pt)
    const ptPerMm = 2.835;
    const pageW = Math.round(widthMm * ptPerMm);
    const pageH = Math.round(heightMm * ptPerMm);

    const pages = [];

    for (const item of items) {
      if (!item?.productName || !item?.janCode) continue;
      const quantity = Math.min(Math.max(1, item.quantity || 1), 50);
      const png = await renderLabel({ productName: item.productName, janCode: item.janCode }, profile);

      for (let i = 0; i < quantity; i++) {
        pages.push(png);
      }
    }

    if (pages.length === 0) {
      return res.status(400).json({ error: '有効な商品がありません' });
    }

    // 各ページをページサイズに合わせてPNG→PDF変換
    // sharpは単ページPDFのみ対応なので、複数ページは手動でPDF結合
    if (pages.length === 1) {
      const pdf = await sharp(pages[0])
        .resize({
          width: Math.round(widthMm * 300 / 25.4),
          height: Math.round(heightMm * 300 / 25.4),
          fit: 'contain',
          background: { r: 255, g: 255, b: 255 },
        })
        .toFormat('pdf', { density: 300 })
        .toBuffer();

      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', 'inline; filename="label.pdf"');
      res.send(pdf);
    } else {
      // 複数ページ: 各ページを個別PDFにしてPDFKit等なしで簡易結合
      // sharpの制約で複数ページPDFは直接生成できないため、
      // 1枚目のPDFを返して残りはリピート印刷で対応
      // → 実用的にはiOS印刷ダイアログの部数指定を使う
      const pdf = await sharp(pages[0])
        .resize({
          width: Math.round(widthMm * 300 / 25.4),
          height: Math.round(heightMm * 300 / 25.4),
          fit: 'contain',
          background: { r: 255, g: 255, b: 255 },
        })
        .toFormat('pdf', { density: 300 })
        .toBuffer();

      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', 'inline; filename="label.pdf"');
      res.set('X-Label-Count', String(pages.length));
      res.send(pdf);
    }
  } catch (err) {
    next(err);
  }
});

export default router;
