import { searchProducts, printLabels, getPrinterStatus, getPreviewUrl, getSettings, saveSettings, discoverPrinters, setStoredPin } from './api.js';

// ── State ──

const QUEUE_KEY = 'label-print-queue';
let queue = loadQueue();
let searchPage = 1;
let searchQuery = '';
let searching = false;
let printerOnline = false;
let printerConnectionType = 'tcp';

// ── DOM ──

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const searchInput = $('#searchInput');
const productList = $('#productList');
const loadMore = $('#loadMore');
const loadMoreBtn = $('#loadMoreBtn');
const queueList = $('#queueList');
const queueFooter = $('#queueFooter');
const queueBadge = $('#queueBadge');
const totalLabels = $('#totalLabels');
const printAllBtn = $('#printAllBtn');
const clearQueueBtn = $('#clearQueueBtn');
const printerStatus = $('#printerStatus');
const previewModal = $('#previewModal');
const previewImage = $('#previewImage');
const printingOverlay = $('#printingOverlay');
const printingStatus = $('#printingStatus');
const airPrintArea = $('#airPrintArea');

// ── Navigation ──

$$('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const viewId = btn.dataset.view;
    $$('.view').forEach((v) => v.classList.remove('active'));
    $(`.view#${viewId}`).classList.add('active');
    $$('.nav-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// ── Barcode Scanner ──

const scanBtn = $('#scanBtn');
const scannerContainer = $('#scannerContainer');
const closeScannerBtn = $('#closeScannerBtn');
let html5QrCode = null;

scanBtn.addEventListener('click', async () => {
  if (scannerContainer.hidden) {
    scannerContainer.hidden = false;
    if (!html5QrCode) {
      html5QrCode = new Html5Qrcode('scanner');
    }
    try {
      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 100 } },
        onScanSuccess
      );
    } catch (err) {
      showToast('カメラを起動できません', true);
      scannerContainer.hidden = true;
    }
  } else {
    stopScanner();
  }
});

closeScannerBtn.addEventListener('click', stopScanner);

async function stopScanner() {
  if (html5QrCode) {
    try { await html5QrCode.stop(); } catch { /* already stopped */ }
  }
  scannerContainer.hidden = true;
}

async function onScanSuccess(decodedText) {
  await stopScanner();
  // スキャンしたコードで検索
  searchInput.value = decodedText;
  searchQuery = decodedText;
  searchPage = 1;
  productList.innerHTML = '';
  performSearch();
  vibrate([100]);
}

// ── Search ──

let debounceTimer;

searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    searchQuery = searchInput.value.trim();
    searchPage = 1;
    productList.innerHTML = '';
    if (searchQuery) {
      performSearch();
    }
  }, 400);
});

async function performSearch(append = false) {
  if (searching) return;
  searching = true;

  try {
    const result = await searchProducts(searchQuery, searchPage);

    if (!append) {
      productList.innerHTML = '';
    }

    if (result.products.length === 0 && !append) {
      productList.innerHTML = '<p class="empty-message">商品が見つかりません</p>';
      loadMore.hidden = true;
      return;
    }

    result.products.forEach((product) => {
      productList.appendChild(createProductCard(product));
    });

    // もっと見るボタン
    const loaded = productList.querySelectorAll('.product-card').length;
    loadMore.hidden = loaded >= result.totalCount;
  } catch (err) {
    showToast(err.message);
  } finally {
    searching = false;
  }
}

loadMoreBtn.addEventListener('click', () => {
  searchPage++;
  performSearch(true);
});

function createProductCard(product) {
  const card = document.createElement('div');
  card.className = 'product-card';

  const inQueue = queue.some((q) => q.janCode === product.janCode);

  card.innerHTML = `
    <div class="product-info">
      <div class="product-name">${escapeHtml(product.productName)}</div>
      <div class="product-jan">${escapeHtml(product.janCode)}</div>
    </div>
    <div class="product-actions">
      <button class="btn-add ${inQueue ? 'added' : ''}" data-jan="${escapeHtml(product.janCode)}">
        ${inQueue ? '&#10003;' : '+'}
      </button>
    </div>
  `;

  // プレビュー（カード本体タップ）
  card.querySelector('.product-info').addEventListener('click', () => {
    showPreview(product.productName, product.janCode);
  });

  // キューに追加（+ボタン）
  card.querySelector('.btn-add').addEventListener('click', (e) => {
    e.stopPropagation();
    addToQueue(product);
    const btn = card.querySelector('.btn-add');
    btn.classList.add('added');
    btn.innerHTML = '&#10003;';
  });

  return card;
}

// ── Queue ──

function addToQueue(product) {
  const existing = queue.find((q) => q.janCode === product.janCode);
  if (existing) {
    existing.quantity++;
  } else {
    queue.push({
      productName: product.productName,
      janCode: product.janCode,
      quantity: 1,
    });
  }
  renderQueue();
  showToast('キューに追加しました');
}

function renderQueue() {
  if (queue.length === 0) {
    queueList.innerHTML = '<p class="empty-message">商品を追加してください</p>';
    queueFooter.hidden = true;
    queueBadge.hidden = true;
    saveQueue();
    return;
  }

  queueFooter.hidden = false;
  queueBadge.hidden = false;

  const total = queue.reduce((sum, item) => sum + item.quantity, 0);
  totalLabels.textContent = total;
  queueBadge.textContent = queue.length;

  queueList.innerHTML = queue.map((item, index) => `
    <div class="queue-item" data-index="${index}">
      <div class="queue-item-info">
        <div class="queue-item-name">${escapeHtml(item.productName)}</div>
        <div class="queue-item-jan">${escapeHtml(item.janCode)}</div>
      </div>
      <div class="quantity-control">
        <button class="qty-minus" data-index="${index}">&minus;</button>
        <span class="quantity-value">${item.quantity}</span>
        <button class="qty-plus" data-index="${index}">+</button>
      </div>
      <button class="btn-remove" data-index="${index}">&times;</button>
    </div>
  `).join('');

  // イベント委譲
  queueList.querySelectorAll('.qty-minus').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.index);
      if (queue[i].quantity > 1) {
        queue[i].quantity--;
      } else {
        queue.splice(i, 1);
      }
      renderQueue();
    });
  });

  queueList.querySelectorAll('.qty-plus').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.index);
      queue[i].quantity++;
      renderQueue();
    });
  });

  queueList.querySelectorAll('.btn-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.index);
      queue.splice(i, 1);
      renderQueue();
    });
  });

  saveQueue();
}

clearQueueBtn.addEventListener('click', () => {
  if (queue.length >= 3 && !confirm(`${queue.length}件の商品をすべて削除しますか？`)) return;
  queue = [];
  renderQueue();
});

// ── Print ──

printAllBtn.addEventListener('click', async () => {
  if (queue.length === 0) return;

  if (printerConnectionType === 'airprint') {
    await printWithAirPrint(queue);
    return;
  }

  if (!printerOnline) {
    showToast('プリンターがオフラインです', true);
    return;
  }

  await printViaTcp();
});

async function printViaTcp() {
  printingOverlay.hidden = false;
  const total = queue.reduce((sum, item) => sum + item.quantity, 0);
  printingStatus.textContent = `印刷中… (${total}枚)`;

  try {
    const result = await printLabels(queue);

    if (result.failed > 0) {
      showToast(`${result.printed}枚印刷 / ${result.failed}件エラー`, true);
    } else {
      showToast(`${result.printed}枚の印刷が完了しました`);
      vibrate([100]);
      saveToHistory(queue);
      queue = [];
      renderQueue();
    }
  } catch (err) {
    showToast(`印刷エラー: ${err.message}`, true);
    vibrate([200, 100, 200]);
  } finally {
    printingOverlay.hidden = true;
  }
}

async function printWithAirPrint(items) {
  printingOverlay.hidden = false;
  printingStatus.innerHTML = '<span>PDFを生成中…</span>';

  try {
    const res = await fetch('/api/print-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(body.error || `HTTP ${res.status}`);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const total = items.reduce((sum, item) => sum + (item.quantity || 1), 0);

    // スピナーを消して印刷ボタンを表示
    printingStatus.innerHTML = `
      <p style="font-size:1.1rem;margin-bottom:16px">${total}枚のラベルPDFを生成しました</p>
      <button id="airPrintBtn" class="btn btn-primary btn-lg" style="width:100%;max-width:280px;margin-bottom:12px">プリント</button>
      <br>
      <button id="airPrintCloseBtn" class="btn btn-ghost" style="color:white">閉じる</button>
    `;
    $('.spinner').hidden = true;

    document.getElementById('airPrintBtn').addEventListener('click', () => {
      // PDFをiframeに読み込んで直接印刷ダイアログを開く
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;left:-9999px;width:0;height:0';
      iframe.src = url;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } catch {
          // iframe印刷できない場合はPDFを直接開く
          window.open(url, '_blank');
        }
      };
    });

    document.getElementById('airPrintCloseBtn').addEventListener('click', () => {
      printingOverlay.hidden = true;
      $('.spinner').hidden = false;
      URL.revokeObjectURL(url);
    });

    saveToHistory(items);
  } catch (err) {
    showToast(`AirPrint準備エラー: ${err.message}`, true);
    printingOverlay.hidden = true;
  }
}

function applyPrintPageSize() {
  let style = document.getElementById('airprint-page-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'airprint-page-style';
    document.head.appendChild(style);
  }
  const model = availableProfiles.find((m) => m.id === settingPrinterModel.value);
  const labelSize = model?.labelSizes.find((s) => s.id === settingLabelSize.value);
  if (labelSize) {
    const [w, h] = labelSize.id.split('x').map(Number);
    style.textContent = `@media print { @page { size: ${w}mm ${h}mm; } .airprint-label { width: ${w}mm; height: ${h}mm; } }`;
  }
}

function renderAirPrintLabels(items) {
  airPrintArea.innerHTML = '';
  for (const item of items) {
    const quantity = Math.min(Math.max(1, item.quantity || 1), 50);
    for (let i = 0; i < quantity; i++) {
      const label = document.createElement('div');
      label.className = 'airprint-label';

      const img = document.createElement('img');
      img.alt = `${item.productName} ${item.janCode}`;
      img.src = getPreviewUrl(item.productName, item.janCode);

      label.appendChild(img);
      airPrintArea.appendChild(label);
    }
  }
}

async function waitForAirPrintImages() {
  const images = [...airPrintArea.querySelectorAll('img')];
  await Promise.all(images.map((img) => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', () => reject(new Error('ラベル画像を生成できませんでした')), { once: true });
    });
  }));
}

// ── Preview ──

function showPreview(productName, janCode) {
  previewImage.src = getPreviewUrl(productName, janCode);
  previewModal.hidden = false;
}

$('#closePreview').addEventListener('click', () => {
  previewModal.hidden = true;
});

$('#cancelPreview').addEventListener('click', () => {
  previewModal.hidden = true;
});

$('.modal-backdrop')?.addEventListener('click', () => {
  previewModal.hidden = true;
});

// ── Printer Status ──

async function updatePrinterStatus() {
  try {
    const { online, connectionType } = await getPrinterStatus();
    printerConnectionType = connectionType || 'tcp';
    if (printerConnectionType === 'airprint') {
      printerOnline = true;
      printerStatus.className = 'printer-status online';
      printerStatus.querySelector('.status-text').textContent = 'AirPrint';
      printAllBtn.disabled = false;
      return;
    }
    printerOnline = online;
    printerStatus.className = `printer-status ${online ? 'online' : 'offline'}`;
    printerStatus.querySelector('.status-text').textContent = online ? 'オンライン' : 'オフライン';
    printAllBtn.disabled = !online;
  } catch {
    printerOnline = false;
    printerStatus.className = 'printer-status offline';
    printerStatus.querySelector('.status-text').textContent = 'オフライン';
    printAllBtn.disabled = true;
  }
}

// 30秒ごとにステータスチェック
updatePrinterStatus();
setInterval(updatePrinterStatus, 60_000);

// ── Toast ──

let toastTimer;

function showToast(message, isError = false) {
  let toast = $('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), isError ? 5000 : 2500);
}

// ── Vibration ──

function vibrate(pattern) {
  if (navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

// ── Settings ──

const settingPrinterModel = $('#settingPrinterModel');
const settingLabelSize = $('#settingLabelSize');
const settingPrinterIp = $('#settingPrinterIp');
const settingPrinterPort = $('#settingPrinterPort');
const settingPrinterConnectionType = $('#settingPrinterConnectionType');
let availableProfiles = [];
const tcpPrinterFields = $('#tcpPrinterFields');
const airPrintFields = $('#airPrintFields');
const settingContractId = $('#settingContractId');
const settingClientId = $('#settingClientId');
const settingClientSecret = $('#settingClientSecret');
const saveSettingsBtn = $('#saveSettingsBtn');
const settingsStatus = $('#settingsStatus');
const settingCutMode = $('#settingCutMode');
const discoverPrinterBtn = $('#discoverPrinterBtn');
const discoverResult = $('#discoverResult');

const pinGate = $('#pinGate');
const settingsForm = $('#settingsForm');
const pinInput = $('#pinInput');
const pinSubmitBtn = $('#pinSubmitBtn');
const pinError = $('#pinError');
const settingAppPin = $('#settingAppPin');

async function loadSettings() {
  try {
    const config = await getSettings();
    // プロファイルドロップダウンを構築
    availableProfiles = config.availableProfiles || [];
    populateModelDropdown(config.printerModel || 'TD-4550DNWB');
    updateLabelSizeOptions(config.labelSize || '49x24');

    settingPrinterConnectionType.value = config.printerConnectionType || 'tcp';
    printerConnectionType = settingPrinterConnectionType.value;
    settingPrinterIp.value = config.printerIp || '';
    settingPrinterPort.value = config.printerPort || 9100;
    settingContractId.value = config.smaregiContractId || '';
    settingClientId.value = config.smaregiClientId || '';
    settingClientSecret.value = config.smaregiClientSecret || '';
    updatePrinterConnectionFields();
    settingCutMode.value = config.cutMode || 'end';
    settingsForm.hidden = false;
    pinGate.hidden = true;
  } catch (err) {
    if (err.message.includes('PIN')) {
      // PIN認証が必要
      pinGate.hidden = false;
      settingsForm.hidden = true;
    }
  }
}

pinSubmitBtn.addEventListener('click', async () => {
  const pin = pinInput.value.trim();
  if (!pin) return;
  setStoredPin(pin);
  pinError.textContent = '';
  try {
    await loadSettings();
  } catch {
    pinError.textContent = 'PINが正しくありません';
    pinError.className = 'settings-status error';
  }
});

pinInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') pinSubmitBtn.click();
});

function populateModelDropdown(selectedModel) {
  settingPrinterModel.innerHTML = '';
  for (const model of availableProfiles) {
    const opt = document.createElement('option');
    opt.value = model.id;
    opt.textContent = model.name;
    settingPrinterModel.appendChild(opt);
  }
  settingPrinterModel.value = selectedModel;
}

function updateLabelSizeOptions(selectedSize) {
  const modelId = settingPrinterModel.value;
  const model = availableProfiles.find((m) => m.id === modelId);
  settingLabelSize.innerHTML = '';
  if (model) {
    for (const size of model.labelSizes) {
      const opt = document.createElement('option');
      opt.value = size.id;
      opt.textContent = size.name;
      settingLabelSize.appendChild(opt);
    }
  }
  if (selectedSize) {
    settingLabelSize.value = selectedSize;
  }
}

settingPrinterModel.addEventListener('change', () => {
  updateLabelSizeOptions();
});

loadSettings();

settingPrinterConnectionType.addEventListener('change', updatePrinterConnectionFields);

function updatePrinterConnectionFields() {
  const useAirPrint = settingPrinterConnectionType.value === 'airprint';
  tcpPrinterFields.hidden = useAirPrint;
  airPrintFields.hidden = !useAirPrint;
  $('#cutModeField').hidden = useAirPrint;
}

saveSettingsBtn.addEventListener('click', async () => {
  saveSettingsBtn.disabled = true;
  settingsStatus.textContent = '保存中…';
  settingsStatus.className = 'settings-status';

  try {
    await saveSettings({
      printerModel: settingPrinterModel.value,
      labelSize: settingLabelSize.value,
      printerConnectionType: settingPrinterConnectionType.value,
      printerIp: settingPrinterIp.value,
      printerPort: settingPrinterPort.value,
      cutMode: settingCutMode.value,
      smaregiContractId: settingContractId.value,
      smaregiClientId: settingClientId.value,
      smaregiClientSecret: settingClientSecret.value,
      appPin: settingAppPin.value || undefined,
    });

    settingsStatus.textContent = '設定を保存しました';
    printerConnectionType = settingPrinterConnectionType.value;
    // ステータス再チェック
    updatePrinterStatus();
  } catch (err) {
    settingsStatus.textContent = `保存エラー: ${err.message}`;
    settingsStatus.className = 'settings-status error';
  } finally {
    saveSettingsBtn.disabled = false;
  }
});

discoverPrinterBtn.addEventListener('click', async () => {
  discoverPrinterBtn.disabled = true;
  discoverResult.hidden = false;
  discoverResult.innerHTML = '<p>検出中… (数秒かかります)</p>';

  try {
    const { printers } = await discoverPrinters();
    if (printers.length === 0) {
      discoverResult.innerHTML = '<p>プリンターが見つかりません。電源とネットワーク接続を確認してください。</p>';
    } else {
      discoverResult.innerHTML = '';
      printers.forEach((p) => {
        const item = document.createElement('div');
        item.className = 'discover-item';
        const label = document.createElement('span');
        label.textContent = p.ip + (p.name ? ` (${p.name})` : '');
        const btn = document.createElement('button');
        btn.className = 'btn btn-ghost btn-sm';
        btn.textContent = '選択';
        btn.addEventListener('click', () => {
          settingPrinterIp.value = p.ip;
        });
        item.appendChild(label);
        item.appendChild(btn);
        discoverResult.appendChild(item);
      });
    }
  } catch (err) {
    discoverResult.innerHTML = `<p>検出エラー: ${escapeHtml(err.message)}</p>`;
  } finally {
    discoverPrinterBtn.disabled = false;
  }
});

// ── History (localStorage) ──

const HISTORY_KEY = 'label-print-history';
const MAX_HISTORY = 20;

function saveToHistory(items) {
  const history = getHistory();
  for (const item of items) {
    // 既に履歴にあれば先頭に移動
    const idx = history.findIndex((h) => h.janCode === item.janCode);
    if (idx !== -1) history.splice(idx, 1);
    history.unshift({ productName: item.productName, janCode: item.janCode });
  }
  history.length = Math.min(history.length, MAX_HISTORY);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { /* quota exceeded */ }
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

function showHistory() {
  const history = getHistory();
  if (history.length === 0) return;

  productList.innerHTML = `<p class="section-label">最近印刷した商品</p>`;
  history.forEach((product) => {
    productList.appendChild(createProductCard(product));
  });
}

// ── Queue Persistence ──

function saveQueue() {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch { /* quota exceeded */ }
}

function loadQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

// 初期表示で履歴を表示
showHistory();
// キューが残っていれば復元表示
if (queue.length > 0) renderQueue();

// ── Utility ──

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
