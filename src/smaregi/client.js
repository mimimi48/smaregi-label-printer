import { getAccessToken } from './auth.js';
import { getConfig } from '../config.js';

// ── 商品マスタキャッシュ ──
// 初回検索時にスマレジAPIから全商品を取得し、メモリに保持する。
// キャッシュは10分間有効。設定変更時にも無効化される。
const CACHE_TTL_MS = 10 * 60 * 1000;
let productCache = null;
let cacheExpiresAt = 0;

/**
 * キャッシュを明示的にクリア（設定変更時などに使用）
 */
export function clearProductCache() {
  productCache = null;
  cacheExpiresAt = 0;
}

/**
 * 全商品マスタを取得（キャッシュ付き）
 */
async function getAllProducts() {
  if (productCache && Date.now() < cacheExpiresAt) {
    return productCache;
  }

  const config = getConfig();
  const contractId = config.smaregiContractId;
  const apiBase = config.smaregiApiHost;
  const token = await getAccessToken();

  const all = [];
  const fetchLimit = 1000;
  let fetchPage = 1;

  while (true) {
    const params = new URLSearchParams({
      limit: String(fetchLimit),
      page: String(fetchPage),
      fields: 'productId,productCode,productName,groupCode,price,categoryId',
    });

    const url = `${apiBase}/${contractId}/pos/products?${params}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`スマレジAPI エラー (${res.status}): ${body}`);
    }

    const products = await res.json();
    all.push(...products);

    if (products.length < fetchLimit) break;
    fetchPage++;
  }

  productCache = all.map(normalizeProduct);
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;

  return productCache;
}

/**
 * スマレジから商品を検索
 * @param {string} query - 検索キーワード
 * @param {object} options
 * @param {number} options.page - ページ番号 (1始まり)
 * @param {number} options.limit - 1ページあたりの件数
 * @returns {Promise<{products: Array, totalCount: number}>}
 */
export async function searchProducts(query, options = {}) {
  const { page = 1, limit = 20 } = options;

  const all = await getAllProducts();

  let matched;
  if (!query) {
    matched = all;
  } else {
    const q = query.toLowerCase();
    matched = all.filter(p =>
      p.productName.toLowerCase().includes(q) ||
      p.janCode.includes(q)
    );
  }

  const start = (page - 1) * limit;
  const paged = matched.slice(start, start + limit);

  return {
    products: paged,
    totalCount: matched.length,
  };
}

/**
 * 商品IDで商品を取得
 * @param {string} productId
 * @returns {Promise<object>}
 */
export async function getProduct(productId) {
  const config = getConfig();
  const contractId = config.smaregiContractId;
  const apiBase = config.smaregiApiHost;
  const token = await getAccessToken();

  const url = `${apiBase}/${contractId}/pos/products/${productId}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`スマレジAPI エラー (${res.status}): ${body}`);
  }

  const product = await res.json();
  return normalizeProduct(product);
}

/**
 * スマレジAPIレスポンスを正規化
 */
function normalizeProduct(raw) {
  // JANコードは数字のみの値を優先（groupCodeにブランド名が入るケースがある）
  const candidates = [raw.productCode, raw.groupCode];
  const janCode = candidates.find(c => c && /^\d{8,14}$/.test(c.trim())) || '';

  return {
    productId: raw.productId,
    productName: raw.productName || '',
    janCode: janCode.trim(),
    price: raw.price || 0,
    categoryId: raw.categoryId || '',
    categoryName: raw.categoryName || '',
  };
}
