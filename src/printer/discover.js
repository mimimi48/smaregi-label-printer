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
  const { timeout = 500, port = 9100, nameTimeout = 800 } = options;

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

  await Promise.all(results.map(async (printer) => {
    printer.name = await getPrinterName(printer.ip, nameTimeout);
  }));

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

async function getPrinterName(host, timeout) {
  const paths = [
    '/general/status.html',
    '/',
  ];

  for (const path of paths) {
    try {
      const response = await fetchPrinterPage(host, path, timeout);
      const name = extractPrinterName(response.text, response.headers);
      if (name) return name;
    } catch {
      // 名前取得に失敗しても検出自体は継続する
    }
  }

  return '';
}

async function fetchPrinterPage(host, path, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`http://${host}${path}`, { signal: controller.signal });
    const text = await response.text().catch(() => '');
    return { text, headers: response.headers };
  } finally {
    clearTimeout(timer);
  }
}

function extractPrinterName(html, headers = new Headers()) {
  const h1 = matchTagText(html, 'h1');
  if (h1) return normalizePrinterName(h1);

  const title = matchTagText(html, 'title');
  if (title) return normalizePrinterName(title);

  const server = headers.get?.('server') || '';
  if (/epson/i.test(server)) return 'EPSON';
  if (/brother/i.test(server)) return 'Brother';

  return '';
}

function matchTagText(html, tagName) {
  const match = html.match(new RegExp(`<${tagName}[^>]*>([^<]+)</${tagName}>`, 'i'));
  return match ? decodeHtmlEntities(match[1]).trim() : '';
}

function normalizePrinterName(name) {
  return name
    .replace(/\s+/g, ' ')
    .replace(/^Brother\s+/i, '')
    .trim();
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCharCode(parseInt(decimal, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

export const _test = {
  extractPrinterName,
  normalizePrinterName,
  decodeHtmlEntities,
};
