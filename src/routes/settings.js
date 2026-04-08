import { Router } from 'express';
import { getPublicConfig, saveConfig } from '../config.js';
import { clearTokenCache } from '../smaregi/auth.js';

const router = Router();

/**
 * GET /api/settings
 * 現在の設定を取得（シークレットはマスク済み）
 */
router.get('/', (req, res) => {
  res.json(getPublicConfig());
});

/**
 * POST /api/settings
 * 設定を更新
 */
router.post('/', (req, res, next) => {
  try {
    const { smaregiContractId, smaregiClientId, smaregiClientSecret, smaregiApiHost, printerIp, printerPort } = req.body;

    const updates = {};

    if (smaregiContractId !== undefined) updates.smaregiContractId = smaregiContractId.trim();
    if (smaregiClientId !== undefined) updates.smaregiClientId = smaregiClientId.trim();
    // マスク値でなければ更新
    if (smaregiClientSecret !== undefined && smaregiClientSecret !== '********') {
      updates.smaregiClientSecret = smaregiClientSecret.trim();
    }
    if (smaregiApiHost !== undefined) updates.smaregiApiHost = smaregiApiHost.trim();
    if (printerIp !== undefined) updates.printerIp = printerIp.trim();
    if (printerPort !== undefined) updates.printerPort = Number(printerPort) || 9100;

    saveConfig(updates);

    // スマレジ認証情報が変わった場合はトークンキャッシュをクリア
    if (updates.smaregiContractId || updates.smaregiClientId || updates.smaregiClientSecret) {
      clearTokenCache();
    }

    res.json({ ok: true, config: getPublicConfig() });
  } catch (err) {
    next(err);
  }
});

export default router;
