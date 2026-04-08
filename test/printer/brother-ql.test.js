import { describe, it, expect } from 'vitest';
import { encodeLabel, toMonochromeBitmap } from '../../src/printer/brother-ql.js';
import { PRINT_WIDTH_DOTS, PRINT_HEIGHT_DOTS, RASTER_LINE_BYTES } from '../../src/label/constants.js';

describe('toMonochromeBitmap', () => {
  it('converts grayscale pixel data to 1bpp bitmap', () => {
    // 8ピクセル幅、1行: 4黒、4白
    const pixels = Buffer.from([0, 0, 0, 0, 255, 255, 255, 255]);
    const bitmap = toMonochromeBitmap(pixels, 8, 1, 1, 128);

    // 最初の4ピクセルが黒(1)、残り4が白(0) → 0b11110000 = 0xF0
    expect(bitmap[0]).toBe(0xf0);
  });

  it('handles RGBA input with alpha channel', () => {
    // 2ピクセル: 黒不透明、白透明
    const pixels = Buffer.from([
      0, 0, 0, 255,       // 黒、不透明 → 黒
      0, 0, 0, 0,         // 黒、透明 → 白として扱う
    ]);
    const bitmap = toMonochromeBitmap(pixels, 2, 1, 4, 128);

    // 最初のピクセルだけ黒: 0b10000000 = 0x80
    expect(bitmap[0]).toBe(0x80);
  });

  it('produces correct buffer size', () => {
    const width = PRINT_WIDTH_DOTS;
    const height = 10;
    const pixels = Buffer.alloc(width * height, 255); // 全白
    const bitmap = toMonochromeBitmap(pixels, width, height, 1);

    const expectedBytes = Math.ceil(width / 8) * height;
    expect(bitmap.length).toBe(expectedBytes);
  });
});

describe('encodeLabel', () => {
  it('starts with invalidate sequence (200 zero bytes)', () => {
    const bytesPerRow = Math.ceil(PRINT_WIDTH_DOTS / 8);
    const bitmap = Buffer.alloc(bytesPerRow * PRINT_HEIGHT_DOTS, 0);
    const encoded = encodeLabel(bitmap);

    // 最初の200バイトが0x00
    for (let i = 0; i < 200; i++) {
      expect(encoded[i]).toBe(0x00);
    }
  });

  it('contains ESC @ initialize command', () => {
    const bytesPerRow = Math.ceil(PRINT_WIDTH_DOTS / 8);
    const bitmap = Buffer.alloc(bytesPerRow * PRINT_HEIGHT_DOTS, 0);
    const encoded = encodeLabel(bitmap);

    // 200バイト目以降にESC @ (0x1b 0x40)がある
    expect(encoded[200]).toBe(0x1b);
    expect(encoded[201]).toBe(0x40);
  });

  it('contains raster mode switch command', () => {
    const bytesPerRow = Math.ceil(PRINT_WIDTH_DOTS / 8);
    const bitmap = Buffer.alloc(bytesPerRow * PRINT_HEIGHT_DOTS, 0);
    const encoded = encodeLabel(bitmap);

    // ESC i a 1 (0x1b 0x69 0x61 0x01)
    expect(encoded[202]).toBe(0x1b);
    expect(encoded[203]).toBe(0x69);
    expect(encoded[204]).toBe(0x61);
    expect(encoded[205]).toBe(0x01);
  });

  it('ends with print command 0x1A', () => {
    const bytesPerRow = Math.ceil(PRINT_WIDTH_DOTS / 8);
    const bitmap = Buffer.alloc(bytesPerRow * PRINT_HEIGHT_DOTS, 0);
    const encoded = encodeLabel(bitmap);

    expect(encoded[encoded.length - 1]).toBe(0x1a);
  });

  it('contains correct number of raster lines', () => {
    const bytesPerRow = Math.ceil(PRINT_WIDTH_DOTS / 8);
    const bitmap = Buffer.alloc(bytesPerRow * PRINT_HEIGHT_DOTS, 0);
    const encoded = encodeLabel(bitmap);

    // 各ラスター行は g(0x67) + 0x00 + length(RASTER_LINE_BYTES) + data
    let rasterLineCount = 0;
    for (let i = 0; i < encoded.length - 2; i++) {
      if (encoded[i] === 0x67 && encoded[i + 1] === 0x00 && encoded[i + 2] === RASTER_LINE_BYTES) {
        rasterLineCount++;
      }
    }
    expect(rasterLineCount).toBe(PRINT_HEIGHT_DOTS);
  });
});
