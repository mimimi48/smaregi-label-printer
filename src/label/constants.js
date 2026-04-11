/**
 * ラベル定数（デフォルトプロファイルからの再エクスポート）
 * 直接インポートしているコードの後方互換性を維持
 */

import { getProfile, DEFAULT_MODEL, DEFAULT_LABEL_SIZE } from '../printer/profiles.js';

export const DPI = 300;

const defaultProfile = getProfile(DEFAULT_MODEL, DEFAULT_LABEL_SIZE);

export const LABEL_WIDTH_MM = defaultProfile.widthMm;
export const LABEL_HEIGHT_MM = defaultProfile.heightMm;
export const PRINT_WIDTH_DOTS = defaultProfile.printWidthDots;
export const PRINT_HEIGHT_DOTS = defaultProfile.printHeightDots;
export const RASTER_LINE_BYTES = defaultProfile.rasterLineBytes;
export const LAYOUT = defaultProfile.layout;
