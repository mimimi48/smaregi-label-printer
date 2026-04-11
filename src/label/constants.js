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
// ラベルは横長で読むが、プリンターは縦に排出
// 24mm = ヘッド幅方向, 49mm = 送り方向
export const LABEL_WIDTH_MM = 49;
export const LABEL_HEIGHT_MM = 24;

// レンダリングサイズ（横長・ユーザーが読む向き）
export const RENDER_WIDTH = 579;   // 49mm
export const RENDER_HEIGHT = 283;  // 24mm

// ラスター送信サイズ（90°CW回転後）
// 24mm @ 300DPI = 283 dots（ヘッド幅方向）
// 49mm @ 300DPI = 579 dots（送り方向）
export const PRINT_WIDTH_DOTS = 283;
export const PRINT_HEIGHT_DOTS = 579;

// TD-4550DNWBのヘッド最大幅 108mm = 1280 dots = 160 bytes/line
export const RASTER_LINE_BYTES = 160;

// 1mm ≈ 11.81 dots
// 余白 1.5mm ≈ 18 dots
// 商品名 9mm ≈ 106 dots
// バーコード 11mm ≈ 130 dots
// 数字 3mm ≈ 35 dots（bwip-jsのincludetextで描画）
export const LAYOUT = {
  margin: 18,
  productName: {
    y: 18,
    maxWidth: 579 - 36,
    fontSize: 26,
    minFontSize: 14,
  },
  barcode: {
    y: 124,
    width: 400,
    height: 120,
    textSize: 16,
  },
};
