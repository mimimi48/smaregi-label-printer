// Brother QL-820NWBc: 300 DPI
// DK-1209 ダイカットラベル: 29mm × 62mm
// 印刷可能領域（若干のマージンを考慮）

export const DPI = 300;

// 29mm × 62mm @ 300 DPI
// 29mm = 幅方向（ヘッド幅）, 62mm = 送り方向
export const LABEL_WIDTH_MM = 29;
export const LABEL_HEIGHT_MM = 62;

// QL-820NWBcのヘッド幅は最大62mm (720 dots)
// 29mmラベルの場合、印刷幅 = 306 dots（左右マージン込み）
// 送り方向 62mm = 732 dots
export const PRINT_WIDTH_DOTS = 306;
export const PRINT_HEIGHT_DOTS = 732;

// Brother QLのラスターデータは1行あたりのバイト数が固定
// QL-820NWBcは最大幅 720 dots = 90 bytes/line
// ただし実際のデータ幅はラベル幅に合わせる
export const RASTER_LINE_BYTES = 90;

// ラベルレイアウト（dots単位）
export const LAYOUT = {
  margin: 10,
  productName: {
    y: 20,
    maxWidth: PRINT_WIDTH_DOTS - 20,
    fontSize: 36,
    minFontSize: 20,
  },
  barcode: {
    y: 320,
    width: 260,
    height: 350,
    textSize: 24,
  },
};
