import { getAccessToken } from './auth.js';
import { getConfig } from '../config.js';

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
  const config = getConfig();
  const contractId = config.smaregiContractId;
  const apiBase = config.smaregiApiHost;

  const token = await getAccessToken();

  const params = new URLSearchParams({
    limit: String(limit),
    page: String(page),
    fields: 'productId,productCode,productName,groupCode,price,categoryId',
  });

  // 数字のみならコード検索、それ以外は全件取得後にフィルタ
  const isCodeSearch = query && /^\d+$/.test(query);
  if (isCodeSearch) {
    params.set('product_code', query);
  }

  const url = `${apiBase}/${contractId}/pos/products?${params}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`スマレジAPI エラー (${res.status}): ${body}`);
  }

  let products = await res.json();

  // 商品名検索はAPI側が非対応のためクライアント側でフィルタ
  if (query && !isCodeSearch) {
    const q = query.toLowerCase();
    products = products.filter(p =>
      (p.productName || '').toLowerCase().includes(q) ||
      (p.productCode || '').includes(q) ||
      (p.groupCode || '').includes(q)
    );
  }

  // レスポンスヘッダーからページネーション情報を取得
  const linkHeader = res.headers.get('link');
  const totalCount = products.length;

  return {
    products: products.map(normalizeProduct),
    totalCount,
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
