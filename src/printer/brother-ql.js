/**
 * Brother QL-820NWBc ラスターコマンドプロトコルエンコーダー
 *
 * 参考: Brother QL Raster Command Reference
 * プロトコル概要:
 *   1. Invalidate (0x00 × 200)
 *   2. Initialize (ESC @)
 *   3. Switch to raster mode
 *   4. Media/quality info
 *   5. Margins, auto-cut設定
 *   6. ラスターデータ送信（1行ずつ）
 *   7. Print command
 */

import { RASTER_LINE_BYTES, PRINT_WIDTH_DOTS, PRINT_HEIGHT_DOTS } from '../label/constants.js';

/**
 * モノクロビットマップをBrother QLラスターコマンドにエンコード
 * @param {Buffer} bitmapData - 1bppモノクロビットマップ（0=白, 1=黒）
 *   各行 PRINT_WIDTH_DOTS ピクセル、PRINT_HEIGHT_DOTS 行
 * @param {object} options
 * @param {boolean} options.autoCut - 自動カットするか (default: true)
 * @param {number} options.copies - 印刷枚数 (default: 1)
 * @returns {Buffer} プリンターに送信するバイナリデータ
 */
export function encodeLabel(bitmapData, options = {}) {
  const { autoCut = true, copies = 1 } = options;
  const buffers = [];

  // 1. Invalidate — 200バイトの0x00でプリンターの状態をリセット
  buffers.push(Buffer.alloc(200, 0x00));

  // 2. Initialize — ESC @
  buffers.push(Buffer.from([0x1b, 0x40]));

  // 3. Switch to raster mode — ESC i a 1
  buffers.push(Buffer.from([0x1b, 0x69, 0x61, 0x01]));

  // 4. Media type — ESC i z (メディア情報)
  // DK-1209: 29mm × 62mm ダイカットラベル
  buffers.push(Buffer.from([
    0x1b, 0x69, 0x7a,
    0x86,       // Valid flags: PI_KIND | PI_WIDTH | PI_LENGTH | PI_QUALITY
    0x0b,       // Media type: die-cut label
    0x1d,       // Label width: 29mm
    0x3e,       // Label length: 62mm
    0x00, 0x00, // ラスター行数 (低バイト, 高バイト) — 後で設定
    0x00, 0x00, // ページ番号 (使用しない)
    0x00,       // 予約
  ]));

  // ラスター行数を設定（リトルエンディアン）
  const heightBuf = Buffer.alloc(4);
  heightBuf.writeUInt32LE(PRINT_HEIGHT_DOTS);
  // media infoの行数フィールドを上書き
  const mediaInfo = buffers[buffers.length - 1];
  mediaInfo[7] = heightBuf[0];
  mediaInfo[8] = heightBuf[1];

  // 5. Auto cut設定 — ESC i M (auto cut flag)
  buffers.push(Buffer.from([0x1b, 0x69, 0x4d, autoCut ? 0x40 : 0x00]));

  // 6. Cut each N labels (auto cut every label)
  buffers.push(Buffer.from([0x1b, 0x69, 0x41, 0x01]));

  // 7. Margins (送り方向) — ESC i d (margin = 0)
  buffers.push(Buffer.from([0x1b, 0x69, 0x64, 0x00, 0x00]));

  // 8. Compression mode off
  buffers.push(Buffer.from([0x4d, 0x00]));

  // 9. ラスターデータ送信
  const bytesPerRow = Math.ceil(PRINT_WIDTH_DOTS / 8);

  for (let row = 0; row < PRINT_HEIGHT_DOTS; row++) {
    const lineBuffer = Buffer.alloc(RASTER_LINE_BYTES, 0x00);

    // ビットマップデータからこの行を抽出
    const srcOffset = row * bytesPerRow;
    if (srcOffset + bytesPerRow <= bitmapData.length) {
      bitmapData.copy(lineBuffer, 0, srcOffset, srcOffset + bytesPerRow);
    }

    // ラスターラインコマンド: g 0x00 <length> <data>
    const lineHeader = Buffer.from([0x67, 0x00, RASTER_LINE_BYTES]);
    buffers.push(lineHeader);
    buffers.push(lineBuffer);
  }

  // 10. Print command (with feeding)
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
      // グレースケール値を取得
      let gray;
      if (channels === 1) {
        gray = pixelData[pixelIndex];
      } else if (channels >= 3) {
        // RGB平均（簡易）
        gray = (pixelData[pixelIndex] + pixelData[pixelIndex + 1] + pixelData[pixelIndex + 2]) / 3;
        // アルファがある場合、透明は白として扱う
        if (channels === 4 && pixelData[pixelIndex + 3] < 128) {
          gray = 255;
        }
      }

      // 閾値以下なら黒（ビット=1）
      if (gray < threshold) {
        const byteIndex = y * bytesPerRow + Math.floor(x / 8);
        const bitIndex = 7 - (x % 8);
        bitmap[byteIndex] |= (1 << bitIndex);
      }
    }
  }

  return bitmap;
}
