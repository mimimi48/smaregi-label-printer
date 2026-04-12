import { searchProducts, refreshProducts, printLabels, getPrinterStatus, getPreviewUrl, getSettings, saveSettings, discoverPrinters, setStoredPin, fetchTemplates, saveTemplates as saveTemplatesApi } from './api.js';

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

function switchView(viewId) {
  $$('.view').forEach((v) => v.classList.remove('active'));
  $(`.view#${viewId}`).classList.add('active');
  $$('.nav-btn').forEach((b) => b.classList.remove('active'));
  $(`[data-view="${viewId}"]`).classList.add('active');
  try { localStorage.setItem('active-view', viewId); } catch { /* ignore */ }
}

$$('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

// リロード時にタブ復元
try {
  const saved = localStorage.getItem('active-view');
  if (saved && $(`#${saved}`)) switchView(saved);
} catch { /* ignore */ }

// ── Refresh Products ──

const refreshBtn = $('#refreshBtn');

refreshBtn.addEventListener('click', async () => {
  refreshBtn.disabled = true;
  refreshBtn.style.opacity = '0.5';
  try {
    const result = await refreshProducts();
    showToast(`商品マスタを更新しました (${result.totalCount}件)`);
    // 検索中なら再検索
    if (searchQuery) {
      searchPage = 1;
      productList.innerHTML = '';
      performSearch();
    }
  } catch (err) {
    showToast(`更新エラー: ${err.message}`, true);
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.style.opacity = '';
  }
});

// ── Barcode Scanner ──

const scanBtn = $('#scanBtn');
const scannerContainer = $('#scannerContainer');
const closeScannerBtn = $('#closeScannerBtn');
const scannerVideo = $('#scannerVideo');

let scannerStream = null;
let scannerDetector = null;
let scannerRAF = null;
let useNativeDetector = false;

// Native BarcodeDetector対応チェック
try {
  if ('BarcodeDetector' in window) {
    const supported = await BarcodeDetector.getSupportedFormats();
    const needed = ['ean_13', 'ean_8'].filter(f => supported.includes(f));
    if (needed.length > 0) {
      scannerDetector = new BarcodeDetector({ formats: needed });
      useNativeDetector = true;
    }
  }
} catch { /* Native API not available */ }

scanBtn.addEventListener('click', () => {
  if (scannerContainer.hidden) {
    startScanner();
  } else {
    stopScanner();
  }
});

closeScannerBtn.addEventListener('click', stopScanner);

async function startScanner() {
  scannerContainer.hidden = false;
  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      },
      audio: false,
    });

    scannerVideo.srcObject = scannerStream;

    // 連続オートフォーカス設定
    setTimeout(() => {
      try {
        const track = scannerStream.getVideoTracks()[0];
        const caps = track.getCapabilities();
        const adv = {};
        if (caps.focusMode && caps.focusMode.includes('continuous')) {
          adv.focusMode = 'continuous';
        }
        if (caps.exposureMode && caps.exposureMode.includes('continuous')) {
          adv.exposureMode = 'continuous';
        }
        if (Object.keys(adv).length > 0) {
          track.applyConstraints({ advanced: [adv] });
        }
      } catch { /* capabilities not supported */ }
    }, 800);

    if (useNativeDetector) {
      startNativeDetection();
    } else {
      startQuaggaDetection();
    }
  } catch (err) {
    const msg = (err.name === 'NotAllowedError' || String(err).includes('Permission'))
      ? 'カメラの使用を許可してください（設定 > Safari > カメラ）'
      : 'カメラを起動できません';
    showToast(msg, true);
    scannerContainer.hidden = true;
  }
}

function startNativeDetection() {
  const detect = () => {
    if (!scannerStream) return;
    scannerDetector.detect(scannerVideo).then((barcodes) => {
      if (barcodes.length > 0) {
        onScanSuccess(barcodes[0].rawValue);
        return;
      }
      // 次のフレームをスケジュール
      if ('requestVideoFrameCallback' in scannerVideo) {
        scannerVideo.requestVideoFrameCallback(detect);
      } else {
        scannerRAF = requestAnimationFrame(detect);
      }
    }).catch(() => {
      scannerRAF = requestAnimationFrame(detect);
    });
  };

  if ('requestVideoFrameCallback' in scannerVideo) {
    scannerVideo.requestVideoFrameCallback(detect);
  } else {
    scannerRAF = requestAnimationFrame(detect);
  }
}

function startQuaggaDetection() {
  Quagga.init({
    inputStream: {
      name: 'Live',
      type: 'LiveStream',
      target: $('#scanner'),
      constraints: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      area: { top: '25%', right: '10%', left: '10%', bottom: '25%' },
    },
    decoder: {
      readers: ['ean_reader', 'ean_8_reader', 'code_128_reader'],
      multiple: false,
    },
    locate: true,
    locator: { patchSize: 'medium', halfSample: true },
    frequency: 10,
  }, (err) => {
    if (err) {
      showToast('スキャナーの初期化に失敗しました', true);
      return;
    }
    Quagga.start();
    Quagga.onDetected((result) => {
      if (result.codeResult && result.codeResult.code) {
        onScanSuccess(result.codeResult.code);
      }
    });
  });
}

function stopScanner() {
  if (scannerRAF) {
    cancelAnimationFrame(scannerRAF);
    scannerRAF = null;
  }
  if (scannerStream) {
    scannerStream.getTracks().forEach(t => t.stop());
    scannerStream = null;
  }
  scannerVideo.srcObject = null;

  // Quaggaが動いていれば停止
  try { Quagga.stop(); Quagga.offDetected(); } catch { /* not running */ }
  // Quaggaが生成したvideo/canvasを削除
  $('#scanner').querySelectorAll('video:not(#scannerVideo), canvas').forEach(el => el.remove());

  scannerContainer.hidden = true;
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.3;
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch { /* audio not supported */ }
}

function onScanSuccess(decodedText) {
  stopScanner();
  playBeep();
  vibrate([100]);
  // スキャンしたコードで検索
  searchInput.value = decodedText;
  searchQuery = decodedText;
  searchPage = 1;
  productList.innerHTML = '';
  performSearch();
}

// カメラ解放: タブ切り替え時
document.addEventListener('visibilitychange', () => {
  if (document.hidden && scannerStream) {
    stopScanner();
  }
});

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

  const existing = queue.find((q) => q.janCode === product.janCode);
  const currentQty = existing ? existing.quantity : 0;

  card.innerHTML = `
    <div class="product-info">
      <div class="product-name">${escapeHtml(product.productName)}</div>
      <div class="product-jan">${escapeHtml(product.janCode)}</div>
    </div>
    <div class="quantity-control compact">
      <button class="qty-minus">&minus;</button>
      <span class="quantity-value">${currentQty}</span>
      <button class="qty-plus">+</button>
    </div>
  `;

  const qtyValue = card.querySelector('.quantity-value');
  const minusBtn = card.querySelector('.qty-minus');
  const plusBtn = card.querySelector('.qty-plus');

  function updateQty(delta) {
    const cur = parseInt(qtyValue.textContent, 10);
    const next = Math.max(0, cur + delta);
    qtyValue.textContent = next;
    setQueueQuantity(product, next);
  }

  minusBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    updateQty(-1);
  });

  plusBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    updateQty(1);
  });

  // プレビュー（カード本体タップ）
  card.querySelector('.product-info').addEventListener('click', () => {
    showPreview(product.productName, product.janCode);
  });

  return card;
}

// ── Queue ──

/**
 * キュー内の商品の数量を設定する。0なら削除。
 */
function setQueueQuantity(product, quantity) {
  const idx = queue.findIndex((q) => q.janCode === product.janCode);
  if (quantity <= 0) {
    if (idx !== -1) queue.splice(idx, 1);
  } else if (idx !== -1) {
    queue[idx].quantity = quantity;
  } else {
    queue.push({
      productName: product.productName,
      janCode: product.janCode,
      quantity,
    });
  }
  renderQueue();
}

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

/**
 * 任意のアイテムリストを印刷する共通関数
 * @param {Array} items - 印刷するアイテム配列
 * @param {object} options
 * @param {boolean} options.clearQueue - 印刷成功後にキューをクリアするか
 */
async function printItems(items, { clearQueue: shouldClearQueue = false } = {}) {
  if (items.length === 0) return;

  if (printerConnectionType === 'airprint') {
    await printWithAirPrint(items);
    return;
  }

  if (!printerOnline) {
    showToast('プリンターがオフラインです', true);
    return;
  }

  printingOverlay.hidden = false;
  const total = items.reduce((sum, item) => sum + item.quantity, 0);
  printingStatus.textContent = `印刷中… (${total}枚)`;

  try {
    const result = await printLabels(items);

    if (result.failed > 0) {
      showToast(`${result.printed}枚印刷 / ${result.failed}件エラー`, true);
    } else {
      showToast(`${result.printed}枚の印刷が完了しました`);
      vibrate([100]);
      saveToHistory(items);
      if (shouldClearQueue) {
        queue = [];
        renderQueue();
      }
    }
  } catch (err) {
    showToast(`印刷エラー: ${err.message}`, true);
    vibrate([200, 100, 200]);
  } finally {
    printingOverlay.hidden = true;
  }
}

printAllBtn.addEventListener('click', () => {
  printItems(queue, { clearQueue: true });
});

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
      window.open(url, '_blank');
    });

    document.getElementById('airPrintCloseBtn').addEventListener('click', () => {
      printingOverlay.hidden = true;
      $('.spinner').hidden = false;
      URL.revokeObjectURL(url);
      queue = [];
      renderQueue();
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

// ── Templates ──

const templateList = $('#templateList');
const templateBadge = $('#templateBadge');
const newTemplateBtn = $('#newTemplateBtn');
const backToTemplatesBtn = $('#backToTemplatesBtn');
const saveTemplateBtn = $('#saveTemplateBtn');
const templateNameInput = $('#templateNameInput');
const templateSearchInput = $('#templateSearchInput');
const templateSearchResults = $('#templateSearchResults');
const templateEditList = $('#templateEditList');
const templateEditView = $('#templateEditView');
const templateView = $('#templateView');

let editingTemplateId = null;
let editingTemplateItems = [];
let cachedTemplates = [];

function loadTemplates() {
  return cachedTemplates;
}

async function reloadTemplates() {
  try {
    cachedTemplates = await fetchTemplates();
  } catch {
    cachedTemplates = [];
  }
}

function persistTemplates(templates) {
  cachedTemplates = templates;
  saveTemplatesApi(templates).catch((err) => {
    showToast('テンプレート保存エラー: ' + err.message, true);
  });
}

// ── テンプレート一覧 ──

function renderTemplates() {
  const templates = loadTemplates();

  if (templates.length === 0) {
    templateBadge.hidden = true;
    templateList.innerHTML = '<p class="empty-message">テンプレートがありません</p>';
    return;
  }

  templateBadge.hidden = false;
  templateBadge.textContent = templates.length;

  templateList.innerHTML = '';
  templates.forEach((tpl, index) => {
    const total = tpl.items.reduce((sum, item) => sum + item.quantity, 0);
    const card = document.createElement('div');
    card.className = 'template-card';

    card.innerHTML = `
      <div class="template-card-header">
        <div class="template-card-info">
          <div class="template-card-name">${escapeHtml(tpl.name)}</div>
          <div class="template-card-meta">${tpl.items.length}商品</div>
        </div>
        <div class="template-card-actions">
          <button class="btn-icon" data-action="edit" aria-label="編集" title="編集">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="btn-icon danger" data-action="delete" aria-label="削除" title="削除">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="template-card-items" hidden></div>
    `;

    const itemsContainer = card.querySelector('.template-card-items');

    // 各商品を数量カウンター付きカードとして描画
    tpl.items.forEach((item) => {
      const row = createProductCard({ productName: item.productName, janCode: item.janCode });
      row.style.boxShadow = 'none';
      row.style.borderBottom = '1px solid var(--color-border)';
      row.style.borderRadius = '0';
      itemsContainer.appendChild(row);
    });

    // 展開/折りたたみ
    card.querySelector('.template-card-info').addEventListener('click', () => {
      itemsContainer.hidden = !itemsContainer.hidden;
    });

    // 編集
    card.querySelector('[data-action="edit"]').addEventListener('click', (e) => {
      e.stopPropagation();
      openTemplateEditor(tpl);
    });

    // 削除
    card.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm(`「${tpl.name}」を削除しますか？`)) return;
      const templates = loadTemplates();
      templates.splice(index, 1);
      persistTemplates(templates);
      renderTemplates();
      showToast('テンプレートを削除しました');
    });

    templateList.appendChild(card);
  });
}

// ── テンプレート編集 ──

newTemplateBtn.addEventListener('click', () => {
  openTemplateEditor(null);
});



function openTemplateEditor(tpl) {
  editingTemplateId = tpl ? tpl.id : null;
  editingTemplateItems = tpl ? tpl.items.map(item => ({ ...item })) : [];
  templateNameInput.value = tpl ? tpl.name : '';
  templateSearchInput.value = '';
  templateSearchResults.innerHTML = '';

  // 一覧を隠して編集画面を表示
  $$('.view').forEach((v) => v.classList.remove('active'));
  templateEditView.classList.add('active');
  // ナビのアクティブ状態を維持
  $$('.nav-btn').forEach((b) => b.classList.remove('active'));
  $('[data-view="templateView"]').classList.add('active');

  renderTemplateEditItems();
  templateNameInput.focus();
}

backToTemplatesBtn.addEventListener('click', () => {
  $$('.view').forEach((v) => v.classList.remove('active'));
  templateView.classList.add('active');
});

saveTemplateBtn.addEventListener('click', () => {
  const name = templateNameInput.value.trim();
  if (!name) {
    showToast('テンプレート名を入力してください', true);
    templateNameInput.focus();
    return;
  }
  if (editingTemplateItems.length === 0) {
    showToast('商品を追加してください', true);
    templateSearchInput.focus();
    return;
  }

  const templates = loadTemplates();

  if (editingTemplateId) {
    const idx = templates.findIndex(t => t.id === editingTemplateId);
    if (idx !== -1) {
      templates[idx].name = name;
      templates[idx].items = editingTemplateItems.map(item => ({ ...item }));
    }
  } else {
    templates.unshift({
      id: Date.now().toString(36),
      name,
      items: editingTemplateItems.map(item => ({ ...item })),
    });
  }

  persistTemplates(templates);
  renderTemplates();

  // 一覧に戻る
  $$('.view').forEach((v) => v.classList.remove('active'));
  templateView.classList.add('active');
  showToast('テンプレートを保存しました');
});

// テンプレート編集画面の検索
let tplDebounceTimer;

templateSearchInput.addEventListener('input', () => {
  clearTimeout(tplDebounceTimer);
  tplDebounceTimer = setTimeout(async () => {
    const q = templateSearchInput.value.trim();
    if (!q) {
      templateSearchResults.innerHTML = '';
      return;
    }
    try {
      const result = await searchProducts(q, 1);
      templateSearchResults.innerHTML = '';
      if (result.products.length === 0) {
        templateSearchResults.innerHTML = '<p class="empty-message">商品が見つかりません</p>';
        return;
      }
      result.products.forEach((product) => {
        templateSearchResults.appendChild(createTemplateProductCard(product));
      });
    } catch (err) {
      templateSearchResults.innerHTML = '';
    }
  }, 400);
});

function createTemplateProductCard(product) {
  const card = document.createElement('div');
  card.className = 'product-card';

  const inTemplate = editingTemplateItems.some(item => item.janCode === product.janCode);

  card.innerHTML = `
    <div class="product-info">
      <div class="product-name">${escapeHtml(product.productName)}</div>
      <div class="product-jan">${escapeHtml(product.janCode)}</div>
    </div>
    <button class="btn btn-primary btn-sm tpl-add-btn" ${inTemplate ? 'disabled' : ''}>${inTemplate ? '追加済' : '追加'}</button>
  `;

  card.querySelector('.tpl-add-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const existing = editingTemplateItems.find(item => item.janCode === product.janCode);
    if (!existing) {
      editingTemplateItems.push({
        productName: product.productName,
        janCode: product.janCode,
        quantity: 1,
      });
      renderTemplateEditItems();
    }
    const btn = card.querySelector('.tpl-add-btn');
    btn.disabled = true;
    btn.textContent = '追加済';
    showToast('追加しました');
  });

  return card;
}

function renderTemplateEditItems() {
  if (editingTemplateItems.length === 0) {
    templateEditList.innerHTML = '<p class="empty-message">商品を検索して追加してください</p>';
    return;
  }

  templateEditList.innerHTML = '';
  editingTemplateItems.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'queue-item';
    row.innerHTML = `
      <div class="queue-item-info">
        <div class="queue-item-name">${escapeHtml(item.productName)}</div>
        <div class="queue-item-jan">${escapeHtml(item.janCode)}</div>
      </div>
      <button class="btn-remove">&times;</button>
    `;

    row.querySelector('.btn-remove').addEventListener('click', () => {
      editingTemplateItems.splice(i, 1);
      renderTemplateEditItems();
    });

    templateEditList.appendChild(row);
  });
}

// 初期描画（サーバーからテンプレート取得、localStorage→サーバー移行）
reloadTemplates().then(async () => {
  const LOCAL_KEY = 'label-print-templates';
  try {
    const local = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    if (local.length > 0 && cachedTemplates.length === 0) {
      persistTemplates(local);
      localStorage.removeItem(LOCAL_KEY);
    } else if (local.length > 0) {
      localStorage.removeItem(LOCAL_KEY);
    }
  } catch { /* ignore */ }
  renderTemplates();
});

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
