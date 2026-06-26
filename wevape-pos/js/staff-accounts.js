const StaffAccountsModule = (() => {
  function render() {
    const el = document.getElementById("panel-staff-accounts");
    el.innerHTML = `
      <h2 class="pageTitle">직원 계정 관리</h2>
      <div class="card">
        <div style="text-align:center;padding:40px 20px">
          <div style="font-size:48px;margin-bottom:16px">🔐</div>
          <div style="font-weight:700;font-size:18px;margin-bottom:8px">로그인/권한 시스템 구축 중</div>
          <div class="muted">2단계 권한 분리 작업 완료 후 활성화됩니다.</div>
        </div>
      </div>
    `;
  }
  return { render };
})();
