/**
 * Express エラーハンドラーミドルウェア
 */
export function errorHandler(err, req, res, _next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  if (err.message.includes('スマレジ認証エラー')) {
    return res.status(502).json({ error: 'スマレジAPI認証に失敗しました' });
  }

  if (err.message.includes('スマレジAPI エラー')) {
    return res.status(502).json({ error: 'スマレジAPIとの通信に失敗しました' });
  }

  if (err.message.includes('プリンター')) {
    return res.status(503).json({ error: err.message });
  }

  res.status(500).json({ error: 'サーバーエラーが発生しました' });
}
