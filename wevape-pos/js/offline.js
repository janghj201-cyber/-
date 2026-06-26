// ── 오프라인 주문 임시저장 + 자동 동기화 ──────────────────────────────────────

const OFFLINE_DB_NAME    = 'wevape-offline';
const OFFLINE_DB_VERSION = 1;
const PENDING_STORE      = 'pending_orders';

// ── IndexedDB 헬퍼 ────────────────────────────────────────────────────────────

function offlineOpenDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(PENDING_STORE)) {
        db.createObjectStore(PENDING_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function offlineSaveOrder(payload) {
  const db = await offlineOpenDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(PENDING_STORE, 'readwrite');
    const req = tx.objectStore(PENDING_STORE).add({
      payload,
      saved_at: new Date().toISOString()
    });
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function offlineGetPending() {
  const db = await offlineOpenDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(PENDING_STORE, 'readonly');
    const req = tx.objectStore(PENDING_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function offlineDeleteOrder(id) {
  const db = await offlineOpenDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(PENDING_STORE, 'readwrite');
    const req = tx.objectStore(PENDING_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// ── 배너 UI ───────────────────────────────────────────────────────────────────

function offlineResetBanner() {
  const banner = document.getElementById('offlineBanner');
  if (!banner) return;
  banner.style.background = '#b3361f';
  banner.textContent = '🔴 오프라인 모드 — 주문은 임시저장됩니다 (재연결 시 자동 업로드)';
}

async function offlineUpdateBanner() {
  const banner = document.getElementById('offlineBanner');
  if (!banner) return;
  if (!navigator.onLine) {
    banner.style.display    = 'block';
    banner.style.background = '#b3361f';
    banner.textContent = '🔴 오프라인 모드 — 주문은 임시저장됩니다 (재연결 시 자동 업로드)';
    return;
  }
  const rows = await offlineGetPending().catch(() => []);
  if (rows.length > 0) {
    banner.style.display    = 'block';
    banner.style.background = '#b07800';
    banner.textContent = `🟡 미업로드 주문 ${rows.length}건 — 동기화 대기 중`;
  } else {
    banner.style.display = 'none';
    offlineResetBanner();
  }
}

// ── 동기화 ────────────────────────────────────────────────────────────────────

async function offlineSync() {
  if (!navigator.onLine) return;
  const pending = await offlineGetPending().catch(() => []);
  if (!pending.length) return;

  const banner = document.getElementById('offlineBanner');
  if (banner) {
    banner.style.display    = 'block';
    banner.style.background = '#3d7a4a';
    banner.textContent = `🟡 미업로드 주문 ${pending.length}건 동기화 중...`;
  }

  let ok = 0, fail = 0;
  for (const entry of pending) {
    try {
      await sbRpc('register_order', entry.payload);
      await offlineDeleteOrder(entry.id);
      ok++;
    } catch {
      fail++;
    }
  }

  if (!banner) return;
  if (fail === 0) {
    banner.textContent = `✓ ${ok}건 동기화 완료`;
    setTimeout(() => {
      banner.style.display = 'none';
      offlineResetBanner();
    }, 3000);
  } else {
    banner.textContent = `동기화: ${ok}건 성공 / ${fail}건 실패 (재연결 시 재시도)`;
  }
}

// ── 초기화 ────────────────────────────────────────────────────────────────────

function initOffline() {
  offlineUpdateBanner();

  window.addEventListener('online', () => {
    offlineUpdateBanner();
    if (localStorage.getItem('wevape_access_token')) offlineSync();
  });
  window.addEventListener('offline', () => offlineUpdateBanner());

  // 앱 시작 시 미동기화 주문 업로드 시도
  if (navigator.onLine && localStorage.getItem('wevape_access_token')) {
    offlineSync();
  }
}
