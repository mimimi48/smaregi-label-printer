import { readFileSync, writeFileSync, chmodSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getModelList } from './printer/profiles.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../data');
const SETTINGS_PATH = join(DATA_DIR, 'settings.json');

const DEFAULTS = {
  smaregiContractId: '',
  smaregiClientId: '',
  smaregiClientSecret: '',
  smaregiApiHost: 'https://api.smaregi.jp',
  printerConnectionType: 'tcp',
  printerModel: 'TD-4550DNWB',
  labelSize: '49x24',
  printerIp: '',
  printerPort: 9100,
  autoCut: false,
  port: 3000,
  appPin: '',
};

let cached = null;

/**
 * 設定を読み込む（settings.json > .env > デフォルト の優先順）
 */
export function getConfig() {
  if (cached) return cached;
  cached = loadConfig();
  return cached;
}

/**
 * 設定を保存
 * @param {object} updates - 更新するフィールド
 */
export function saveConfig(updates) {
  const current = loadFromFile();
  const merged = { ...current, ...updates };

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2), 'utf-8');
  // 認証情報を含むためパーミッションを制限
  try { chmodSync(SETTINGS_PATH, 0o600); } catch { /* Windows等では無視 */ }
  cached = null;
}

/**
 * フロントエンド向けの設定を取得（シークレットはマスク）
 */
export function getPublicConfig() {
  const config = getConfig();
  return {
    smaregiContractId: config.smaregiContractId,
    smaregiClientId: config.smaregiClientId,
    smaregiClientSecret: config.smaregiClientSecret ? '__MASKED__' : '',
    smaregiApiHost: config.smaregiApiHost,
    printerConnectionType: config.printerConnectionType,
    printerModel: config.printerModel,
    labelSize: config.labelSize,
    printerIp: config.printerIp,
    printerPort: config.printerPort,
    autoCut: config.autoCut,
    pinConfigured: !!config.appPin,
    configured: !!(config.smaregiContractId && config.smaregiClientId && config.smaregiClientSecret && isPrinterConfigured(config)),
    availableProfiles: getModelList(),
  };
}

function loadConfig() {
  const file = loadFromFile();
  const printerConnectionType = normalizePrinterConnectionType(file.printerConnectionType || process.env.PRINTER_CONNECTION_TYPE);

  return {
    smaregiContractId: file.smaregiContractId || process.env.SMAREGI_CONTRACT_ID || DEFAULTS.smaregiContractId,
    smaregiClientId: file.smaregiClientId || process.env.SMAREGI_CLIENT_ID || DEFAULTS.smaregiClientId,
    smaregiClientSecret: file.smaregiClientSecret || process.env.SMAREGI_CLIENT_SECRET || DEFAULTS.smaregiClientSecret,
    smaregiApiHost: file.smaregiApiHost || process.env.SMAREGI_API_HOST || DEFAULTS.smaregiApiHost,
    printerConnectionType,
    printerModel: file.printerModel || DEFAULTS.printerModel,
    labelSize: file.labelSize || DEFAULTS.labelSize,
    printerIp: file.printerIp || process.env.PRINTER_IP || DEFAULTS.printerIp,
    printerPort: file.printerPort || Number(process.env.PRINTER_PORT) || DEFAULTS.printerPort,
    autoCut: file.autoCut ?? DEFAULTS.autoCut,
    port: Number(process.env.PORT) || DEFAULTS.port,
    appPin: file.appPin || '',
  };
}

function loadFromFile() {
  try {
    const raw = readFileSync(SETTINGS_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function normalizePrinterConnectionType(value) {
  return value === 'airprint' ? 'airprint' : DEFAULTS.printerConnectionType;
}

function isPrinterConfigured(config) {
  if (config.printerConnectionType === 'airprint') {
    return true;
  }
  return !!config.printerIp;
}
