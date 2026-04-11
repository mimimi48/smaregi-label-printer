/**
 * プリンターモデル＆ラベルサイズのプロファイル定義
 */

export const DEFAULT_MODEL = 'TD-4550DNWB';
export const DEFAULT_LABEL_SIZE = '49x24';

export const PRINTER_MODELS = {
  'TD-4550DNWB': {
    name: 'Brother TD-4550DNWB',
    rasterLineBytes: 162,
    headPins: 1296,
    invalidateBytes: 400,
    labelSizes: {
      '49x24': {
        name: '49mm × 24mm',
        widthMm: 49,
        heightMm: 24,
        printWidthDots: 579,
        printHeightDots: 283,
        mediaTypeByte: 0x4b,
        labelOffset: 44,
        layout: {
          margin: 18,
          productName: { y: 18, maxWidth: 579 - 36, fontSize: 48, minFontSize: 24 },
          barcode: { y: 100, width: 540, height: 160, textSize: 18 },
        },
      },
      '30x14': {
        name: '30mm × 14mm',
        widthMm: 30,
        heightMm: 14,
        printWidthDots: 354,
        printHeightDots: 165,
        mediaTypeByte: 0x4b,
        labelOffset: 59,
        layout: {
          margin: 10,
          productName: { y: 8, maxWidth: 354 - 20, fontSize: 28, minFontSize: 14 },
          barcode: { y: 55, width: 320, height: 100, textSize: 12 },
        },
      },
      '29x42': {
        name: '29mm × 42mm',
        widthMm: 29,
        heightMm: 42,
        printWidthDots: 343,
        printHeightDots: 496,
        mediaTypeByte: 0x4b,
        labelOffset: 60,
        layout: {
          margin: 14,
          productName: { y: 14, maxWidth: 343 - 28, fontSize: 36, minFontSize: 18 },
          barcode: { y: 180, width: 310, height: 280, textSize: 16 },
        },
      },
      '60x30': {
        name: '60mm × 30mm',
        widthMm: 60,
        heightMm: 30,
        printWidthDots: 709,
        printHeightDots: 354,
        mediaTypeByte: 0x4b,
        labelOffset: 37,
        layout: {
          margin: 20,
          productName: { y: 20, maxWidth: 709 - 40, fontSize: 52, minFontSize: 26 },
          barcode: { y: 130, width: 660, height: 200, textSize: 20 },
        },
      },
      '90x45': {
        name: '90mm × 45mm',
        widthMm: 90,
        heightMm: 45,
        printWidthDots: 1063,
        printHeightDots: 531,
        mediaTypeByte: 0x4b,
        labelOffset: 19,
        layout: {
          margin: 24,
          productName: { y: 24, maxWidth: 1063 - 48, fontSize: 64, minFontSize: 32 },
          barcode: { y: 200, width: 900, height: 280, textSize: 24 },
        },
      },
    },
  },
  'QL-820NWBc': {
    name: 'Brother QL-820NWBc',
    rasterLineBytes: 90,
    headPins: 720,
    invalidateBytes: 400,
    labelSizes: {
      '62x29': {
        name: '62mm × 29mm (DK-1209)',
        widthMm: 62,
        heightMm: 29,
        printWidthDots: 696,
        printHeightDots: 271,
        mediaTypeByte: 0x4b,
        labelOffset: 0,
        layout: {
          margin: 18,
          productName: { y: 18, maxWidth: 696 - 36, fontSize: 48, minFontSize: 24 },
          barcode: { y: 100, width: 560, height: 140, textSize: 18 },
        },
      },
      '62x100': {
        name: '62mm × 100mm (DK-1202)',
        widthMm: 62,
        heightMm: 100,
        printWidthDots: 696,
        printHeightDots: 1182,
        mediaTypeByte: 0x4b,
        labelOffset: 0,
        layout: {
          margin: 24,
          productName: { y: 40, maxWidth: 696 - 48, fontSize: 56, minFontSize: 28 },
          barcode: { y: 400, width: 600, height: 600, textSize: 24 },
        },
      },
      '29x90': {
        name: '29mm × 90mm (DK-1201)',
        widthMm: 29,
        heightMm: 90,
        printWidthDots: 306,
        printHeightDots: 991,
        mediaTypeByte: 0x4b,
        labelOffset: 0,
        layout: {
          margin: 12,
          productName: { y: 20, maxWidth: 306 - 24, fontSize: 32, minFontSize: 16 },
          barcode: { y: 360, width: 280, height: 500, textSize: 16 },
        },
      },
    },
  },
  'QL-1110NWB': {
    name: 'Brother QL-1110NWB',
    rasterLineBytes: 162,
    headPins: 1296,
    invalidateBytes: 200,
    labelSizes: {
      '62x29': {
        name: '62mm × 29mm (DK-1209)',
        widthMm: 62,
        heightMm: 29,
        printWidthDots: 696,
        printHeightDots: 271,
        mediaTypeByte: 0x4b,
        labelOffset: 36,
        layout: {
          margin: 18,
          productName: { y: 18, maxWidth: 696 - 36, fontSize: 48, minFontSize: 24 },
          barcode: { y: 100, width: 560, height: 140, textSize: 18 },
        },
      },
      '102x51': {
        name: '102mm × 51mm (DK-1240)',
        widthMm: 102,
        heightMm: 51,
        printWidthDots: 1164,
        printHeightDots: 526,
        mediaTypeByte: 0x4b,
        labelOffset: 7,
        layout: {
          margin: 24,
          productName: { y: 24, maxWidth: 1164 - 48, fontSize: 64, minFontSize: 32 },
          barcode: { y: 200, width: 1000, height: 280, textSize: 24 },
        },
      },
    },
  },
};

/**
 * モデルIDとラベルサイズIDからプロファイルを取得
 */
export function getProfile(modelId, labelSizeId) {
  const model = PRINTER_MODELS[modelId];
  if (!model) throw new Error(`未対応のプリンターモデル: ${modelId}`);

  const label = model.labelSizes[labelSizeId];
  if (!label) throw new Error(`${model.name} で ${labelSizeId} ラベルは未対応です`);

  return {
    modelId,
    modelName: model.name,
    rasterLineBytes: model.rasterLineBytes,
    headPins: model.headPins,
    invalidateBytes: model.invalidateBytes,
    ...label,
  };
}

/**
 * フロントエンド向けモデル一覧
 */
export function getModelList() {
  return Object.entries(PRINTER_MODELS).map(([id, model]) => ({
    id,
    name: model.name,
    labelSizes: Object.entries(model.labelSizes).map(([sizeId, size]) => ({
      id: sizeId,
      name: size.name,
    })),
  }));
}
