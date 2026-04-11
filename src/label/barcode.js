import bwipjs from 'bwip-js';

/**
 * JANコード（EAN-13）のバーコード画像をPNGバッファとして生成
 * @param {string} janCode - 13桁のJANコード
 * @param {object} options
 * @param {number} options.width - バーコード幅（mm）
 * @param {number} options.height - バーコード高さ（mm）
 * @param {boolean} options.includeText - コード番号を表示するか
 * @returns {Promise<Buffer>} PNG画像バッファ
 */
export async function generateBarcode(janCode, options = {}) {
  const {
    width = 22,
    height = 12,
    includeText = true,
  } = options;

  const png = await bwipjs.toBuffer({
    bcid: 'ean13',
    text: janCode,
    scale: 6,
    width: 45,
    height: 20,
    includetext: includeText,
    textxalign: 'center',
    textsize: 12,
    monochrome: true,
  });

  return png;
}
