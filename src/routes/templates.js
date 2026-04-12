import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const TEMPLATES_PATH = join(DATA_DIR, 'templates.json');

const router = Router();

function loadTemplates() {
  try {
    const raw = readFileSync(TEMPLATES_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveTemplates(templates) {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  writeFileSync(TEMPLATES_PATH, JSON.stringify(templates, null, 2), 'utf-8');
}

/**
 * GET /api/templates
 * テンプレート一覧を取得
 */
router.get('/', (req, res) => {
  res.json(loadTemplates());
});

function stripHtml(str) {
  return str.replace(/<[^>]*>/g, '');
}

const MAX_TEMPLATES = 100;
const MAX_ITEMS_PER_TEMPLATE = 500;
const MAX_NAME_LENGTH = 100;
const MAX_PRODUCT_NAME_LENGTH = 200;

function sanitizeTemplates(raw) {
  if (!Array.isArray(raw)) return null;
  const templates = raw.slice(0, MAX_TEMPLATES);

  return templates.map(tpl => {
    if (!tpl || typeof tpl !== 'object') return null;

    const name = stripHtml(String(tpl.name || '')).slice(0, MAX_NAME_LENGTH).trim();
    if (!name) return null;

    const items = Array.isArray(tpl.items)
      ? tpl.items.slice(0, MAX_ITEMS_PER_TEMPLATE).map(item => {
          if (!item || typeof item !== 'object') return null;
          const productName = stripHtml(String(item.productName || '')).slice(0, MAX_PRODUCT_NAME_LENGTH).trim();
          const janCode = String(item.janCode || '').replace(/[^\d]/g, '').trim();
          if (!productName || !janCode) return null;
          return { productName, janCode, quantity: 1 };
        }).filter(Boolean)
      : [];

    return {
      id: String(tpl.id || Date.now().toString(36)),
      name,
      items,
    };
  }).filter(Boolean);
}

/**
 * PUT /api/templates
 * テンプレート一覧を丸ごと保存（フロントエンドのstateと同期）
 */
router.put('/', (req, res, next) => {
  try {
    const sanitized = sanitizeTemplates(req.body);
    if (sanitized === null) {
      return res.status(400).json({ error: 'テンプレートは配列で送信してください' });
    }
    saveTemplates(sanitized);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
