import { Router } from 'express';
import { searchProducts } from '../smaregi/client.js';

const router = Router();

/**
 * GET /api/products?q=keyword&page=1
 * スマレジ商品マスタを検索
 */
router.get('/', async (req, res, next) => {
  try {
    const query = req.query.q || '';
    const page = parseInt(req.query.page, 10) || 1;

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

export default router;
