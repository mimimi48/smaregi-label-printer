import { describe, it, expect } from 'vitest';
import { generateBarcode } from '../../src/label/barcode.js';

describe('generateBarcode', () => {
  it('generates a PNG buffer for valid JAN code', async () => {
    const png = await generateBarcode('4901234567894');

    expect(png).toBeInstanceOf(Buffer);
    expect(png.length).toBeGreaterThan(0);

    // PNGシグネチャ確認
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50); // P
    expect(png[2]).toBe(0x4e); // N
    expect(png[3]).toBe(0x47); // G
  });

  it('throws on invalid JAN code', async () => {
    await expect(generateBarcode('123')).rejects.toThrow();
  });
});
