/**
 * スマレジ プラットフォームAPI OAuth2.0 トークン管理
 * Client Credentials Grant
 */

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

  const contractId = process.env.SMAREGI_CONTRACT_ID;
  const clientId = process.env.SMAREGI_CLIENT_ID;
  const clientSecret = process.env.SMAREGI_CLIENT_SECRET;

  if (!contractId || !clientId || !clientSecret) {
    throw new Error('スマレジAPI認証情報が設定されていません (.env を確認してください)');
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
