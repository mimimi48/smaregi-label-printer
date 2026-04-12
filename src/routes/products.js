import { Router } from 'express';
import { searchProducts, clearProductCache } from '../smaregi/client.js';

const router = Router();

/**
 * GET /api/products?q=keyword&page=1
 * スマレジ商品マスタを検索
 */
router.get('/', async (req, res, next) => {
  try {
    const query = String(req.query.q || '').slice(0, 100).trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);

    const result = await searchProducts(query, { page });

    res.json({
      products: result.products,
      totalCount: result.totalCount,
      page,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/products/refresh
 * 商品マスタキャッシュをクリアして再取得
 */
router.post('/refresh', async (req, res, next) => {
  try {
    clearProductCache();
    const result = await searchProducts('', { page: 1 });
    res.json({ ok: true, totalCount: result.totalCount });
  } catch (err) {
    next(err);
  }
});

export default router;
