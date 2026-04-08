import { searchProducts, printLabels, getPrinterStatus, getPreviewUrl } from './api.js';

// ── State ──

let queue = [];
let searchPage = 1;
let searchQuery = '';
let searching = false;

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
  queue = [];
  renderQueue();
});

// ── Print ──

printAllBtn.addEventListener('click', async () => {
  if (queue.length === 0) return;

  printingOverlay.hidden = false;
  const total = queue.reduce((sum, item) => sum + item.quantity, 0);
  printingStatus.textContent = `印刷中… (${total}枚)`;

  try {
    const result = await printLabels(queue);

    if (result.failed > 0) {
      showToast(`${result.printed}枚印刷 / ${result.failed}件エラー`);
    } else {
      showToast(`${result.printed}枚の印刷が完了しました`);
      queue = [];
      renderQueue();
    }
  } catch (err) {
    showToast(`印刷エラー: ${err.message}`);
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
    printerStatus.className = `printer-status ${online ? 'online' : 'offline'}`;
    printerStatus.querySelector('.status-text').textContent = online ? 'オンライン' : 'オフライン';
  } catch {
    printerStatus.className = 'printer-status offline';
    printerStatus.querySelector('.status-text').textContent = 'オフライン';
  }
}

// 30秒ごとにステータスチェック
updatePrinterStatus();
setInterval(updatePrinterStatus, 30_000);

// ── Toast ──

function showToast(message) {
  let toast = $('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ── Utility ──

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
