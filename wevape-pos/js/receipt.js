// ── 영수증 출력 + 카카오톡 공유 ────────────────────────────────────────────────
// Kakao 앱 JavaScript 키: https://developers.kakao.com 에서 발급 후 입력
const KAKAO_APP_KEY = "";

let _receipt     = null;
let _kakaoReady  = false;

function _initKakao() {
  if (_kakaoReady || !KAKAO_APP_KEY || typeof Kakao === "undefined") return;
  try { Kakao.init(KAKAO_APP_KEY); _kakaoReady = true; } catch (e) {}
}

// ── 영수증 HTML (모달 + 인쇄 공용) ───────────────────────────────────────────

function _receiptHtml(d) {
  const dt  = d.datetime instanceof Date ? d.datetime : new Date(d.datetime);
  const dts = dt.toLocaleString("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit"
  });

  const itemsHtml = d.items.map(it => `
    <div style="display:flex;justify-content:space-between;margin-bottom:2px">
      <span style="flex:1;margin-right:8px">${it.name}${it.qty > 1 ? " × " + it.qty : ""}</span>
      <span style="white-space:nowrap">${fmtWon(it.price * it.qty)}</span>
    </div>
  `).join("");

  const discHtml = d.discount ? `
    <div style="border-top:1px dashed #888;margin:6px 0"></div>
    <div style="display:flex;justify-content:space-between;color:#666;font-size:0.9em">
      <span>할인</span><span>-${fmtWon(d.discount)}</span>
    </div>
  ` : "";

  const custHtml = d.customer
    ? `<div style="text-align:center;font-size:0.85em;color:#666;margin-top:4px">회원: ${d.customer.name}${d.customer.phone ? " · " + d.customer.phone : ""}</div>`
    : "";

  const orderHtml = d.orderId
    ? `<div style="font-size:0.8em;color:#888">주문번호: ${String(d.orderId).slice(0, 8)}</div>`
    : "";

  return `
    <div style="text-align:center;font-size:1.2em;font-weight:800;letter-spacing:.06em;margin-bottom:2px">위베이프</div>
    ${d.storeName ? `<div style="text-align:center;margin-bottom:6px">${d.storeName}</div>` : ""}
    <div style="border-top:2px solid #222;margin:6px 0"></div>
    <div style="font-size:0.85em;color:#555">${dts}</div>
    <div style="font-size:0.85em;color:#555">결제: ${d.paymentMethod}</div>
    ${orderHtml}
    <div style="border-top:1px dashed #888;margin:8px 0"></div>
    ${itemsHtml}
    ${discHtml}
    <div style="border-top:2px solid #222;margin:6px 0"></div>
    <div style="display:flex;justify-content:space-between;font-weight:800;font-size:1.1em">
      <span>합계</span><span>${fmtWon(d.total)}</span>
    </div>
    <div style="border-top:2px solid #222;margin:6px 0"></div>
    ${custHtml}
    <div style="text-align:center;font-weight:700;margin-top:10px;letter-spacing:.08em">감사합니다!</div>
  `;
}

// ── 영수증 텍스트 (카카오 공유용) ─────────────────────────────────────────────

function _receiptText(d) {
  const dt  = d.datetime instanceof Date ? d.datetime : new Date(d.datetime);
  const dts = dt.toLocaleString("ko-KR");
  const lines = d.items.map(it =>
    `  ${it.name}${it.qty > 1 ? " × " + it.qty : ""}  ${fmtWon(it.price * it.qty)}`
  );
  if (d.discount) lines.push(`  (할인 -${fmtWon(d.discount)})`);
  return `[위베이프${d.storeName ? " " + d.storeName : ""}] 영수증\n` +
    `일시: ${dts}\n결제: ${d.paymentMethod}\n` +
    `────────────────\n${lines.join("\n")}\n────────────────\n` +
    `합계: ${fmtWon(d.total)}` +
    (d.customer ? `\n회원: ${d.customer.name}` : "");
}

// ── 인쇄 ─────────────────────────────────────────────────────────────────────

function printReceipt() {
  if (!_receipt) return;
  const area = document.getElementById("receiptPrintArea");
  area.innerHTML = _receiptHtml(_receipt);
  window.print();
  setTimeout(() => { area.innerHTML = ""; }, 1500);
}

// ── 카카오톡 / Web Share 공유 ─────────────────────────────────────────────────

async function shareReceipt() {
  if (!_receipt) return;
  const statusEl = document.getElementById("rc_status");
  const text     = _receiptText(_receipt);
  const appUrl   = location.origin + location.pathname;

  // 1순위: Kakao Share SDK
  _initKakao();
  if (_kakaoReady) {
    try {
      Kakao.Share.sendDefault({
        objectType: "text",
        text,
        link: { mobileWebUrl: appUrl, webUrl: appUrl }
      });
      return;
    } catch (e) {}
  }

  // 2순위: Web Share API (모바일 네이티브 공유창 — 카카오 포함)
  if (navigator.share) {
    try {
      await navigator.share({ title: "위베이프 영수증", text });
      return;
    } catch (e) {
      if (e.name !== "AbortError") console.warn("Share error:", e);
      return;
    }
  }

  // 폴백: 클립보드 복사
  try {
    await navigator.clipboard.writeText(text);
    if (statusEl) statusEl.textContent = "✓ 클립보드에 복사됐습니다. KakaoTalk에 붙여넣기 하세요.";
  } catch {
    if (statusEl) statusEl.textContent = "공유 기능을 지원하지 않는 브라우저입니다.";
  }
}

// ── 영수증 모달 표시 ──────────────────────────────────────────────────────────

function showReceipt(data) {
  _receipt = data;

  const modal   = document.getElementById("receiptModal");
  const content = document.getElementById("receiptContent");
  if (!modal || !content) return;

  content.innerHTML = _receiptHtml(data);

  const hasKakao = KAKAO_APP_KEY || navigator.share;
  const shareBtn = document.getElementById("rc_shareBtn");
  if (shareBtn) shareBtn.style.display = hasKakao ? "" : "none";

  document.getElementById("rc_printBtn").onclick = printReceipt;
  document.getElementById("rc_shareBtn").onclick = shareReceipt;
  document.getElementById("rc_closeBtn").onclick = () => { modal.style.display = "none"; };
  modal.onclick = e => { if (e.target === modal) modal.style.display = "none"; };

  if (document.getElementById("rc_status")) document.getElementById("rc_status").textContent = "";
  modal.style.display = "flex";
}
