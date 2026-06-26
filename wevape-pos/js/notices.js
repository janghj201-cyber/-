// ── 공지사항 팝업 (로그인 후 자동 표시) ─────────────────────────────────────

const NOTICES_SEEN_KEY = "wevape_notices_seen_at";

async function checkAndShowNotices() {
  try {
    const lastSeen  = localStorage.getItem(NOTICES_SEEN_KEY) || "2020-01-01T00:00:00Z";
    const today     = new Date().toISOString().slice(0, 10);
    const storeId   = localStorage.getItem("wevape_user_store_id");

    const rows = await sbGet(
      "notices?select=id,title,content,target_store_id,created_at" +
      "&tenant_id=eq." + TENANT_ID +
      "&created_at=gt." + lastSeen +
      "&or=(expires_at.is.null,expires_at.gte." + today + ")" +
      "&order=created_at.asc"
    );

    // 내 매장 대상이거나 전체 매장 공지만 필터
    const relevant = rows.filter(n =>
      !n.target_store_id || n.target_store_id === storeId
    );

    if (relevant.length > 0) showNoticePopup(relevant);
  } catch (err) {
    // 공지 확인 실패는 조용히 무시
  }
}

function showNoticePopup(notices) {
  const modal    = document.getElementById("noticeModal");
  const bodyEl   = document.getElementById("noticeModalItems");
  const closeBtn = document.getElementById("noticeModalClose");
  if (!modal || !bodyEl) return;

  bodyEl.innerHTML = notices.map((n, i) => `
    <div style="${i > 0 ? "border-top:1px solid var(--line);margin-top:16px;padding-top:16px" : ""}">
      <div style="font-weight:700;font-size:15px;margin-bottom:6px">${n.title}</div>
      <div style="white-space:pre-wrap;font-size:14px;line-height:1.6;color:var(--ink-soft)">${n.content}</div>
      <div class="muted" style="margin-top:6px;font-size:12px">${new Date(n.created_at).toLocaleDateString("ko-KR")}</div>
    </div>
  `).join("");

  modal.style.display = "flex";

  const close = () => {
    modal.style.display = "none";
    localStorage.setItem(NOTICES_SEEN_KEY, new Date().toISOString());
  };

  closeBtn.onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };
}

// ── 공지사항 관리 모듈 (관리자 전용) ─────────────────────────────────────────

const NoticesModule = (() => {
  let allStores = [];

  function render() {
    const el = document.getElementById("panel-notices");
    el.innerHTML = `
      <h2 class="pageTitle">공지사항 발송</h2>

      <!-- 새 공지 작성 -->
      <div class="card" style="margin-bottom:12px">
        <div style="font-weight:700;margin-bottom:12px">새 공지사항 작성</div>
        <input id="no_title" type="text" placeholder="제목 *" style="width:100%;margin-bottom:8px" />
        <textarea id="no_content" placeholder="내용 *" rows="4"
          style="width:100%;margin-bottom:8px;padding:9px 11px;border:1.5px solid var(--line);border-radius:8px;font-family:inherit;font-size:14px;resize:vertical"></textarea>
        <div class="row" style="margin-bottom:8px;flex-wrap:wrap">
          <select id="no_target" style="flex:1">
            <option value="">전체 매장</option>
          </select>
          <div class="row" style="flex:1;gap:4px;align-items:center">
            <label class="muted" style="font-size:13px;white-space:nowrap">만료일 (선택)</label>
            <input id="no_expires" type="date" style="flex:1" />
          </div>
        </div>
        <button id="no_sendBtn" style="width:100%">📢 공지 발송</button>
        <div class="muted" id="no_sendStatus" style="margin-top:8px"></div>
      </div>

      <!-- 공지 목록 -->
      <div class="card">
        <div style="font-weight:700;margin-bottom:12px">발송된 공지사항</div>
        <div id="no_list"><div class="muted">불러오는 중...</div></div>
      </div>
    `;
    bind();
    loadAll();
  }

  function bind() {
    document.getElementById("no_sendBtn").addEventListener("click", sendNotice);
  }

  async function loadAll() {
    try {
      const [notices, stores] = await Promise.all([
        sbGet(
          "notices?select=id,title,content,target_store_id,created_at,expires_at,stores(name)" +
          "&tenant_id=eq." + TENANT_ID + "&order=created_at.desc&limit=50"
        ),
        sbGet("stores?select=store_id,name&order=name")
      ]);
      allStores = stores;

      // 대상 매장 드롭다운 채우기
      document.getElementById("no_target").innerHTML =
        `<option value="">전체 매장</option>` +
        stores.map(s => `<option value="${s.store_id}">${s.name}</option>`).join("");

      renderList(notices);
    } catch (err) {
      document.getElementById("no_list").innerHTML = `<div class="muted">오류: ${err.message}</div>`;
    }
  }

  function renderList(notices) {
    const box = document.getElementById("no_list");
    if (!notices.length) {
      box.innerHTML = `<div class="muted">발송된 공지사항이 없습니다.</div>`;
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    box.innerHTML = notices.map(n => {
      const expired  = n.expires_at && n.expires_at < today;
      const target   = n.stores?.name || "전체 매장";
      const dateStr  = new Date(n.created_at).toLocaleDateString("ko-KR");
      const expStr   = n.expires_at ? ` · 만료 ${n.expires_at}` : "";
      return `
        <div style="padding:10px 0;border-bottom:1px solid var(--line);${expired ? "opacity:.5" : ""}">
          <div class="row" style="justify-content:space-between;align-items:flex-start">
            <div style="flex:1">
              <div style="font-weight:600;margin-bottom:2px">${n.title}${expired ? " <span class='muted'>(만료)</span>" : ""}</div>
              <div class="muted" style="font-size:12px">${dateStr} · ${target}${expStr}</div>
              <div style="margin-top:6px;font-size:13px;white-space:pre-wrap;color:var(--ink-soft)">${n.content}</div>
            </div>
            <button class="no-deleteBtn secondary" data-id="${n.id}" style="margin-left:12px;padding:4px 10px;font-size:12px;flex-shrink:0">삭제</button>
          </div>
        </div>
      `;
    }).join("");

    box.querySelectorAll(".no-deleteBtn").forEach(btn => {
      btn.addEventListener("click", () => deleteNotice(btn.dataset.id));
    });
  }

  async function sendNotice() {
    const statusEl = document.getElementById("no_sendStatus");
    const title    = document.getElementById("no_title").value.trim();
    const content  = document.getElementById("no_content").value.trim();
    const storeId  = document.getElementById("no_target").value || null;
    const expires  = document.getElementById("no_expires").value || null;
    if (!title || !content) { statusEl.textContent = "제목과 내용을 입력해주세요."; return; }

    const targetName = storeId
      ? (allStores.find(s => s.store_id === storeId)?.name || "선택 매장")
      : "전체 매장";
    if (!confirm(`[${targetName}] 대상으로 공지를 발송하시겠습니까?`)) return;

    statusEl.textContent = "발송 중...";
    document.getElementById("no_sendBtn").disabled = true;
    try {
      const createdBy = localStorage.getItem("wevape_user_name") || null;
      await sbPost("notices", {
        tenant_id:       TENANT_ID,
        title,
        content,
        target_store_id: storeId,
        expires_at:      expires || null
      }, { "Prefer": "return=representation" });
      statusEl.textContent = "✓ 공지 발송 완료";
      document.getElementById("no_title").value   = "";
      document.getElementById("no_content").value = "";
      document.getElementById("no_expires").value = "";
      await loadAll();
    } catch (err) {
      statusEl.textContent = "오류: " + err.message;
    } finally {
      document.getElementById("no_sendBtn").disabled = false;
    }
  }

  async function deleteNotice(id) {
    if (!confirm("이 공지사항을 삭제하시겠습니까?")) return;
    try {
      await sbDelete("notices?id=eq." + id);
      await loadAll();
    } catch (err) {
      document.getElementById("no_list").insertAdjacentHTML("beforeend",
        `<div class="muted">삭제 오류: ${err.message}</div>`);
    }
  }

  return { render };
})();
