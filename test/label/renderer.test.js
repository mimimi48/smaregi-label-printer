import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { renderLabel, renderLabelRaw } from '../../src/label/renderer.js';
import { PRINT_WIDTH_DOTS, PRINT_HEIGHT_DOTS } from '../../src/label/constants.js';

describe('renderLabel', () => {
  it('generates a PNG with correct dimensions', async () => {
    const png = await renderLabel({
      productName: 'テスト商品',
      janCode: '4901234567894',
    });

    expect(png).toBeInstanceOf(Buffer);

    const metadata = await sharp(png).metadata();
    expect(metadata.width).toBe(PRINT_WIDTH_DOTS);
    expect(metadata.height).toBe(PRINT_HEIGHT_DOTS);
    expect(metadata.format).toBe('png');
  });

  it('handles long product names without error', async () => {
    const png = await renderLabel({
      productName: 'これはとても長い商品名のテストで文字数が多い場合の折り返し処理を確認するためのものです',
      janCode: '4901234567894',
    });

    expect(png).toBeInstanceOf(Buffer);
    const metadata = await sharp(png).metadata();
    expect(metadata.width).toBe(PRINT_WIDTH_DOTS);
  });
});

describe('renderLabelRaw', () => {
  it('returns grayscale raw pixel data', async () => {
    const { data, width, height } = await renderLabelRaw({
      productName: 'テスト',
      janCode: '4901234567894',
    });

    expect(data).toBeInstanceOf(Buffer);
    expect(width).toBe(PRINT_WIDTH_DOTS);
    expect(height).toBe(PRINT_HEIGHT_DOTS);
    expect(data.length).toBe(width * height);
  });
});
