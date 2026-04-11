import net from 'node:net';
import { getConfig } from '../config.js';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Brother プリンターにTCP 9100で印刷データを送信（リトライ付き）
 * @param {Buffer} data - エンコード済みラスターデータ
 * @param {object} options
 * @param {string} options.host - プリンターIP
 * @param {number} options.port - ポート番号 (default: 9100)
 * @param {number} options.timeout - タイムアウトms (default: 15000)
 * @returns {Promise<void>}
 */
export function sendToPrinter(data, options = {}) {
  const config = getConfig();
  const {
    host = config.printerIp,
    port = config.printerPort,
    timeout = 15000,
  } = options;

  if (!host) {
    return Promise.reject(new Error('プリンターIPが設定されていません'));
  }

  return sendWithRetry(data, host, port, timeout, MAX_RETRIES);
}

async function sendWithRetry(data, host, port, timeout, retriesLeft) {
  try {
    await sendOnce(data, host, port, timeout);
  } catch (err) {
    if (retriesLeft > 0) {
      await delay(RETRY_DELAY_MS);
      return sendWithRetry(data, host, port, timeout, retriesLeft - 1);
    }
    throw err;
  }
}

function sendOnce(data, host, port, timeout) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      fn(value);
    };

    socket.setTimeout(timeout);

    socket.on('timeout', () => {
      settle(reject, new Error(`プリンター接続タイムアウト (${host}:${port})`));
    });

    socket.on('error', (err) => {
      settle(reject, new Error(`プリンター接続エラー: ${err.message}`));
    });

    socket.connect(port, host, () => {
      socket.write(data, (err) => {
        if (err) {
          settle(reject, new Error(`プリンター送信エラー: ${err.message}`));
          return;
        }
        // データ送信完了後、プリンターがデータを処理する時間を確保
        setTimeout(() => {
          settle(resolve);
        }, 800);
      });
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * プリンターのオンライン状態を確認
 * @param {object} options
 * @returns {Promise<boolean>} オンラインならtrue
 */
export function checkPrinterStatus(options = {}) {
  const config = getConfig();
  const {
    host = config.printerIp,
    port = config.printerPort,
    timeout = 3000,
  } = options;

  if (!host) return Promise.resolve(false);

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    socket.setTimeout(timeout);

    socket.on('timeout', () => {
      if (!settled) { settled = true; socket.destroy(); resolve(false); }
    });

    socket.on('error', () => {
      if (!settled) { settled = true; resolve(false); }
    });

    socket.connect(port, host, () => {
      if (!settled) { settled = true; socket.end(); resolve(true); }
    });
  });
}
