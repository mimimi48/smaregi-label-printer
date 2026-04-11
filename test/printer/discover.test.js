import { describe, expect, it } from 'vitest';
import { _test } from '../../src/printer/discover.js';

describe('printer discovery name extraction', () => {
  it('extracts Brother model name from the status page heading', () => {
    const html = '<title>Brother TD-4550DNWB</title><div id="modelName"><h1>TD-4550DNWB</h1></div>';

    expect(_test.extractPrinterName(html)).toBe('TD-4550DNWB');
  });

  it('falls back to the page title and removes Brother prefix', () => {
    const html = '<title>Brother TD-4550DNWB</title>';

    expect(_test.extractPrinterName(html)).toBe('TD-4550DNWB');
  });

  it('decodes HTML entities in names', () => {
    expect(_test.decodeHtmlEntities('TD&#45;4550DNWB&nbsp;&amp;&nbsp;Ready')).toBe('TD-4550DNWB & Ready');
  });

  it('falls back to known server headers', () => {
    const headers = new Headers({ server: 'EPSON_Linux UPnP/1.0 Epson UPnP SDK/1.0' });

    expect(_test.extractPrinterName('', headers)).toBe('EPSON');
  });
});
