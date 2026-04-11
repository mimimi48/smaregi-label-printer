import { Router } from 'express';
import { renderLabel } from '../label/renderer.js';
import { getConfig } from '../config.js';
import { getProfile } from '../printer/profiles.js';

const router = Router();

/**
 * GET /api/preview?productName=...&janCode=...
 * ラベルのプレビュー画像をPNGで返す
 */
router.get('/', async (req, res, next) => {
  try {
    const { productName, janCode } = req.query;

    if (!productName || typeof productName !== 'string' || productName.length > 200) {
      return res.status(400).json({ error: '商品名が無効です' });
    }
    if (!janCode || !/^\d{8,14}$/.test(janCode)) {
      return res.status(400).json({ error: 'JANコードが無効です（8〜14桁の数字）' });
    }

    const config = getConfig();
    const profile = getProfile(config.printerModel, config.labelSize);
    const png = await renderLabel({ productName, janCode }, profile);

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-cache');
    res.send(png);
  } catch (err) {
    next(err);
  }
});

export default router;
