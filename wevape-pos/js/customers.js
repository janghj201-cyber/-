const CustomersModule = (() => {
  let stores = [];
  let currentList = [];

  function render() {
    const el = document.getElementById("panel-customers");
    el.innerHTML = `
      <h2 class="pageTitle">고객 관리</h2>
      <div id="cu_listView">
        <div class="card" style="margin-bottom:12px">
          <div class="row" style="margin-bottom:8px;flex-wrap:wrap">
            <select id="cu_storeFilter" style="flex:1"><option value="">전체 매장</option></select>
            <input id="cu_searchInput" type="text" placeholder="이름 또는 전화번호 검색" style="flex:2" />
          </div>
          <div class="row" style="flex-wrap:wrap">
            <select id="cu_genderFilter">
              <option value="">성별 전체</option><option value="남">남</option><option value="여">여</option><option value="미입력">미입력</option>
            </select>
            <select id="cu_ageFilter">
              <option value="">연령대 전체</option><option value="10">10대</option><option value="20">20대</option><option value="30">30대</option><option value="40">40대</option><option value="50">50대 이상</option>
            </select>
            <select id="cu_natFilter">
              <option value="">국적 전체</option><option value="한국">내국인</option><option value="중국">중국인</option><option value="일본">일본인</option><option value="기타">기타외국인</option>
            </select>
            <select id="cu_visitFilter">
              <option value="">방문횟수 전체</option><option value="1">1회</option><option value="2-5">2~5회</option><option value="6-10">6~10회</option><option value="11">11회 이상</option>
            </select>
          </div>
        </div>
        <div class="muted" id="cu_countStatus" style="margin-bottom:8px"></div>
        <div class="card" style="overflow-x:auto">
          <table style="table-layout:fixed;width:100%">
            <colgroup>
              <col style="width:80px"><col style="width:130px">
              <col class="cu-col-age" style="width:70px">
              <col class="cu-col-gender" style="width:60px">
              <col class="cu-col-nat" style="width:80px">
              <col style="width:80px"><col style="width:110px">
              <col class="cu-col-lastvisit" style="width:90px">
            </colgroup>
            <thead>
              <tr>
                <th style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">이름</th>
                <th style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">전화번호</th>
                <th class="cu-col-age" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">연령대</th>
                <th class="cu-col-gender" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">성별</th>
                <th class="cu-col-nat" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">국적</th>
                <th style="text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">방문횟수</th>
                <th style="text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">총구매금액</th>
                <th class="cu-col-lastvisit" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">최근방문</th>
              </tr>
            </thead>
            <tbody id="cu_tableBody"></tbody>
          </table>
        </div>
        <div class="card" id="cu_distroBox" style="margin-top:12px"></div>
      </div>
      <div id="cu_detailView" style="display:none"></div>
      <div class="muted" id="cu_status" style="margin-top:10px"></div>
    `;
    bind();
    loadStores();
  }

  function bind() {
    document.getElementById("cu_storeFilter").addEventListener("change", loadList);
    document.getElementById("cu_genderFilter").addEventListener("change", loadList);
    document.getElementById("cu_ageFilter").addEventListener("change", loadList);
    document.getElementById("cu_natFilter").addEventListener("change", loadList);
    document.getElementById("cu_visitFilter").addEventListener("change", loadList);
    document.getElementById("cu_searchInput").addEventListener("input", () => {
      clearTimeout(window._cuSearchT);
      window._cuSearchT = setTimeout(loadList, 250);
    });
  }

  async function loadStores() {
    try {
      stores = await sbGet("stores?select=store_id,name&order=name");
      document.getElementById("cu_storeFilter").innerHTML =
        `<option value="">전체 매장</option>` + stores.map(s => `<option value="${s.store_id}">${s.name}</option>`).join("");
    } catch (err) {}
    await loadList();
  }

  function storeName(storeId) {
    return stores.find(s => s.store_id === storeId)?.name || "-";
  }

  function ageBucket(birthDate) {
    if (!birthDate) return null;
    const b = new Date(birthDate);
    const now = new Date();
    let age = now.getFullYear() - b.getFullYear();
    if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--;
    return Math.min(50, Math.floor(age / 10) * 10);
  }

  function matchVisitBucket(visits, bucket) {
    if (!bucket) return true;
    const v = visits || 0;
    if (bucket === "1") return v === 1;
    if (bucket === "2-5") return v >= 2 && v <= 5;
    if (bucket === "6-10") return v >= 6 && v <= 10;
    if (bucket === "11") return v >= 11;
    return true;
  }

  async function loadList() {
    const statusEl = document.getElementById("cu_countStatus");
    const storeId = document.getElementById("cu_storeFilter").value;
    const gender = document.getElementById("cu_genderFilter").value;
    const ageFilter = document.getElementById("cu_ageFilter").value;
    const nationality = document.getElementById("cu_natFilter").value;
    const visitFilter = document.getElementById("cu_visitFilter").value;
    const q = document.getElementById("cu_searchInput").value.trim();

    statusEl.textContent = "불러오는 중...";
    try {
      let path = "customers?select=customer_id,name,phone,birth_date,gender,nationality,total_visits,total_amount,last_visit_at,first_visit_store,created_at&order=last_visit_at.desc.nullslast&limit=500";
      if (storeId) path += "&first_visit_store=eq." + storeId;
      if (gender) path += "&gender=eq." + encodeURIComponent(gender);
      if (nationality) path += "&nationality=eq." + encodeURIComponent(nationality);
      if (q) path += "&or=(name.ilike.*" + encodeURIComponent(q) + "*,phone.ilike.*" + encodeURIComponent(q) + "*)";
      let data = await sbGet(path);
      if (ageFilter) data = data.filter(c => ageBucket(c.birth_date) === parseInt(ageFilter, 10));
      if (visitFilter) data = data.filter(c => matchVisitBucket(c.total_visits, visitFilter));
      currentList = data;
      statusEl.textContent = "총 " + data.length.toLocaleString() + "명";
      renderTable();
      renderDistro(storeId);
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  function fmtDateShort(s) {
    if (!s) return "-";
    const d = new Date(s);
    return (d.getMonth() + 1 + "").padStart(2, "0") + "-" + (d.getDate() + "").padStart(2, "0");
  }

  function renderTable() {
    const body = document.getElementById("cu_tableBody");
    body.innerHTML = currentList.map(c => {
      const age = ageBucket(c.birth_date);
      return `
        <tr class="resultRow" data-id="${c.customer_id}" style="cursor:pointer">
          <td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.name || "이름없음"}</td>
          <td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.phone || "-"}</td>
          <td class="cu-col-age">${age !== null ? age + "대" : "-"}</td>
          <td class="cu-col-gender">${c.gender || "-"}</td>
          <td class="cu-col-nat" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.nationality || "-"}</td>
          <td style="text-align:right">${c.total_visits || 0}회</td>
          <td style="text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${fmtWon(c.total_amount)}</td>
          <td class="cu-col-lastvisit">${fmtDateShort(c.last_visit_at)}</td>
        </tr>
      `;
    }).join("") || `<tr><td colspan="8" class="muted">조회된 고객이 없습니다.</td></tr>`;
    body.querySelectorAll("tr[data-id]").forEach(tr => tr.addEventListener("click", () => openDetail(tr.dataset.id)));
  }

  function renderDistro(storeId) {
    const box = document.getElementById("cu_distroBox");
    const list = currentList;
    if (!list.length) { box.innerHTML = ""; return; }
    const label = storeId ? storeName(storeId) : "전체";

    const male = list.filter(c => c.gender === "남").length;
    const female = list.filter(c => c.gender === "여").length;
    const pct = (n) => Math.round((n / list.length) * 100);

    const ageCounts = {};
    list.forEach(c => {
      const b = ageBucket(c.birth_date);
      if (b !== null) ageCounts[b] = (ageCounts[b] || 0) + 1;
    });
    const ageLine = Object.keys(ageCounts).sort((a, b) => a - b)
      .map(b => b + "대 " + pct(ageCounts[b]) + "%").join("  ") || "-";

    const natCounts = {};
    list.forEach(c => { const n = c.nationality || "기타"; natCounts[n] = (natCounts[n] || 0) + 1; });
    const natLabel = { "한국": "내국인", "중국": "중국인", "일본": "일본인", "기타": "기타" };
    const natLine = Object.keys(natCounts).map(n => (natLabel[n] || n) + " " + pct(natCounts[n]) + "%").join("  ") || "-";

    const now = new Date();
    const newThisMonth = list.filter(c => {
      if (!c.created_at) return false;
      const d = new Date(c.created_at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    const revisitCount = list.filter(c => (c.total_visits || 0) > 1).length;
    const revisitRate = Math.round((revisitCount / list.length) * 100);

    box.innerHTML = `
      <div style="font-weight:700;margin-bottom:8px">[ ${label} 고객 분포 ]</div>
      <div class="row" style="justify-content:space-between;padding:4px 0"><span class="muted">성별</span><span>남 ${pct(male)}%  여 ${pct(female)}%</span></div>
      <div class="row" style="justify-content:space-between;padding:4px 0"><span class="muted">연령대</span><span>${ageLine}</span></div>
      <div class="row" style="justify-content:space-between;padding:4px 0"><span class="muted">국적</span><span>${natLine}</span></div>
      <div class="row" style="justify-content:space-between;padding:4px 0"><span class="muted">신규(이번달)</span><span>${newThisMonth}명</span></div>
      <div class="row" style="justify-content:space-between;padding:4px 0"><span class="muted">재방문율</span><span>${revisitRate}%</span></div>
    `;
  }

  async function openDetail(customerId) {
    const statusEl = document.getElementById("cu_status");
    statusEl.textContent = "불러오는 중...";
    try {
      const rows = await sbGet("customers?select=*&customer_id=eq." + customerId);
      const cust = rows[0];
      const orders = await sbGet(
        "orders?select=order_id,order_datetime,payment_method,total_amount,store_id,order_items(qty,products(name))&customer_id=eq." + customerId + "&order=order_datetime.desc&limit=50"
      );
      const mainStoreId = mostFrequentStore(orders) || cust.first_visit_store;
      renderDetail(cust, orders.slice(0, 10), mainStoreId);
      document.getElementById("cu_listView").style.display = "none";
      document.getElementById("cu_detailView").style.display = "block";
      statusEl.textContent = "";
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  function mostFrequentStore(orders) {
    const counts = {};
    orders.forEach(o => { if (o.store_id) counts[o.store_id] = (counts[o.store_id] || 0) + 1; });
    let best = null, bestCount = 0;
    Object.keys(counts).forEach(id => { if (counts[id] > bestCount) { best = id; bestCount = counts[id]; } });
    return best;
  }

  function fmtDateFull(s) {
    if (!s) return "-";
    return new Date(s).toLocaleDateString("ko-KR");
  }

  function renderDetail(cust, recentOrders, mainStoreId) {
    const box = document.getElementById("cu_detailView");
    const age = ageBucket(cust.birth_date);
    const avgOrder = cust.total_visits ? Math.round((cust.total_amount || 0) / cust.total_visits) : 0;

    box.innerHTML = `
      <h2 class="pageTitle">${cust.name || "이름없음"} 고객 상세</h2>

      <div class="card" id="cu_detailView_fields">
        <div style="font-weight:700;margin-bottom:8px">기본정보</div>
        <div id="cu_fieldsDisplay">
          <div class="row" style="justify-content:space-between;padding:3px 0"><span class="muted">이름</span><span>${cust.name || "-"}</span></div>
          <div class="row" style="justify-content:space-between;padding:3px 0"><span class="muted">전화번호</span><span>${cust.phone || "-"}</span></div>
          <div class="row" style="justify-content:space-between;padding:3px 0"><span class="muted">생년월일</span><span>${cust.birth_date || "-"} ${age !== null ? "(" + age + "대)" : ""}</span></div>
          <div class="row" style="justify-content:space-between;padding:3px 0"><span class="muted">성별</span><span>${cust.gender || "-"}</span></div>
          <div class="row" style="justify-content:space-between;padding:3px 0"><span class="muted">국적</span><span>${cust.nationality || "-"}</span></div>
          <div class="row" style="justify-content:space-between;padding:3px 0"><span class="muted">특이사항</span><span>${cust.memo || "-"}</span></div>
          <div class="row" style="justify-content:space-between;padding:3px 0"><span class="muted">주 방문매장</span><span>${mainStoreId ? storeName(mainStoreId) : "-"} (자동)</span></div>
        </div>
        <div id="cu_fieldsEdit" style="display:none">
          <div class="row" style="margin-bottom:8px">
            <input id="cu_editName" type="text" placeholder="이름" style="flex:1" value="${cust.name || ""}" />
            <input id="cu_editPhone" type="text" placeholder="전화번호" style="flex:1" value="${cust.phone || ""}" />
          </div>
          <input id="cu_editBirth" type="date" style="width:100%;margin-bottom:8px" value="${cust.birth_date || ""}" />
          <div class="row" style="margin-bottom:8px">
            ${["남", "여", "미입력"].map(g => `<button type="button" class="${g === cust.gender ? "" : "secondary"} cu-editGender" data-v="${g}">${g}</button>`).join("")}
          </div>
          <div class="row" style="margin-bottom:8px;flex-wrap:wrap">
            ${[["한국", "내국인"], ["중국", "중국인"], ["일본", "일본인"], ["기타", "기타외국인"]].map(([v, l]) => `<button type="button" class="${v === cust.nationality ? "" : "secondary"} cu-editNat" data-v="${v}">${l}</button>`).join("")}
          </div>
          <input id="cu_editMemo" type="text" placeholder="특이사항" style="width:100%;margin-bottom:8px" value="${cust.memo || ""}" />
        </div>
      </div>

      <div class="card">
        <div style="font-weight:700;margin-bottom:8px">방문 통계</div>
        <div class="row" style="justify-content:space-between;padding:3px 0"><span class="muted">첫 방문</span><span>${fmtDateFull(cust.first_visit_at) !== "-" ? fmtDateFull(cust.first_visit_at) : (cust.first_visit_date || "-")}</span></div>
        <div class="row" style="justify-content:space-between;padding:3px 0"><span class="muted">최근 방문</span><span>${fmtDateFull(cust.last_visit_at)}</span></div>
        <div class="row" style="justify-content:space-between;padding:3px 0"><span class="muted">총 방문횟수</span><span>${cust.total_visits || 0}회</span></div>
        <div class="row" style="justify-content:space-between;padding:3px 0"><span class="muted">총 구매금액</span><span>${fmtWon(cust.total_amount)}</span></div>
        <div class="row" style="justify-content:space-between;padding:3px 0"><span class="muted">객단가 평균</span><span>${fmtWon(avgOrder)}</span></div>
        <div class="row" style="justify-content:space-between;padding:3px 0"><span class="muted">포인트 잔액</span><span>${(cust.points || 0).toLocaleString()}P</span></div>
      </div>

      <div class="card">
        <div style="font-weight:700;margin-bottom:8px">구매 이력 (최근 10건)</div>
        ${recentOrders.map(o => {
          const items = o.order_items || [];
          const summary = items.length ? items[0].products?.name + (items.length > 1 ? ` 외 ${items.length - 1}건` : "") : "-";
          return `<div class="row" style="justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--line)">
            <span>${fmtDateShort(o.order_datetime)}  ${summary}  ${o.payment_method}</span>
            <span style="font-weight:700">${fmtWon(o.total_amount)}</span>
          </div>`;
        }).join("") || `<div class="muted">구매 내역이 없습니다.</div>`}
      </div>

      <div class="row" style="justify-content:flex-end;gap:8px">
        <button type="button" id="cu_editBtn" class="secondary">정보 수정</button>
        <button type="button" id="cu_saveBtn" style="display:none">저장</button>
        <button type="button" id="cu_closeBtn" class="secondary">닫기</button>
      </div>
    `;

    let editGender = cust.gender || "미입력";
    let editNat = cust.nationality || "한국";

    document.getElementById("cu_editBtn").addEventListener("click", () => {
      document.getElementById("cu_fieldsDisplay").style.display = "none";
      document.getElementById("cu_fieldsEdit").style.display = "block";
      document.getElementById("cu_editBtn").style.display = "none";
      document.getElementById("cu_saveBtn").style.display = "inline-block";
    });
    document.querySelectorAll(".cu-editGender").forEach(b => b.addEventListener("click", () => {
      editGender = b.dataset.v;
      document.querySelectorAll(".cu-editGender").forEach(x => x.classList.toggle("secondary", x.dataset.v !== editGender));
    }));
    document.querySelectorAll(".cu-editNat").forEach(b => b.addEventListener("click", () => {
      editNat = b.dataset.v;
      document.querySelectorAll(".cu-editNat").forEach(x => x.classList.toggle("secondary", x.dataset.v !== editNat));
    }));
    document.getElementById("cu_saveBtn").addEventListener("click", async () => {
      const statusEl = document.getElementById("cu_status");
      statusEl.textContent = "저장 중...";
      try {
        await sbPatch("customers?customer_id=eq." + cust.customer_id, {
          name: document.getElementById("cu_editName").value.trim() || null,
          phone: document.getElementById("cu_editPhone").value.trim() || null,
          birth_date: document.getElementById("cu_editBirth").value || null,
          gender: editGender,
          nationality: editNat,
          memo: document.getElementById("cu_editMemo").value.trim() || null
        });
        statusEl.textContent = "저장 완료";
        await openDetail(cust.customer_id);
      } catch (err) { statusEl.textContent = "저장 실패: " + err.message; }
    });
    document.getElementById("cu_closeBtn").addEventListener("click", closeDetail);
  }

  function closeDetail() {
    document.getElementById("cu_detailView").style.display = "none";
    document.getElementById("cu_listView").style.display = "block";
    loadList();
  }

  return { render };
})();
