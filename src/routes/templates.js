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

/**
 * PUT /api/templates
 * テンプレート一覧を丸ごと保存（フロントエンドのstateと同期）
 */
router.put('/', (req, res, next) => {
  try {
    const templates = req.body;
    if (!Array.isArray(templates)) {
      return res.status(400).json({ error: 'テンプレートは配列で送信してください' });
    }
    saveTemplates(templates);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
