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
  it('starts with invalidate sequence (400 zero bytes for QL-820NWBc)', () => {
    const bytesPerRow = Math.ceil(PRINT_WIDTH_DOTS / 8);
    const bitmap = Buffer.alloc(bytesPerRow * PRINT_HEIGHT_DOTS, 0);
    const encoded = encodeLabel(bitmap);

    // QL-820NWBcは2色対応モデルのため400バイト
    for (let i = 0; i < 400; i++) {
      expect(encoded[i]).toBe(0x00);
    }
  });

  it('contains ESC @ initialize command after invalidate', () => {
    const bytesPerRow = Math.ceil(PRINT_WIDTH_DOTS / 8);
    const bitmap = Buffer.alloc(bytesPerRow * PRINT_HEIGHT_DOTS, 0);
    const encoded = encodeLabel(bitmap);

    // 400バイト目以降にESC @ (0x1b 0x40)
    expect(encoded[400]).toBe(0x1b);
    expect(encoded[401]).toBe(0x40);
  });

  it('contains raster mode switch command', () => {
    const bytesPerRow = Math.ceil(PRINT_WIDTH_DOTS / 8);
    const bitmap = Buffer.alloc(bytesPerRow * PRINT_HEIGHT_DOTS, 0);
    const encoded = encodeLabel(bitmap);

    // ESC i a 1 (0x1b 0x69 0x61 0x01)
    expect(encoded[402]).toBe(0x1b);
    expect(encoded[403]).toBe(0x69);
    expect(encoded[404]).toBe(0x61);
    expect(encoded[405]).toBe(0x01);
  });

  it('contains correct media info flags (0x8E)', () => {
    const bytesPerRow = Math.ceil(PRINT_WIDTH_DOTS / 8);
    const bitmap = Buffer.alloc(bytesPerRow * PRINT_HEIGHT_DOTS, 0);
    const encoded = encodeLabel(bitmap);

    // ESC i z の後のflags byte
    // 406: 0x1b, 407: 0x69, 408: 0x7a, 409: flags
    expect(encoded[406]).toBe(0x1b);
    expect(encoded[407]).toBe(0x69);
    expect(encoded[408]).toBe(0x7a);
    expect(encoded[409]).toBe(0x8e); // PI_QUALITY | PI_LENGTH | PI_WIDTH | PI_KIND
    expect(encoded[410]).toBe(0x0b); // die-cut
    expect(encoded[411]).toBe(0x1d); // 29mm
    expect(encoded[412]).toBe(0x3e); // 62mm
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
