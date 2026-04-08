import net from 'node:net';
import { getConfig } from '../config.js';

/**
 * Brother QL プリンターにTCP 9100で印刷データを送信
 * @param {Buffer} data - エンコード済みラスターデータ
 * @param {object} options
 * @param {string} options.host - プリンターIP
 * @param {number} options.port - ポート番号 (default: 9100)
 * @param {number} options.timeout - タイムアウトms (default: 10000)
 * @returns {Promise<void>}
 */
export function sendToPrinter(data, options = {}) {
  const config = getConfig();
  const {
    host = config.printerIp,
    port = config.printerPort,
    timeout = 10000,
  } = options;

  return new Promise((resolve, reject) => {
    const socket = new net.Socket();

    socket.setTimeout(timeout);

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error(`プリンター接続タイムアウト (${host}:${port})`));
    });

    socket.on('error', (err) => {
      reject(new Error(`プリンター接続エラー: ${err.message}`));
    });

    socket.connect(port, host, () => {
      socket.write(data, (err) => {
        if (err) {
          socket.destroy();
          reject(new Error(`プリンター送信エラー: ${err.message}`));
          return;
        }
        // データ送信完了後、少し待ってから切断
        setTimeout(() => {
          socket.end();
          resolve();
        }, 500);
      });
    });
  });
}

/**
 * プリンターのオンライン状態を確認
 * @param {object} options
 * @param {string} options.host - プリンターIP
 * @param {number} options.port - ポート番号
 * @param {number} options.timeout - タイムアウトms (default: 3000)
 * @returns {Promise<boolean>} オンラインならtrue
 */
export function checkPrinterStatus(options = {}) {
  const config = getConfig();
  const {
    host = config.printerIp,
    port = config.printerPort,
    timeout = 3000,
  } = options;

  return new Promise((resolve) => {
    const socket = new net.Socket();

    socket.setTimeout(timeout);

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      resolve(false);
    });

    socket.connect(port, host, () => {
      socket.end();
      resolve(true);
    });
  });
}
