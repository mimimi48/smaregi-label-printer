import { Router } from 'express';
import { renderLabelRaw } from '../label/renderer.js';
import { encodeLabel, toMonochromeBitmap } from '../printer/brother-ql.js';
import { sendToPrinter } from '../printer/tcp-client.js';

const router = Router();

/**
 * POST /api/print
 * ラベルを印刷
 * Body: { items: [{ productName, janCode, quantity }] }
 */
router.post('/', async (req, res, next) => {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: '印刷する商品を指定してください' });
    }

    const results = [];
    let printed = 0;
    let failed = 0;

    for (const item of items) {
      const { productName, janCode, quantity = 1 } = item;

      if (!productName || !janCode) {
        results.push({ productName, status: 'error', message: '商品名またはJANコードが不足' });
        failed++;
        continue;
      }

      try {
        // ラベル画像をレンダリング
        const { data, width, height } = await renderLabelRaw({ productName, janCode });

        // モノクロビットマップに変換
        const bitmap = toMonochromeBitmap(data, width, height, 1);

        // Brother QLコマンドにエンコード
        for (let i = 0; i < quantity; i++) {
          const printData = encodeLabel(bitmap, { autoCut: true });
          await sendToPrinter(printData);
          printed++;
        }

        results.push({ productName, janCode, quantity, status: 'ok' });
      } catch (err) {
        results.push({ productName, status: 'error', message: err.message });
        failed++;
      }
    }

    res.json({ printed, failed, results });
  } catch (err) {
    next(err);
  }
});

export default router;
