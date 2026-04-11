import { Router } from 'express';
import { renderLabelRaw } from '../label/renderer.js';
import { encodeLabel, toMonochromeBitmap } from '../printer/brother-ql.js';
import { sendToConfiguredPrinter } from '../printer/sender.js';
import { getConfig } from '../config.js';

const router = Router();

const MAX_ITEMS = 20;
const MAX_QUANTITY_PER_ITEM = 50;

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

    if (items.length > MAX_ITEMS) {
      return res.status(400).json({ error: `一度に${MAX_ITEMS}商品まで印刷できます` });
    }

    const results = [];
    let printed = 0;
    let failed = 0;
    const totalPrints = countPrintableLabels(items);
    let printIndex = 0;

    for (const item of items) {
      if (!item || typeof item !== 'object') {
        results.push({ status: 'error', message: '商品データが無効です' });
        failed++;
        continue;
      }

      const { productName, janCode } = item;
      const quantity = normalizeQuantity(item.quantity);

      if (!isValidProductName(productName)) {
        results.push({ productName, status: 'error', message: '商品名が無効です' });
        failed++;
        continue;
      }
      if (!isValidJanCode(janCode)) {
        results.push({ productName, status: 'error', message: 'JANコードが無効です' });
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
          printIndex++;
          const isLastPrint = printIndex === totalPrints;
          const printData = encodeLabel(bitmap, { autoCut: getConfig().autoCut, cutAtEnd: isLastPrint });
          await sendToConfiguredPrinter(printData);
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

function countPrintableLabels(items) {
  return items.reduce((sum, item) => {
    if (!item || typeof item !== 'object') return sum;
    if (!isValidProductName(item.productName) || !isValidJanCode(item.janCode)) return sum;
    return sum + normalizeQuantity(item.quantity);
  }, 0);
}

function normalizeQuantity(quantity) {
  return Math.min(Math.max(1, quantity || 1), MAX_QUANTITY_PER_ITEM);
}

function isValidProductName(productName) {
  return !!productName && typeof productName === 'string' && productName.length <= 200;
}

function isValidJanCode(janCode) {
  return !!janCode && /^\d{8,14}$/.test(janCode);
}

export default router;
