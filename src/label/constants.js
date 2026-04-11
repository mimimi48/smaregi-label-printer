// Brother TD-4550DNWB: 300 DPI
// ダイカットラベル: 49mm × 24mm
//
// レイアウト仕様:
//   商品名エリア: 9mm
//   バーコードエリア: 11mm
//   数字エリア: 3mm（バーコード下の数字）
//   余白: 上下左右 1.5mm

export const DPI = 300;

// 49mm × 24mm @ 300 DPI
// 49mm = ヘッド幅方向, 24mm = 送り方向
export const LABEL_WIDTH_MM = 49;
export const LABEL_HEIGHT_MM = 24;

// 49mm @ 300DPI = 579 dots（ヘッド幅方向）
// 24mm @ 300DPI = 283 dots（送り方向）
export const PRINT_WIDTH_DOTS = 579;
export const PRINT_HEIGHT_DOTS = 283;

// TD-4550DNWBのヘッド: 1296ピン = 162 bytes/line
export const RASTER_LINE_BYTES = 162;

// レイアウト（横長 579×283 で描画）
export const LAYOUT = {
  margin: 18,
  productName: {
    y: 18,
    maxWidth: 579 - 36,
    fontSize: 48,
    minFontSize: 24,
  },
  barcode: {
    y: 100,
    width: 540,
    height: 160,
    textSize: 18,
  },
};
