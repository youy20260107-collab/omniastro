
(function(){
  var gate = document.getElementById('auth-gate');
  var gateText = document.getElementById('ag-gate-text');
  var gateNote = document.getElementById('ag-gate-note');
  var loginBtn = document.getElementById('ag-login-btn');
  var userBar = document.getElementById('auth-user-bar');
  var userEmail = document.getElementById('auth-user-email');
  var logoutBtn = document.getElementById('auth-logout-btn');

  function showGate(){
    gate.hidden = false;
    document.body.style.overflow = 'hidden';
    userBar.hidden = true;
  }
  function hideGate(user){
    gate.hidden = true;
    document.body.style.overflow = '';
    userBar.hidden = false;
    var label = (user && (user.email || (user.user_metadata && user.user_metadata.full_name))) || '已登入';
    userEmail.textContent = label;

    // v10.9修正：「管理者專用入口」現在只有指定的管理員帳號登入時才會顯示，
    // 其他任何 Google 帳號登入都完全看不到這個按鈕（先前版本是「任何登入使用者都看得到
    // 入口按鈕，只是點進去內容會被後端擋掉」，這裡改成前端也直接隱藏整個入口，
    // 一般使用者不會被一個「點了也沒用」的按鈕困擾）。後端 ADMIN_EMAILS 名單把關機制不變，
    // 這裡只是額外在前端也做同樣的限制，屬於雙重保險。
    var ADMIN_UI_EMAIL = 'felix670131@gmail.com';
    var adminEntry = document.getElementById('auth-admin-entry');
    var isAdminUser = !!(user && user.email && user.email.toLowerCase() === ADMIN_UI_EMAIL.toLowerCase());
    if (adminEntry) adminEntry.classList.toggle('show', isAdminUser);

    // 通知頁面其他模組（例如命盤存摺）：登入身分已確認，可以開始跟雲端同步資料。
    window.__zmpUser = user;
    document.dispatchEvent(new CustomEvent('zmp:auth-ready', { detail: user }));

    // v10.2 新增：登入成功後記一筆登入紀錄（呼叫 log-login.js，不是自動觸發的
    // identity-login，所以就算這支失敗也絕對不會影響登入本身）。
    recordLoginOnce(user);
  }
  // 每個瀏覽器分頁只記一次，成功才設旗標；失敗（含網路問題）不設旗標，
  // 下次同一分頁再次觸發登入流程時會自動重試，不會被卡住。
  function recordLoginOnce(user){
    var flagOk = true;
    try{ if (sessionStorage.getItem('zmp_login_logged_v1')) return; }
    catch(e){ flagOk = false; }
    if (!user || typeof user.jwt !== 'function') return;
    user.jwt().then(function(token){
      return fetch('/.netlify/functions/log-login', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token }
      });
    }).then(function(res){
      if (res && res.ok && flagOk) {
        try{ sessionStorage.setItem('zmp_login_logged_v1', '1'); }catch(e){}
      }
    }).catch(function(){ /* 安靜失敗，不影響使用者 */ });
  }
  function setNote(msg){
    if (gateNote) gateNote.textContent = msg;
  }

  // ============================================================================
  // 🔧🔧🔧 暫時關閉 Google 登入（測試用開關）🔧🔧🔧
  // 使用者要求暫時關閉登入功能以便測試，這裡改成 true 就會跳過登入畫面直接進入網站。
  // ⚠️ 測試完成後，請務必把下面這行改回 false，才會恢復正常的 Google 登入驗證機制，
  //    否則任何人都能不登入直接使用整個網站（包含雲端命盤存摺等需要帳號的功能會停用，
  //    因為沒有真實登入身分，但排盤、報告等主要功能都能正常使用不受影響）。
  // ============================================================================
  var TEMP_DISABLE_LOGIN = true; // ← 測試期間暫時關閉登入；測試完成後改回 false
  if (TEMP_DISABLE_LOGIN) {
    console.warn('[五象 FiveLens登入] ⚠️ 目前處於「暫時關閉登入」測試模式，任何人不用登入即可使用網站。測試完成後記得把 TEMP_DISABLE_LOGIN 改回 false。');
    hideGate({ email: '（測試模式・未登入）' });
    logoutBtn.addEventListener('click', function(){
      // 測試模式下沒有真正的登入 session，登出按鈕改為「重新顯示登入畫面」方便你自行切換查看效果。
      showGate();
    });
    return; // 略過下方原本的 Netlify Identity 初始化與登入按鈕綁定，兩者互斥、不會同時執行
  }
  // ============================================================================

  // 診斷 1：本站是否透過 http(s) 由 Netlify 實際部署後開啟。
  // Netlify Identity 需要真實的 Netlify 網域＋已啟用 Identity 服務才能運作，
  // 直接雙擊本機 HTML 檔案（file:// 開頭）或用尚未部署的網址測試，登入按鈕必定沒有反應。
  if (location.protocol === 'file:') {
    console.error('[五象 FiveLens登入] 目前是以本機檔案方式開啟（file://），Netlify Identity 無法在此模式下運作，請先部署到 Netlify 後用該網址開啟頁面測試。');
    setNote('⚠️ 目前是用本機檔案開啟，Google 登入功能需部署到 Netlify 後才能測試，請改用正式網址開啟。');
  }

  if (window.netlifyIdentity) {
    netlifyIdentity.on('init', function(user){
      console.log('[五象 FiveLens登入] netlifyIdentity 已初始化，目前使用者：', user);
      if (user) { hideGate(user); } else { showGate(); }
    });
    netlifyIdentity.on('login', function(user){
      console.log('[五象 FiveLens登入] 登入成功：', user);
      hideGate(user);
      netlifyIdentity.close();
    });
    netlifyIdentity.on('logout', function(){
      console.log('[五象 FiveLens登入] 已登出');
      showGate();
    });
    // 診斷 2：widget 本身丟出的錯誤（例如此網域尚未在 Netlify 後台啟用 Identity 服務）
    netlifyIdentity.on('error', function(err){
      console.error('[五象 FiveLens登入] netlifyIdentity 錯誤：', err);
      var raw = (err && err.message) || '';
      if (/Failed to load settings/i.test(raw) || /Unable to locate site configuration/i.test(raw)) {
        setNote('這個網站在 Netlify 上的登入服務（Identity）還沒接上，常見原因：① Project configuration → Identity 還沒啟用　② 剛啟用但站台還沒重新部署一次（回 Deploys 手動觸發部署）　③ 若是自訂網域，需確認網域是透過 Netlify 的 DNS 指過來的。這不是操作錯誤，需要到 Netlify 後台檢查設定。');
      } else {
        setNote('⚠️ 登入服務發生錯誤：' + (raw || String(err)));
      }
    });
    netlifyIdentity.init();
  } else {
    console.error('[五象 FiveLens登入] netlify-identity-widget.js 未能載入，window.netlifyIdentity 不存在（可能是網路被擋、廣告攔截套件、或 CSP 設定擋住了 identity.netlify.com）。');
    setNote('⚠️ 登入元件載入失敗，請確認網路可連到 identity.netlify.com（檢查廣告攔截套件／防火牆），並重新整理頁面。');
  }

  loginBtn.addEventListener('click', function(){
    console.log('[五象 FiveLens登入] 登入按鈕被點擊，window.netlifyIdentity =', window.netlifyIdentity);
    if (window.netlifyIdentity) {
      try {
        netlifyIdentity.open('login');
      } catch (e) {
        console.error('[五象 FiveLens登入] 呼叫 netlifyIdentity.open() 時發生例外：', e);
        setNote('⚠️ 開啟登入視窗時發生錯誤，請按 F12 開啟主控台查看詳細訊息並回報。');
      }
    } else {
      setNote('⚠️ 登入元件尚未載入完成，請重新整理頁面後再試一次；若持續發生，可能是網路擋住了 identity.netlify.com。');
    }
  });
  logoutBtn.addEventListener('click', function(){
    if (window.netlifyIdentity) {
      netlifyIdentity.logout();
    }
  });

  // ===== 管理員：單一入口（v10.9合併「登入紀錄」與「所有使用者資料」為同一個面板的兩個內頁頁籤） =====
  var adminEntryBtn = document.getElementById('auth-admin-entry-btn');
  var adminPanelOverlay = document.getElementById('admin-panel-overlay');
  var adminPanelClose = document.getElementById('admin-panel-close');
  var adminPanelTabs = Array.from(document.querySelectorAll('.admin-panel-tab'));

  function openAdminPanel(){
    adminPanelOverlay.hidden = false;
    // 每次打開都以「登入紀錄」為預設頁籤，並重新載入兩頁籤的資料（確保資料是最新的）
    switchAdminTab('loginlog');
    loadLoginLogs();
    loadAllUserCharts();
  }
  function switchAdminTab(key){
    adminPanelTabs.forEach(function(t){
      var on = t.dataset.admintab === key;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('.admin-tab-content').forEach(function(c){
      c.classList.toggle('active', c.id === 'admin-tab-' + key);
    });
  }
  if (adminEntryBtn) {
    adminEntryBtn.addEventListener('click', function(e){
      e.stopPropagation();
      openAdminPanel();
    });
  }
  adminPanelTabs.forEach(function(t){
    t.addEventListener('click', function(){ switchAdminTab(t.dataset.admintab); });
  });
  if (adminPanelClose) adminPanelClose.addEventListener('click', function(){ adminPanelOverlay.hidden = true; });
  if (adminPanelOverlay) {
    adminPanelOverlay.addEventListener('click', function(e){
      if (e.target === adminPanelOverlay) adminPanelOverlay.hidden = true;
    });
  }

  // ===== 管理員：登入紀錄（面板內第一個頁籤） =====
  var logStatus = document.getElementById('login-log-status');
  var logTable = document.getElementById('login-log-table');
  var logTbody = document.getElementById('login-log-tbody');
  var logRefreshBtn = document.getElementById('login-log-refresh');

  function fmtTime(iso){
    try {
      var d = new Date(iso);
      return d.toLocaleString('zh-TW', { hour12:false });
    } catch(e){ return iso || ''; }
  }

  async function loadLoginLogs(){
    logStatus.textContent = '載入中…';
    logTable.hidden = true;
    var user = window.netlifyIdentity && netlifyIdentity.currentUser();
    if (!user) { logStatus.textContent = '⚠️ 尚未登入，無法查詢。'; return; }

    try {
      var res = await fetch('/.netlify/functions/get-login-logs', {
        headers: { 'Authorization': 'Bearer ' + (await user.jwt()) }
      });
      if (res.status === 401 || res.status === 403) {
        var errBody = await res.json().catch(function(){ return {}; });
        logStatus.textContent = '⚠️ ' + (errBody.error || '這個帳號沒有查看登入紀錄的權限。');
        return;
      }
      if (!res.ok) {
        logStatus.textContent = '⚠️ 讀取失敗（狀態碼 ' + res.status + '），請確認此網站已部署 Netlify Functions。';
        return;
      }
      var data = await res.json();
      var logs = data.records || [];
      logTbody.innerHTML = '';
      logs.forEach(function(r){
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + fmtTime(r.ts) + '</td>' +
          '<td class="email-cell">' + (r.email || '') + (r.name ? '（' + r.name + '）' : '') + '</td>' +
          '<td>' + (r.provider || '') + '</td>';
        logTbody.appendChild(tr);
      });
      logStatus.textContent = '共 ' + logs.length + ' 筆登入紀錄';
      logTable.hidden = logs.length === 0;
    } catch (err) {
      console.error('[登入紀錄] 讀取失敗：', err);
      logStatus.textContent = '⚠️ 讀取時發生錯誤，請按 F12 開啟主控台查看詳細訊息。';
    }
  }
  if (logRefreshBtn) logRefreshBtn.addEventListener('click', loadLoginLogs);

  // ===== 管理員：所有使用者的命盤存摺資料（面板內第二個頁籤） =====
  var alldataRefresh = document.getElementById('alldata-refresh');
  var alldataStatus = document.getElementById('alldata-status');
  var alldataList = document.getElementById('alldata-list');

  function escapeHtmlAdmin(s){
    return String(s==null?'':s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  async function loadAllUserCharts(){
    alldataStatus.textContent = '載入中…';
    alldataList.innerHTML = '';
    var user = window.netlifyIdentity && netlifyIdentity.currentUser();
    if (!user) { alldataStatus.textContent = '⚠️ 尚未登入，無法查詢。'; return; }

    try {
      var res = await fetch('/.netlify/functions/get-all-user-charts', {
        headers: { 'Authorization': 'Bearer ' + (await user.jwt()) }
      });
      if (res.status === 401 || res.status === 403) {
        var errBody2 = await res.json().catch(function(){ return {}; });
        alldataStatus.textContent = '⚠️ ' + (errBody2.error || '這個帳號沒有查看使用者資料的權限。');
        return;
      }
      if (!res.ok) {
        alldataStatus.textContent = '⚠️ 讀取失敗（狀態碼 ' + res.status + '），請確認此網站已部署 get-all-user-charts.js。';
        return;
      }
      var users = await res.json();
      if (!Array.isArray(users) || users.length === 0) {
        alldataStatus.textContent = '目前還沒有任何使用者存過命盤。';
        return;
      }
      alldataStatus.textContent = '共 ' + users.length + ' 位使用者有存過命盤';
      alldataList.innerHTML = users.map(function(u){
        var rows = (u.charts||[]).map(function(c){
          return '<tr>' +
            '<td>' + escapeHtmlAdmin(c.surname) + escapeHtmlAdmin(c.givenName||'') + '</td>' +
            '<td>' + (c.gender==='M'?'男':'女') + '</td>' +
            '<td>' + escapeHtmlAdmin(c.dateVal) + ' ' + (c.unknownHour?'(時辰未知)':escapeHtmlAdmin(c.timeVal)) + '</td>' +
            '<td>' + escapeHtmlAdmin(c.note||'') + '</td>' +
            '<td>' + escapeHtmlAdmin(c.savedAt ? new Date(c.savedAt).toLocaleString('zh-TW',{hour12:false}) : '') + '</td>' +
          '</tr>';
        }).join('');
        return '<details class="user-data-card">' +
          '<summary><span class="udc-email">' + escapeHtmlAdmin(u.email) + '</span>' +
          '<span class="udc-meta">' + u.chartCount + ' 筆・最後更新 ' + (u.updatedAt ? new Date(u.updatedAt).toLocaleString('zh-TW',{hour12:false}) : '—') + '</span></summary>' +
          (rows ? ('<table class="log-table"><thead><tr><th>姓名</th><th>性別</th><th>出生時間</th><th>備註</th><th>存檔時間</th></tr></thead><tbody>' + rows + '</tbody></table>')
                : '<p class="log-panel-status">此帳號目前沒有存任何命盤。</p>') +
          '</details>';
      }).join('');
    } catch (err) {
      console.error('[所有使用者資料] 讀取失敗：', err);
      alldataStatus.textContent = '⚠️ 讀取時發生錯誤，請按 F12 開啟主控台查看詳細訊息。';
    }
  }

  if (alldataRefresh) alldataRefresh.addEventListener('click', loadAllUserCharts);
})();
