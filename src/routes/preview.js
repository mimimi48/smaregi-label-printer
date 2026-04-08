import { Router } from 'express';
import { renderLabel } from '../label/renderer.js';

const router = Router();

/**
 * GET /api/preview?productName=...&janCode=...
 * ラベルのプレビュー画像をPNGで返す
 */
router.get('/', async (req, res, next) => {
  try {
    const { productName, janCode } = req.query;

    if (!productName || !janCode) {
      return res.status(400).json({ error: '商品名とJANコードを指定してください' });
    }

    const png = await renderLabel({ productName, janCode });

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-cache');
    res.send(png);
  } catch (err) {
    next(err);
  }
});

export default router;
