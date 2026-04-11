/**
 * Brother ラスターコマンドプロトコルエンコーダー
 *
 * 参考: Brother Raster Command Reference (QL-800/QL-1100/TD-4 series)
 * プロトコル概要:
 *   1. Invalidate
 *   2. Initialize (ESC @)
 *   3. Switch to raster mode
 *   4. Media/quality info
 *   5. Margins, auto-cut設定
 *   6. ラスターデータ送信（1行ずつ）
 *   7. Print command
 */

import { RASTER_LINE_BYTES, PRINT_WIDTH_DOTS, PRINT_HEIGHT_DOTS } from '../label/constants.js';

/**
 * モノクロビットマップをBrother ラスターコマンドにエンコード
 * @param {Buffer} bitmapData - 1bppモノクロビットマップ（0=白, 1=黒）
 * @param {object} options
 * @param {boolean} options.autoCut - 自動カットするか (default: false)
 * @param {boolean} options.cutAtEnd - 印刷ジョブ末尾でカットするか (default: true)
 * @param {object} options.profile - プリンタープロファイル（省略時はデフォルト定数を使用）
 * @returns {Buffer} プリンターに送信するバイナリデータ
 */
export function encodeLabel(bitmapData, options = {}) {
  const { autoCut = false, cutAtEnd = true, profile = null } = options;

  const rasterLineBytes = profile?.rasterLineBytes ?? RASTER_LINE_BYTES;
  const printWidthDots = profile?.printWidthDots ?? PRINT_WIDTH_DOTS;
  const printHeightDots = profile?.printHeightDots ?? PRINT_HEIGHT_DOTS;
  const invalidateBytes = profile?.invalidateBytes ?? 400;
  const mediaTypeByte = profile?.mediaTypeByte ?? 0x4b;
  const labelWidthMm = profile?.widthMm ?? 49;
  const labelHeightMm = profile?.heightMm ?? 24;
  const labelOffset = profile?.labelOffset ?? 44;

  const buffers = [];

  // 1. Invalidate
  buffers.push(Buffer.alloc(invalidateBytes, 0x00));

  // 2. Initialize — ESC @
  buffers.push(Buffer.from([0x1b, 0x40]));

  // 3. Switch to raster mode — ESC i a 1
  buffers.push(Buffer.from([0x1b, 0x69, 0x61, 0x01]));

  // 4. Media type — ESC i z
  buffers.push(Buffer.from([
    0x1b, 0x69, 0x7a,
    0x8e,
    mediaTypeByte,
    labelWidthMm,
    labelHeightMm,
    0x00, 0x00,
    0x00, 0x00,
    0x00,
  ]));

  // ラスター行数を設定（リトルエンディアン）
  const heightBuf = Buffer.alloc(4);
  heightBuf.writeUInt32LE(printHeightDots);
  const mediaInfo = buffers[buffers.length - 1];
  mediaInfo[7] = heightBuf[0];
  mediaInfo[8] = heightBuf[1];

  // 5. Auto cut設定 — ESC i M
  buffers.push(Buffer.from([0x1b, 0x69, 0x4d, autoCut ? 0x40 : 0x00]));

  // 6. Expanded mode — ESC i K (bit 3 = cut at end)
  buffers.push(Buffer.from([0x1b, 0x69, 0x4b, cutAtEnd ? 0x08 : 0x00]));

  // 7. Cut each N labels
  buffers.push(Buffer.from([0x1b, 0x69, 0x41, 0x01]));

  // 8. Margins (送り方向) — ESC i d (margin = 0)
  buffers.push(Buffer.from([0x1b, 0x69, 0x64, 0x00, 0x00]));

  // 9. Compression mode off
  buffers.push(Buffer.from([0x4d, 0x00]));

  // 10. ラスターデータ送信
  const bytesPerRow = Math.ceil(printWidthDots / 8);

  for (let row = 0; row < printHeightDots; row++) {
    const lineBuffer = Buffer.alloc(rasterLineBytes, 0x00);

    const srcOffset = row * bytesPerRow;
    if (srcOffset + bytesPerRow <= bitmapData.length) {
      bitmapData.copy(lineBuffer, labelOffset, srcOffset, srcOffset + bytesPerRow);
    }

    const lineHeader = Buffer.from([0x67, 0x00, rasterLineBytes]);
    buffers.push(lineHeader);
    buffers.push(lineBuffer);
  }

  // 11. Print command (with feeding)
  buffers.push(Buffer.from([0x1a]));

  return Buffer.concat(buffers);
}

/**
 * 画像のピクセルデータ（グレースケール/RGBA）を1bppモノクロに変換
 * @param {Buffer} pixelData - ピクセルデータ
 * @param {number} width - 画像幅（ピクセル）
 * @param {number} height - 画像高さ（ピクセル）
 * @param {number} channels - チャンネル数（1=グレースケール, 4=RGBA）
 * @param {number} threshold - 二値化閾値 (0-255, default: 128)
 * @returns {Buffer} 1bpp モノクロビットマップ（1=黒, 0=白）
 */
export function toMonochromeBitmap(pixelData, width, height, channels = 1, threshold = 128) {
  const bytesPerRow = Math.ceil(width / 8);
  const bitmap = Buffer.alloc(bytesPerRow * height, 0x00);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIndex = (y * width + x) * channels;
      let gray;
      if (channels === 1) {
        gray = pixelData[pixelIndex];
      } else if (channels >= 3) {
        gray = (pixelData[pixelIndex] + pixelData[pixelIndex + 1] + pixelData[pixelIndex + 2]) / 3;
        if (channels === 4 && pixelData[pixelIndex + 3] < 128) {
          gray = 255;
        }
      }

      if (gray < threshold) {
        const byteIndex = y * bytesPerRow + Math.floor(x / 8);
        const bitIndex = 7 - (x % 8);
        bitmap[byteIndex] |= (1 << bitIndex);
      }
    }
  }

  return bitmap;
}
