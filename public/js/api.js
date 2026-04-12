/**
 * API通信モジュール
 */

function getStoredPin() {
  return sessionStorage.getItem('app-pin') || '';
}

export function setStoredPin(pin) {
  sessionStorage.setItem('app-pin', pin);
}

function authHeaders() {
  const pin = getStoredPin();
  return pin ? { 'X-App-Pin': pin } : {};
}

async function request(url, options = {}) {
  const res = await fetch(url, options);

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res;
}

export async function searchProducts(query, page = 1) {
  const params = new URLSearchParams({ q: query, page: String(page) });
  const res = await request(`/api/products?${params}`);
  return res.json();
}

export async function printLabels(items) {
  const res = await request('/api/print', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  return res.json();
}

export async function getPrinterStatus() {
  const res = await request('/api/printer/status');
  return res.json();
}

export function getPreviewUrl(productName, janCode) {
  const params = new URLSearchParams({ productName, janCode });
  return `/api/preview?${params}`;
}

export async function getSettings() {
  const res = await request('/api/settings', {
    headers: { ...authHeaders() },
  });
  return res.json();
}

export async function saveSettings(settings) {
  const res = await request('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(settings),
  });
  return res.json();
}

export async function downloadPrn(items) {
  const res = await fetch('/api/print-prn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.blob();
}

export async function discoverPrinters() {
  const res = await request('/api/printer/discover', {
    headers: { ...authHeaders() },
  });
  return res.json();
}
