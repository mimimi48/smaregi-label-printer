import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generateBarcode } from './barcode.js';
import { RENDER_WIDTH, RENDER_HEIGHT, LAYOUT } from './constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONT_PATH = join(__dirname, '../../fonts/NotoSansJP-Bold.ttf');

// フォントをBase64エンコードしてSVG内で使用
let fontBase64 = '';
try {
  fontBase64 = readFileSync(FONT_PATH).toString('base64');
} catch {
  // フォントが見つからない場合はシステムフォントにフォールバック
}

/**
 * 商品名とJANコードからラベル画像を生成
 * @param {object} product
 * @param {string} product.productName - 商品名
 * @param {string} product.janCode - JANコード（13桁）
 * @returns {Promise<Buffer>} PNG画像バッファ
 */
export async function renderLabel(product) {
  const { productName, janCode } = product;

  // バーコード画像を生成
  const barcodePng = await generateBarcode(janCode);

  // 商品名のフォントサイズを決定（長い名前は小さく）
  const fontSize = calculateFontSize(productName);

  // 商品名をSVGで描画（日本語対応）
  const nameSvg = createTextSvg(productName, fontSize);

  // ベースの白い画像を作成（横長・ユーザーが読む向き）
  const base = sharp({
    create: {
      width: RENDER_WIDTH,
      height: RENDER_HEIGHT,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  });

  // バーコード画像のサイズを取得してリサイズ
  const barcodeResized = await sharp(barcodePng)
    .resize({
      width: LAYOUT.barcode.width,
      height: LAYOUT.barcode.height,
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .toBuffer();

  // 合成
  const barcodeLeft = Math.floor((RENDER_WIDTH - LAYOUT.barcode.width) / 2);

  const label = await base
    .composite([
      {
        input: Buffer.from(nameSvg),
        top: LAYOUT.productName.y,
        left: LAYOUT.margin,
      },
      {
        input: barcodeResized,
        top: LAYOUT.barcode.y,
        left: barcodeLeft,
      },
    ])
    .png()
    .toBuffer();

  return label;
}

/**
 * ラベル画像をグレースケールのrawピクセルデータとして取得
 * （Brother QLエンコーダーへの入力用）
 * @param {object} product
 * @returns {Promise<{data: Buffer, width: number, height: number}>}
 */
export async function renderLabelRaw(product) {
  const labelPng = await renderLabel(product);

  // 横長画像を90°CW回転してラスター送信用の向きにする
  // ユーザーがラベルを90°CCW回転して読むと正しい向きになる
  const { data, info } = await sharp(labelPng)
    .rotate(90)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return { data, width: info.width, height: info.height };
}

/**
 * 商品名の長さに応じたフォントサイズを計算
 */
function calculateFontSize(text) {
  const len = text.length;
  if (len <= 6) return LAYOUT.productName.fontSize;
  if (len <= 10) return 30;
  if (len <= 15) return 24;
  if (len <= 20) return 20;
  return LAYOUT.productName.minFontSize;
}

/**
 * 商品名のSVG画像を生成（日本語対応）
 * sharpのSVGオーバーレイ機能を使用
 */
function createTextSvg(text, fontSize) {
  const maxWidth = LAYOUT.productName.maxWidth;
  // 長いテキストは折り返し
  const lines = wrapText(text, maxWidth, fontSize);
  const lineHeight = fontSize * 1.3;
  const totalHeight = Math.ceil(lines.length * lineHeight + fontSize * 0.3);

  const fontFamily = fontBase64 ? 'NotoSansJP' : "sans-serif, 'Hiragino Sans', 'Noto Sans JP'";
  const fontFace = fontBase64
    ? `<defs><style>@font-face { font-family: 'NotoSansJP'; src: url('data:font/ttf;base64,${fontBase64}') format('truetype'); font-weight: bold; }</style></defs>`
    : '';

  const textElements = lines.map((line, i) => {
    const y = fontSize + i * lineHeight;
    const escaped = escapeXml(line);
    return `<text x="0" y="${y}" font-size="${fontSize}" font-family="${fontFamily}" font-weight="bold" fill="black">${escaped}</text>`;
  }).join('\n');

  return `<svg width="${maxWidth}" height="${totalHeight}" xmlns="http://www.w3.org/2000/svg">
    ${fontFace}
    ${textElements}
  </svg>`;
}

/**
 * テキストを指定幅に収まるように折り返す
 * 簡易実装：日本語は1文字≒fontSize*0.9px、英数字は≒fontSize*0.55px
 */
function wrapText(text, maxWidth, fontSize) {
  const lines = [];
  let currentLine = '';
  let currentWidth = 0;

  for (const char of text) {
    const charWidth = isHalfWidth(char) ? fontSize * 0.55 : fontSize * 0.9;
    if (currentWidth + charWidth > maxWidth && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = char;
      currentWidth = charWidth;
    } else {
      currentLine += char;
      currentWidth += charWidth;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  // 最大4行まで
  if (lines.length > 4) {
    lines.length = 4;
    lines[3] = lines[3].slice(0, -1) + '…';
  }

  return lines;
}

function isHalfWidth(char) {
  const code = char.charCodeAt(0);
  return code <= 0x7e || (code >= 0xff61 && code <= 0xff9f);
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
