import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { renderLabel, renderLabelRaw } from '../../src/label/renderer.js';
import { RENDER_WIDTH, RENDER_HEIGHT, PRINT_WIDTH_DOTS, PRINT_HEIGHT_DOTS } from '../../src/label/constants.js';

describe('renderLabel', () => {
  it('generates a PNG with correct dimensions', async () => {
    const png = await renderLabel({
      productName: 'テスト商品',
      janCode: '4901234567894',
    });

    expect(png).toBeInstanceOf(Buffer);

    const metadata = await sharp(png).metadata();
    expect(metadata.width).toBe(RENDER_WIDTH);
    expect(metadata.height).toBe(RENDER_HEIGHT);
    expect(metadata.format).toBe('png');
  });

  it('handles long product names without error', async () => {
    const png = await renderLabel({
      productName: 'これはとても長い商品名のテストで文字数が多い場合の折り返し処理を確認するためのものです',
      janCode: '4901234567894',
    });

    expect(png).toBeInstanceOf(Buffer);
    const metadata = await sharp(png).metadata();
    expect(metadata.width).toBe(RENDER_WIDTH);
  });
});

describe('renderLabelRaw', () => {
  it('returns rotated grayscale raw pixel data for printing', async () => {
    const { data, width, height } = await renderLabelRaw({
      productName: 'テスト',
      janCode: '4901234567894',
    });

    expect(data).toBeInstanceOf(Buffer);
    // 90°CW回転後: RENDER_HEIGHT×RENDER_WIDTH → PRINT_WIDTH×PRINT_HEIGHT
    expect(width).toBe(PRINT_WIDTH_DOTS);
    expect(height).toBe(PRINT_HEIGHT_DOTS);
    expect(data.length).toBe(width * height);
  });
});
