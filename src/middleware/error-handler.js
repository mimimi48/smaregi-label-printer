/**
 * Express エラーハンドラーミドルウェア
 * 技術的エラーメッセージをユーザー向けに変換
 */
export function errorHandler(err, req, res, _next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  if (err.message.includes('スマレジ認証エラー')) {
    return res.status(502).json({ error: 'スマレジAPI認証に失敗しました。設定を確認してください。' });
  }

  if (err.message.includes('スマレジAPI エラー')) {
    return res.status(502).json({ error: 'スマレジAPIとの通信に失敗しました。しばらく待ってから再試行してください。' });
  }

  if (err.message.includes('ECONNREFUSED') || err.message.includes('接続エラー')) {
    return res.status(503).json({ error: 'プリンターに接続できません。電源が入っているか確認してください。' });
  }

  if (err.message.includes('タイムアウト') || err.message.includes('timeout')) {
    return res.status(503).json({ error: 'プリンターが応答しません。同じネットワークに接続されているか確認してください。' });
  }

  if (err.message.includes('送信エラー')) {
    return res.status(503).json({ error: 'プリンターへのデータ送信に失敗しました。再試行してください。' });
  }

  if (err.message.includes('プリンター')) {
    return res.status(503).json({ error: err.message });
  }

  res.status(500).json({ error: 'サーバーエラーが発生しました' });
}
