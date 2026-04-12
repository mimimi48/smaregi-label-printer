import { Router } from 'express';
import { getPublicConfig, saveConfig, getConfig } from '../config.js';
import { clearTokenCache } from '../smaregi/auth.js';
import { clearProductCache } from '../smaregi/client.js';
import { requirePin } from '../middleware/auth.js';
import { PRINTER_MODELS } from '../printer/profiles.js';

const router = Router();

const ALLOWED_API_HOSTS = ['https://api.smaregi.jp', 'https://api.smaregi.dev'];

/**
 * GET /api/settings
 * 現在の設定を取得（シークレットはマスク済み）
 */
router.get('/', requirePin, (req, res) => {
  res.json(getPublicConfig());
});

/**
 * POST /api/settings
 * 設定を更新
 */
router.post('/', requirePin, (req, res, next) => {
  try {
    const {
      smaregiContractId,
      smaregiClientId,
      smaregiClientSecret,
      smaregiApiHost,
      printerConnectionType,
      printerModel,
      labelSize,
      printerIp,
      printerPort,
      cutMode,
      appPin,
    } = req.body;

    const updates = {};

    if (smaregiContractId !== undefined) updates.smaregiContractId = smaregiContractId.trim();
    if (smaregiClientId !== undefined) updates.smaregiClientId = smaregiClientId.trim();

    // マスク値でなければ更新
    if (smaregiClientSecret !== undefined && smaregiClientSecret !== '__MASKED__') {
      updates.smaregiClientSecret = smaregiClientSecret.trim();
    }

    // APIホストは許可リストのみ
    if (smaregiApiHost !== undefined) {
      const trimmed = smaregiApiHost.trim();
      if (!ALLOWED_API_HOSTS.includes(trimmed)) {
        return res.status(400).json({ error: `APIホストは ${ALLOWED_API_HOSTS.join(' または ')} のみ指定可能です` });
      }
      updates.smaregiApiHost = trimmed;
    }

    // プリンターモデル
    if (printerModel !== undefined) {
      if (!PRINTER_MODELS[printerModel]) {
        return res.status(400).json({ error: '未対応のプリンターモデルです' });
      }
      updates.printerModel = printerModel;
    }

    // ラベルサイズ
    if (labelSize !== undefined) {
      const modelId = printerModel || getConfig().printerModel;
      const model = PRINTER_MODELS[modelId];
      if (!model?.labelSizes[labelSize]) {
        return res.status(400).json({ error: 'このプリンターモデルで未対応のラベルサイズです' });
      }
      updates.labelSize = labelSize;
    }

    if (printerConnectionType !== undefined) {
      if (!['tcp', 'airprint'].includes(printerConnectionType)) {
        return res.status(400).json({ error: '接続方式が無効です' });
      }
      updates.printerConnectionType = printerConnectionType;
    }

    // プリンターIPはプライベートLANアドレスのみ
    if (printerIp !== undefined) {
      const trimmedIp = printerIp.trim();
      if (trimmedIp && !isPrivateLanIp(trimmedIp)) {
        return res.status(400).json({ error: 'プリンターIPはプライベートネットワークアドレスのみ指定可能です' });
      }
      updates.printerIp = trimmedIp;
    }

    // ポートは9100-9109の範囲のみ
    if (printerPort !== undefined) {
      const port = Number(printerPort);
      if (!Number.isInteger(port) || port < 9100 || port > 9109) {
        return res.status(400).json({ error: 'プリンターポートは9100〜9109の範囲で指定してください' });
      }
      updates.printerPort = port;
    }

    // カットモード設定
    if (cutMode !== undefined) {
      if (!['none', 'end', 'each'].includes(cutMode)) {
        return res.status(400).json({ error: 'カット設定が無効です' });
      }
      updates.cutMode = cutMode;
    }

    // PIN設定（4〜8桁の数字）
    if (appPin !== undefined) {
      const trimmedPin = appPin.trim();
      if (trimmedPin && !/^\d{4,8}$/.test(trimmedPin)) {
        return res.status(400).json({ error: 'PINは4〜8桁の数字で設定してください' });
      }
      updates.appPin = trimmedPin;
    }

    saveConfig(updates);

    // スマレジ認証情報が変わった場合��トークン・商品キャッシュをクリア
    if (updates.smaregiContractId || updates.smaregiClientId || updates.smaregiClientSecret) {
      clearTokenCache();
      clearProductCache();
    }

    res.json({ ok: true, config: getPublicConfig() });
  } catch (err) {
    next(err);
  }
});

/**
 * プライベートLANアドレスの検証
 * 192.168.x.x, 10.x.x.x, 172.16-31.x.x のみ許可
 */
function isPrivateLanIp(ip) {
  return /^(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/.test(ip);
}

export default router;
