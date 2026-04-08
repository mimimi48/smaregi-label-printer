import { getConfig } from '../config.js';

/**
 * PIN認証ミドルウェア
 * 設定画面など機密操作に必要。
 * PINは data/settings.json の appPin に保存。
 * 未設定の場合は初回セットアップとして認証をスキップ。
 */
export function requirePin(req, res, next) {
  const config = getConfig();
  const storedPin = config.appPin;

  // PINが未設定の場合はスキップ（初回セットアップ時）
  if (!storedPin) {
    return next();
  }

  const submittedPin = req.headers['x-app-pin'] || req.body?.__pin;

  if (!submittedPin || submittedPin !== storedPin) {
    return res.status(401).json({ error: 'PINが正しくありません' });
  }

  next();
}
