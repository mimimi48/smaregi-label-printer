/**
 * スマレジ プラットフォームAPI OAuth2.0 トークン管理
 * Client Credentials Grant
 */

import { getConfig } from '../config.js';

let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * アクセストークンを取得（キャッシュ＆自動更新）
 * @returns {Promise<string>} アクセストークン
 */
export async function getAccessToken() {
  // 有効期限の60秒前に更新
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const config = getConfig();
  const contractId = config.smaregiContractId;
  const clientId = config.smaregiClientId;
  const clientSecret = config.smaregiClientSecret;

  if (!contractId || !clientId || !clientSecret) {
    throw new Error('スマレジAPI認証情報が設定されていません（設定画面から入力してください）');
  }

  const tokenUrl = 'https://id.smaregi.jp/authorize/token';

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: `pos.products:read`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`スマレジ認証エラー (${res.status}): ${body}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;

  return cachedToken;
}

/**
 * トークンキャッシュをクリア（テスト用）
 */
export function clearTokenCache() {
  cachedToken = null;
  tokenExpiresAt = 0;
}
