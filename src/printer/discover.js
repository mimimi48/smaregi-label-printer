import net from 'node:net';
import { networkInterfaces } from 'node:os';

/**
 * LAN内のBrother QLプリンターを検出
 * サーバーと同一サブネット内でTCP 9100が応答するデバイスをスキャン
 * @param {object} options
 * @param {number} options.timeout - 各ホストのタイムアウトms (default: 500)
 * @param {number} options.port - スキャンするポート (default: 9100)
 * @returns {Promise<Array<{ip: string, name: string}>>}
 */
export async function discoverPrinters(options = {}) {
  const { timeout = 500, port = 9100 } = options;

  // サーバーのローカルIPからサブネットを特定
  const localIps = getLocalIpAddresses();
  if (localIps.length === 0) return [];

  const results = [];
  const scanPromises = [];

  for (const localIp of localIps) {
    // /24サブネットを仮定（192.168.x.0/24）
    const baseIp = localIp.split('.').slice(0, 3).join('.');

    for (let i = 1; i <= 254; i++) {
      const targetIp = `${baseIp}.${i}`;
      if (targetIp === localIp) continue; // 自分自身はスキップ

      scanPromises.push(
        checkPort(targetIp, port, timeout).then((open) => {
          if (open) results.push({ ip: targetIp, name: '' });
        })
      );
    }
  }

  await Promise.all(scanPromises);

  // IPアドレス順にソート
  results.sort((a, b) => {
    const aParts = a.ip.split('.').map(Number);
    const bParts = b.ip.split('.').map(Number);
    for (let i = 0; i < 4; i++) {
      if (aParts[i] !== bParts[i]) return aParts[i] - bParts[i];
    }
    return 0;
  });

  return results;
}

function checkPort(host, port, timeout) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      resolve(false);
    });

    socket.connect(port, host);
  });
}

function getLocalIpAddresses() {
  const interfaces = networkInterfaces();
  const ips = [];

  for (const name in interfaces) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }

  return ips;
}
