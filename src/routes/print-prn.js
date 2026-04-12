import { Router } from 'express';
import { renderLabelRaw } from '../label/renderer.js';
import { encodeLabel, toMonochromeBitmap } from '../printer/brother-ql.js';
import { getConfig } from '../config.js';
import { getProfile } from '../printer/profiles.js';

const router = Router();

const MAX_ITEMS = 20;
const MAX_QUANTITY_PER_ITEM = 50;

/**
 * GET /api/print-prn?productName=...&janCode=...&copies=1
 * 単品PRNダウンロード
 */
router.get('/', async (req, res, next) => {
  try {
    const { productName, janCode } = req.query;
    const copies = Math.min(Math.max(1, parseInt(req.query.copies, 10) || 1), MAX_QUANTITY_PER_ITEM);

    if (!productName || typeof productName !== 'string' || productName.length > 200) {
      return res.status(400).json({ error: '商品名が無効です' });
    }
    if (!janCode || !/^\d{8,14}$/.test(janCode)) {
      return res.status(400).json({ error: 'JANコードが無効です' });
    }

    const prn = await buildPrn([{ productName, janCode, quantity: copies }]);

    res.set('Content-Type', 'application/octet-stream');
    res.set('Content-Disposition', 'attachment; filename="label.prn"');
    res.set('Cache-Control', 'no-cache');
    res.send(prn);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/print-prn
 * バッチPRNダウンロード（キュー全体）
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
    if (items.length > MAX_ITEMS) {
      return res.status(400).json({ error: `一度に${MAX_ITEMS}商品まで指定できます` });
    }

    const validItems = items
      .filter((item) => item && typeof item === 'object')
      .filter((item) => item.productName && typeof item.productName === 'string' && item.productName.length <= 200)
      .filter((item) => item.janCode && /^\d{8,14}$/.test(item.janCode))
      .map((item) => ({
        productName: item.productName,
        janCode: item.janCode,
        quantity: Math.min(Math.max(1, item.quantity || 1), MAX_QUANTITY_PER_ITEM),
      }));

    if (validItems.length === 0) {
      return res.status(400).json({ error: '有効な商品がありません' });
    }

    const prn = await buildPrn(validItems);

    res.set('Content-Type', 'application/octet-stream');
    res.set('Content-Disposition', 'attachment; filename="labels.prn"');
    res.set('Cache-Control', 'no-cache');
    res.send(prn);
  } catch (err) {
    next(err);
  }
});

/**
 * アイテムリストからPRNバイナリを生成
 */
async function buildPrn(items) {
  const config = getConfig();
  const profile = getProfile(config.printerModel, config.labelSize);

  const totalLabels = items.reduce((sum, item) => sum + item.quantity, 0);
  let labelIndex = 0;
  const buffers = [];

  for (const item of items) {
    const { data, width, height } = await renderLabelRaw(
      { productName: item.productName, janCode: item.janCode },
      profile,
    );
    const bitmap = toMonochromeBitmap(data, width, height, 1);

    for (let i = 0; i < item.quantity; i++) {
      labelIndex++;
      const isLast = labelIndex === totalLabels;
      const autoCut = config.cutMode === 'each';
      const cutAtEnd = config.cutMode !== 'none' && isLast;
      buffers.push(encodeLabel(bitmap, { autoCut, cutAtEnd, profile }));
    }
  }

  return Buffer.concat(buffers);
}

export default router;
