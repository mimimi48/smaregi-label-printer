import { searchProducts, printLabels, getPrinterStatus, getPreviewUrl, getSettings, saveSettings, discoverPrinters } from './api.js';

// ── State ──

let queue = [];
let searchPage = 1;
let searchQuery = '';
let searching = false;
let printerOnline = false;

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
}

clearQueueBtn.addEventListener('click', () => {
  if (queue.length >= 3 && !confirm(`${queue.length}件の商品をすべて削除しますか？`)) return;
  queue = [];
  renderQueue();
});

// ── Print ──

printAllBtn.addEventListener('click', async () => {
  if (queue.length === 0) return;
  if (!printerOnline) {
    showToast('プリンターがオフラインです', true);
    return;
  }

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
});

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
    const { online } = await getPrinterStatus();
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
setInterval(updatePrinterStatus, 30_000);

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

const settingPrinterIp = $('#settingPrinterIp');
const settingPrinterPort = $('#settingPrinterPort');
const settingContractId = $('#settingContractId');
const settingClientId = $('#settingClientId');
const settingClientSecret = $('#settingClientSecret');
const saveSettingsBtn = $('#saveSettingsBtn');
const settingsStatus = $('#settingsStatus');
const discoverPrinterBtn = $('#discoverPrinterBtn');
const discoverResult = $('#discoverResult');

async function loadSettings() {
  try {
    const config = await getSettings();
    settingPrinterIp.value = config.printerIp || '';
    settingPrinterPort.value = config.printerPort || 9100;
    settingContractId.value = config.smaregiContractId || '';
    settingClientId.value = config.smaregiClientId || '';
    settingClientSecret.value = config.smaregiClientSecret || '';
  } catch {
    // 初回起動時はエラーになる場合がある
  }
}

loadSettings();

saveSettingsBtn.addEventListener('click', async () => {
  saveSettingsBtn.disabled = true;
  settingsStatus.textContent = '保存中…';
  settingsStatus.className = 'settings-status';

  try {
    const result = await saveSettings({
      printerIp: settingPrinterIp.value,
      printerPort: settingPrinterPort.value,
      smaregiContractId: settingContractId.value,
      smaregiClientId: settingClientId.value,
      smaregiClientSecret: settingClientSecret.value,
    });

    settingsStatus.textContent = '設定を保存しました';
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
      discoverResult.innerHTML = printers.map((p) => `
        <div class="discover-item">
          <span>${escapeHtml(p.ip)}${p.name ? ' (' + escapeHtml(p.name) + ')' : ''}</span>
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('settingPrinterIp').value='${p.ip}'">選択</button>
        </div>
      `).join('');
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

// 初期表示で履歴を表示
showHistory();

// ── Utility ──

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
