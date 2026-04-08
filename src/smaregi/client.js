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
  });

  // 数字のみならJANコード検索、それ以外は商品名検索
  if (query) {
    if (/^\d+$/.test(query)) {
      params.set('group_code', query);
    } else {
      params.set('product_name', query);
    }
  }

  const url = `${apiBase}/${contractId}/pos/products?${params}`;

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

  const products = await res.json();

  // レスポンスヘッダーからページネーション情報を取得
  const totalCount = parseInt(res.headers.get('x-total-count') || '0', 10);

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
  return {
    productId: raw.productId,
    productName: raw.productName || '',
    janCode: raw.groupCode || raw.productCode || '',
    price: raw.price || 0,
    categoryId: raw.categoryId || '',
    categoryName: raw.categoryName || '',
  };
}
