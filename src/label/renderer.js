import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generateBarcode } from './barcode.js';
import { PRINT_WIDTH_DOTS, PRINT_HEIGHT_DOTS, LAYOUT } from './constants.js';

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
 * @param {object} [profile] - プリンタープロファイル（省略時はデフォルト）
 * @returns {Promise<Buffer>} PNG画像バッファ
 */
export async function renderLabel(product, profile = null) {
  const { productName, janCode } = product;
  const width = profile?.printWidthDots ?? PRINT_WIDTH_DOTS;
  const height = profile?.printHeightDots ?? PRINT_HEIGHT_DOTS;
  const layout = profile?.layout ?? LAYOUT;

  // バーコード画像を生成
  const barcodePng = await generateBarcode(janCode);

  // 商品名のフォントサイズを決定（長い名前は小さく）
  const fontSize = calculateFontSize(productName, layout);

  // 商品名をSVGで描画（日本語対応）
  const nameSvg = createTextSvg(productName, fontSize, layout);

  // ベースの白い画像を作成
  const base = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  });

  // バーコード画像のサイズを取得してリサイズ
  const barcodeResized = await sharp(barcodePng)
    .resize({
      width: layout.barcode.width,
      height: layout.barcode.height,
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .toBuffer();

  // 合成
  const barcodeLeft = Math.floor((width - layout.barcode.width) / 2);

  const label = await base
    .composite([
      {
        input: Buffer.from(nameSvg),
        top: layout.productName.y,
        left: Math.floor((width - layout.productName.maxWidth) / 2),
      },
      {
        input: barcodeResized,
        top: layout.barcode.y,
        left: barcodeLeft,
      },
    ])
    .png()
    .toBuffer();

  return label;
}

/**
 * ラベル画像をグレースケールのrawピクセルデータとして取得
 * @param {object} product
 * @param {object} [profile] - プリンタープロファイル
 * @returns {Promise<{data: Buffer, width: number, height: number}>}
 */
export async function renderLabelRaw(product, profile = null) {
  const labelPng = await renderLabel(product, profile);

  // byte 0=ヘッド右端のため、画像を水平反転してラスター方向に合わせる
  const { data, info } = await sharp(labelPng)
    .flop()
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return { data, width: info.width, height: info.height };
}

/**
 * 商品名の長さに応じたフォントサイズを計算
 */
function calculateFontSize(text, layout) {
  const len = text.length;
  if (len <= 6) return layout.productName.fontSize;
  if (len <= 10) return Math.round(layout.productName.fontSize * 0.7);
  if (len <= 15) return Math.round(layout.productName.fontSize * 0.55);
  if (len <= 20) return Math.round(layout.productName.fontSize * 0.45);
  return layout.productName.minFontSize;
}

/**
 * 商品名のSVG画像を生成（日本語対応）
 */
function createTextSvg(text, fontSize, layout) {
  const maxWidth = layout.productName.maxWidth;
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
    return `<text x="50%" y="${y}" text-anchor="middle" font-size="${fontSize}" font-family="${fontFamily}" font-weight="bold" fill="black">${escaped}</text>`;
  }).join('\n');

  return `<svg width="${maxWidth}" height="${totalHeight}" xmlns="http://www.w3.org/2000/svg">
    ${fontFace}
    ${textElements}
  </svg>`;
}

function wrapText(text, maxWidth, fontSize) {
  const lines = [];
  let currentLine = '';
  let currentWidth = 0;

  for (const char of text) {
    const charWidth = isHalfWidth(char) ? fontSize * 0.6 : fontSize * 1.0;
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
