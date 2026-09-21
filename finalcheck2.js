
(function(){
  const E = window.FortuneEngine;
  const A = E.astroCore, B = E.baziCore, L = E.lunarCore, Z = E.ziweiCore, AC = E.astrologyCore, N = E.nameCore, AL = E.almanacCore;

  // v9.7新增：建除十二神「交節日精確判定」，取代先前AL.getJianchu()各頁籤各自呼叫、對交節當天一律沿用簡化公式的作法。
  // 傳統通書慣例：節氣（12個「節」）交接的那一天，建除值神沿用前一日的值神（「疊值」），下一日才切回新月支重新起算，
  // 這是為了讓「建」永遠精準對齊新月支的第一個同名地支日；本函式比對「當日」與「前一日」個別算出的月柱地支，
  // 若兩者不同即代表當日為交節日，此時直接沿用前一日之建除值神，否則維持原公式計算。
  // 擇日／流月流日精算／農民曆通書／風水方位 四頁籤已統一改為呼叫本函式，取代原本各自獨立呼叫 AL.getJianchu()。
  function getJianchuPrecise(y, m, d, precomputedTerms){
    const dGZ = B.idxToGZ(B.ganzhiIndex(y, m, d));
    const prevDt = new Date(Date.UTC(y, m - 1, d) - 86400000);
    const py = prevDt.getUTCFullYear(), pm = prevDt.getUTCMonth() + 1, pd = prevDt.getUTCDate();
    const pGZ = B.idxToGZ(B.ganzhiIndex(py, pm, pd));
    const terms = precomputedTerms || A.getSolarTermsRange(y - 1, y + 1);
    let monthZhi = null, prevMonthZhi = null;
    try{ monthZhi = B.computeFourPillars({ year:y, month:m, day:d, hour:12, minute:0, tzOffset:8, longitude:120, useTrueSolarTime:false, precomputedTerms:terms }).pillars.month.zhi; }catch(e){}
    try{ prevMonthZhi = B.computeFourPillars({ year:py, month:pm, day:pd, hour:12, minute:0, tzOffset:8, longitude:120, useTrueSolarTime:false, precomputedTerms:terms }).pillars.month.zhi; }catch(e){}
    if(!monthZhi) return null;
    if(prevMonthZhi && prevMonthZhi !== monthZhi){
      const prevJc = AL.getJianchu(prevMonthZhi, pGZ.zhi);
      return prevJc ? { name:prevJc.name, tier:prevJc.tier, carried:true } : (AL.getJianchu(monthZhi, dGZ.zhi) || null);
    }
    const jc = AL.getJianchu(monthZhi, dGZ.zhi);
    return jc ? { name:jc.name, tier:jc.tier, carried:false } : null;
  }

  // v5.6新增：全站共用的HTML escape工具。任何使用者輸入（姓名、備註等）在組成innerHTML字串前，
  // 一律先經過此函式跳脫特殊字元，避免使用者輸入被瀏覽器當成HTML/腳本執行（XSS防護）。
  function escapeHtml(str){
    if(str===null || str===undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ================= v8.6合併自v7.9.7：全域友善錯誤提示（取代 window.alert）＝＝＝＝＝＝＝＝＝＝＝＝＝
  // 以 role="alert"/"status" + aria-live 的非阻斷式提示條，取代會中斷操作流程、
  // 且對螢幕閱讀器使用者體驗不佳的 window.alert()。訊息會自動於數秒後淡出，並可手動關閉。
  // opts.type 可傳 'error'（預設，紅色／⚠️）或 'success'（綠色／✅，用於成功類提示）。
  function showFriendlyError(message, opts){
    opts = opts || {};
    const isSuccess = opts.type === 'success';
    let el = document.getElementById('globalErrorToast');
    if(!el){
      el = document.createElement('div');
      el.id = 'globalErrorToast';
      el.className = 'global-error-toast';
      el.innerHTML = `<span class="get-icon" aria-hidden="true"></span><span class="get-msg"></span><button type="button" class="get-close" aria-label="關閉提示訊息">✕</button>`;
      document.body.appendChild(el);
      el.querySelector('.get-close').addEventListener('click', ()=>{ el.classList.remove('show'); });
    }
    el.classList.toggle('is-success', isSuccess);
    el.setAttribute('role', isSuccess ? 'status' : 'alert');
    el.setAttribute('aria-live', isSuccess ? 'polite' : 'assertive');
    el.querySelector('.get-icon').textContent = isSuccess ? '✅' : '⚠️';
    el.querySelector('.get-msg').textContent = message;
    el.classList.add('show');
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(()=>{ el.classList.remove('show'); }, opts.duration || (isSuccess ? 3500 : 7000));
    if(opts.focusEl && typeof opts.focusEl.focus === 'function'){ opts.focusEl.focus(); }
    return el;
  }

  // ================= v10.3新增：全域錯誤安全網（缺失⑥修正） =================
  // 目的：任何按鈕背後的程式若拋出未預期例外、或非同步作業(Promise)失敗卻沒有被個別功能自行攔截處理，
  // 過去畫面上完全不會有任何提示，使用者只會覺得「按了沒反應」。這裡在最外層加一道保險，
  // 只要有例外「漏接」，就一定會用同一套友善提示條告知使用者，不需要每一個按鈕各自補寫防呆。
  // 注意：這是「最後一道防線」，不會取代、也不影響任何功能原本自己的 try/catch 與提示邏輯，
  // 原本就有妥善處理錯誤的地方（例如AI追問、合盤比對等）完全不受影響、不會出現兩次提示。
  let _lastGlobalErrToastAt = 0;
  function _throttledGlobalErrToast(msg){
    const now = Date.now();
    if(now - _lastGlobalErrToastAt < 4000) return; // 避免同一瞬間多個錯誤疊加彈出、洗版
    _lastGlobalErrToastAt = now;
    showFriendlyError(msg);
  }
  window.addEventListener('error', function(e){
    console.error('[五象 FiveLens][全域安全網] 未攔截的錯誤：', e.error || e.message);
    _throttledGlobalErrToast('這個操作剛才發生了預期外的問題，畫面可能沒有完成更新；可以重新整理頁面後再試一次，若持續發生歡迎透過頁尾聯絡信箱回報。');
  });
  window.addEventListener('unhandledrejection', function(e){
    console.error('[五象 FiveLens][全域安全網] 未攔截的非同步錯誤：', e.reason);
    _throttledGlobalErrToast('這個操作剛才發生了預期外的問題（可能是網路連線或雲端服務暫時無回應）；可以稍後再試一次，若持續發生歡迎透過頁尾聯絡信箱回報。');
  });

  // ================= v10.3新增：全站按鈕統一「處理中」視覺回饋（缺失②修正的基礎設施） =================
  // 目的：使用者點擊「主要／小型」按鈕後，不管背後是同步或非同步(fetch/AI呼叫等)運算，
  // 都能立刻看到「有反應」的觸覺回饋，而不是呆呆等待、以為按鈕壞了。
  // 做法：用事件代理(delegation)在 document 層級監聽，完全不影響、不取代任何既有的
  // addEventListener 點擊邏輯（兩者是各自獨立的監聽器，互不干擾、不會重複觸發或攔截）。
  document.addEventListener('click', function(e){
    const btn = e.target.closest('button.btn-primary, button.btn-mini, .tab-group-btn, .tab-btn');
    if(!btn || btn.disabled) return;
    btn.classList.remove('btn-clicked-pulse');
    // 強制觸發 reflow 讓動畫可以重新播放（連續快速點擊同一顆按鈕時也看得到回饋）
    void btn.offsetWidth;
    btn.classList.add('btn-clicked-pulse');
    setTimeout(()=>btn.classList.remove('btn-clicked-pulse'), 260);
  }, true);

  // 判斷「西元年/月/日」是否為真實存在的日期（例如 2024-02-30、2023-02-29 這類會被
  // JS Date 物件自動「進位」成隔天，而非直接報錯的無效日期，屬於容易被忽略的邊界情境）。
  const BIRTH_YEAR_MIN = 1902, BIRTH_YEAR_MAX = 2097;
  function isValidCalendarDate(y,m,d){
    if(!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
    const dt = new Date(y, m-1, d);
    return dt.getFullYear()===y && dt.getMonth()===(m-1) && dt.getDate()===d;
  }

  // 驗證出生日期字串（"YYYY-MM-DD"）是否落在系統支援範圍內且為真實日期，
  // 回傳 {ok:true} 或 {ok:false, message:'友善錯誤訊息'}，供團隊相容性／企業擇日等多人表單共用。
  function validateDateInput(dateVal, opts){
    opts = opts || {};
    const who = opts.who || '';
    if(!dateVal) return {ok:false, message:`請選擇${who}出生日期`};
    const parts = dateVal.split('-').map(Number);
    const y=parts[0], m=parts[1], d=parts[2];
    if(!isValidCalendarDate(y,m,d)){
      return {ok:false, message:`${who}出生日期「${dateVal}」並非真實存在的日期，請重新確認（例如注意當年是否為閏年、該月是否有此天數）。`};
    }
    if(y < BIRTH_YEAR_MIN || y > BIRTH_YEAR_MAX){
      return {ok:false, message:`${who}出生年份需介於西元 ${BIRTH_YEAR_MIN}～${BIRTH_YEAR_MAX} 年之間，目前輸入的年份（${y}）超出系統萬年曆與節氣資料庫的可靠計算範圍。`};
    }
    return {ok:true, y, m, d};
  }

  // v10.6新增（缺失⑦修正）：驗證「起算日期／預產期」這類必須是「今天或未來」的日期欄位——
  // 擇日Copilot、企業擇日、剖腹擇日都是「從這個日期開始往後找好日子」的邏輯，若選到過去的日期，
  // 系統會照常算出一串看似正常、實則已經失去意義的「建議日期」，卻沒有任何提示告知使用者，
  // 這裡統一補上檢查，供三處共用，確保錯誤訊息與判斷邏輯一致。
  function validateNotPastDate(dateVal, opts){
    opts = opts || {};
    const who = opts.who || '';
    const base = validateDateInput(dateVal, {who});
    if(!base.ok) return base;
    const today = todayInfo();
    const selectedMs = Date.UTC(base.y, base.m-1, base.d);
    const todayMs = Date.UTC(today.y, today.m-1, today.d);
    if(selectedMs < todayMs){
      return {ok:false, message:`${who}日期不能早於今天（今天是 ${today.y}-${String(today.m).padStart(2,'0')}-${String(today.d).padStart(2,'0')}），因為本功能是從這個日期開始往後篩選合適的日子，選擇過去的日期會導致篩選結果失去參考意義，請重新選擇今天或未來的日期。`};
    }
    return base;
  }

  // v5.6新增：本機儲存輕量混淆（XOR＋隨機裝置金鑰＋Base64）。
  // 誠實揭露：這是「混淆」而非「加密」——裝置金鑰與被混淆的內容同樣存放在使用者自己的瀏覽器中，
  // 對於能在此頁面執行JavaScript的人（例如使用者自己打開瀏覽器主控台）而言並非無法還原。
  // 它能防範的是：肉眼直接看localStorage面板時認出可辨識的金鑰字串／個資明文、
  // 或瀏覽器分享畫面／擴充功能單純掃描localStorage文字內容時意外外洩。
  // 若要達到真正的加密等級保護，需要伺服器端或使用者自訂密碼（會增加操作摩擦），
  // 這與本站「完全前端、免登入、金鑰不經伺服器」的BYOK架構設計初衷有取捨關係，此處選擇以最小摩擦的混淆作為現實可行的折衷改善。
  const Obfuscate = (function(){
    const DEVICE_KEY_NAME = 'zmp_device_okey_v1';
    function getDeviceKey(){
      let k = localStorage.getItem(DEVICE_KEY_NAME);
      if(!k){
        try{
          k = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b=>b.toString(16).padStart(2,'0')).join('');
        }catch(e){
          k = Array.from({length:32}, ()=>Math.floor(Math.random()*16).toString(16)).join('');
        }
        localStorage.setItem(DEVICE_KEY_NAME, k);
      }
      return k;
    }
    function xorStr(str, key){
      let out = '';
      for(let i=0;i<str.length;i++){ out += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length)); }
      return out;
    }
    function encode(plain){
      if(plain===null || plain===undefined || plain==='') return '';
      try{
        const key = getDeviceKey();
        const xored = xorStr(unescape(encodeURIComponent(plain)), key);
        return 'ob1:' + btoa(xored);
      }catch(e){ return plain; }
    }
    function decode(stored){
      if(!stored) return '';
      if(!stored.startsWith('ob1:')) return stored; // 相容舊版（v5.5以前）明文儲存資料，讀到後下次寫入會自動轉為混淆格式
      try{
        const key = getDeviceKey();
        const xored = atob(stored.slice(4));
        return decodeURIComponent(escape(xorStr(xored, key)));
      }catch(e){ return ''; }
    }
    return { encode, decode };
  })();

  // ---------- 星輪刻度繪製 ----------
  (function drawWheel(){
    const ZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
    const ticks = document.getElementById('zhiTicks');
    const labels = document.getElementById('zhiLabels');
    // v10.11 hero redesign：首頁星輪已改為品牌主視覺圖片，舊版 zhiTicks/zhiLabels SVG 不再存在；缺少時直接跳過繪製，不能阻斷後續所有功能初始化。
    if(!ticks || !labels) return;
    const cx=150, cy=150, rOuter=140, rInner=128, rLabel=112;
    for(let i=0;i<12;i++){
      const ang = (i*30 - 90) * Math.PI/180;
      const x1 = cx + rInner*Math.cos(ang), y1 = cy + rInner*Math.sin(ang);
      const x2 = cx + rOuter*Math.cos(ang), y2 = cy + rOuter*Math.sin(ang);
      const line = document.createElementNS('http://www.w3.org/2000/svg','line');
      line.setAttribute('x1',x1);line.setAttribute('y1',y1);line.setAttribute('x2',x2);line.setAttribute('y2',y2);
      line.setAttribute('stroke','#33447a');line.setAttribute('stroke-opacity','0.35');
      ticks.appendChild(line);
      const lx = cx + rLabel*Math.cos(ang), ly = cy + rLabel*Math.sin(ang);
      const t = document.createElementNS('http://www.w3.org/2000/svg','text');
      t.setAttribute('x',lx);t.setAttribute('y',ly+5);t.textContent=ZHI[i];
      labels.appendChild(t);
    }
  })();

  // ---------- 首頁「開始算命」按鈕：顯示輸入表單並平滑捲動過去 ----------
  (function(){
    const btn = document.getElementById('startFortuneBtn');
    const formSection = document.getElementById('form-section');
    if(!btn || !formSection) return;
    btn.addEventListener('click', ()=>{
      // v10.11.1：保留 JS 事件，同時與按鈕上的 inline fallback 並行；
      // 即使其他非關鍵初始化模組稍後發生例外，首頁 CTA 仍能正常開啟排盤表單。
      formSection.classList.remove('hidden-until-cta');
      btn.setAttribute('aria-expanded','true');
      if(typeof formSection.scrollIntoView === 'function'){
        formSection.scrollIntoView({behavior:'smooth', block:'start'});
      }
    });
  })();

  // ---------- 台灣縣市／鄉鎮市區 快速選擇（全台22縣市、368鄉鎮市區行政中心點座標） ----------
  const TW_DISTRICTS = {
    '台北市': [['中正區',121.519,25.032],['大同區',121.513,25.063],['中山區',121.533,25.064],['松山區',121.558,25.050],['大安區',121.535,25.026],['萬華區',121.499,25.035],['信義區',121.571,25.033],['士林區',121.526,25.092],['北投區',121.499,25.132],['內湖區',121.594,25.083],['南港區',121.606,25.055],['文山區',121.570,24.989]],
    '新北市': [['板橋區',121.459,25.013],['三重區',121.487,25.061],['中和區',121.499,24.999],['永和區',121.516,25.008],['新莊區',121.433,25.037],['新店區',121.538,24.967],['樹林區',121.421,24.990],['鶯歌區',121.354,24.954],['三峽區',121.369,24.934],['淡水區',121.448,25.170],['汐止區',121.658,25.064],['瑞芳區',121.810,25.109],['土城區',121.443,24.972],['蘆洲區',121.474,25.085],['五股區',121.437,25.083],['泰山區',121.430,25.058],['林口區',121.392,25.077],['深坑區',121.616,25.002],['石碇區',121.656,24.986],['坪林區',121.712,24.937],['三芝區',121.499,25.259],['石門區',121.568,25.290],['八里區',121.399,25.145],['平溪區',121.739,25.025],['雙溪區',121.866,25.034],['貢寮區',121.907,25.021],['金山區',121.636,25.221],['萬里區',121.689,25.179],['烏來區',121.550,24.865]],
    '桃園市': [['桃園區',121.301,24.994],['中壢區',121.226,24.958],['大溪區',121.284,24.881],['楊梅區',121.145,24.917],['蘆竹區',121.293,25.045],['大園區',121.196,25.061],['龜山區',121.338,25.032],['八德區',121.288,24.969],['龍潭區',121.214,24.864],['平鎮區',121.216,24.926],['新屋區',121.135,24.972],['觀音區',121.107,25.030],['復興區',121.353,24.822]],
    '台中市': [['中區',120.679,24.144],['東區',120.688,24.137],['南區',120.665,24.125],['西區',120.665,24.147],['北區',120.686,24.157],['北屯區',120.716,24.178],['西屯區',120.639,24.169],['南屯區',120.640,24.138],['太平區',120.716,24.144],['大里區',120.683,24.099],['霧峰區',120.703,24.061],['烏日區',120.622,24.108],['豐原區',120.723,24.256],['后里區',120.712,24.310],['石岡區',120.767,24.271],['東勢區',120.827,24.259],['和平區',121.005,24.212],['新社區',120.798,24.243],['潭子區',120.708,24.220],['大雅區',120.643,24.220],['神岡區',120.685,24.251],['大肚區',120.548,24.150],['沙鹿區',120.565,24.234],['龍井區',120.545,24.201],['梧棲區',120.539,24.255],['清水區',120.564,24.271],['大甲區',120.623,24.348],['外埔區',120.653,24.324],['大安區',120.594,24.348]],
    '台南市': [['中西區',120.199,22.996],['東區',120.219,22.982],['南區',120.185,22.972],['北區',120.204,23.009],['安平區',120.166,23.000],['安南區',120.166,23.048],['永康區',120.256,23.026],['歸仁區',120.294,22.968],['新化區',120.312,23.036],['左鎮區',120.416,23.043],['玉井區',120.462,23.121],['楠西區',120.507,23.174],['南化區',120.478,23.032],['仁德區',120.244,22.972],['關廟區',120.322,22.949],['龍崎區',120.362,22.943],['官田區',120.316,23.192],['麻豆區',120.246,23.183],['佳里區',120.171,23.164],['西港區',120.213,23.144],['七股區',120.144,23.140],['將軍區',120.135,23.203],['學甲區',120.183,23.230],['北門區',120.123,23.243],['新營區',120.316,23.309],['後壁區',120.348,23.360],['白河區',120.415,23.351],['東山區',120.406,23.313],['六甲區',120.360,23.226],['下營區',120.264,23.243],['柳營區',120.328,23.267],['鹽水區',120.267,23.322],['善化區',120.296,23.132],['大內區',120.386,23.147],['山上區',120.351,23.108],['新市區',120.294,23.088],['安定區',120.235,23.093]],
    '高雄市': [['楠梓區',120.335,22.733],['左營區',120.294,22.686],['鼓山區',120.283,22.641],['三民區',120.310,22.653],['鹽埕區',120.286,22.622],['前金區',120.294,22.628],['新興區',120.303,22.630],['苓雅區',120.312,22.621],['前鎮區',120.309,22.598],['旗津區',120.283,22.612],['小港區',120.343,22.567],['鳳山區',120.361,22.627],['大寮區',120.404,22.611],['鳥松區',120.359,22.667],['林園區',120.409,22.500],['大樹區',120.428,22.700],['大社區',120.353,22.727],['仁武區',120.347,22.702],['岡山區',120.294,22.797],['橋頭區',120.302,22.756],['燕巢區',120.361,22.774],['田寮區',120.373,22.849],['阿蓮區',120.322,22.898],['路竹區',120.263,22.858],['湖內區',120.216,22.900],['茄萣區',120.183,22.902],['永安區',120.243,22.783],['彌陀區',120.245,22.775],['梓官區',120.267,22.756],['旗山區',120.483,22.888],['美濃區',120.539,22.898],['六龜區',120.639,22.988],['甲仙區',120.601,23.081],['杉林區',120.585,22.996],['內門區',120.475,22.960],['茂林區',120.653,22.883],['桃源區',120.780,23.108],['那瑪夏區',120.687,23.238]],
    '基隆市': [['仁愛區',121.744,25.129],['信義區',121.752,25.128],['中正區',121.767,25.128],['中山區',121.734,25.136],['安樂區',121.716,25.134],['暖暖區',121.746,25.106],['七堵區',121.714,25.109]],
    '新竹市': [['東區',120.979,24.801],['北區',120.966,24.816],['香山區',120.921,24.788]],
    '新竹縣': [['竹北市',121.008,24.838],['竹東鎮',121.089,24.737],['新埔鎮',121.078,24.826],['關西鎮',121.181,24.786],['湖口鄉',121.037,24.898],['新豐鄉',121.026,24.879],['芎林鄉',121.088,24.783],['橫山鄉',121.128,24.716],['北埔鄉',121.058,24.700],['寶山鄉',121.003,24.775],['峨眉鄉',121.056,24.667],['尖石鄉',121.191,24.700],['五峰鄉',121.100,24.594]],
    '苗栗縣': [['苗栗市',120.821,24.560],['頭份市',120.914,24.686],['竹南鎮',120.874,24.694],['後龍鎮',120.798,24.596],['通霄鎮',120.696,24.489],['苑裡鎮',120.649,24.442],['卓蘭鎮',120.826,24.320],['大湖鄉',120.858,24.421],['公館鄉',120.826,24.550],['銅鑼鄉',120.786,24.485],['南庄鄉',120.984,24.596],['頭屋鄉',120.837,24.593],['三義鄉',120.759,24.354],['西湖鄉',120.750,24.512],['造橋鄉',120.867,24.647],['三灣鄉',120.925,24.632],['獅潭鄉',120.906,24.560],['泰安鄉',120.980,24.407]],
    '彰化縣': [['彰化市',120.538,24.075],['鹿港鎮',120.435,24.057],['和美鎮',120.492,24.108],['線西鄉',120.436,24.126],['伸港鄉',120.454,24.147],['福興鄉',120.460,24.043],['秀水鄉',120.520,24.026],['花壇鄉',120.559,24.032],['芬園鄉',120.610,24.031],['員林市',120.573,23.958],['溪湖鎮',120.478,23.958],['田中鎮',120.583,23.865],['大村鄉',120.567,24.001],['埔鹽鄉',120.487,23.989],['埔心鄉',120.548,23.958],['永靖鄉',120.564,23.933],['社頭鄉',120.577,23.906],['二水鄉',120.615,23.813],['北斗鎮',120.522,23.871],['二林鎮',120.376,23.898],['田尾鄉',120.538,23.898],['埤頭鄉',120.464,23.868],['芳苑鄉',120.334,23.921],['大城鄉',120.303,23.858],['竹塘鄉',120.412,23.870],['溪州鄉',120.492,23.828]],
    '南投縣': [['南投市',120.683,23.913],['埔里鎮',120.966,23.966],['草屯鎮',120.685,23.973],['竹山鎮',120.679,23.760],['集集鎮',120.784,23.828],['名間鄉',120.687,23.851],['鹿谷鄉',120.751,23.751],['中寮鄉',120.734,23.865],['魚池鄉',120.911,23.879],['國姓鄉',120.856,24.043],['水里鄉',120.856,23.809],['信義鄉',121.030,23.663],['仁愛鄉',121.163,24.048]],
    '雲林縣': [['斗六市',120.543,23.711],['斗南鎮',120.483,23.674],['虎尾鎮',120.433,23.708],['西螺鎮',120.464,23.798],['土庫鎮',120.386,23.681],['北港鎮',120.302,23.568],['古坑鄉',120.575,23.650],['大埤鄉',120.436,23.660],['莿桐鄉',120.503,23.760],['林內鄉',120.594,23.751],['二崙鄉',120.407,23.761],['崙背鄉',120.363,23.789],['麥寮鄉',120.257,23.788],['東勢鄉',120.325,23.657],['褒忠鄉',120.334,23.703],['台西鄉',120.201,23.703],['元長鄉',120.348,23.643],['四湖鄉',120.207,23.680],['口湖鄉',120.187,23.598],['水林鄉',120.219,23.633]],
    '嘉義市': [['東區',120.460,23.478],['西區',120.437,23.480]],
    '嘉義縣': [['太保市',120.331,23.462],['朴子市',120.246,23.464],['布袋鎮',120.157,23.386],['大林鎮',120.564,23.601],['民雄鄉',120.432,23.550],['溪口鄉',120.412,23.581],['新港鄉',120.349,23.545],['六腳鄉',120.253,23.523],['東石鄉',120.181,23.454],['義竹鄉',120.199,23.343],['鹿草鄉',120.269,23.427],['水上鄉',120.436,23.417],['中埔鄉',120.535,23.437],['竹崎鄉',120.552,23.478],['梅山鄉',120.552,23.601],['番路鄉',120.610,23.447],['大埔鄉',120.599,23.318],['阿里山鄉',120.686,23.509]],
    '屏東縣': [['屏東市',120.487,22.670],['潮州鎮',120.545,22.550],['東港鎮',120.448,22.467],['恆春鎮',120.744,22.000],['萬丹鄉',120.492,22.611],['長治鄉',120.523,22.694],['麟洛鄉',120.517,22.660],['九如鄉',120.500,22.734],['里港鄉',120.494,22.777],['鹽埔鄉',120.542,22.727],['高樹鄉',120.598,22.782],['萬巒鄉',120.559,22.564],['內埔鄉',120.560,22.624],['竹田鄉',120.541,22.617],['新埤鄉',120.567,22.500],['枋寮鄉',120.590,22.360],['新園鄉',120.456,22.500],['崁頂鄉',120.499,22.520],['林邊鄉',120.500,22.427],['南州鄉',120.481,22.457],['佳冬鄉',120.548,22.416],['琉球鄉',120.377,22.339],['車城鄉',120.751,22.088],['滿州鄉',120.816,22.023],['枋山鄉',120.678,22.213],['三地門鄉',120.641,22.751],['霧台鄉',120.706,22.762],['瑪家鄉',120.640,22.707],['泰武鄉',120.656,22.628],['來義鄉',120.615,22.560],['春日鄉',120.638,22.420],['獅子鄉',120.686,22.219],['牡丹鄉',120.789,22.169]],
    '宜蘭縣': [['宜蘭市',121.754,24.757],['羅東鎮',121.767,24.677],['蘇澳鎮',121.842,24.596],['頭城鎮',121.823,24.860],['礁溪鄉',121.772,24.828],['壯圍鄉',121.782,24.732],['員山鄉',121.734,24.755],['冬山鄉',121.788,24.636],['五結鄉',121.799,24.682],['三星鄉',121.653,24.674],['大同鄉',121.539,24.673],['南澳鄉',121.803,24.464]],
    '花蓮縣': [['花蓮市',121.604,23.977],['鳳林鎮',121.451,23.746],['玉里鎮',121.313,23.332],['新城鄉',121.646,24.016],['吉安鄉',121.583,23.943],['壽豐鄉',121.573,23.870],['光復鄉',121.424,23.667],['豐濱鄉',121.567,23.618],['瑞穗鄉',121.373,23.500],['富里鄉',121.246,23.174],['秀林鄉',121.601,24.104],['萬榮鄉',121.427,23.769],['卓溪鄉',121.372,23.372]],
    '台東縣': [['台東市',121.147,22.756],['成功鎮',121.365,23.101],['關山鎮',121.166,23.043],['卑南鄉',121.075,22.759],['鹿野鄉',121.152,22.947],['池上鄉',121.217,23.114],['東河鄉',121.325,23.001],['長濱鄉',121.470,23.323],['太麻里鄉',120.995,22.622],['大武鄉',120.897,22.354],['綠島鄉',121.481,22.662],['海端鄉',121.079,23.098],['延平鄉',121.033,22.900],['金峰鄉',120.966,22.582],['達仁鄉',120.898,22.478],['蘭嶼鄉',121.552,22.041]],
    '澎湖縣': [['馬公市',119.560,23.565],['湖西鄉',119.628,23.567],['白沙鄉',119.596,23.660],['西嶼鄉',119.514,23.578],['望安鄉',119.505,23.371],['七美鄉',119.427,23.208]],
    '金門縣': [['金城鎮',118.317,24.432],['金湖鎮',118.403,24.445],['金沙鎮',118.408,24.500],['金寧鄉',118.333,24.462],['烈嶼鄉',118.238,24.427],['烏坵鄉',119.457,24.998]],
    '連江縣': [['南竿鄉',119.939,26.157],['北竿鄉',119.984,26.223],['莒光鄉',119.947,25.958],['東引鄉',120.492,26.370]],
  };

  const countySelectEl = document.getElementById('countySelect');
  const districtSelectEl = document.getElementById('districtSelect');
  Object.keys(TW_DISTRICTS).forEach(county=>{
    const opt = document.createElement('option');
    opt.value = county; opt.textContent = county;
    countySelectEl.appendChild(opt);
  });
  countySelectEl.addEventListener('change', ()=>{
    const county = countySelectEl.value;
    districtSelectEl.innerHTML = '';
    if(!county){
      districtSelectEl.disabled = true;
      districtSelectEl.appendChild(new Option('請先選擇縣市',''));
      return;
    }
    districtSelectEl.disabled = false;
    districtSelectEl.appendChild(new Option('請選擇鄉鎮市區…',''));
    TW_DISTRICTS[county].forEach(([name])=>{
      districtSelectEl.appendChild(new Option(name, name));
    });
  });
  districtSelectEl.addEventListener('change', ()=>{
    const county = countySelectEl.value;
    const district = districtSelectEl.value;
    if(!county || !district) return;
    const found = TW_DISTRICTS[county].find(d=>d[0]===district);
    if(found){
      document.getElementById('longitude').value = Math.round(found[1]*100)/100;
      document.getElementById('latitude').value = Math.round(found[2]*100)/100;
    }
  });

  // ---------- 通用縣市／鄉鎮市區快速選擇 wiring（供「合盤比對」乙方欄位複用） ----------
  function wireCountyDistrictSelect(countyId, districtId, lonId, latId){
    const countyEl = document.getElementById(countyId);
    const districtEl = document.getElementById(districtId);
    if(!countyEl || !districtEl) return;
    Object.keys(TW_DISTRICTS).forEach(county=>{
      const opt = document.createElement('option');
      opt.value = county; opt.textContent = county;
      countyEl.appendChild(opt);
    });
    countyEl.addEventListener('change', ()=>{
      const county = countyEl.value;
      districtEl.innerHTML = '';
      if(!county){
        districtEl.disabled = true;
        districtEl.appendChild(new Option('請先選擇縣市',''));
        return;
      }
      districtEl.disabled = false;
      districtEl.appendChild(new Option('請選擇鄉鎮市區…',''));
      TW_DISTRICTS[county].forEach(([name])=>{
        districtEl.appendChild(new Option(name, name));
      });
    });
    districtEl.addEventListener('change', ()=>{
      const county = countyEl.value;
      const district = districtEl.value;
      if(!county || !district) return;
      const found = TW_DISTRICTS[county].find(d=>d[0]===district);
      if(found){
        document.getElementById(lonId).value = Math.round(found[1]*100)/100;
        document.getElementById(latId).value = Math.round(found[2]*100)/100;
      }
    });
  }
  wireCountyDistrictSelect('cCountySelect','cDistrictSelect','cLongitude','cLatitude');

  // ---------- 性別選擇 UI ----------
  document.querySelectorAll('#genderRow .radio-pill').forEach(p=>{
    p.addEventListener('click',()=>{
      document.querySelectorAll('#genderRow .radio-pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
    });
  });
  document.querySelectorAll('#cGenderRow .radio-pill').forEach(p=>{
    p.addEventListener('click',()=>{
      document.querySelectorAll('#cGenderRow .radio-pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
    });
  });

  // v9.7新增：版本更新徽章改為彈出面板。
  // v9.7.1修正：原本用CSS :hover/:focus-within讓position:absolute面板展開，結果被祖先.hero的
  // overflow:hidden裁切、內容顯示不全（如截圖所示）。改為position:fixed，並在每次開啟時用JS
  // 依按鈕實際位置（getBoundingClientRect）計算座標，徹底跳脫任何父層overflow或堆疊環境的裁切問題；
  // 同時用mouseenter/mouseleave（含短延遲，避免滑鼠移動到面板途中誤觸關閉）取代CSS hover，
  // 觸控裝置則維持點擊切換與點擊外部自動收合。
  (function setupVersionBadgePopover(){
    const wrap = document.getElementById('versionChipsWrap');
    const btn = document.getElementById('versionBadgeBtn');
    const popover = document.getElementById('versionChipsPopover');
    if(!wrap || !btn || !popover) return;
    let closeTimer = null;

    function positionPopover(){
      const r = btn.getBoundingClientRect();
      const margin = 10;
      popover.style.top = (r.bottom + 8) + 'px';
      // 預設靠右對齊按鈕右緣；若因此超出視窗左側，改貼齊視窗左邊界margin處
      let left = r.right - popover.offsetWidth;
      if(left < margin) left = margin;
      const maxLeft = window.innerWidth - popover.offsetWidth - margin;
      if(left > maxLeft) left = Math.max(margin, maxLeft);
      popover.style.left = left + 'px';
    }
    function openPopover(){
      clearTimeout(closeTimer);
      wrap.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      // 先展開以取得正確的offsetWidth，再定位（面板寬度依內容而定，需等渲染後量測）
      requestAnimationFrame(positionPopover);
    }
    function closePopover(){
      wrap.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
    function scheduleClose(){
      clearTimeout(closeTimer);
      closeTimer = setTimeout(closePopover, 150);
    }

    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      if(wrap.classList.contains('open')) closePopover(); else openPopover();
    });
    // 注意：popover採position:fixed後，即使在DOM上仍是wrap的子元素，其「渲染位置」已跳脫wrap的
    // 版面範圍（fixed定位不受父層版面盒子約束），故mouseenter/mouseleave需分別綁在btn與popover
    // 兩個實際會被滑鼠移入的元素上，而不能只綁在wrap上——否則滑鼠從按鈕移動到下方彈出的面板途中，
    // 會先「離開」wrap的（很小的）版面盒子而誤觸關閉，面板永遠來不及被滑鼠移入。
    btn.addEventListener('mouseenter', openPopover);
    btn.addEventListener('mouseleave', scheduleClose);
    popover.addEventListener('mouseenter', ()=>clearTimeout(closeTimer));
    popover.addEventListener('mouseleave', scheduleClose);
    document.addEventListener('click', (e)=>{
      if(!wrap.contains(e.target) && !popover.contains(e.target)) closePopover();
    });
    document.addEventListener('keydown', (e)=>{
      if(e.key==='Escape') closePopover();
    });
    window.addEventListener('resize', ()=>{ if(wrap.classList.contains('open')) positionPopover(); });
    window.addEventListener('scroll', ()=>{ if(wrap.classList.contains('open')) positionPopover(); }, { passive:true });
  })();

  // ---------- Tabs（v8.6合併自v7.9.7：補上 WAI-ARIA Tabs Pattern，支援鍵盤方向鍵／Home/End導覽與 aria-selected 狀態同步；
  //             同時保留 v8.2 的頁籤延遲渲染與手機版下拉選單同步邏輯） ----------
  const tabBtnList = Array.from(document.querySelectorAll('.tab-btn'));
  // v8.7新增：頁籤分組導覽同步——依 tabKey 找出其所屬 .tab-group-panel／.tab-group-btn 並設為顯示中，
  // 純粹是導覽列高亮的UI同步，不影響任何排盤資料或 panel-* 渲染內容；用 function 宣告故整段皆可提升，
  // 供下方 activateTab() 於任何觸發來源（滑鼠點擊／鍵盤方向鍵／程式呼叫 tab-btn.click()）呼叫。
  function syncTabGroupForTab(tabKey){
    const srcBtn = document.getElementById('tabbtn-'+tabKey);
    const panel = srcBtn && srcBtn.closest('.tab-group-panel');
    if(!panel) return;
    const groupKey = panel.dataset.group;
    document.querySelectorAll('.tab-group-btn').forEach(b=>{
      const on = b.dataset.group === groupKey;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('.tab-group-panel').forEach(p=>{
      p.classList.toggle('active', p.dataset.group === groupKey);
    });
    // v10.3新增（缺失③修正）：把目前作用中的分類寫到 <body data-active-group="...">，
    // 純粹是CSS掛勾用的標記，不影響任何運算或資料，讓每個模組能有自己的識別主色，
    // 使用者一眼就能從配色分辨「我現在在哪一個功能區」，不用只靠看文字標題。
    document.body.dataset.activeGroup = groupKey;
  }
  // v10.4新增（缺失①修正）：命盤報告中心的5個分頁（綜合運勢報告／AI白話追問／命盤解析報告／
  // 命盤時間軸／準確度回饋與回測），本質上都是「同一份命盤結果」的不同呈現方式，
  // 過去要點5次分頁才能拼湊出完整資訊；這裡改為只要點其中任何一個，就把這5個區塊「合併顯示成同一頁」
  // （垂直排列、可一路捲動看完），並自動捲動到你點的那一段。
  // 注意：這裡完全沒有更動 renderReport／renderAIQATab／renderPoster／renderTimeline／renderFeedbackStats
  // 這5個渲染函式本身，也沒有更動它們各自的 panel-* 內容容器，只是改變「同時顯示幾個」的邏輯。
  const REPORT_MERGED_TABS = ['report','aiqa','poster','timeline','feedback'];
  function activateTab(btn, opts){
    opts = opts || {};
    document.querySelectorAll('.tab-btn').forEach(b=>{
      b.classList.remove('active');
      b.setAttribute('aria-selected','false');
      b.tabIndex = -1;
    });
    const isReportMerged = REPORT_MERGED_TABS.includes(btn.dataset.tab);
    if(isReportMerged){
      // 報告中心：把「非報告中心」的分頁隱藏，但5個報告分頁全部保留顯示（合併頁效果）
      document.querySelectorAll('.tab-panel').forEach(p=>{
        const key = p.id.replace(/^panel-/, '');
        p.classList.toggle('active', REPORT_MERGED_TABS.includes(key));
      });
      document.querySelectorAll('.report-section-label').forEach(lbl=>{
        lbl.classList.toggle('active', REPORT_MERGED_TABS.includes(lbl.dataset.reportLabel));
      });
    }else{
      document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
      document.querySelectorAll('.report-section-label').forEach(lbl=>lbl.classList.remove('active'));
    }
    btn.classList.add('active');
    btn.setAttribute('aria-selected','true');
    btn.tabIndex = 0;
    syncTabGroupForTab(btn.dataset.tab); // v8.7新增：切到哪一頁，分組導覽列就同步高亮該分類
    const panel = document.getElementById('panel-'+btn.dataset.tab);
    if(panel) panel.classList.add('active');
    if(mobileTabSelect) mobileTabSelect.value = btn.dataset.tab;
    // v10.8修正（缺失①）：「企業方案」是對外的方案介紹／洽詢頁，內容固定、不需要使用者自己的
    // 命盤資料，不應該被「必須先排盤才能看到內容」這條規則卡住——否則分享這個頁面連結給潛在客戶時，
    // 對方會先看到一片空白，要求對方填自己的生日資料才願意顯示報價，會直接把轉換率打到0。
    // 這裡讓 bizplan 這個分頁不受 lastCtx 是否存在影響，一律直接渲染。
    const NO_CHART_NEEDED_TABS = ['bizplan'];
    if(isReportMerged){
      // 合併頁：5段內容都要渲染（renderTabSafely本身有防重複渲染機制，重複呼叫不會造成內容重複或效能問題）
      if(lastCtx) REPORT_MERGED_TABS.forEach(k=>renderTabSafely(k, lastCtx));
      if(panel && !opts.skipScroll && typeof panel.scrollIntoView === 'function'){ panel.scrollIntoView({behavior:'smooth', block:'start'}); }
    }else if(NO_CHART_NEEDED_TABS.includes(btn.dataset.tab)){
      renderTabSafely(btn.dataset.tab, lastCtx || {});
    }else{
      if(lastCtx) renderTabSafely(btn.dataset.tab, lastCtx); // v8.2：頁籤延遲渲染，切換到哪一頁才計算哪一頁
    }
    if(opts.focus) btn.focus();
  }
  const mobileTabSelect = document.getElementById('tabMobileSelect');
  tabBtnList.forEach((btn, idx)=>{
    btn.addEventListener('click', ()=>activateTab(btn));
    btn.addEventListener('keydown', (e)=>{
      let targetIdx = null;
      if(e.key==='ArrowRight' || e.key==='ArrowDown'){ targetIdx = (idx+1) % tabBtnList.length; }
      else if(e.key==='ArrowLeft' || e.key==='ArrowUp'){ targetIdx = (idx-1+tabBtnList.length) % tabBtnList.length; }
      else if(e.key==='Home'){ targetIdx = 0; }
      else if(e.key==='End'){ targetIdx = tabBtnList.length-1; }
      if(targetIdx!==null){
        e.preventDefault();
        activateTab(tabBtnList[targetIdx], {focus:true});
      }
    });
  });

  // v8.2新增：手機版頁籤下拉選單——窄螢幕下頁籤橫向排列需大量滑動才能找到目標功能，
  // 改用下拉選單一次看到所有選項，選項內容自動讀取現有 .tab-btn 清單產生，避免兩處要手動同步維護。
  // v10.8修正（缺失②）：加上 <optgroup> 依5大分類分組（與桌機版側邊選單的分類邏輯一致），
  // 取代原本28個分頁完全攤平、要滑很久才找得到目標功能的單層清單，且與系統內其他下拉選單
  // （例如行銷個人化的目標受眾選單）已經在用的optgroup模式做法一致。
  if(mobileTabSelect){
    document.querySelectorAll('.tab-group-panel').forEach(groupPanel=>{
      const groupKey = groupPanel.dataset.group;
      const groupBtn = document.querySelector(`.tab-group-btn[data-group="${groupKey}"]`);
      const optgroup = document.createElement('optgroup');
      optgroup.label = groupBtn ? groupBtn.textContent.trim() : groupKey;
      groupPanel.querySelectorAll('.tab-btn').forEach(btn=>{
        const opt = document.createElement('option');
        opt.value = btn.dataset.tab;
        opt.textContent = btn.textContent.trim();
        if(btn.classList.contains('active')) opt.selected = true;
        optgroup.appendChild(opt);
      });
      mobileTabSelect.appendChild(optgroup);
    });
    mobileTabSelect.addEventListener('change', ()=>{
      const target = document.querySelector(`.tab-btn[data-tab="${mobileTabSelect.value}"]`);
      if(target) target.click();
    });
  }

  // ---------- v8.7新增：頁籤分組導覽（分類按鈕的點擊行為＋初始狀態） ----------
  // 分類切換本身已交由 activateTab() 內建的 syncTabGroupForTab() 統一處理（見上方，
  // 涵蓋滑鼠點擊／鍵盤方向鍵／程式呼叫 tab-btn.click() 等所有觸發來源），
  // 這裡只需額外處理「使用者直接點分類按鈕」這個新增的入口：切到該分類並開啟其第一個子頁籤。
  (function(){
    const tabGroupBtns = Array.from(document.querySelectorAll('.tab-group-btn'));
    if(!tabGroupBtns.length) return;
    tabGroupBtns.forEach(gbtn=>{
      gbtn.addEventListener('click', ()=>{
        // v10.8新增：點擊「目前已經展開中」的分類，改為收合該分類（只收合選單，不影響目前畫面正在
        // 顯示的內容），避免子頁籤較多的分類（如流年與擇日中心，內含10個子頁籤）一直佔用選單版面；
        // 再點一次任一分類即會正常展開，不影響原本「點分類跳到其第一個子頁籤」的既有行為。
        const tabsShell = document.getElementById('tabsShell');
        const alreadyOpen = gbtn.classList.contains('active') && tabsShell && !tabsShell.classList.contains('tabs-all-collapsed');
        if(alreadyOpen){
          tabsShell.classList.add('tabs-all-collapsed');
          return;
        }
        if(tabsShell) tabsShell.classList.remove('tabs-all-collapsed');
        const panel = document.querySelector(`.tab-group-panel[data-group="${gbtn.dataset.group}"]`);
        const firstBtn = panel && panel.querySelector('.tab-btn');
        if(firstBtn) firstBtn.click(); // 沿用既有 activateTab() 邏輯，未新增另一套切換機制
      });
    });
    // 頁面載入時，依目前已 active 的 .tab-btn（預設「八字命盤」）同步分類選單初始狀態
    const initialActiveBtn = document.querySelector('.tab-btn.active');
    if(initialActiveBtn) syncTabGroupForTab(initialActiveBtn.dataset.tab);
  })();

  // ---------- v10.10新增：側邊選單「收合時只顯示圖示」的文字/圖示拆分 ----------
  // 把每顆按鈕原本「🔮 命盤系統」這種「圖示+空格+文字」的純文字內容，拆成
  // <span class="tab-icon">🔮</span><span class="tab-label">命盤系統</span> 兩個獨立區塊，
  // 讓收合狀態下能乾淨地「只顯示圖示」，而不是文字被裁切到只剩一半、看起來破圖。
  // 只重新排版按鈕內部的顯示方式，不影響 textContent 之外任何既有邏輯（分頁切換、
  // aria屬性、data-tab等全部原封不動）。
  (function(){
    document.querySelectorAll('.tab-group-btn, .tab-btn').forEach(btn=>{
      const raw = btn.textContent.trim();
      const spaceIdx = raw.indexOf(' ');
      if(spaceIdx <= 0) return; // 找不到空格分隔（理論上不會發生），保留原樣避免破壞內容
      const icon = raw.slice(0, spaceIdx);
      const label = raw.slice(spaceIdx + 1);
      btn.textContent = '';
      const iconSpan = document.createElement('span');
      iconSpan.className = 'tab-icon';
      iconSpan.textContent = icon;
      const labelSpan = document.createElement('span');
      labelSpan.className = 'tab-label';
      labelSpan.textContent = label;
      btn.appendChild(iconSpan);
      btn.appendChild(document.createTextNode(' ')); // 保留原本文字間的空白，讓 .textContent 組回來時仍是「圖示 文字」，供手機選單等其他讀取textContent的地方維持原樣不受影響
      btn.appendChild(labelSpan);
    });
  })();

  // ---------- v10.11重寫：側邊選單「桌機可收合／手機滑出式抽屜」（取代v10.8~v10.10的hover做法） ----------
  (function(){
    var MOBILE_BP = 1024;
    var COLLAPSE_KEY = 'zmp_sidebar_collapsed_v1';
    var hamburgerBtn = document.getElementById('sidebarHamburgerBtn');
    var collapseBtn = document.getElementById('sidebarCollapseBtn');
    var closeBtn = document.getElementById('sidebarCloseBtn');
    var backdrop = document.getElementById('sidebarBackdrop');
    var tabsShell = document.getElementById('tabsShell');
    if(!tabsShell) return;

    function openDrawer(){
      document.body.classList.add('drawer-open');
      if(hamburgerBtn) hamburgerBtn.setAttribute('aria-expanded','true');
    }
    function closeDrawer(){
      document.body.classList.remove('drawer-open');
      if(hamburgerBtn) hamburgerBtn.setAttribute('aria-expanded','false');
    }
    function isMobile(){ return window.innerWidth <= MOBILE_BP; }

    // 桌機收合／展開：手動點擊切換，並記住使用者的選擇（存到localStorage），
    // 下次打開網站時會自動套用上次的選擇，符合世界標準側欄選單的慣用行為。
    function setCollapsed(collapsed){
      document.body.classList.toggle('sidebar-collapsed', collapsed);
      if(collapseBtn){
        collapseBtn.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
        collapseBtn.textContent = collapsed ? '⟩⟩' : '⟨⟨';
      }
      try{ localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); }catch(e){}
    }
    try{ setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1'); }catch(e){ setCollapsed(false); }

    if(collapseBtn) collapseBtn.addEventListener('click', function(){
      setCollapsed(!document.body.classList.contains('sidebar-collapsed'));
    });
    if(hamburgerBtn) hamburgerBtn.addEventListener('click', openDrawer);
    if(closeBtn) closeBtn.addEventListener('click', closeDrawer);
    if(backdrop) backdrop.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape' && document.body.classList.contains('drawer-open')) closeDrawer();
    });
    // 視窗尺寸調整（例如把瀏覽器視窗從手機寬度拉寬回桌機寬度）時，若抽屜還是開著的，
    // 自動關閉，避免切回桌機版時畫面上還殘留著手機版抽屜的開啟狀態。
    window.addEventListener('resize', function(){
      if(!isMobile()) closeDrawer();
    });
    // 手機版：點擊任一功能分頁後，選單本來的目的（切換頁面）已經達成，自動收起抽屜，
    // 不需要使用者再手動點一次關閉鈕，這是滑出式選單的標準慣例。
    tabsShell.addEventListener('click', function(e){
      if(isMobile() && e.target.closest('.tab-btn')) closeDrawer();
    });
  })();

  // v8.2新增：頁籤延遲渲染（Lazy Render）＋錯誤邊界（Error Boundary）
  // 排盤送出後不再一次同步執行全部14個頁籤的render函式（避免單次排盤耗時過長，尤其在手機上），
  // 改為只立即渲染當下作用中的頁籤，其餘頁籤在使用者第一次點開時才計算並快取結果。
  // 若某一頁籤計算過程拋出例外，只在該頁籤顯示錯誤提示、不中斷其他頁籤已渲染或即將渲染的內容。
  const TAB_RENDERERS = {};
  const tabRenderedFlag = {};
  function registerTabRenderer(tabKey, fn){ TAB_RENDERERS[tabKey] = fn; }
  function renderTabSafely(tabKey, ctx){
    if(tabRenderedFlag[tabKey]) return;
    const fn = TAB_RENDERERS[tabKey];
    if(!fn){ tabRenderedFlag[tabKey] = true; return; }
    try{
      fn(ctx);
      tabRenderedFlag[tabKey] = true;
    }catch(err){
      console.error(`[五象 FiveLens] 頁籤「${tabKey}」渲染時發生錯誤：`, err);
      tabRenderedFlag[tabKey] = true; // 標記為已嘗試，避免使用者反覆切換頁籤造成重複報錯
      const panel = document.getElementById('panel-'+tabKey);
      if(panel){
        const msg = (err && err.message) ? String(err.message).replace(/</g,'&lt;').replace(/>/g,'&gt;') : '未知錯誤';
        panel.innerHTML = `<div class="error-box">⚠️ 這個區塊在計算時發生預期外的錯誤，不影響其他頁籤，你可以切換到別的頁籤繼續查看結果；若重新排盤後仍持續發生，歡迎透過頁尾聯絡信箱回報（錯誤訊息：${msg}）。</div>`;
      }
    }
  }
  function resetTabRenderCache(){ Object.keys(tabRenderedFlag).forEach(k=>delete tabRenderedFlag[k]); }

  // 各頁籤延遲渲染的實際呼叫方式（函式本身在下方定義，因使用 function 宣告故已整體提升，此處註冊時機沒有問題）
  registerTabRenderer('bazi',    ctx=>renderBazi(ctx.bazi, ctx.wuxing, ctx.shishen, ctx.dayun, ctx.p.gender, ctx.p));
  registerTabRenderer('ziwei',   ctx=>renderZiwei(ctx.ziwei, ctx.p.unknownHour, ctx.p.gender, ctx.dayun, ctx.p));
  registerTabRenderer('astro',   ctx=>renderAstro(ctx.astro, ctx.ascendant, ctx.p.unknownHour));
  registerTabRenderer('name',    ctx=>renderName(ctx.name, ctx.p.surname, ctx.p.givenName, ctx.wuxing, ctx.bazi));
  registerTabRenderer('yijing',  ctx=>renderYijing(ctx));
  registerTabRenderer('tarot',   ctx=>renderTarotTab(ctx));
  registerTabRenderer('report',  ctx=>renderReport(ctx));
  registerTabRenderer('liunian', ctx=>renderLiunian(ctx));
  registerTabRenderer('liuyue',  ctx=>renderLiuyue(ctx));
  registerTabRenderer('yearsynth', ctx=>renderYearSynth(ctx));
  registerTabRenderer('zeri',    ctx=>renderZeri(ctx));
  registerTabRenderer('fengshui',ctx=>renderFengshui(ctx));
  registerTabRenderer('almanac',  ctx=>renderAlmanacTab(ctx));
  registerTabRenderer('zodiacyear',ctx=>renderZodiacYearTab(ctx));
  registerTabRenderer('taishen', ctx=>renderTaishenTab(ctx));
  registerTabRenderer('csection',ctx=>renderCsectionTab(ctx));
  registerTabRenderer('aiqa',    ctx=>renderAIQATab(ctx));
  registerTabRenderer('teamcompat',ctx=>renderTeamCompatTab(ctx));
  registerTabRenderer('bizzeri', ctx=>renderBizZeriTab(ctx));
  registerTabRenderer('actionplan',ctx=>renderActionPlanTab(ctx));
  registerTabRenderer('marketing',ctx=>renderMarketingTab(ctx));
  registerTabRenderer('bizplan',ctx=>renderBizPlanTab(ctx));
  registerTabRenderer('palmface',ctx=>renderPalmFaceTab(ctx));
  registerTabRenderer('hourcalib',ctx=>renderHourCalibTab(ctx));
  registerTabRenderer('poster',  ctx=>renderPoster(ctx));
  registerTabRenderer('timeline',ctx=>renderTimeline(ctx));
  registerTabRenderer('feedback',ctx=>renderFeedbackStats(ctx));

  const GAN_WX = B.GAN_WUXING, ZHI_WX = B.ZHI_WUXING;
  const HOUR_ZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
  let lastCtx = null; // 保留最近一次命盤結果，供「流月流日」查詢按鈕重新繪製使用

  function hourToZhiIdx(clockHour){
    if(clockHour>=23||clockHour<1) return 0;
    return Math.floor((clockHour+1)/2)%12;
  }

  // ---------- 紫微主星象徵字典(用於報告生成) ----------
  const STAR_MEAN = {
    '紫微':{trait:'尊貴領導、統御力強、重面子',cat:['事業','運勢']},
    '天機':{trait:'思慮靈活、善謀略、多變動',cat:['工作','運勢']},
    '太陽':{trait:'熱情外放、重名譽、照顧他人',cat:['事業','家庭']},
    '武曲':{trait:'務實剛毅、重財務執行力',cat:['事業','婚姻']},
    '天同':{trait:'性情溫和、享福知足、人緣佳',cat:['家庭','婚姻']},
    '廉貞':{trait:'企圖心強、感情豐富、易大起大落',cat:['婚姻','災厄']},
    '天府':{trait:'穩健保守、善理財、重安全感',cat:['家庭','運勢']},
    '太陰':{trait:'細膩體貼、重感情、內斂含蓄',cat:['婚姻','家庭']},
    '貪狼':{trait:'多才多藝、社交活躍、慾望較強',cat:['婚姻','事業']},
    '巨門':{trait:'口才犀利、善辯多疑、易招是非',cat:['工作','災厄']},
    '天相':{trait:'重義守信、善協調、輔佐型人格',cat:['事業','婚姻']},
    '天梁':{trait:'穩重長者風範、樂於助人、重原則',cat:['家庭','運勢']},
    '七殺':{trait:'行動力強、敢衝敢拚、性格剛烈',cat:['事業','災厄']},
    '破軍':{trait:'開創變革、不畏挑戰、波動較大',cat:['事業','災厄']},
  };

  function starsOf(chart, palaceName){
    const p = chart.palaces.find(x=>x.palaceName===palaceName);
    return p ? p.stars : [];
  }

  // ---------- 十神統計 ----------
  function countShishen(shishenResult){
    const counter = {};
    ['year','month','hour'].forEach(k=>{
      const s = shishenResult[k];
      counter[s.gan] = (counter[s.gan]||0)+1;
      s.zhiHidden.forEach(h=>{counter[h.shishen]=(counter[h.shishen]||0)+1;});
    });
    const day = shishenResult.day;
    day.zhiHidden.forEach(h=>{counter[h.shishen]=(counter[h.shishen]||0)+1;});
    return counter;
  }

  function wuxingDominant(score){
    const entries = Object.entries(score).sort((a,b)=>b[1]-a[1]);
    return {strongest:entries[0], weakest:entries[entries.length-1], entries};
  }

  // ---------- 命盤存摺（本機 localStorage 做即時快取＋離線備援；v10.2起額外同步到雲端，登入後換裝置也看得到；v5.6起本機內容以Obfuscate混淆存放） ----------
  const SAVE_KEY = 'zmp_saved_charts_v1';
  const SAVE_KEY_TS = SAVE_KEY + '_updatedAt';
  const CHART_SYNC_KEY = 'savedCharts';
  // v10.5新增（缺失②修正）：刪除紀錄「墓碑」清單——記錄「這個id已經被刪除過」，
  // 讓多裝置合併時，就算某裝置的舊清單裡還留著這筆資料，也知道該把它排除、不要復活。
  const DELETED_KEY = 'zmp_saved_charts_deleted_v1';
  const DELETED_MAX = 200;
  let chartCloudWriteQueue = Promise.resolve();

  function getSavedCharts(){
    try{ const arr = JSON.parse(Obfuscate.decode(localStorage.getItem(SAVE_KEY))||'[]'); return Array.isArray(arr)?arr:[]; }
    catch(e){ return []; }
  }
  function getDeletedChartIds(){
    try{ const arr = JSON.parse(localStorage.getItem(DELETED_KEY)||'[]'); return Array.isArray(arr)?arr:[]; }
    catch(e){ return []; }
  }
  function addDeletedChartId(id){
    const arr = getDeletedChartIds();
    if(!arr.includes(id)){
      arr.push(id);
      while(arr.length > DELETED_MAX) arr.shift();
      try{ localStorage.setItem(DELETED_KEY, JSON.stringify(arr)); }
      catch(e){ /* 空間不足時不影響本次刪除，僅這筆刪除紀錄可能無法同步到其他裝置 */ }
    }
  }
  function mergeDeletedIdsIntoLocal(remoteDeletedIds){
    if(!Array.isArray(remoteDeletedIds) || !remoteDeletedIds.length) return getDeletedChartIds();
    const merged = Array.from(new Set([...getDeletedChartIds(), ...remoteDeletedIds]));
    while(merged.length > DELETED_MAX) merged.shift();
    try{ localStorage.setItem(DELETED_KEY, JSON.stringify(merged)); }catch(e){}
    return merged;
  }
  // v10.5新增（缺失②修正）：以「每一筆命盤自己的id」做聯集合併，取代原本「整包依時間戳記二選一覆蓋」
  // 的同步策略——原本的策略在雙裝置/多分頁情境下，較新的一份會把另一份「整包蓋掉」，
  // 導致其中一邊剛新增的命盤被永久、靜默地弄丟；改成逐筆聯集後，兩邊各自新增的資料都會保留，
  // 只有真的被明確刪除過（即在deletedIds「墓碑」名單裡）的id才會被排除，不會因合併而復活。
  function mergeSavedCharts(localList, remoteList, deletedIds){
    const deletedSet = new Set(deletedIds||[]);
    const byId = new Map();
    [...(remoteList||[]), ...(localList||[])].forEach(item=>{
      if(!item || !item.id || deletedSet.has(item.id)) return;
      if(!byId.has(item.id)) byId.set(item.id, item);
    });
    return Array.from(byId.values()).sort((a,b)=> new Date(b.savedAt||0) - new Date(a.savedAt||0));
  }
  // 只更新本機快取，不會再推回雲端（雲端同步下來的資料用這個寫回本機，避免無限迴圈）
  function setSavedChartsLocalOnly(list, updatedAt){
    try{
      localStorage.setItem(SAVE_KEY, Obfuscate.encode(JSON.stringify(list)));
      localStorage.setItem(SAVE_KEY_TS, String(updatedAt||Date.now()));
    }catch(e){ /* 本機空間不足時忽略，雲端資料仍會顯示 */ }
  }
  // 一般存檔用這個：先寫本機（不會卡使用者），再非同步推上雲端
  // v10.5修正（缺失②）：推上雲端前，先向雲端抓一次「目前最新狀態」做合併，而不是把本機這份
  // 直接naive覆蓋上去——避免這個函式（新增/刪除命盤時都會呼叫）跟「登入時的整體同步」
  // 兩條路徑同時各自推送、彼此賽跑，導致其中一邊剛做的異動被另一邊蓋掉（原本的臭蟲成因）。
  // 現在無論是新增、刪除、或登入時的整體同步，最終都會走到同一套合併邏輯，只有一條寫入雲端的路徑。
  function setSavedCharts(list){
    const ts = Date.now();
    try{ localStorage.setItem(SAVE_KEY, Obfuscate.encode(JSON.stringify(list))); localStorage.setItem(SAVE_KEY_TS, String(ts)); }
    catch(e){ showFriendlyError('儲存失敗，可能是瀏覽器儲存空間已滿，或目前處於無痕模式導致無法使用本機儲存。'); return; }
    setChartSyncBadge('syncing');
    chartCloudWriteQueue = chartCloudWriteQueue.catch(()=>{}).then(async()=>{
      const remote = await zmpServerStorageGet(CHART_SYNC_KEY);
      if(remote && remote.__zmpError){ setChartSyncBadge('error'); return; }
      const remoteList = (remote && Array.isArray(remote.list)) ? remote.list : [];
      const remoteDeletedIds = (remote && Array.isArray(remote.deletedIds)) ? remote.deletedIds : [];
      const mergedDeletedIds = mergeDeletedIdsIntoLocal(remoteDeletedIds);
      const mergedList = mergeSavedCharts(getSavedCharts(), remoteList, mergedDeletedIds);
      if(JSON.stringify(mergedList) !== JSON.stringify(getSavedCharts())){
        setSavedChartsLocalOnly(mergedList, Date.now());
        renderSavedCharts();
      }
      const ok = await zmpServerStorageSet(CHART_SYNC_KEY, { list: mergedList, deletedIds: mergedDeletedIds, updatedAt: Date.now() });
      setChartSyncBadge(ok ? 'synced' : 'error');
    });
  }

  // ---- 雲端讀寫共用小工具（透過 /.netlify/functions/data，需登入）----
  async function zmpServerStorageGet(key){
    const user = window.netlifyIdentity && netlifyIdentity.currentUser();
    if(!user) return null;
    try{
      const res = await fetch('/.netlify/functions/data?key=' + encodeURIComponent(key), {
        headers: { 'Authorization': 'Bearer ' + (await user.jwt()) }
      });
      if(!res.ok) return {__zmpError:true,status:res.status};
      const data = await res.json();
      return data.value;
    }catch(e){ console.error('[命盤雲端同步] 讀取失敗：', e); return {__zmpError:true}; }
  }
  async function zmpServerStorageSet(key, value){
    const user = window.netlifyIdentity && netlifyIdentity.currentUser();
    if(!user) return false;
    try{
      const res = await fetch('/.netlify/functions/data', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization': 'Bearer ' + (await user.jwt()) },
        body: JSON.stringify({ key: key, value: value })
      });
      return res.ok;
    }catch(e){ console.error('[命盤雲端同步] 寫入失敗：', e); return false; }
  }
  function setChartSyncBadge(state){
    const el = document.getElementById('chartSyncBadge');
    if(!el) return;
    const map = {
      syncing: ['🔄 同步中…', ''],
      synced:  ['☁️ 已同步到雲端', ''],
      error:   ['⚠️ 同步失敗，暫時僅存本機', 'color:var(--crimson,#b23b35);'],
      offline: ['💾 僅存本機（尚未登入或離線）', '']
    };
    const [text, style] = map[state] || map.offline;
    el.textContent = text;
    el.setAttribute('style', 'font-size:12px;color:var(--paper-dim,#6b7280);' + style);
  }
  // v10.5修正（缺失②）：登入後執行一次——不再是「比較新舊、二選一整包覆蓋」，
  // 而是把本機與雲端的命盤清單、刪除墓碑清單都逐筆合併，合併結果同時寫回本機與雲端，
  // 確保兩個裝置各自新增的命盤都不會遺失，且已刪除的項目不會因合併而復活。
  async function syncSavedChartsFromServer(){
    setChartSyncBadge('syncing');
    const remote = await zmpServerStorageGet(CHART_SYNC_KEY);
    const localList = getSavedCharts();
    if(remote && remote.__zmpError){ setChartSyncBadge('error'); renderSavedCharts(); return; }
    const remoteList = (remote && Array.isArray(remote.list)) ? remote.list : [];
    const remoteDeletedIds = (remote && Array.isArray(remote.deletedIds)) ? remote.deletedIds : [];

    const mergedDeletedIds = mergeDeletedIdsIntoLocal(remoteDeletedIds);
    const mergedList = mergeSavedCharts(localList, remoteList, mergedDeletedIds);

    const listChanged = JSON.stringify(mergedList) !== JSON.stringify(localList);
    const cloudNeedsUpdate = !remote || JSON.stringify(remoteList) !== JSON.stringify(mergedList)
      || JSON.stringify(remoteDeletedIds) !== JSON.stringify(mergedDeletedIds);

    const ts = Date.now();
    if(listChanged || !remote){ setSavedChartsLocalOnly(mergedList, ts); }
    let syncOk = true;
    if(cloudNeedsUpdate){
      syncOk = await zmpServerStorageSet(CHART_SYNC_KEY, { list: mergedList, deletedIds: mergedDeletedIds, updatedAt: ts });
    }
    setChartSyncBadge(syncOk ? 'synced' : 'error');
    renderSavedCharts();
  }
  window.__zmpSyncSavedCharts = syncSavedChartsFromServer; // 供自動化測試/除錯手動觸發同步用，不影響正常流程
  window.__zmpGetSavedCharts = getSavedCharts; // 同上，供測試讀取目前清單
  window.__zmpDeleteSavedChart = deleteSavedChart; // 同上，供測試模擬刪除操作
  function initChartCloudSync(){
    if(window.netlifyIdentity && netlifyIdentity.currentUser()){
      syncSavedChartsFromServer();
    } else {
      setChartSyncBadge('offline');
      document.addEventListener('zmp:auth-ready', syncSavedChartsFromServer, { once:true });
    }
  }

  function renderSavedCharts(){
    const list = getSavedCharts();
    const box = document.getElementById('savedChartsList');
    if(!box) return;
    if(list.length===0){
      box.innerHTML = '<p class="field-hint">尚無已存命盤，排盤完成後可於下方結果頁點選「💾 儲存本次命盤」加入存摺。</p>';
      return;
    }
    box.innerHTML = list.map(c=>`
      <div class="saved-chart-item" data-id="${escapeHtml(c.id)}">
        <div class="sci-info">
          <b>${escapeHtml(c.surname)}${escapeHtml(c.givenName||'')}</b>
          <span>${c.gender==='M'?'男':'女'}・${escapeHtml(c.dateVal)} ${c.unknownHour?'(時辰未知)':escapeHtml(c.timeVal)}</span>
          ${c.note?`<span class="sci-note">📝 ${escapeHtml(c.note)}</span>`:''}
        </div>
        <div class="sci-actions">
          <button type="button" class="btn-mini load-chart-btn" data-id="${escapeHtml(c.id)}">載入</button>
          <button type="button" class="btn-mini danger delete-chart-btn" data-id="${escapeHtml(c.id)}">刪除</button>
        </div>
      </div>`).join('');
    box.querySelectorAll('.load-chart-btn').forEach(b=>b.addEventListener('click', ()=>loadSavedChart(b.dataset.id)));
    box.querySelectorAll('.delete-chart-btn').forEach(b=>b.addEventListener('click', ()=>deleteSavedChart(b.dataset.id)));
  }
  function loadSavedChart(id){
    const c = getSavedCharts().find(x=>x.id===id);
    if(!c) return;
    document.getElementById('surname').value = c.surname;
    document.getElementById('givenName').value = c.givenName||'';
    const genderRadio = document.querySelector(`input[name=gender][value="${c.gender}"]`);
    if(genderRadio){
      genderRadio.checked = true;
      document.querySelectorAll('#genderRow .radio-pill').forEach(p=>{
        p.classList.toggle('active', p.querySelector('input').value===c.gender);
      });
    }
    document.getElementById('birthDate').value = c.dateVal;
    document.getElementById('birthTime').value = c.timeVal;
    document.getElementById('unknownHour').checked = !!c.unknownHour;
    document.getElementById('lateZiSplitsDay').checked = !!c.lateZiSplitsDay;
    if(typeof syncLateZiField==='function') syncLateZiField();
    document.getElementById('longitude').value = c.longitude;
    document.getElementById('latitude').value = c.latitude;
    document.getElementById('useTrueSolar').checked = c.useTrueSolarTime!==false;
    const formSection = document.getElementById('form-section');
    formSection.classList.remove('hidden-until-cta');
    if(formSection.scrollIntoView){ formSection.scrollIntoView({behavior:'smooth', block:'start'}); }
  }
  function deleteSavedChart(id){
    if(!confirm('確定要刪除這筆已存命盤嗎？此動作無法復原。')) return;
    addDeletedChartId(id); // v10.5新增（缺失②修正）：記錄刪除墓碑，避免多裝置合併同步時這筆資料「復活」
    setSavedCharts(getSavedCharts().filter(x=>x.id!==id));
    renderSavedCharts();
  }
  function saveCurrentChart(){
    if(!lastCtx){ showFriendlyError('請先完成排盤，才能儲存命盤。'); return; }
    const p = lastCtx.p;
    const note = prompt('可為此命盤加上備註（例如：客戶編號、關係標籤），留空可略過：','') || '';
    const list = getSavedCharts();
    list.unshift({
      id: 'c'+Date.now()+Math.random().toString(36).slice(2,7),
      surname:p.surname, givenName:p.givenName, gender:p.gender,
      dateVal: `${p.y}-${String(p.m).padStart(2,'0')}-${String(p.d).padStart(2,'0')}`,
      timeVal: `${String(p.hh).padStart(2,'0')}:${String(p.mm).padStart(2,'0')}`,
      unknownHour: !!p.unknownHour, longitude: p.longitude, latitude: p.latitude,
      useTrueSolarTime: p.useTrueSolarTime!==false, lateZiSplitsDay: !!p.lateZiSplitsDay, note, savedAt: new Date().toISOString(),
    });
    if(list.length>50) list.length = 50;
    setSavedCharts(list);
    renderSavedCharts();
    showFriendlyError('已儲存到本機命盤存摺！', {type:'success'});
  }
  document.getElementById('saveChartBtn')?.addEventListener('click', saveCurrentChart);
  document.getElementById('exportChartsBtn')?.addEventListener('click', ()=>{
    const list = getSavedCharts();
    if(list.length===0){ showFriendlyError('目前存摺中沒有資料可匯出。'); return; }
    const data = JSON.stringify(list, null, 2);
    const blob = new Blob([data], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = '五象 FiveLens_命盤存摺.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
  function isValidImportedChart(x){
    if(!x || typeof x !== 'object') return false;
    if(typeof x.id !== 'string' || !/^c[a-zA-Z0-9_-]{6,80}$/.test(x.id)) return false;
    if(typeof x.surname !== 'string' || x.surname.length>40) return false;
    if(typeof (x.givenName||'') !== 'string' || (x.givenName||'').length>80) return false;
    if(x.gender!=='M' && x.gender!=='F') return false;
    if(typeof x.dateVal !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.dateVal)) return false;
    if(typeof x.timeVal !== 'string' || !/^\d{2}:\d{2}$/.test(x.timeVal)) return false;
    const lon=Number(x.longitude), lat=Number(x.latitude);
    if(!Number.isFinite(lon)||lon<-180||lon>180||!Number.isFinite(lat)||lat<-90||lat>90) return false;
    if(x.note!==undefined && (typeof x.note!=='string' || x.note.length>500)) return false;
    return true;
  }
  document.getElementById('importChartsInput')?.addEventListener('change', (e)=>{
    const file = e.target.files[0]; if(!file) return;
    if(file.size > 2*1024*1024){ showFriendlyError('匯入檔案過大，請選擇 2MB 以下的命盤存摺檔。'); e.target.value=''; return; }
    const reader = new FileReader();
    reader.onload = ()=>{
      try{
        const imported = JSON.parse(reader.result);
        if(!Array.isArray(imported)) throw new Error('格式錯誤');
        const existing = getSavedCharts();
        const existingIds = new Set(existing.map(x=>x.id));
        const valid = imported.filter(isValidImportedChart);
        const toAdd = valid.filter(x=>!existingIds.has(x.id)).slice(0, Math.max(0, 50-existing.length));
        const rejected = imported.length - valid.length;
        const merged = existing.concat(toAdd);
        setSavedCharts(merged);
        renderSavedCharts();
        showFriendlyError(`匯入完成，新增 ${toAdd.length} 筆資料（重複ID、格式錯誤或超過 50 筆上限的資料已略過${rejected ? `；無效資料 ${rejected} 筆` : ''}）。`, {type:'success'});
      }catch(err){
        showFriendlyError('匯入失敗，請確認選擇的檔案是本站匯出的「五象 FiveLens_命盤存摺.json」格式。');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });
  renderSavedCharts(); // 先用本機快取立即顯示，避免畫面空白
  initChartCloudSync(); // 再跟雲端同步，同步完成後會自動重新渲染

  // v5.6新增：時辰未知時，「晚子時算隔日」選項無意義（時間已強制為中午12:00），故連動停用並取消勾選。
  const unknownHourEl = document.getElementById('unknownHour');
  const lateZiEl = document.getElementById('lateZiSplitsDay');
  function syncLateZiField(){
    if(unknownHourEl.checked){ lateZiEl.checked = false; lateZiEl.disabled = true; }
    else{ lateZiEl.disabled = false; }
  }
  unknownHourEl?.addEventListener('change', syncLateZiField);
  syncLateZiField();

  // ---------- 主流程 ----------
  // v8.2新增：表單錯誤提示改用行內錯誤框，取代原本的瀏覽器 alert() 彈窗
  // ——alert() 會強制中斷操作流程、風格也與頁面本身不一致，尤其在手機上體驗生硬。
  function showFormError(msg){
    const box = document.getElementById('formErrorBox');
    if(!box){ alert(msg); return; }
    box.textContent = '⚠️ ' + msg;
    box.style.display = 'block';
    if(box.scrollIntoView) box.scrollIntoView({behavior:'smooth', block:'center'});
  }
  function clearFormError(){
    const box = document.getElementById('formErrorBox');
    if(box){ box.style.display = 'none'; box.textContent=''; }
  }

  document.getElementById('birthForm').addEventListener('submit', function(e){
    e.preventDefault();
    clearFormError();
    const surname = document.getElementById('surname').value.trim();
    const givenName = document.getElementById('givenName').value.trim();
    const gender = document.querySelector('input[name=gender]:checked').value;
    const dateVal = document.getElementById('birthDate').value;
    const timeVal = document.getElementById('birthTime').value || '12:00';
    const unknownHour = document.getElementById('unknownHour').checked;
    const lateZiSplitsDay = document.getElementById('lateZiSplitsDay').checked;
    const longitudeRaw = document.getElementById('longitude').value.trim();
    const latitudeRaw = document.getElementById('latitude').value.trim();
    const longitude = longitudeRaw === '' ? 121.5 : Number(longitudeRaw);
    const latitude = latitudeRaw === '' ? 25.03 : Number(latitudeRaw);
    const useTrueSolarTime = document.getElementById('useTrueSolar').checked;

    if(!dateVal){ showFormError('請選擇出生日期'); return; }
    if(isNaN(longitude) || Math.abs(longitude)>180){ showFormError('經度數值有誤，請輸入 -180 至 180 之間的數字（東經為正）。'); return; }
    if(isNaN(latitude) || Math.abs(latitude)>90){ showFormError('緯度數值有誤，請輸入 -90 至 90 之間的數字（北緯為正）。'); return; }
    const [y,m,d] = dateVal.split('-').map(Number);
    let [hh,mm] = timeVal.split(':').map(Number);
    if(unknownHour){ hh=12; mm=0; }

    document.getElementById('result').style.display='none';
    document.getElementById('loadingBox').classList.add('active');

    setTimeout(()=>{
      try{
        runAll({surname,givenName,gender,y,m,d,hh,mm,unknownHour,longitude,latitude,useTrueSolarTime,lateZiSplitsDay});
      }catch(err){
        console.error(err);
        showFormError('計算發生錯誤，請確認輸入的日期是否正確（支援範圍約西元1901~2098年）。');
      }finally{
        document.getElementById('loadingBox').classList.remove('active');
      }
    }, 50);
  });

  function runAll(p){
    const tzOffset = 8;
    // ---- 八字 ----
    const baziInput = {year:p.y,month:p.m,day:p.d,hour:p.hh,minute:p.mm,tzOffset,longitude:p.longitude,useTrueSolarTime:p.useTrueSolarTime,lateZiSplitsDay:!!p.lateZiSplitsDay};
    const bazi = B.computeFourPillars(baziInput);
    const wuxing = B.wuxingScore(bazi.pillars);
    const shishen = B.computeShishenForPillars(bazi.pillars);
    const yearGanIdx = B.GAN.indexOf(bazi.pillars.year.gan);
    const dayun = B.computeDayun(baziInput, bazi.pillars, yearGanIdx, p.gender);

    // ---- 農曆 ----
    const lunar = L.solarToLunar(p.y,p.m,p.d,tzOffset);

    // ---- 紫微 ----
    const hourZhiIdx = p.unknownHour ? null : hourToZhiIdx(p.hh + p.mm/60);
    let ziwei = null;
    if(hourZhiIdx!==null){
      ziwei = Z.computeZiweiChart({
        lunarYear:lunar.lunarYear, lunarMonth:lunar.monthNumber, lunarDay:lunar.dayIndex,
        hourZhiIdx, yearGanZhi: bazi.pillars.year.gan+bazi.pillars.year.zhi, gender: p.gender,
      });
    }

    // ---- 西洋占星 ----
    const jdUT = A.toJD(p.y,p.m,p.d,(p.hh+p.mm/60)-tzOffset);
    const astro = AC.computeChart(jdUT);
    let ascendant = null;
    if(!p.unknownHour){ ascendant = AC.computeAscendant(jdUT, p.latitude, p.longitude); }

    // ---- 姓名學 ----
    const name = N.analyzeName(p.surname, p.givenName);

    renderResult({p,bazi,wuxing,shishen,dayun,lunar,ziwei,astro,ascendant,name});
  }

  function el(html){ const d=document.createElement('div'); d.innerHTML=html; return d.firstElementChild; }

  function renderResult(ctx){
    const {p,bazi,wuxing,shishen,dayun,lunar,ziwei,astro,ascendant,name} = ctx;
    lastCtx = ctx;
    resetTabRenderCache(); // v8.2：每次重新排盤都要清空頁籤渲染快取，避免切換頁籤時看到上一組命盤的舊資料

    document.getElementById('result').style.display='block';
    document.getElementById('resultTitle').textContent = `${p.surname}${p.givenName} 的命盤`;
    document.getElementById('resultSub').textContent =
      `國曆 ${p.y}/${p.m}/${p.d} ${p.unknownHour?'(時辰未知)':String(p.hh).padStart(2,'0')+':'+String(p.mm).padStart(2,'0')}　`+
      `農曆 ${lunar.lunarYear}年${lunar.isLeap?'閏':''}${lunar.monthName}${lunar.dayName}　`+
      `八字年：${bazi.baziYear}　節氣區間：${bazi.solarTermUsed}`;

    // v8.2：只立即渲染目前作用中的頁籤（通常是「八字命盤」或使用者上次停留的頁籤），
    // 其餘頁籤改為使用者點開時才計算，大幅縮短單次排盤的畫面回應時間；
    // 每個頁籤各自包在錯誤邊界中，單一頁籤出錯不會讓其他頁籤跟著空白。
    const activeBtn = document.querySelector('.tab-btn.active');
    const activeTabKey = activeBtn ? activeBtn.dataset.tab : 'bazi';
    renderTabSafely(activeTabKey, ctx);

    const resultEl = document.getElementById('result');
    if(resultEl.scrollIntoView){ resultEl.scrollIntoView({behavior:'smooth', block:'start'}); }
  }

  // ---------- 白話說明用的對照字典（皆為命理系統的通用定義，非針對個人的臆測） ----------
  const WX_PLAIN_METAPHOR = {
    '木':'像大樹一樣，重視成長、學習與向上發展，個性有韌性但也需要伸展的空間。',
    '火':'像太陽一樣，熱情積極、行動力強，喜歡站在人前發光發熱。',
    '土':'像大地一樣，穩重踏實、值得信賴，但有時比較固執、不容易變通。',
    '金':'像刀劍一樣，做事果斷、講求效率與原則，個性直接不拖泥帶水。',
    '水':'像流水一樣，聰明靈活、善於應變，但情緒起伏也可能較大。',
  };
  const PILLAR_MEANING = {
    year:'代表祖先根基、幼年運（約1~16歲）以及原生家庭背景。',
    month:'代表父母、手足與青年運（約17~32歲），也是判斷命盤格局的重要依據。',
    day:'代表你自己（日主）與配偶，是整張命盤的核心座標，其餘天干地支都是拿來跟日主比較的。',
    hour:'代表子女、晚年運（約49歲以後），也反映內心比較深層、不輕易表現出來的想法。',
  };
  const PALACE_MEANING = {
    '命宮':'代表你天生的核心性格與人生格局，是整張命盤最重要的宮位。',
    '兄弟':'代表與兄弟姊妹、平輩朋友之間的緣分與互動關係。',
    '夫妻':'代表感情婚姻狀況，以及和另一半的相處模式。',
    '子女':'代表與子女的緣分，也代表創造力與帶部屬晚輩的方式。',
    '財帛':'代表賺錢的方式與理財觀念——錢從哪裡來、容易怎麼花。',
    '疾厄':'代表體質與健康，提醒平時需要留意的身心狀況。',
    '遷移':'代表外出、搬遷、旅行運，以及在外地或異鄉的人際表現。',
    '交友':'代表朋友、部屬與人際圈的往來狀況。',
    '事業':'代表工作、事業發展方向與職場上的表現。',
    '田宅':'代表不動產、居家環境與家庭基業。',
    '福德':'代表內心的價值觀、興趣嗜好與精神生活品質。',
    '父母':'代表與父母長輩的緣分，以及成長過程中受到的家庭教養影響。',
  };
  const ZODIAC_TRAIT = {
    '牡羊座':'行動派、直率衝勁十足，喜歡當第一', '金牛座':'務實穩重、重視安全感與生活品質', '雙子座':'聰明靈活、好奇心強、擅長溝通',
    '巨蟹座':'重感情、顧家念舊、情緒細膩', '獅子座':'自信大方、有領導魅力、重視面子', '處女座':'細心謹慎、追求完美、善於分析',
    '天秤座':'重視和諧、優雅有品味、善於社交協調', '天蠍座':'深沉神秘、意志堅定、愛恨分明', '射手座':'樂觀自由、愛冒險探索、直言不諱',
    '摩羯座':'務實負責、目標導向、意志力強', '水瓶座':'獨立特別、重視理念、思想前衛', '雙魚座':'浪漫感性、富同理心、想像力豐富',
  };
  const PLANET_MEANING = {
    Sun:'代表你的核心自我、生命動力，以及你想成為什麼樣的人',
    Moon:'代表你的內在情緒、安全感來源與最真實的內心需求',
    Mercury:'代表你的思考方式，以及表達、溝通的風格',
    Venus:'代表你在感情與審美上的喜好——如何愛人、被什麼樣的人事物吸引',
    Mars:'代表你的行動力、慾望的展現方式，以及面對衝突時的反應',
    Jupiter:'代表你的幸運、成長機會，以及容易「擴張」順利的方向',
    Saturn:'代表你的責任感、人生課題，以及需要努力克服的限制',
  };
  const FIVE_GE_MEANING = {
    '天格':'多半代表祖先與家族背景的影響（通常由姓氏筆畫決定），較少直接反映個人吉凶，主要作為輔助參考。',
    '人格':'又稱「主運」，代表你的性格特質與整體命運核心，是五格中最重要的一格。',
    '地格':'又稱「前運」，代表36歲以前的際遇，也與家庭、基礎運勢有關。',
    '外格':'代表你在外的人際關係、社交表現與對外形象。',
    '總格':'又稱「後運」，代表36歲以後的際遇，也是姓名整體吉凶的總和參考。',
  };

  function explainSimple(bodyHtml){
    return `<div class="explain-box explain-simple"><h4>💡 簡易說明（給還不熟悉命理的你）</h4>${bodyHtml}</div>`;
  }
  // v9.7修正：改用原生<details>元素預設收合，實現「新手速覽／老手進階細節」真正的資訊分層——
  // 先前「詳細說明」雖然視覺上與「簡易說明」區隔，但實際上兩者都是預設展開、同時佔滿版面，
  // 並未真的替使用者省下閱讀量。此為單一共用函式的修改，全站6處呼叫皆自動套用，無需逐一改動呼叫端。
  function explainDetail(bodyHtml, summaryLabel){
    return `<details class="explain-box explain-detail"><summary>${summaryLabel || '📖 展開完整推演細節（十神、神煞、大運等專業術語逐一說明）'}</summary><div class="explain-detail-body">${bodyHtml}</div></details>`;
  }
  // 事業／婚姻／桃花／感情 白話解讀卡片組：items = [{icon,title,tag,paras:[...]}]
  function domainSection(heading, items, noteHtml){
    let html = `<h3 style="font-family:var(--serif);color:var(--gold-soft);font-size:16px;margin:26px 0 12px;">${heading}</h3>`;
    html += `<div class="domain-grid">`;
    items.forEach(it=>{
      html += `<div class="domain-card"><h5>${it.icon} ${it.title}${it.tag?`<span class="dc-tag">${it.tag}</span>`:''}</h5>${it.paras.map(p=>`<p>${p}</p>`).join('')}</div>`;
    });
    html += `</div>`;
    if(noteHtml) html += `<div class="domain-note">${noteHtml}</div>`;
    return html;
  }

  // ================= v9.7新增：八字神煞系統／用神格局深度分析引擎 =================
  // 神煞查表全部基於命盤已排出的四柱天干地支，不需額外排盤運算；用神格局引擎則是在既有「身強身弱」
  // 簡化版基礎上，新增「調候」（依月令補充寒暖燥濕）與「從格／專旺格」辨識，仍屬規則化簡化演算，
  // 並非傳統子平真詮等級的逐一格局辨證，詳見下方render函式中的演算方法說明。

  // ---------- 神煞查表 ----------
  // 天乙貴人：依日干對照，口訣「甲戊庚牛羊，乙己鼠猴鄉，丙丁豬雞位，壬癸兔蛇藏，六辛逢虎馬」
  const TIANYI_BY_GAN = {
    '甲':['丑','未'], '戊':['丑','未'], '庚':['丑','未'],
    '乙':['子','申'], '己':['子','申'],
    '丙':['亥','酉'], '丁':['亥','酉'],
    '壬':['卯','巳'], '癸':['卯','巳'],
    '辛':['寅','午'],
  };
  // 桃花：依三合局對照，口訣「申子辰見酉，寅午戌見卯，巳酉丑見午，亥卯未見子」（與getPeachZhi共用同一份PEACH_GROUP資料）
  // 驛馬：依三合局對照，口訣「申子辰馬在寅，寅午戌馬在申，巳酉丑馬在亥，亥卯未馬在巳」
  const YIMA_BY_GROUP = { '申':'寅','子':'寅','辰':'寅', '寅':'申','午':'申','戌':'申', '巳':'亥','酉':'亥','丑':'亥', '亥':'巳','卯':'巳','未':'巳' };
  // 華蓋：依三合局對照，即該局自身的「墓庫」地支，口訣「申子辰見辰，寅午戌見戌，巳酉丑見丑，亥卯未見未」
  const HUAGAI_BY_GROUP = { '申':'辰','子':'辰','辰':'辰', '寅':'戌','午':'戌','戌':'戌', '巳':'丑','酉':'丑','丑':'丑', '亥':'未','卯':'未','未':'未' };
  // 羊刃：僅陽干有羊刃（帝旺之刃），口訣「甲刃在卯，丙戊刃在午，庚刃在酉，壬刃在子」
  const YANGREN_BY_GAN = { '甲':'卯', '丙':'午', '戊':'午', '庚':'酉', '壬':'子' };

  const SHENSHA_DESC = {
    '天乙貴人': '傳統上最重要的貴人星，代表遇到困難時容易有人拉一把、逢凶化吉，人際關係也相對順遂。',
    '桃花': '代表異性緣、人緣與魅力，出現在不同柱位意義略有差異（年月桃花偏向外緣人氣，日時桃花偏向感情婚姻）。',
    '驛馬': '代表變動、遷移、奔波，容易與外出、搬家、換工作、出差旅行等變動性事務有緣，方向中性，端看流年吉凶而定是機會還是奔波勞碌。',
    '華蓋': '代表藝術、宗教、哲學等孤高性質的才華與領悟力，帶華蓋者較有獨立思考、不從眾的傾向，但也可能較不擅長社交應酬。',
    '羊刃': '個性剛強、行動力強、意志堅定，但也代表脾氣較衝、容易與人起衝突，傳統上羊刃過旺需留意意外血光與衝動決策。',
    '空亡': '該柱位所代表的六親或人生領域，力量傳統上被視為較「虛」、較不踏實，需要更多後天努力才能落實，並非完全沒有，僅是相對需要用心經營。',
  };

  function computeShensha(bazi){
    const P = bazi.pillars;
    const dayGan = P.day.gan;
    const pillarZhi = { year:P.year.zhi, month:P.month.zhi, day:P.day.zhi, hour:P.hour.zhi };
    const pillarLabel = { year:'年', month:'月', day:'日', hour:'時' };
    const results = [];

    // 天乙貴人：依日干找對應zhi，掃描四柱
    const tianyiZhi = TIANYI_BY_GAN[dayGan] || [];
    const tianyiHits = Object.entries(pillarZhi).filter(([k,z])=>tianyiZhi.includes(z)).map(([k])=>pillarLabel[k]);
    if(tianyiHits.length) results.push({ name:'天乙貴人', pillars:tianyiHits, desc:SHENSHA_DESC['天乙貴人'] });

    // 桃花／驛馬／華蓋：以日支為主要參照（現代通行版本，亦有以年支為參照之流派，屬命理界常見分歧）
    const refZhi = pillarZhi.day;
    const peachZhi = getPeachZhi(refZhi);
    if(peachZhi){
      const hits = Object.entries(pillarZhi).filter(([k,z])=>z===peachZhi).map(([k])=>pillarLabel[k]);
      if(hits.length) results.push({ name:'桃花', pillars:hits, desc:SHENSHA_DESC['桃花'] });
    }
    const yimaZhi = YIMA_BY_GROUP[refZhi];
    if(yimaZhi){
      const hits = Object.entries(pillarZhi).filter(([k,z])=>z===yimaZhi).map(([k])=>pillarLabel[k]);
      if(hits.length) results.push({ name:'驛馬', pillars:hits, desc:SHENSHA_DESC['驛馬'] });
    }
    const huagaiZhi = HUAGAI_BY_GROUP[refZhi];
    if(huagaiZhi){
      const hits = Object.entries(pillarZhi).filter(([k,z])=>z===huagaiZhi).map(([k])=>pillarLabel[k]);
      if(hits.length) results.push({ name:'華蓋', pillars:hits, desc:SHENSHA_DESC['華蓋'] });
    }

    // 羊刃：依日干查表，掃描四柱（僅甲丙戊庚壬五個陽干有此神煞）
    const yangrenZhi = YANGREN_BY_GAN[dayGan];
    if(yangrenZhi){
      const hits = Object.entries(pillarZhi).filter(([k,z])=>z===yangrenZhi).map(([k])=>pillarLabel[k]);
      if(hits.length) results.push({ name:'羊刃', pillars:hits, desc:SHENSHA_DESC['羊刃'] });
    }

    // 空亡：依日柱60甲子索引所屬「旬」換算，該旬缺少的兩個地支即為空亡，掃描四柱地支是否落入空亡
    const dayIdx = B.ganzhiIndex ? null : null; // 佔位，實際索引由呼叫端傳入bazi時已知日柱干支，改用下方計算
    const xunStart = Math.floor(idxOfGanZhi(P.day.gan, P.day.zhi) / 10) * 10;
    const usedZhi = new Set();
    for(let i=0;i<10;i++){ usedZhi.add(B.ZHI[(xunStart+i)%12]); }
    const kongwangZhi = B.ZHI.filter(z=>!usedZhi.has(z));
    const kongwangHits = Object.entries(pillarZhi).filter(([k,z])=>kongwangZhi.includes(z) && k!=='day').map(([k])=>pillarLabel[k]);
    if(kongwangHits.length) results.push({ name:'空亡', pillars:kongwangHits, desc:SHENSHA_DESC['空亡'] + `（本命盤空亡地支為「${kongwangZhi.join('、')}」）` });

    return results;
  }
  // 60甲子索引：輸入干支求其在60甲子循環中的序號（甲子=0...癸亥=59），用於空亡「旬」的計算
  function idxOfGanZhi(gan, zhi){
    const gi = B.GAN.indexOf(gan), zi = B.ZHI.indexOf(zhi);
    for(let idx=0; idx<60; idx++){ if(idx%10===gi && idx%12===zi) return idx; }
    return 0;
  }

  // ---------- 用神／格局深度分析引擎 ----------
  // 「扶抑」旺衰評分：對四柱天干＋地支藏干（依藏干本氣0.6／中氣0.3／餘氣0.1比例）逐一判斷與日主的五行生剋關係，
  // 並依「月令為提綱，旺衰月令占七成」的傳統原則，將月支本氣權重加重為其餘位置的3倍、月支中餘氣加重1.5倍，
  // 其餘七個位置（年干、年支藏干、月干、日支藏干、時干、時支藏干）權重皆為1倍，此為子平法「調候扶抑」的簡化量化版本。
  const RELATION_GROUP = { same:'比劫', sheng_me:'印', me_sheng:'食傷', ke_me:'官殺', me_ke:'財' };
  function ganRelationToDayMaster(dayGanWx, otherWx){
    if(otherWx===dayGanWx) return 'same';
    if(WX_SHENG[otherWx]===dayGanWx) return 'sheng_me';
    if(WX_SHENG[dayGanWx]===otherWx) return 'me_sheng';
    if(WX_KE[otherWx]===dayGanWx) return 'ke_me';
    if(WX_KE[dayGanWx]===otherWx) return 'me_ke';
    return null;
  }
  const TIAOHOU_KTB_TABLE = {
    '甲': {
      '寅': { primary:['丙'], secondary:['癸'] },
      '卯': { primary:['庚'], secondary:['戊','己'] },
      '辰': { primary:['丁','庚'], secondary:['壬'] },
      '巳': { primary:['癸'], secondary:['庚','丁'] },
      '午': { primary:['癸'], secondary:['丁'] },
      '未': { primary:['癸','庚','丁'], secondary:[] },
      '申': { primary:['庚','丁'], secondary:['壬'] },
      '酉': { primary:['丁','丙'], secondary:[] },
      '戌': { primary:['甲','庚'], secondary:['丁','壬','癸'] },
      '亥': { primary:['庚','丁','丙'], secondary:['戊'] },
      '子': { primary:['丁','庚'], secondary:['丙'] },
      '丑': { primary:['丁','庚'], secondary:[] },
    },
    '乙': {
      '寅': { primary:['丙'], secondary:['癸'] },
      '卯': { primary:['癸','丙'], secondary:[] },
      '辰': { primary:['癸'], secondary:['戊'] },
      '巳': { primary:['癸'], secondary:[] },
      '午': { primary:['癸'], secondary:['丙'] },
      '未': { primary:['癸'], secondary:['丙'] },
      '申': { primary:['丙','癸'], secondary:['己'] },
      '酉': { primary:['癸','丙'], secondary:['壬'] },
      '戌': { primary:['癸'], secondary:['甲'] },
      '亥': { primary:['丙'], secondary:['戊'] },
      '子': { primary:['丙'], secondary:[] },
      '丑': { primary:['丙'], secondary:[] },
    },
    '丙': {
      '寅': { primary:['壬'], secondary:['庚'] },
      '卯': { primary:['壬'], secondary:['戊'] },
      '辰': { primary:['壬'], secondary:['甲'] },
      '巳': { primary:['壬'], secondary:['庚'] },
      '午': { primary:['壬','庚'], secondary:[] },
      '未': { primary:['壬'], secondary:['庚'] },
      '申': { primary:['壬'], secondary:['戊'] },
      '酉': { primary:['壬'], secondary:['癸'] },
      '戌': { primary:['甲','壬'], secondary:[] },
      '亥': { primary:['甲'], secondary:['戊','庚'] },
      '子': { primary:['壬'], secondary:['戊','己'] },
      '丑': { primary:['壬'], secondary:['甲'] },
    },
    '丁': {
      '寅': { primary:['庚','甲'], secondary:[] },
      '卯': { primary:['庚','甲'], secondary:[] },
      '辰': { primary:['甲'], secondary:['庚','戊'] },
      '巳': { primary:['甲','庚'], secondary:[] },
      '午': { primary:['庚','壬'], secondary:['癸'] },
      '未': { primary:['甲','庚'], secondary:[] },
      '申': { primary:['庚','甲'], secondary:['乙','丙','戊'] },
      '酉': { primary:['庚','甲'], secondary:['丙'] },
      '戌': { primary:['甲'], secondary:[] },
      '亥': { primary:['庚','甲'], secondary:['戊','癸'] },
      '子': { primary:['庚','甲'], secondary:['戊','癸'] },
      '丑': { primary:['庚','甲'], secondary:['戊','癸'] },
    },
    '戊': {
      '寅': { primary:['丙','甲','癸'], secondary:[] },
      '卯': { primary:['丙','甲','癸'], secondary:[] },
      '辰': { primary:['甲','丙','癸'], secondary:[] },
      '巳': { primary:['甲','丙','癸'], secondary:[] },
      '午': { primary:['壬','甲'], secondary:['丙'] },
      '未': { primary:['癸','丙'], secondary:['甲'] },
      '申': { primary:['丙','癸'], secondary:['甲'] },
      '酉': { primary:['丙','癸'], secondary:[] },
      '戌': { primary:['甲','丙'], secondary:['癸'] },
      '亥': { primary:['甲','丙'], secondary:[] },
      '子': { primary:['丙','甲'], secondary:[] },
      '丑': { primary:['丙','甲'], secondary:[] },
    },
    '己': {
      '寅': { primary:['丙'], secondary:['甲','庚'] },
      '卯': { primary:['甲','癸'], secondary:[] },
      '辰': { primary:['丙','癸'], secondary:['甲'] },
      '巳': { primary:['癸','丙'], secondary:[] },
      '午': { primary:['癸','丙'], secondary:[] },
      '未': { primary:['癸','丙'], secondary:[] },
      '申': { primary:['丙','癸'], secondary:[] },
      '酉': { primary:['辛','癸'], secondary:[] },
      '戌': { primary:['甲','丙','癸'], secondary:[] },
      '亥': { primary:['丙','戊','甲'], secondary:[] },
      '子': { primary:['丙','戊','甲'], secondary:[] },
      '丑': { primary:['丙','戊','甲'], secondary:[] },
    },
    '庚': {
      '寅': { primary:['丙','甲'], secondary:['戊','壬'] },
      '卯': { primary:['丁','甲'], secondary:['丙'] },
      '辰': { primary:['丁','甲'], secondary:['癸','壬'] },
      '巳': { primary:['壬','戊','丙'], secondary:['丁'] },
      '午': { primary:['壬','癸'], secondary:['戊','己'] },
      '未': { primary:['甲','丁'], secondary:[] },
      '申': { primary:['丁','甲'], secondary:[] },
      '酉': { primary:['丁','丙'], secondary:[] },
      '戌': { primary:['甲','壬'], secondary:[] },
      '亥': { primary:['丙','丁','甲'], secondary:[] },
      '子': { primary:['丁','甲','丙'], secondary:[] },
      '丑': { primary:['丁','甲','丙'], secondary:[] },
    },
    '辛': {
      '寅': { primary:['己','壬'], secondary:['庚'] },
      '卯': { primary:['壬'], secondary:['甲'] },
      '辰': { primary:['壬','癸'], secondary:[] },
      '巳': { primary:['壬','甲'], secondary:[] },
      '午': { primary:['壬','己'], secondary:['癸'] },
      '未': { primary:['壬','庚'], secondary:['甲'] },
      '申': { primary:['壬'], secondary:['甲','戊'] },
      '酉': { primary:['壬'], secondary:['甲','丁'] },
      '戌': { primary:['壬','癸'], secondary:['甲'] },
      '亥': { primary:['壬','丙'], secondary:[] },
      '子': { primary:['丙'], secondary:[] },
      '丑': { primary:['丙','壬'], secondary:['戊','己'] },
    },
    '壬': {
      '寅': { primary:['庚','丙'], secondary:[] },
      '卯': { primary:['庚','辛'], secondary:['戊'] },
      '辰': { primary:['甲','庚'], secondary:['丙'] },
      '巳': { primary:['庚','辛','壬','癸'], secondary:[] },
      '午': { primary:['庚','癸'], secondary:['辛'] },
      '未': { primary:['辛','甲'], secondary:[] },
      '申': { primary:['丁','戊'], secondary:['庚'] },
      '酉': { primary:['甲'], secondary:['庚','辛'] },
      '戌': { primary:['甲','丙'], secondary:[] },
      '亥': { primary:['庚'], secondary:['甲','戊'] },
      '子': { primary:['戊','丙'], secondary:[] },
      '丑': { primary:['丙','甲'], secondary:[] },
    },
    '癸': {
      '寅': { primary:['辛','丙'], secondary:['庚'] },
      '卯': { primary:['庚','辛'], secondary:[] },
      '辰': { primary:['丙'], secondary:['辛','甲'] },
      '巳': { primary:['庚'], secondary:['壬'] },
      '午': { primary:['庚','辛'], secondary:[] },
      '未': { primary:['庚','辛'], secondary:[] },
      '申': { primary:['丁'], secondary:['庚'] },
      '酉': { primary:['辛','丙'], secondary:[] },
      '戌': { primary:['辛'], secondary:['甲'] },
      '亥': { primary:['庚','辛'], secondary:['戊','丁'] },
      '子': { primary:['丙','辛'], secondary:[] },
      '丑': { primary:['丙'], secondary:['庚','辛'] },
    },
  };
  // v9.8.3升級：調候用神改採《窮通寶鑑》十天干十二月調候用神表（10日干×12月令＝120組），
  // 取代先前僅依「冬季喜火／夏季喜水／春秋不特別調候」的3類簡化版本。內容已交叉核對多方獨立命理
  // 文獻來源，彼此一致。原文對每組尚有「無X用Y」「Z旺則用W」等條件式判斷與詳細命理推演，此處僅
  // 摘取「主要用神」與「輔助用神」兩層結構化資料供程式查表使用，並以自撰白話說明呈現，不逐字複製
  // 原文命理論述。這是far比先前3分類版本更貼近命理館、擇日館實務查閱《窮通寶鑑》的專業判斷方式。
  function tiaohouSuggestion(dayGan, monthZhi){
    const entry = TIAOHOU_KTB_TABLE[dayGan] && TIAOHOU_KTB_TABLE[dayGan][monthZhi];
    if(!entry){
      return { need:null, primary:[], secondary:[], reason:'查無對應調候資料。', source:null };
    }
    const primaryStr = entry.primary.join('、');
    const secondaryStr = entry.secondary.join('、');
    const need = entry.primary[0] ? B.GAN_WUXING[entry.primary[0]] : null;
    let reason = `依《窮通寶鑑》，日主「${dayGan}」生於${monthZhi}月，傳統上調候用神以「${primaryStr}」為主`;
    if(secondaryStr) reason += `，「${secondaryStr}」為輔助`;
    reason += `。這是根據古籍對這個日干在這個月份最常見氣候與五行失衡狀況所整理出的建議調候方向，實際仍須配合命盤整體強弱、格局綜合判斷，並非只要八字中出現這些字就必然是好命，也並非沒出現就一定不好。`;
    return { need, primary:entry.primary, secondary:entry.secondary, reason, source:'窮通寶鑑' };
  }

  function computeYongshenEngine(bazi){
    const P = bazi.pillars;
    const dayGan = P.day.gan, dayGanWx = B.GAN_WUXING[dayGan];
    const monthZhi = P.month.zhi;
    let supportScore = 0, drainScore = 0;
    const detail = [];
    function addGan(gan, weight, label){
      const wx = B.GAN_WUXING[gan];
      const rel = ganRelationToDayMaster(dayGanWx, wx);
      if(rel==='same' || rel==='sheng_me'){ supportScore += weight; } else if(rel){ drainScore += weight; }
      if(rel) detail.push({ label, gan, wx, rel:RELATION_GROUP[rel], weight });
    }
    function addZhiHidden(zhi, posWeight, label){
      (B.ZHI_HIDDEN[zhi]||[]).forEach(([g, prop])=>{
        addGan(g, posWeight * prop, label + `藏${g}`);
      });
    }
    addGan(P.year.gan, 1, '年干');
    addZhiHidden(P.year.zhi, 1, '年支');
    addGan(P.month.gan, 1, '月干');
    addZhiHidden(P.month.zhi, 3, '月支'); // 月令權重加重
    addZhiHidden(P.day.zhi, 1, '日支');
    addGan(P.hour.gan, 1, '時干');
    addZhiHidden(P.hour.zhi, 1, '時支');

    const total = supportScore + drainScore || 1;
    const ratio = supportScore / total;
    let strengthLabel, strengthTier;
    if(ratio >= 0.85){ strengthLabel = '極強'; strengthTier = 'extreme_strong'; }
    else if(ratio >= 0.55){ strengthLabel = '偏強'; strengthTier = 'strong'; }
    else if(ratio >= 0.45){ strengthLabel = '中和'; strengthTier = 'balanced'; }
    else if(ratio >= 0.15){ strengthLabel = '偏弱'; strengthTier = 'weak'; }
    else { strengthLabel = '極弱'; strengthTier = 'extreme_weak'; }

    // 從格／專旺格簡化辨識：僅在「極強」或「極弱」且日主幾乎無根（支持力量絕對值也偏低）時才提示，
    // 一般身強身弱不在此列，避免浮濫套用從格（從格在傳統子平法中屬於少數特殊格局，非常態）。
    let geju = null;
    if(strengthTier==='extreme_weak' && supportScore < total*0.12){
      const drainByCat = { 食傷:0, 財:0, 官殺:0 };
      detail.forEach(d=>{ if(d.rel==='食傷') drainByCat.食傷+=d.weight; if(d.rel==='財') drainByCat.財+=d.weight; if(d.rel==='官殺') drainByCat.官殺+=d.weight; });
      const topDrain = Object.entries(drainByCat).sort((a,b)=>b[1]-a[1])[0];
      if(topDrain[1]>0) geju = { type:`從${topDrain[0]}格（候選）`, note:`日主「${dayGan}」在命盤中幾乎沒有比劫、印星根氣支持，力量幾乎全部集中在「${topDrain[0]}」，符合「從弱格」的基本特徵之一（日主無根＋單一五行極旺）。從格是子平法中較特殊少見的格局，僅供參考方向，正式論斷從格與否還需同時檢視是否有「破格」的通根或不合，強烈建議諮詢專業命理師確認。` };
    } else if(strengthTier==='extreme_strong' && drainScore < total*0.12){
      geju = { type:'專旺格（候選）', note:`日主「${dayGan}」在命盤中比劫、印星力量極旺，官殺財星幾乎不見約束，符合「專旺格／從強格」的基本特徵之一。同樣屬於子平法中較特殊少見的格局，正式論斷仍強烈建議諮詢專業命理師確認是否有破格因素。` };
    }

    const tiaohou = tiaohouSuggestion(dayGan, monthZhi);
    // 綜合用神建議：扶抑為主（弱則用印比生扶、強則用食傷官殺財洩克），調候需求以附加提醒方式呈現而非直接覆蓋扶抑結論
    const WX_ORDER = ['木','火','土','金','水'];
    let fuyiYongShen = [];
    if(strengthTier==='weak' || strengthTier==='extreme_weak'){
      fuyiYongShen = [dayGanWx, WX_ORDER.find(w=>WX_SHENG[w]===dayGanWx)]; // 比劫(同我) + 印(生我)
    } else if(strengthTier==='strong' || strengthTier==='extreme_strong'){
      fuyiYongShen = [WX_ORDER.find(w=>WX_SHENG[dayGanWx]===w), WX_ORDER.find(w=>WX_KE[dayGanWx]===w), WX_ORDER.find(w=>WX_KE[w]===dayGanWx)].filter(Boolean); // 食傷、財、官殺
    } else {
      fuyiYongShen = [dayGanWx];
    }
    return { dayGan, dayGanWx, monthZhi, ratio, supportScore, drainScore, strengthLabel, strengthTier, geju, tiaohou, fuyiYongShen, detail };
  }

  // ================= v9.8.1新增：出生時辰反推校準器 =================
  // 設計理念：不新增第二套排盤引擎，而是對12個時辰假設分別呼叫與命盤主流程完全相同的
  // B.computeFourPillars()，再用「流年運勢」頁籤同一套 flowTags() 訊號判斷邏輯，逐一檢查
  // 使用者輸入的人生事件發生年份，該時辰假設是否出現與事件類型相符的流年訊號（例如「結婚」
  // 年份是否出現「合配偶宮」），統計每個時辰假設的命中數並排序。此為統計傾向參考，非精確
  // 反推術（真正的時辰反推術如「子平真詮」時柱定位法需要更完整的命理推演與人工判斷）。
  function computeHourCalibration(p, events){
    const usableEvents = events.filter(ev=>{
      const cat = EVENT_CATEGORY_MAP[ev.category];
      return cat && cat.expectTags.length>0 && /^\d{4}-\d{2}-\d{2}$/.test(ev.date);
    });
    if(usableEvents.length===0) return null;
    const results = SHICHEN_LIST.map(sc=>{
      let fp;
      try{
        fp = B.computeFourPillars({ year:p.y, month:p.m, day:p.d, hour:sc.hour, minute:0, tzOffset:8, longitude:p.longitude, useTrueSolarTime:p.useTrueSolarTime });
      }catch(e){ return { ...sc, score:0, hits:[], dayGan:'—', dayZhi:'—', error:true }; }
      const dayGan = fp.pillars.day.gan, dayZhi = fp.pillars.day.zhi;
      const peachZhi = getPeachZhi(dayZhi);
      const spouseStars = p.gender==='M' ? ['正財','偏財'] : ['正官','七殺'];
      const natalZhi = { year:fp.pillars.year.zhi, month:fp.pillars.month.zhi, day:dayZhi, hour:fp.pillars.hour.zhi };
      let score = 0; const hits = [];
      usableEvents.forEach(ev=>{
        const cat = EVENT_CATEGORY_MAP[ev.category];
        const [ey] = ev.date.split('-').map(Number);
        let yGZ;
        try{ yGZ = ganZhiOfYear(ey, p.longitude, p.useTrueSolarTime); }catch(e){ return; }
        const flowShishen = B.getShishen(dayGan, yGZ.gan);
        const tags = flowTags(natalZhi, dayZhi, dayGan, yGZ.gan, yGZ.zhi, flowShishen, spouseStars, peachZhi, '年');
        const matched = cat.expectTags.filter(t=>tags.includes(t));
        if(matched.length>0){ score += matched.length; hits.push({ event:ev, matched }); }
      });
      return { ...sc, dayGan, dayZhi, score, hits, hitRate: usableEvents.length>0 ? hits.length/usableEvents.length : 0 };
    });
    results.sort((a,b)=> b.score - a.score || b.hitRate - a.hitRate);
    return { results, usableEvents, skippedCount: events.length - usableEvents.length };
  }

  function renderHourCalibTab(ctx){
    const panel = document.getElementById('panel-hourcalib');
    if(!panel) return;
    const { p } = ctx;
    panel.innerHTML = '';
    panel.appendChild(el(`<div>
      <div class="compat-intro">最多人卡在命理分析的第一關不是「算不準」，而是根本不知道精確出生時辰。這個工具讓你輸入幾個記得住大概時間的人生重大事件（結婚、換工作、搬家等），系統會對12個時辰假設分別排盤，比對哪個時辰假設算出的流年訊號與你回報的事件最吻合，供你篩選出「較有可能」的時辰範圍——這是統計傾向參考，不是精確反推術，強烈建議事件數至少3個以上、且分散在不同年齡才有參考意義，若能找到戶籍謄本、長輩回憶等更直接的資料來源，仍應以那些為優先。</div>
      ${eventLogFormHtml('hourCalibEvents')}
      <button type="button" class="btn-primary" id="hourCalibRunBtn" style="margin-top:16px;">🧭 開始校準</button>
      <div id="hourCalibResult"></div>
    </div>`));

    wireEventLogForm('hourCalibEvents', null);
    document.getElementById('hourCalibRunBtn').addEventListener('click', ()=>{
      const resultBox = document.getElementById('hourCalibResult');
      const events = getEventLog();
      const calib = computeHourCalibration(p, events);
      if(!calib){
        resultBox.innerHTML = `<div class="error-box" style="margin-top:14px;">目前輸入的事件類型皆為「其他重大事件」或格式不完整，本工具僅能比對有對應流年訊號的事件類型（升學、搬家、分手、結婚、換工作、重大病痛、財務變動），請至少新增一筆這幾類事件。</div>`;
        return;
      }
      const { results, usableEvents, skippedCount } = calib;
      const top3 = results.slice(0, 3);
      let html = `<div class="card" style="margin-top:14px;">
        <h3 style="margin:0 0 10px;font-family:var(--serif);color:var(--gold-soft);">校準結果（依 ${usableEvents.length} 筆可比對事件計算）</h3>
        ${skippedCount>0?`<p style="font-size:14px;color:var(--paper-dim);">另有 ${skippedCount} 筆「其他重大事件」未納入比對（無對應流年訊號可判斷）。</p>`:''}
        <h4 style="margin:14px 0 8px;color:var(--jade-soft);">🌟 較有可能的時辰（前3名）</h4>
        <table class="data-table"><tr><th>時辰</th><th>時間範圍</th><th>推算日柱</th><th>命中事件數</th><th>命中率</th></tr>
        ${top3.map(r=>`<tr><td class="hl">${r.name}</td><td>${r.range}</td><td class="gz">${r.dayGan}${r.dayZhi}</td><td>${r.hits.length}／${usableEvents.length}</td><td>${(r.hitRate*100).toFixed(0)}%</td></tr>`).join('')}
        </table>
      </div>`;
      html += `<details style="margin-top:14px;"><summary style="cursor:pointer;color:var(--gold-soft);font-size:14px;">顯示完整12時辰比對結果</summary>
        <table class="data-table" style="margin-top:10px;"><tr><th>時辰</th><th>推算日柱</th><th>命中事件數</th><th>命中率</th></tr>
        ${results.map(r=>`<tr><td>${r.name}（${r.range}）</td><td class="gz">${r.dayGan}${r.dayZhi}</td><td>${r.hits.length}／${usableEvents.length}</td><td>${(r.hitRate*100).toFixed(0)}%</td></tr>`).join('')}
        </table>
      </details>`;
      if(top3[0] && top3[0].hits.length>0){
        html += `<div class="card" style="margin-top:14px;"><h4 style="margin:0 0 10px;color:var(--gold-soft);">「${top3[0].name}」命中細節</h4>`;
        top3[0].hits.forEach(h=>{
          const cat = EVENT_CATEGORY_MAP[h.event.category];
          html += `<p style="font-size:14px;color:var(--paper-dim);margin:0 0 6px;">${h.event.date}・${cat.label}${h.event.note?`（${escapeHtml(h.event.note)}）`:''} → 該年流年訊號命中「${h.matched.join('、')}」</p>`;
        });
        html += `</div>`;
      }
      html += explainDetail(`
        <h5>這個方法的原理與限制是什麼？</h5>
        <p style="font-size:14px;color:var(--paper-dim);line-height:1.85;">每個時辰假設都會排出一組完整八字，本工具對12個時辰假設分別計算「你回報事件發生那一年」的流年訊號（與「流年運勢」頁籤同一套判斷邏輯），檢查是否出現與該事件類型相符的訊號（例如「結婚」預期出現「合配偶宮」或「姻緣星動」）。命中次數較多的時辰，代表在本站訊號判斷體系下「相對更吻合」你回報的人生際遇，但這仍是機率傾向、不是唯一解——不同時辰之間命中率差距不大時（例如只差1、2次命中），代表訊號區分度不足，此時本工具無法給出有意義的判斷，建議尋求更直接的時辰資料來源。</p>
        <h5>為什麼需要至少3個事件？</h5>
        <p style="font-size:14px;color:var(--paper-dim);line-height:1.85;">事件數太少時，12個時辰假設可能有多個並列最高分（例如只有1個事件時，很容易有3、4個時辰同時命中），統計上不具區分力；事件數越多、時間跨度越大（涵蓋不同大運階段），校準結果的參考價值越高。</p>
      `);
      resultBox.innerHTML = '';
      resultBox.appendChild(el(`<div>${html}</div>`));
    });
  }

  function renderBazi(bazi, wuxing, shishen, dayun, gender, p){
    const panel = document.getElementById('panel-bazi');
    const P = bazi.pillars;
    const dayGan = P.day.gan, dayZhi = P.day.zhi, dayGanWx = GAN_WX[dayGan];
    const dom = wuxingDominant(wuxing);
    const total = Object.values(wuxing).reduce((a,b)=>a+b,0) || 1;
    const generateMap = {'木':'水','火':'木','土':'火','金':'土','水':'金'};
    const supportScore = (wuxing[dayGanWx]||0) + (wuxing[generateMap[dayGanWx]]||0);
    const strengthLabel = (supportScore/total)>0.42 ? '偏強' : ((supportScore/total)<0.28 ? '偏弱' : '中和');
    const strengthPlain = strengthLabel==='偏強' ? '個性主見強、獨立自主，比較習慣靠自己解決問題。' : (strengthLabel==='偏弱' ? '個性比較需要別人的幫忙或環境資源的支持，不喜歡單打獨鬥。' : '個性算平衡型，能屈能伸，強弱都能應付。');
    const scCounter = countShishen(shishen);
    const catSums = {
      guanSha:(scCounter['正官']||0)+(scCounter['七殺']||0),
      caiXing:(scCounter['正財']||0)+(scCounter['偏財']||0),
      yinXing:(scCounter['正印']||0)+(scCounter['偏印']||0),
      shiShang:(scCounter['食神']||0)+(scCounter['傷官']||0),
      biJie:(scCounter['比肩']||0)+(scCounter['劫財']||0),
    };
    const topCatEntry = Object.entries(catSums).sort((a,b)=>b[1]-a[1])[0];
    const catPlain = { guanSha:'責任感強、重紀律，做事有規矩、有分寸', caiXing:'務實精明、重視實際成果，很會運用資源', yinXing:'學習力強、貴人運佳，喜歡吸收知識、依賴前輩指導', shiShang:'創意豐沛、表達力強，點子多、喜歡展現自己', biJie:'重視人脈、行動力強，喜歡合作與朋友互相扶持' };
    const catLabel = { guanSha:'官殺（正官／七殺）', caiXing:'財星（正財／偏財）', yinXing:'印星（正印／偏印）', shiShang:'食傷（食神／傷官）', biJie:'比劫（比肩／劫財）' };
    // v10.5修正（缺失④）：改用精確實歲，取代「西曆年直接相減」的粗略算法（見getPreciseAgeInfo說明）。
    const nowAgeForDu = getPreciseAgeInfo(p).preciseAge;
    const curDu = (dayun.dayunList||[]).find(d=>nowAgeForDu>=parseFloat(d.startAge) && nowAgeForDu<parseFloat(d.endAge)) || dayun.dayunList[dayun.dayunList.length-1];

    let html = explainSimple(`
      <p>你的「日主」（代表你自己）是 <b style="color:var(--gold-soft);">${dayGan}${dayZhi}</b>，五行屬「${dayGanWx}」——${WX_PLAIN_METAPHOR[dayGanWx]}</p>
      <p>整體來說，你的命盤屬於「<b style="color:var(--gold-soft);">${strengthLabel}</b>」格局：${strengthPlain}</p>
      <p>命盤中「${catLabel[topCatEntry[0]]}」的力量最突出，代表你${catPlain[topCatEntry[0]]}。</p>
      <p>五行中「${dom.strongest[0]}」最旺，是你天生最擅長發揮的部分；「${dom.weakest[0]}」最弱，是比較少展現、可以多留意補強的地方。</p>
      ${curDu ? `<p>你現在正走「${curDu.gan}${curDu.zhi}」這個大運（${curDu.startAge}~${curDu.endAge}歲），簡單說就是人生現階段的大主題，會持續影響你未來這10年左右的整體走向。</p>` : ''}
    `);
    // v5.6新增：出生時間接近節氣交界時的精度提醒。本站節氣時刻計算誤差可能達數分鐘，
    // 若出生時間與最近節氣交界相差在20分鐘內，月柱（甚至年柱，若剛好是立春）有機率因此誤判。
    if(typeof bazi.nearestTermGapMinutes==='number' && bazi.nearestTermGapMinutes<=20){
      html = `<div class="error-box" style="margin-bottom:16px;">⚠️ 你的出生時間距離最近的節氣交界僅約 ${bazi.nearestTermGapMinutes.toFixed(1)} 分鐘（本站節氣時刻計算與官方天文年鑑相比可能有數分鐘誤差），月柱（節氣所定義的「幾月」）甚至年柱（若剛好卡在立春前後）有機率因此排錯一柱。若這個誤差對你很重要，建議同時參考官方萬年曆核對節氣交界的精確時刻。</div>` + html;
    }

// ---- 事業／婚姻／桃花／感情 白話解讀（依真實十神數量、日主五行、桃花地支演算） ----
    const spouseIsCaiXing = gender==='M';
    const spouseCatLabel = spouseIsCaiXing ? '財星（正財／偏財，代表妻子／女友）' : '官殺（正官／七殺，代表丈夫／男友）';
    const spouseCount = spouseIsCaiXing ? catSums.caiXing : catSums.guanSha;
    const spouseText = spouseCount>=3
      ? `命盤中「${spouseCatLabel}」力量偏旺，代表在婚姻裡容易吸引到條件不錯、或相處起來${spouseIsCaiXing?'務實顧家':'有責任感、能扛事'}的對象，但力量太強也提醒別讓${spouseIsCaiXing?'另一半的付出':'對方的要求'}成為單方面的壓力。`
      : (spouseCount>=1
        ? `命盤中「${spouseCatLabel}」有出現但不算突出，感情婚姻運勢中規中矩，緣分需要靠後天主動經營、多把握機會認識新朋友。`
        : `命盤中「${spouseCatLabel}」在天干沒有明顯出現，不代表沒有姻緣，而是這段緣分比較需要透過大運、流年「補上」這顆星時才會比較明顯浮現，平常也可以多留意身邊被朋友介紹或工作場合認識的對象。`);
    const daySpouseHidden = shishen.day.zhiHidden.map(h=>h.shishen).join('、');
    const peachZhi = getPeachZhi(dayZhi);
    const natalZhiList = [P.year.zhi, P.month.zhi, P.day.zhi, P.hour.zhi];
    const hasPeach = natalZhiList.includes(peachZhi);
    const careerLean = catSums.guanSha>=catSums.shiShang ? (catSums.guanSha>=3?'體制內、管理職或需要承擔責任的工作':'按部就班、講求紀律的工作型態') : (catSums.shiShang>=3?'需要發揮創意、才華展現的工作（如設計、行銷、教學、表演等）':'發揮個人專業與彈性的工作型態');
    const wealthText = catSums.caiXing>=3
      ? `命盤中「財星（正財／偏財）」出現${catSums.caiXing}次，力量偏旺，代表你賺錢管道相對多元、對金錢也比較敏銳，但財星過旺也提醒別讓賺錢占據生活全部重心。`
      : (catSums.caiXing>=1
        ? `命盤中「財星」出現${catSums.caiXing}次，力量中等，收入穩定但爆發力有限，適合穩紮穩打、長期累積的理財方式。`
        : `命盤中「財星」在天干沒有明顯出現，不代表賺不到錢，而是財運比較需要主動爭取，不會憑空從天而降，建議透過提升專業能力或多元收入來源來補強財運。`);
    const investLean = dom.strongest[0]==='金' ? '對數字、規則與趨勢判斷較敏銳，操作股票、基金等金融商品相對得心應手' : (dom.strongest[0]==='土' ? '性格務實穩重，較適合不動產等長期持有型資產' : '行動力強、決策速度快，投資前建議先設好停損點，避免情緒化決策');
    const healthOrgan = ORGAN_MAP[dom.weakest[0]] || '';
    const healthText = `五行中「${dom.weakest[0]}」最弱，中醫五行養生觀念裡對應「${healthOrgan}」，是相對需要多留意保養的部位（僅為命理養生參考，非醫學診斷）。日主「${strengthLabel}」，${strengthLabel==='偏弱'?'體力與抗壓耐受度相對有限，長期熬夜或過度勞累特別容易反映在身體上，建議規律作息、避免透支。':(strengthLabel==='偏強'?'體力與抗壓性較好，但也別因此輕忽保養，維持規律運動仍有其必要。':'整體體質平穩，維持良好作息即可。')}`;

    html += domainSection('事業／婚姻／桃花／感情／財運／健康 白話解讀', [
      { icon:'💼', title:'事業', tag:dom.strongest[0]+'旺',
        paras:[
          `命盤中「官殺」出現${catSums.guanSha}次、「食傷」出現${catSums.shiShang}次，兩相比較之下，你比較適合「${careerLean}」。`,
          `五行以「${dom.strongest[0]}」最旺，${WX_PLAIN_METAPHOR[dom.strongest[0]]}這也是你天生比較容易發揮、做起來得心應手的方向。`
        ]},
      { icon:'💍', title:'婚姻', tag:strengthLabel,
        paras:[
          spouseText,
          `日柱地支（配偶宮）「${dayZhi}」裡藏著「${daySpouseHidden}」的特質，這是配偶宮比較深層、不容易第一眼看出來，但實際相處後會慢慢感受到的部分。`
        ]},
      { icon:'🌸', title:'桃花', tag:hasPeach?'命帶桃花':'桃花較不顯著',
        paras:[
          hasPeach
            ? `以日支「${dayZhi}」推算，桃花地支為「${peachZhi}」，而你命盤四柱中剛好有出現「${peachZhi}」，命理上稱為「命帶桃花」，代表你天生人緣不錯、異性緣或社交魅力比較容易被人注意到。`
            : `以日支「${dayZhi}」推算，桃花地支為「${peachZhi}」，但命盤四柱中沒有出現這個字，代表天生桃花星不算特別突出——這不代表沒人緣，只是魅力比較需要靠後天打扮、社交場合累積，遇到流年、大運帶「${peachZhi}」時桃花運會比平常更旺（可搭配「流年運勢」「流月流日精算」頁籤查詢哪一年／月比較旺）。`,
        ]},
      { icon:'💗', title:'感情', tag:catSums.shiShang>=3?'表達力強':'內斂型',
        paras:[
          `日主屬「${dayGanWx}」，${WX_PLAIN_METAPHOR[dayGanWx]}反映在感情中，這也是你面對親密關係時，最自然、最不用勉強偽裝的相處狀態。`,
          catSums.shiShang>=3 ? '「食傷」力量較旺，代表你談感情時表達直接、情感豐富，喜怒都寫在臉上，優點是真誠，但也要留意言語上別讓另一半感覺被冒犯。' : '「食傷」力量不算突出，代表你談感情時偏內斂，習慣用行動而非言語表達在乎，建議可以練習偶爾把心裡話說出口，讓另一半更清楚感受到你的心意。'
        ]},
      { icon:'💰', title:'財運', tag:catSums.caiXing>=3?'財旺':'平穩',
        paras:[ wealthText, `投資理財傾向：${investLean}。` ]},
      { icon:'❤️‍🩹', title:'健康', tag:strengthLabel,
        paras:[ healthText ]},
    ], '以上為依命盤「十神」與「日支桃花」規則推算之通用解讀，實際感情婚姻、財運與健康狀況仍受個人選擇、成長經歷、生活習慣與相處方式影響，僅供參考；如需更完整的正緣時機、換工作時機、犯太歲提醒與重大人生抉擇建議，可進一步參考「綜合運勢報告」與「流年運勢」頁籤。');

    


    html += `<div class="pillars-grid">`;
    ['year','month','day','hour'].forEach(k=>{
      const label = {year:'年柱',month:'月柱',day:'日柱(日主)',hour:'時柱'}[k];
      const gz = P[k];
      html += `<div class="pillar-card"><div class="label">${label}</div><div class="gz">${gz.gan}${gz.zhi}</div>
        <div class="wx">${GAN_WX[gz.gan]}${ZHI_WX[gz.zhi]}</div></div>`;
    });
    html += `</div>`;

    html += `<h3 style="font-family:var(--serif);color:var(--gold-soft);font-size:16px;margin:0 0 12px;">五行分佈</h3>`;
    html += `<div class="wuxing-bars">`;
    const maxV = Math.max(...Object.values(wuxing));
    ['木','火','土','金','水'].forEach(wx=>{
      const v = wuxing[wx]||0;
      html += `<div class="wx-row"><div class="wxname">${wx}</div><div class="bar-bg"><div class="bar-fill" style="width:${(v/maxV*100).toFixed(0)}%"></div></div><div class="wxval">${v.toFixed(1)}</div></div>`;
    });
    html += `</div>`;

    html += `<h3 style="font-family:var(--serif);color:var(--gold-soft);font-size:16px;margin:0 0 12px;">十神(以日主為我)</h3>`;
    html += `<table class="data-table"><tr><th>柱位</th><th>天干十神</th><th>地支藏干十神</th></tr>`;
    ['year','month','day','hour'].forEach(k=>{
      const label = {year:'年',month:'月',day:'日',hour:'時'}[k];
      const s = shishen[k];
      html += `<tr><td class="hl">${label}</td><td>${s.gan}</td><td>${s.zhiHidden.map(h=>h.gan+'('+h.shishen+')').join('、')}</td></tr>`;
    });
    html += `</table>`;

    html += `<h3 style="font-family:var(--serif);color:var(--gold-soft);font-size:16px;margin:0 0 12px;">大運（${dayun.isForward?'順排':'逆排'}，起運約 ${dayun.startAge} 歲）</h3>`;
    html += `<table class="data-table"><tr><th>大運</th><th>年齡區間</th></tr>`;
    dayun.dayunList.forEach(du=>{
      html += `<tr><td class="hl">${du.gan}${du.zhi}</td><td>${du.startAge} ~ ${du.endAge} 歲</td></tr>`;
    });
    html += `</table>`;

    // v9.7新增：八字神煞（天乙貴人／桃花／驛馬／華蓋／羊刃／空亡）
    const shenshaList = computeShensha(bazi);
    html += `<h3 style="font-family:var(--serif);color:var(--gold-soft);font-size:16px;margin:26px 0 12px;">神煞</h3>`;
    if(shenshaList.length===0){
      html += `<p style="color:var(--paper-dim);font-size:14px;">命盤四柱中未查到本站收錄的六種常見神煞（天乙貴人、桃花、驛馬、華蓋、羊刃、空亡），屬正常情況，不代表命盤欠佳。</p>`;
    }else{
      html += `<div class="domain-grid">`;
      shenshaList.forEach(s=>{
        html += `<div class="domain-card"><h5>✨ ${s.name}<span class="dc-tag">${s.pillars.join('、')}柱</span></h5><p>${s.desc}</p></div>`;
      });
      html += `</div>`;
    }

    // v9.7新增：用神／格局深度分析引擎（扶抑旺衰量化評分＋調候＋從格/專旺格辨識）
    const ys = computeYongshenEngine(bazi);
    html += `<h3 style="font-family:var(--serif);color:var(--gold-soft);font-size:16px;margin:26px 0 12px;">用神／格局深度分析</h3>`;
    html += `<div class="card" style="padding:14px 16px;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
        ${tagChip(`扶抑旺衰：${ys.strengthLabel}（支持力 ${(ys.ratio*100).toFixed(0)}%）`)}
        ${ys.geju ? tagChip(ys.geju.type) : ''}
        ${ys.tiaohou.source ? tagChip(`調候用神（${ys.tiaohou.source}）：${ys.tiaohou.primary.join('、')}`) : ''}
      </div>
      <p style="color:var(--paper-dim);font-size:14px;line-height:1.85;margin:0 0 8px;">${ys.tiaohou.reason}</p>
      ${ys.geju ? `<p style="color:var(--crimson-soft);font-size:14px;line-height:1.85;margin:0 0 8px;">${ys.geju.note}</p>` : ''}
      <p style="color:var(--paper);font-size:14px;line-height:1.85;margin:0;">綜合扶抑判斷，建議用神方向為「<b style="color:var(--gold-soft);">${ys.fuyiYongShen.join('、')}</b>」，可作為日常補強顏色、方位、五行屬性物品選擇時的參考依據${ys.tiaohou.need?`；若同時考量調候需求，「${ys.tiaohou.need}」亦可列入優先補強方向`:''}。</p>
    </div>`;

    html += explainDetail(`
      <h5>四柱分別代表什麼？</h5>
      <ul>
        <li><b>年柱（${P.year.gan}${P.year.zhi}）：</b>${PILLAR_MEANING.year}</li>
        <li><b>月柱（${P.month.gan}${P.month.zhi}）：</b>${PILLAR_MEANING.month}</li>
        <li><b>日柱（${P.day.gan}${P.day.zhi}）：</b>${PILLAR_MEANING.day}</li>
        <li><b>時柱（${P.hour.gan}${P.hour.zhi}）：</b>${PILLAR_MEANING.hour}</li>
      </ul>
      <h5>五行分佈是怎麼算出來、代表什麼？</h5>
      <p style="font-size:14px;color:var(--paper-dim);line-height:1.85;">上方數字是把四柱八個字（含地支藏干）依五行屬性加總得出的分數，總分佔比即代表這個五行在你命盤中的強弱。分數越高代表這個五行的能量在命盤中越充足，也是用來判斷「日主身強身弱」與後續「補強建議」的依據。</p>
      <h5>十神是什麼？</h5>
      <p style="font-size:14px;color:var(--paper-dim);line-height:1.85;">十神是把其他天干地支拿來跟「日主」比較後，依五行生剋關係分類出的十種角色（比肩、劫財、食神、傷官、正財、偏財、正官、七殺、正印、偏印），每一種都對應不同的個性傾向與人生課題，是八字命理判斷個性與運勢走向最核心的工具。你命盤中「${catLabel[topCatEntry[0]]}」出現次數最多（共${topCatEntry[1]}次），因此在解讀報告中會被特別強調。</p>
      <h5>大運是怎麼排出來的？</h5>
      <p style="font-size:14px;color:var(--paper-dim);line-height:1.85;">大運是把人生分成每10年一段的長期運勢曲線，依「陽男陰女順排、陰男陽女逆排」的傳統規則，從月柱往後（順排）或往前（逆排）推算，並依出生時間與節氣交界計算出精確的起運年齡。目前的分析主要根據列表中第一個大運（${curDu?curDu.gan+curDu.zhi+'，'+curDu.startAge+'~'+curDu.endAge+'歲':'尚未起運'}）進行延伸解讀。</p>
      <h5>神煞是怎麼查出來的？（v9.7新增）</h5>
      <p style="font-size:14px;color:var(--paper-dim);line-height:1.85;">神煞是傳統八字命理中，依天干地支對照固定口訣查出的特殊標記星，本站收錄六種最常見的神煞：天乙貴人（依日干查表）、桃花／驛馬／華蓋（依日支所屬三合局查表）、羊刃（依日干查表，僅甲丙戊庚壬五個陽干有此神煞）、空亡（依日柱所在的60甲子「旬」換算該旬缺少的兩個地支）。神煞是命盤的「加減分項」，並非決定命運好壞的主要依據，仍須搭配十神、用神、大運流年綜合判斷。</p>
      <h5>用神／格局是怎麼算出來的？（v9.7新增，v9.8.3調候升級）</h5>
      <p style="font-size:14px;color:var(--paper-dim);line-height:1.85;">「扶抑旺衰」評分將四柱八個字（含地支藏干，依藏干本氣0.6／中氣0.3／餘氣0.1比例）逐一判斷與日主的五行生剋關係，並依「月令為提綱，旺衰月令占七成」的傳統原則，將月支本氣權重加重為其餘位置的3倍、月支中餘氣加重1.5倍，計算出「支持力（比劫＋印）」佔全部力量的比例；比例極高或極低（低於15%或高於85%）且日主幾乎無根時，會進一步提示「從格／專旺格（候選）」方向，但這類特殊格局在子平法中屬少數情況，僅供參考，正式論斷仍須交叉檢視是否有通根、合化等「破格」因素。<b style="color:var(--gold-soft);">「調候」自v9.8.3起改採《窮通寶鑑》十天干十二月調候用神表</b>（10日干×12月令共120組真實古籍資料，非估算），依你的日主天干與月支查表得出「主要用神」與「輔助用神」，取代先前僅依季節分三類（冬喜火／夏喜水／春秋不特別調候）的簡化版本，更貼近命理館、擇日館實務查閱《窮通寶鑑》的判斷方式；惟原文對每組尚有「無X用Y」「Z旺則用W」等條件式判斷與詳細命理推演，本站僅摘取主要／輔助用神兩層結構化資料，並未逐一還原古籍完整的條件式邏輯與命例辨證，仍建議正式論命時搭配專業命理師或直接查閱原典核對。此為子平法「扶抑＋調候」用神判斷的規則化版本，並未涵蓋「病藥」「通關」等更完整的用神判斷體系，僅供日常方向參考，重大人生決策仍建議諮詢專業命理師取得完整論命。</p>
    `);

    panel.innerHTML='';
    panel.appendChild(el(`<div>${html}</div>`));
  }

  function renderZiwei(ziwei, unknownHour, gender, dayun, p){
    const panel = document.getElementById('panel-ziwei');
    if(unknownHour || !ziwei){
      panel.innerHTML = `<div class="error-box">紫微斗數的命宮、身宮與十四主星排列需要準確的出生時辰，目前為「時辰未知」模式，暫不提供此項排盤。若能補上出生時間，可獲得完整紫微命盤。</div>`;
      return;
    }
    const mingPalace = ziwei.palaces.find(pz=>pz.palaceName==='命宮');
    const mingStars = mingPalace ? mingPalace.stars : [];
    const mingStarText = mingStars.length
      ? mingStars.map(s=>STAR_MEAN[s]?`「${s}」星（${STAR_MEAN[s].trait}）`:`「${s}」星`).join('、')
      : '這一宮暫無主星坐守（命理上稱「命宮無主星」，此時通常需借對宮的星曜特質來綜合判斷，個性較不固定、可塑性也較高）';
    const shenPalace = ziwei.palaces.find(pz=>pz.zhi===ziwei.shenGongZhi);
    const shenStars = shenPalace ? shenPalace.stars : [];

    const isForward = dayun ? dayun.isForward : true;
    const daxianSteps = [];
    for(let i=0;i<12;i++){
      const stepIdx = ((ziwei.mingGongIdx + (isForward ? i : -i)) % 12 + 12) % 12;
      const pz = ziwei.palaces[stepIdx];
      const rangeStart = ziwei.ju + i*10;
      daxianSteps.push({ zhi:pz.zhi, palaceName:pz.palaceName, startAge:rangeStart, endAge:rangeStart+9 });
    }
    // v10.5修正（缺失④）：改用精確實歲（已判斷今年生日是否已過），取代「西曆年直接相減」的粗略算法，
    // 避免在生日還沒到的那段期間，把「目前大限」誤判成提前了一階。
    const nowAgeForDx = getPreciseAgeInfo(p).preciseAge;
    const curDaxian = daxianSteps.find(d=>nowAgeForDx>=d.startAge && nowAgeForDx<=d.endAge) || daxianSteps[0];

    let html = explainSimple(`
      <p>你的「命宮」在<b style="color:var(--gold-soft);">${ziwei.mingGongZhi}宮</b>——命宮就像人生的「主舞台」，代表你天生給人的第一印象和核心性格。命宮裡坐著${mingStarText}。</p>
      <p>你的「身宮」在<b style="color:var(--gold-soft);">${ziwei.shenGongZhi}宮</b>（落在「${shenPalace?shenPalace.palaceName:''}」宮位），代表你人生下半場比較看重、會花心力經營的領域${shenStars.length?`，這裡也坐著「${shenStars.join('、')}」星`:''}。</p>
      <p>你的命盤屬於「${ziwei.nayin}${ziwei.ju}局」（依命宮干支「${ziwei.mingGongGanZhi}」之納音判定），代表你從 <b style="color:var(--gold-soft);">${ziwei.ju}歲</b> 開始「起運」進入紫微的大限運勢，之後每10年換一個大限宮位，依「${isForward?'順時針（順排）':'逆時針（逆排）'}」方向推進，目前約落在「${curDaxian.palaceName}宮（${curDaxian.startAge}~${curDaxian.endAge}歲）」大限階段，可搭配下方大限時間軸與12宮星曜對照參考。</p>
      <p><b style="color:var(--gold-soft);">v9.8.5新增</b>：你的命宮同時走到「長生十二神」中的「<b style="color:var(--gold-soft);">${mingPalace?mingPalace.changsheng:'—'}</b>」——${Z.CHANGSHENG12_MEANING[mingPalace?mingPalace.changsheng:'']||''}。長生十二神（長生、沐浴、冠帶、臨官、帝旺、衰、病、死、墓、絕、胎、養）依你的五行局起始宮位，再依陽男陰女順行、陰男陽女逆行排列於12宮，用來輔助判斷各宮位「先天氣數」的強弱起伏，各宮位對應的長生星已標示於下方12宮星盤的宮位小字中。</p>
    `);

// ---- 事業／婚姻／桃花／感情 白話解讀（依真實命盤各宮位主星演算） ----
    const careerPalace = ziwei.palaces.find(pz=>pz.palaceName==='事業');
    const careerStars = careerPalace ? careerPalace.stars : [];
    const marriagePalace = ziwei.palaces.find(pz=>pz.palaceName==='夫妻');
    const marriageStars = marriagePalace ? marriagePalace.stars : [];
    const fudePalace = ziwei.palaces.find(pz=>pz.palaceName==='福德');
    const fudeStars = fudePalace ? fudePalace.stars : [];
    const PEACH_STARS = ['貪狼','廉貞','太陰','天同']; // 十四主星中與桃花／人緣關聯度較高者
    const peachHits = [];
    [{p:'命宮',s:mingStars},{p:'夫妻宮',s:marriageStars},{p:'福德宮',s:fudeStars}].forEach(({p:pname,s})=>{
      s.forEach(st=>{ if(PEACH_STARS.includes(st)) peachHits.push(`${pname}見「${st}」`); });
    });
    function starListText(stars, emptyText){
      return stars.length ? stars.map(s=>STAR_MEAN[s]?`「${s}」星（${STAR_MEAN[s].trait}）`:`「${s}」星`).join('、') : emptyText;
    }
    const wealthPalace = ziwei.palaces.find(pz=>pz.palaceName==='財帛');
    const wealthStars = wealthPalace ? wealthPalace.stars : [];
    const diseasePalace = ziwei.palaces.find(pz=>pz.palaceName==='疾厄');
    const diseaseStars = diseasePalace ? diseasePalace.stars : [];

    html += domainSection('事業／婚姻／桃花／感情／財運／健康 白話解讀', [
      { icon:'💼', title:'事業', tag:'事業宮',
        paras:[
          `你的「事業宮」是${starListText(careerStars, '暫無主星坐守，工作風格較不固定，建議一併參考命宮星曜與對宮（夫妻宮）的搭配特質')}。`,
          careerStars.length ? `這代表你在工作上，天生比較容易展現出這樣的特質與做事風格，也是尋找適合職涯方向時可以優先考慮的線索。` : ''
        ].filter(Boolean)},
      { icon:'💍', title:'婚姻', tag:'夫妻宮',
        paras:[
          `你的「夫妻宮」是${starListText(marriageStars, '暫無主星坐守，代表感情婚姻的樣貌較有彈性、不容易被單一特質定型，實際相處模式較受對方影響')}。`,
          marriageStars.length ? `夫妻宮代表的是「另一半的特質」與「你們相處的模式」，並不是在說你自己的個性，因此可以把它想成是「命盤幫你預告了另一半大概是什麼樣的人」。` : ''
        ].filter(Boolean)},
      { icon:'🌸', title:'桃花', tag:peachHits.length?'桃花星入命':'桃花較不顯著',
        paras: peachHits.length
          ? [`本站十四主星中，貪狼、廉貞、太陰、天同這幾顆星與人緣、桃花的關聯度較高，而你命盤中：${peachHits.join('；')}，代表你天生人緣不錯，容易吸引異性或朋友的注意。`]
          : [`本站十四主星中，貪狼、廉貞、太陰、天同這幾顆星與人緣、桃花的關聯度較高，但這幾顆星並未坐落在你的命宮、夫妻宮或福德宮，代表天生桃花星不算突出，人緣魅力比較需要靠後天社交場合與打扮經營累積。`],
        },
      { icon:'💗', title:'感情', tag:'命宮×夫妻宮',
        paras:[
          `把「命宮」（你自己談感情的方式：${mingStars.length?mingStars.join('、'):'無主星，較有彈性'}）和「夫妻宮」（你會吸引來的對象特質：${marriageStars.length?marriageStars.join('、'):'較不固定'}）放在一起看，就是紫微斗數判斷感情互動模式最直接的方法。`,
        ]},
      { icon:'💰', title:'財運', tag:'財帛宮',
        paras:[
          `你的「財帛宮」是${starListText(wealthStars, '暫無主星坐守，財運較不固定，建議搭配官祿宮與田宅宮綜合判斷')}。`,
          wealthStars.length ? '財帛宮代表你賺錢與用錢的方式，也是判斷理財風格的重要參考，建議依此星曜特質選擇適合自己的理財方式，而非跟風他人的投資策略。' : ''
        ].filter(Boolean)},
      { icon:'❤️‍🩹', title:'健康', tag:'疾厄宮',
        paras:[
          `你的「疾厄宮」是${starListText(diseaseStars, '暫無主星坐守，整體體質傾向較不固定，建議維持規律作息即可')}。`,
          diseaseStars.length ? '疾厄宮反映的是體質與身心狀態的傾向，並非精準醫療診斷，若有實際不適仍應以正規醫療院所的檢查為準。' : ''
        ].filter(Boolean)},
    ], '桃花判斷僅以本站已收錄之十四主星（貪狼、廉貞、太陰、天同）作簡化參考，未包含紅鸞、天喜、天姚、咸池等專門桃花／姻緣輔星，完整精確度仍建議搭配專業紫微命理師交叉確認；財運與健康解讀亦僅供生活化參考，重大理財與醫療決策請諮詢對應領域專業人士。');

    


    html += `<table class="data-table" style="margin-bottom:24px;">
      <tr><th>五行局</th><td class="hl">${ziwei.nayin}${ziwei.ju}局</td></tr>
      <tr><th>命宮</th><td class="hl">${ziwei.mingGongZhi}宮</td></tr>
      <tr><th>身宮</th><td class="hl">${ziwei.shenGongZhi}宮</td></tr>
      <tr><th>紫微星所在</th><td class="hl">${ziwei.ziweiZhi}宮</td></tr>
      <tr><th>天府星所在</th><td class="hl">${ziwei.tianfuZhi}宮</td></tr>
    </table>`;

    html += `<h3 style="font-family:var(--serif);color:var(--gold-soft);font-size:16px;margin:0 0 12px;">大限時間軸（${isForward?'順排':'逆排'}，起運 ${ziwei.ju} 歲）</h3>`;
    html += `<table class="data-table" style="margin-bottom:10px;"><tr><th>大限</th><th>年齡</th><th>宮位</th><th>宮位地支</th></tr>`;
    daxianSteps.forEach((d,i)=>{
      const isCur = d===curDaxian;
      html += `<tr${isCur?' style="background:rgba(51,68,122,0.12);"':''}><td>第${i+1}限${isCur?' <span class="dc-tag">目前</span>':''}</td><td>${d.startAge}~${d.endAge}歲</td><td class="hl">${d.palaceName}宮</td><td>${d.zhi}</td></tr>`;
    });
    html += `</table>`;
    html += `<p style="font-size:14px;color:var(--paper-dim);margin:0 0 22px;">大限（紫微斗數的十年運勢週期）依「陽男陰女順排、陰男陽女逆排」的傳統規則，從命宮起算，每10年推進一個宮位；起運歲數＝五行局數。此區塊與「流年運勢」頁籤的八字大運是兩套不同系統，可交叉參考、不必強求兩者完全一致。</p>`;
    html += `<h3 style="font-family:var(--serif);color:var(--gold-soft);font-size:16px;margin:0 0 12px;">命盤十二宮（傳統版位排列，含廟旺、四化、神煞）</h3>`;
    html += `<div class="ziwei-chart">`;
    const ZIWEI_GRID_POS = {'巳':[1,1],'午':[1,2],'未':[1,3],'申':[1,4],'酉':[2,4],'戌':[3,4],'亥':[4,4],'子':[4,3],'丑':[4,2],'寅':[4,1],'卯':[3,1],'辰':[2,1]};
    const HUA_CLASS = {'祿':'lu','權':'quan','科':'ke','忌':'ji'};
    ziwei.palaces.forEach(pz=>{
      const pos = ZIWEI_GRID_POS[pz.zhi];
      const isMing = pz.palaceName==='命宮';
      const isShen = pz.zhi===ziwei.shenGongZhi;
      const dx = daxianSteps.find(d=>d.zhi===pz.zhi);
      const starsHtml = pz.stars.length ? pz.stars.map((s,i)=>{
        const br = pz.starBrightness[i];
        const hua = pz.sihua.find(h=>h.star===s);
        return `<span class="zc-star">${s}${br?`<sup class="zc-br">${br}</sup>`:''}${hua?`<span class="zc-hua hua-${HUA_CLASS[hua.type]}">${hua.type}</span>`:''}</span>`;
      }).join('') : '<span style="opacity:.4">—</span>';
      // v5.6新增：六煞星（擎羊陀羅火星鈴星地空地劫）另列一行，以區別於十四主星＋六吉星
      const shaHtml = (pz.shaStars && pz.shaStars.length) ? pz.shaStars.map(s=>`<span class="zc-star zc-sha">${s}</span>`).join('') : '';
      html += `<div class="zc-palace ${isMing?'is-ming':''} ${isShen?'is-shen':''}" style="grid-row:${pos[0]};grid-column:${pos[1]};">
        <div class="zc-top-row"><span class="zc-zhi">${pz.zhi}宮</span>${dx?`<span class="zc-age">${dx.startAge}~${dx.endAge}歲</span>`:''}</div>
        <div class="zc-pname">${pz.palaceName}</div>
        <div class="zc-stars">${starsHtml}</div>
        ${shaHtml?`<div class="zc-stars zc-sha-row">${shaHtml}</div>`:''}
        <div class="zc-shensha">${pz.boshi}・${pz.jiangqian}・${pz.suiqian}・${pz.changsheng}</div>
        <div class="zc-badges">${isMing?'<span class="zc-badge ming">命宮</span>':''}${isShen?'<span class="zc-badge shen">身宮</span>':''}</div>
      </div>`;
    });
    html += `<div class="ziwei-center">
        <div class="zc-title">${ziwei.nayin}${ziwei.ju}局</div>
        <div class="zc-line">命宮：<b>${ziwei.mingGongZhi}宮</b>／身宮：<b>${ziwei.shenGongZhi}宮</b></div>
        <div class="zc-line">紫微：<b>${ziwei.ziweiZhi}宮</b>／天府：<b>${ziwei.tianfuZhi}宮</b></div>
        <div class="zc-line">目前大限：<b>${curDaxian.palaceName}宮（${curDaxian.startAge}~${curDaxian.endAge}歲）</b></div>
        <div class="zc-line">生年四化（${ziwei.yearGan}干）：${ziwei.sihuaStars.map((s,i)=>`<b>${s}</b>化${['祿','權','科','忌'][i]}`).join('、')}</div>
      </div>`;
    html += `</div>`;
    html += `<div class="zc-legend">
      <span><b>亮度</b>：廟＞旺＞得／利＞平＞不＞陷（由強至弱）</span>
      <span><span class="zc-hua hua-lu">祿</span>財祿機會　<span class="zc-hua hua-quan">權</span>掌控主導　<span class="zc-hua hua-ke">科</span>名聲文書　<span class="zc-hua hua-ji">忌</span>阻滯波折</span>
      <span>神煞欄「甲・乙・丙」＝博士十二神・將前十二神（含歲驛、亡神）・歲前十二神</span>
    </div>`;
    html += `<p style="font-size:14px;color:var(--paper-dim);margin:0 0 22px;">上方採紫微斗數傳統「十二宮固定版位」排列法：地支「巳午未申酉戌亥子丑寅卯辰」依順時針方向固定分佈於命盤四周，命宮、身宮與各宮位名稱則依你的實際出生資料排入對應地支欄位，與坊間專業命理老師使用的排盤格式一致。星曜右上角小字為「廟旺平陷」亮度（六吉六煞星傳統上不列入此廟旺系統，故不標示），色塊字母為「生年四化」（祿權科忌，依生年天干排定）。<b style="color:var(--gold-soft);">v5.6版更新：</b>六吉星（文昌、文曲、左輔、右弼、天魁、天鉞）與六煞星（擎羊、陀羅、火星、鈴星、地空、地劫）已依安星訣公式排入命盤，六吉星併入各宮主星列並參與四化比對，六煞星另列一行區隔顯示。每宮下方三個字則是「博士十二神・將前十二神（歲驛、亡神所屬）・歲前十二神」三組神煞，皆為命盤固定神煞，並非每年變動的流年神煞；長生十二神（長生沐浴冠帶等）因與大限走向高度重疊，暫未另外標示。</p>`;

    html += explainDetail(`
      <h5>十二宮各自代表什麼？</h5>
      <ul>${Z.PALACE_NAMES.map(pn=>{
        const pz = ziwei.palaces.find(x=>x.palaceName===pn);
        return `<li><b>${pn}宮</b>（${pz?pz.zhi+'宮':''}${pz&&pz.stars.length?'：'+pz.stars.join('、'):'：無主星'}）：${PALACE_MEANING[pn]}</li>`;
      }).join('')}</ul>
      <h5>命宮與身宮的星曜代表什麼個性？</h5>
      <p style="font-size:14px;color:var(--paper-dim);line-height:1.85;">${mingStars.length ? mingStars.map(s=>STAR_MEAN[s]?`<b>${s}星</b>：${STAR_MEAN[s].trait}`:s).join('；') : '命宮無主星，個性較不固定、可塑性高，建議一併參考對宮星曜與其他宮位的整體配置。'}</p>
      <h5>紫微斗數的排盤原理</h5>
      <p style="font-size:14px;color:var(--paper-dim);line-height:1.85;">紫微斗數是依出生年、月、日、時換算出的農曆生辰，先定出「五行局」決定起運速度，再依固定的排星法則，把紫微、天府等十四顆主星與其餘輔星依序安入十二宮，最後以「命宮」為核心，搭配其餘十一宮（兄弟、夫妻、子女、財帛、疾厄、遷移、交友、事業、田宅、福德、父母）交叉解讀一個人各方面的運勢傾向。此項排盤需要準確的出生時辰，因此若選擇「時辰未知」將無法提供此分析。</p>
    `);

    panel.innerHTML='';
    panel.appendChild(el(`<div>${html}</div>`));
  }

  function renderAstro(astro, ascendant, unknownHour){
    const panel = document.getElementById('panel-astro');
    const nameMap = {Sun:'太陽',Moon:'月亮',Mercury:'水星',Venus:'金星',Mars:'火星',Jupiter:'木星',Saturn:'土星',Uranus:'天王星',Neptune:'海王星'};

    let html = explainSimple(`
      <p>你的太陽星座是<b style="color:var(--gold-soft);">${astro.Sun?astro.Sun.sign:'（無資料）'}</b>——太陽代表你的核心自我，簡單說就是「你天生想成為什麼樣的人」：${astro.Sun?ZODIAC_TRAIT[astro.Sun.sign]:''}。</p>
      <p>你的月亮星座是<b style="color:var(--gold-soft);">${astro.Moon?astro.Moon.sign:'（無資料）'}</b>——月亮代表你的內在情緒與安全感需求，反映比較不容易被外人看到的一面：${astro.Moon?ZODIAC_TRAIT[astro.Moon.sign]:''}。</p>
      ${ascendant ? `<p>你的上升星座是<b style="color:var(--gold-soft);">${ascendant.sign}</b>——上升星座代表別人對你的第一印象、你外在表現出來的樣子：${ZODIAC_TRAIT[ascendant.sign]}。</p>` : `<p>上升星座需要準確的出生時間與地點才能精算，目前因「時辰未知」暫時無法提供，只能先看太陽與月亮星座。</p>`}
    `);

// ---- 事業／婚姻／桃花／感情 白話解讀（依真實太陽/金星/火星星座＋上升推算之第七宮演算） ----
    const venusSign = astro.Venus ? astro.Venus.sign : null;
    const marsSign = astro.Mars ? astro.Mars.sign : null;
    let seventhSign = null;
    let secondSign = null;
    let sixthSign = null;
    if(ascendant){
      const idx = AC.ZODIAC_SIGNS.indexOf(ascendant.sign);
      if(idx>=0){
        seventhSign = AC.ZODIAC_SIGNS[(idx+6)%12];
        secondSign = AC.ZODIAC_SIGNS[(idx+1)%12];
        sixthSign = AC.ZODIAC_SIGNS[(idx+5)%12];
      }
    }
    const jupiterSign = astro.Jupiter ? astro.Jupiter.sign : null;
    html += domainSection('事業／婚姻／桃花／感情／財運／健康 白話解讀', [
      { icon:'💼', title:'事業', tag:marsSign?'火星':'',
        paras: marsSign
          ? [`火星代表行動力與衝勁展現的方式，你的火星落在「${marsSign}」，帶有「${ZODIAC_TRAIT[marsSign]}」的傾向，這也是你在職場上爭取目標、面對挑戰時最自然流露出來的做事風格。`]
          : ['（無火星資料可供分析）']},
      { icon:'💍', title:'婚姻', tag:seventhSign?'第七宮（伴侶宮）':'',
        paras: seventhSign
          ? [`占星學中，第七宮代表「婚姻與正式伴侶關係」，用整宮制簡易推算，你的第七宮落在「${seventhSign}」——這通常反映你容易被什麼樣的伴侶特質吸引、或在婚姻關係中比較看重的相處模式：${ZODIAC_TRAIT[seventhSign]}。`]
          : ['第七宮需要準確的出生時間與地點才能計算，目前因「時辰未知」暫時無法提供，可先參考下方「金星」了解感情喜好傾向。']},
      { icon:'🌸', title:'桃花', tag:venusSign?'金星':'',
        paras: venusSign
          ? [`金星是占星學中最直接對應「桃花與吸引力」的行星，代表你會被什麼樣的人事物吸引、以及你展現魅力的方式。你的金星落在「${venusSign}」，帶有「${ZODIAC_TRAIT[venusSign]}」的傾向，這就是你天生的戀愛磁場與桃花風格。`]
          : ['（無金星資料可供分析）']},
      { icon:'💗', title:'感情', tag:'金星×月亮',
        paras:[
          venusSign && astro.Moon
            ? `把「金星」（你如何愛人、被什麼吸引：${ZODIAC_TRAIT[venusSign]}）和「月亮」（你內心真正渴望的安全感：${ZODIAC_TRAIT[astro.Moon.sign]}）放在一起看，就是西洋占星判斷感情需求最核心的兩個線索——金星看「怎麼吸引人」，月亮看「怎樣才會覺得被愛」。`
            : '需要金星與月亮兩項資料齊全才能綜合判斷，請確認出生資料完整。'
        ]},
      { icon:'💰', title:'財運', tag:secondSign?'第二宮（財帛宮）':'木星',
        paras:[
          secondSign
            ? `占星學中第二宮代表「金錢價值觀與物質資源」，用整宮制簡易推算，你的第二宮落在「${secondSign}」，反映你賺錢、用錢與看待財富的態度：${ZODIAC_TRAIT[secondSign]}。`
            : '第二宮需要準確的出生時間與地點才能計算，目前因「時辰未知」暫時無法提供，可先參考木星了解擴張與機會運勢傾向。',
          jupiterSign ? `木星代表擴張、幸運與機會，你的木星落在「${jupiterSign}」，帶有「${ZODIAC_TRAIT[jupiterSign]}」的傾向，這也是你比較容易獲得意外機會或貴人相助的領域方向。` : ''
        ].filter(Boolean)},
      { icon:'❤️‍🩹', title:'健康', tag:sixthSign?'第六宮（健康宮）':'',
        paras:[
          sixthSign
            ? `占星學中第六宮代表「日常健康與生活習慣」，用整宮制簡易推算，你的第六宮落在「${sixthSign}」，反映你在健康管理與生活作息上容易呈現的傾向：${ZODIAC_TRAIT[sixthSign]}。`
            : '第六宮需要準確的出生時間與地點才能計算，目前因「時辰未知」暫時無法提供。',
          '以上僅為占星學角度的生活化參考，並非醫學診斷，若有實際健康疑慮仍應諮詢專業醫師。'
        ]},
    ], '婚姻宮（第七宮）、財帛宮（第二宮）、健康宮（第六宮）皆採用「整宮制」簡易推算（上升星座所在宮位為第一宮，依序往後推算），實際精確宮位邊界（如Placidus等分宮制）仍建議搭配專業占星軟體核對；桃花與感情解讀以金星、月亮為主要依據，是占星學中最普遍採用的判斷方式。');

    


    html += `<div class="sign-cards">`;
    Object.entries(astro).forEach(([k,v])=>{
      html += `<div class="sign-card"><div class="planet">${nameMap[k]||k}${v.retrograde?' <span class="retro-badge" title="逆行">℞</span>':''}</div><div class="sign">${v.sign}</div><div class="degv">${v.deg.toFixed(1)}°</div></div>`;
    });
    if(ascendant){
      html += `<div class="sign-card" style="border-color:var(--gold);"><div class="planet">上升星座</div><div class="sign">${ascendant.sign}</div><div class="degv">${ascendant.deg.toFixed(1)}°</div></div>`;
    }
    html += `</div>`;
    // v5.6新增：主要相位（合／六合／刑／拱／沖）表格
    const aspectList = AC.computeAspects(astro);
    if(aspectList.length){
      const ASPECT_CLASS = {'合相':'asp-conj','六合':'asp-sext','刑相':'asp-square','拱相':'asp-trine','沖相':'asp-opp'};
      html += `<h3 style="font-family:var(--serif);color:var(--gold-soft);font-size:16px;margin:18px 0 10px;">主要相位</h3>`;
      html += `<div class="aspect-list">` + aspectList.map(a=>
        `<span class="aspect-chip ${ASPECT_CLASS[a.name]||''}">${nameMap[a.a]||a.a} ${a.symbol} ${nameMap[a.b]||a.b}<small>（${a.name}，誤差${a.orb}°）</small></span>`
      ).join('') + `</div>`;
      html += `<p style="font-size:14px;color:var(--paper-dim);margin:8px 0 0;">相位代表兩顆行星黃經角度之間的特定關係，容許度（實際角度與整數相位角的誤差）採6度以內。合相(0°)代表能量疊加、六合(60°)與拱相(120°)通常視為和諧、刑相(90°)與沖相(180°)則代表張力與挑戰，實際解讀仍需綜合行星本身意涵與宮位判斷。</p>`;
    }
    html += `<p style="font-size:14px;color:var(--paper-dim);margin:8px 0 0;">行星名稱旁的「℞」符號代表該行星目前為「逆行」狀態（黃經數值暫時反向移動，占星學上常解讀為該行星所主管領域容易出現延遲、重新檢視或內省的傾向）；太陽與月亮永遠不會逆行。</p>`;
    if(!ascendant){
      html += `<div class="error-box">上升星座需要準確出生時間與地點才能計算，目前為「時辰未知」模式，暫不提供。</div>`;
    }
    html += `<p style="font-size:14px;color:var(--paper-dim);">行星黃經採簡化克卜勒軌道根數模型計算，精度約1度以內，適合判斷星座位置；宮位系統與精確逐分秒黃經仍建議搭配專業占星軟體交叉確認。v5.6版起已納入天王星、海王星與主要相位、逆行判斷；冥王星因軌道特性（高離心率、高傾角）在此簡化模型下誤差會明顯放大，為避免提供不可靠位置，暫不收錄。</p>`;
    if(ascendant && (ascendant.deg<=2 || ascendant.deg>=28)){
      html += `<div class="error-box" style="border-color:var(--gold-soft);color:var(--gold-soft);">⚠️ 你的上升星座度數為 ${ascendant.deg.toFixed(1)}°，非常接近與鄰近星座的交界處。由於本站行星／宮位採簡化模型計算（精度約1度），加上出生時間若有1~2分鐘的誤差，都可能讓實際上升星座落入前一個或後一個星座，連帶影響下方「第二宮（財運）」「第六宮（健康）」「第七宮（婚姻）」的判斷。建議確認出生時間是否精確到分鐘，並可搭配專業占星軟體（採用精確天文曆與正式分宮制）交叉核對後再參考下方解讀。</div>`;
    }

    html += explainDetail(`
      <h5>每顆行星分別代表你的哪個部分？</h5>
      <ul>${Object.entries(astro).map(([k,v])=>`<li><b>${nameMap[k]||k}在${v.sign}</b>：${PLANET_MEANING[k]||''}。以你的情況來說，帶有「${ZODIAC_TRAIT[v.sign]}」的特質。</li>`).join('')}</ul>
      <h5>什麼是上升星座？</h5>
      <p style="font-size:14px;color:var(--paper-dim);line-height:1.85;">上升星座是出生當下、東方地平線升起的星座，需要精確的出生時間與地點才能計算。它代表你給別人的「第一印象」與外在表現方式，和太陽星座（核心自我）、月亮星座（內在情緒）合稱「個人三大星座」，三者合看能更完整地描繪一個人的性格全貌。</p>
      <h5>黃經度數是什麼？</h5>
      <p style="font-size:14px;color:var(--paper-dim);line-height:1.85;">每個星座在黃道上佔30度，度數（如「${astro.Sun?astro.Sun.deg.toFixed(1):'--'}°」）代表這顆星星在該星座區間中的精確位置——度數越接近0°或30°，代表越靠近與鄰近星座的交界處（俗稱「星座邊緣」），此時個性可能會同時帶有兩個星座的特質。本站行星位置採簡化克卜勒軌道根數模型計算，精度約在1度以內，足以準確判斷星座歸屬。</p>
    `);

    panel.innerHTML='';
    panel.appendChild(el(`<div>${html}</div>`));
  }

  // ---------- 易經卦象：梅花易數「年月日時」起卦法（依真實農曆年月日與時辰真實演算，非隨機） ----------
  // 先天八卦數：乾1 兌2 離3 震4 巽5 坎6 艮7 坤8；lines為由初爻(下)到上爻(上)的陰陽排列，1=陽 0=陰
  const BAGUA = {
    1:{name:'乾',symbol:'☰',nature:'天',wuxing:'金',family:'父',keyword:'剛健',lines:[1,1,1],trait:'剛健有力、積極進取、重視領導與掌控權，做事講求效率與魄力。'},
    2:{name:'兌',symbol:'☱',nature:'澤',wuxing:'金',family:'少女',keyword:'喜悅',lines:[1,1,0],trait:'開朗喜悅、善於言語表達，重視人際和諧，容易吸引他人靠近。'},
    3:{name:'離',symbol:'☲',nature:'火',wuxing:'火',family:'中女',keyword:'光明',lines:[1,0,1],trait:'聰慧敏銳、光明外顯，重視名譽形象，喜歡站在人前展現自己。'},
    4:{name:'震',symbol:'☳',nature:'雷',wuxing:'木',family:'長男',keyword:'震動',lines:[1,0,0],trait:'行動積極、爆發力強，容易帶動局勢、勇於開創，但情緒起伏也較明顯。'},
    5:{name:'巽',symbol:'☴',nature:'風',wuxing:'木',family:'長女',keyword:'柔入',lines:[0,1,1],trait:'柔順善變、善於溝通協調，做事講求彈性細膩，但有時也顯得優柔寡斷。'},
    6:{name:'坎',symbol:'☵',nature:'水',wuxing:'水',family:'中男',keyword:'險陷',lines:[0,1,0],trait:'深沉聰慧、善於應變，但也容易遇到波折險阻，凡事宜沉著、謀定後動。'},
    7:{name:'艮',symbol:'☶',nature:'山',wuxing:'土',family:'少男',keyword:'篤實',lines:[0,0,1],trait:'穩重踏實、懂得節制與停頓，重視原則、不輕易妥協，行事較為保守謹慎。'},
    8:{name:'坤',symbol:'☷',nature:'地',wuxing:'土',family:'母',keyword:'柔順',lines:[0,0,0],trait:'包容承載、溫和厚德，善於配合支持他人，重視安全感與踏實累積。'},
  };
  // 六十四卦對照表：GUA64[上卦數][下卦數] = 卦名（文王六十四卦標準組合）
  const GUA64 = {
    1:{1:'乾為天',2:'天澤履',3:'天火同人',4:'天雷無妄',5:'天風姤',6:'天水訟',7:'天山遯',8:'天地否'},
    2:{1:'澤天夬',2:'兌為澤',3:'澤火革',4:'澤雷隨',5:'澤風大過',6:'澤水困',7:'澤山咸',8:'澤地萃'},
    3:{1:'火天大有',2:'火澤睽',3:'離為火',4:'火雷噬嗑',5:'火風鼎',6:'火水未濟',7:'火山旅',8:'火地晉'},
    4:{1:'雷天大壯',2:'雷澤歸妹',3:'雷火豐',4:'震為雷',5:'雷風恆',6:'雷水解',7:'雷山小過',8:'雷地豫'},
    5:{1:'風天小畜',2:'風澤中孚',3:'風火家人',4:'風雷益',5:'巽為風',6:'風水渙',7:'風山漸',8:'風地觀'},
    6:{1:'水天需',2:'水澤節',3:'水火既濟',4:'水雷屯',5:'水風井',6:'坎為水',7:'水山蹇',8:'水地比'},
    7:{1:'山天大畜',2:'山澤損',3:'山火賁',4:'山雷頤',5:'山風蠱',6:'山水蒙',7:'艮為山',8:'山地剝'},
    8:{1:'地天泰',2:'地澤臨',3:'地火明夷',4:'地雷復',5:'地風升',6:'地水師',7:'地山謙',8:'坤為地'},
  };
  const YAO_POS_NAME = ['初','二','三','四','五','上'];
  const YAO_POS_MEANING = [
    '初爻代表事情的起點與根基，通常反映最初的動機或還不成熟的階段，宜先站穩腳步、不宜躁進。',
    '二爻多與居家、內部事務相關，象徵貼近核心但仍在私領域的處境，宜以柔和、務實的態度處理。',
    '三爻處在下卦與上卦交界，最容易出現波折與人際上的進退拉扯，行事宜多加謹慎、避免躁動。',
    '四爻接近上位、近君之地，象徵事情開始牽涉到更高層級或核心決策，變動性較大，宜審慎評估。',
    '五爻為全卦最尊之位，象徵居於主導、掌握關鍵資源的位置，是六爻中最重要、最具影響力的一爻。',
    '上爻是事情的終點，象徵盛極而衰、功成身退的階段，宜懂得適時收手、不宜貪求更多。',
  ];
  function findBaguaNumByLines(lines3){
    for(let i=1;i<=8;i++){ if(BAGUA[i].lines.join('')===lines3.join('')) return i; }
    return null;
  }
  function hexLinesOf(upperNum, lowerNum){ return BAGUA[lowerNum].lines.concat(BAGUA[upperNum].lines); }

  function computeYijing(ctx){
    const {p, bazi, lunar} = ctx;
    const yearZhiNum = B.ZHI.indexOf(bazi.pillars.year.zhi) + 1; // 子1...亥12
    const monthNum = lunar.monthNumber;
    const dayNum = lunar.dayIndex;
    const hourZhiIdx = p.unknownHour ? 6 : hourToZhiIdx(p.hh + p.mm/60); // 時辰未知則以午時(近中午)概算
    const hourNum = hourZhiIdx + 1;

    const sum1 = yearZhiNum + monthNum + dayNum;
    let upperNum = sum1 % 8; if(upperNum===0) upperNum = 8;
    const sum2 = sum1 + hourNum;
    let lowerNum = sum2 % 8; if(lowerNum===0) lowerNum = 8;
    let moveLine = sum2 % 6; if(moveLine===0) moveLine = 6;

    const benLines = hexLinesOf(upperNum, lowerNum);
    const benName = GUA64[upperNum][lowerNum];

    const bianLines = benLines.slice();
    const moveIdx = moveLine - 1;
    bianLines[moveIdx] = bianLines[moveIdx]===1 ? 0 : 1;
    const bianLowerNum = findBaguaNumByLines(bianLines.slice(0,3));
    const bianUpperNum = findBaguaNumByLines(bianLines.slice(3,6));
    const bianName = GUA64[bianUpperNum][bianLowerNum];

    return {
      yearZhiNum, monthNum, dayNum, hourNum, sum1, sum2,
      upperNum, lowerNum, upper:BAGUA[upperNum], lower:BAGUA[lowerNum],
      benLines, benName, moveLine, moveIdx,
      bianLines, bianUpperNum, bianLowerNum, bianUpper:BAGUA[bianUpperNum], bianLower:BAGUA[bianLowerNum], bianName,
    };
  }

  function hexLinesHtml(lines, moveIdx){
    let html = `<div class="hex-lines">`;
    for(let i=5;i>=0;i--){
      const yang = lines[i]===1;
      const moving = i===moveIdx;
      html += `<div class="hex-line-row"><div class="hex-line-label">${YAO_POS_NAME[i]}</div>
        <div class="hex-line ${yang?'':'yin'} ${moving?'moving':''}">${yang?'<div class="seg"></div>':'<div class="seg"></div><div class="seg"></div>'}</div></div>`;
    }
    html += `</div>`;
    if(moveIdx!==null && moveIdx!==undefined && moveIdx>=0){
      html += `<div class="hex-line-note">● 紅色為動爻（第${moveIdx+1}爻／${YAO_POS_NAME[moveIdx]}爻）</div>`;
    }
    return html;
  }

  const WX_GENERATE_Y = {'木':'火','火':'土','土':'金','金':'水','水':'木'};
  const WX_OVERCOME_Y = {'木':'土','火':'金','土':'水','金':'木','水':'火'};
  function wxRelationYijing(a,b){
    if(a===b) return {type:'比和',text:`「${a}」與「${a}」同屬性，彼此步調一致、能互相理解`};
    if(WX_GENERATE_Y[a]===b) return {type:'相生',text:`「${a}」生「${b}」，關係順暢，容易互相成就`};
    if(WX_GENERATE_Y[b]===a) return {type:'相生',text:`「${b}」生「${a}」，關係順暢，容易互相成就`};
    if(WX_OVERCOME_Y[a]===b) return {type:'相剋',text:`「${a}」剋「${b}」，彼此存在一定張力，需要多一點磨合`};
    if(WX_OVERCOME_Y[b]===a) return {type:'相剋',text:`「${b}」剋「${a}」，彼此存在一定張力，需要多一點磨合`};
    return {type:'普通',text:'五行關係普通'};
  }

  // ================= v9.8.23新增：塔羅牌占卜（完整版78張牌） =================
  // 設計理念：與「易經卦象」同屬🔮命盤系統分類下「不需出生資料的占卜工具」，但採用與易經卦象（依生日
  // 數字換算、決定性演算）不同的架構——塔羅採「真隨機抽牌」（每次點擊都重新洗牌），更貼近傳統占卜
  // 「應事而起」的精神。78張牌（22張大阿爾克那＋56張小阿爾克那）採萊德偉特體系（Rider-Waite-Smith）
  // 傳統牌義為基礎，大阿爾克那22張為逐一撰寫的完整牌義；小阿爾克那56張則採「花色主題×數字/宮廷主題」
  // 組合生成，此為塔羅教學上常見的解讀方法之一，並於下方「演算方法說明」誠實揭露此組合式生成邏輯，
  // 而非佯稱78張皆為逐一獨立撰寫的一手資料。
  const TAROT_MAJOR = [
    { id:0,  name:'愚者',     en:'The Fool',          keyword:'新開始、冒險、天真',
      upright:'代表全新的開始、沒有包袱的冒險精神，願意跳脫舒適圈嘗試未知的可能性，是充滿潛力卻也帶點天真莽撞的階段。',
      reversed:'提醒你可能過於衝動、缺乏規劃就貿然行動，或是因為害怕而遲遲不敢跨出第一步，宜多一分準備再出發。' },
    { id:1,  name:'魔術師',   en:'The Magician',      keyword:'創造、行動力、資源整合',
      upright:'代表你已具備完成目標所需的工具與能力，是主動出擊、化想法為行動的好時機，善用現有資源即可創造成果。',
      reversed:'暗示能力或資源尚未整合到位，可能流於空談、缺乏執行力，或需留意是否有投機取巧、名不副實的狀況。' },
    { id:2,  name:'女祭司',   en:'The High Priestess', keyword:'直覺、潛意識、內在智慧',
      upright:'代表傾聽內在直覺的重要性，許多答案尚未浮上檯面，宜靜心觀察、耐心等待，不急於外顯行動。',
      reversed:'暗示忽略了自己的直覺、被表象迷惑，或是內心話說不出口、真實想法被壓抑，宜找回與自己內在的連結。' },
    { id:3,  name:'皇后',     en:'The Empress',       keyword:'豐盛、滋養、創造力',
      upright:'代表豐盛、滋養與孕育的能量，無論是感情、事業或創作都處於開花結果、充滿生命力的階段。',
      reversed:'提醒可能過度付出而忽略自身需求、創造力受阻，或生活中出現失衡、匱乏感的狀況，宜適度回頭照顧自己。' },
    { id:4,  name:'皇帝',     en:'The Emperor',       keyword:'權威、秩序、掌控',
      upright:'代表建立秩序、展現領導力與掌控力的階段，適合訂定明確的規則與目標，以理性和紀律推動事情前進。',
      reversed:'暗示可能過度強勢、固執己見而缺乏彈性，或是原本該有的掌控力正在鬆動，權威受到挑戰。' },
    { id:5,  name:'教皇',     en:'The Hierophant',    keyword:'傳統、學習、體制',
      upright:'代表傳統智慧、正規教育或既有體制帶來的指引，適合尋求師長、專業人士的建議，按部就班依循既有規範。',
      reversed:'暗示對傳統框架感到束縛、想要打破常規走出自己的路，或是對既定體制、權威人物產生質疑。' },
    { id:6,  name:'戀人',     en:'The Lovers',        keyword:'關係、選擇、價值契合',
      upright:'代表深刻的情感連結與重要的人生選擇，關係中價值觀契合、彼此吸引，也可能面臨需要抉擇的十字路口。',
      reversed:'暗示關係中出現失衡、溝通不良或價值觀落差，也可能代表在重要選擇上猶豫不決、關係面臨考驗。' },
    { id:7,  name:'戰車',     en:'The Chariot',       keyword:'意志力、突破、勝利',
      upright:'代表憑藉堅定的意志力克服阻礙、勇往直前，即使外在環境充滿挑戰，也能憑決心與行動力邁向勝利。',
      reversed:'暗示方向感混亂、內外拉扯導致停滯不前，或是因為缺乏自制力而讓局面失控，宜重新聚焦目標。' },
    { id:8,  name:'力量',     en:'Strength',          keyword:'內在力量、柔韌、耐心',
      upright:'代表用溫柔而堅定的方式面對挑戰，真正的力量來自內在的耐心與自我掌控，而非蠻力或壓制。',
      reversed:'暗示信心不足、被恐懼或情緒壓垮，或是用強硬蠻幹的方式處理問題反而適得其反，宜找回內在的穩定。' },
    { id:9,  name:'隱者',     en:'The Hermit',        keyword:'內省、獨處、尋求真理',
      upright:'代表需要暫時抽離人群、向內探尋答案的階段，獨處與沉澱能帶來重要的領悟與智慧。',
      reversed:'暗示過度孤立、與外界失去連結，或是逃避該面對的問題，宜留意不要讓獨處變成自我封閉。' },
    { id:10, name:'命運之輪', en:'Wheel of Fortune',  keyword:'轉折、機運、循環',
      upright:'代表命運出現轉折點，順應時勢的變化往往能帶來意想不到的機會，是充滿變數也充滿希望的階段。',
      reversed:'暗示運勢正走下坡、計畫受到外力干擾，或感覺一切都不在自己掌控之中，宜耐心等待下一輪轉機。' },
    { id:11, name:'正義',     en:'Justice',           keyword:'公平、因果、決斷',
      upright:'代表以理性、公正的態度做出決斷，過去的努力或選擇將得到相對應的結果，講求平衡與責任。',
      reversed:'暗示可能面臨不公平的對待、決策有失偏頗，或是逃避該承擔的責任與因果，宜重新檢視事情的全貌。' },
    { id:12, name:'吊人',     en:'The Hanged Man',    keyword:'暫停、換位思考、犧牲',
      upright:'代表主動暫停腳步、換一個角度看待處境，看似停滯不前，實則是沉澱與重新理解問題的必要階段。',
      reversed:'暗示陷入原地打轉、抗拒改變視角，或是不必要的犧牲與拖延，宜評估是否該真正放下、往前邁進。' },
    { id:13, name:'死神',     en:'Death',             keyword:'結束、轉化、重生',
      upright:'代表一個階段徹底結束、舊有模式必須放下，雖然帶來失落，但也為全新的開始騰出空間，是轉化的必經之路。',
      reversed:'暗示抗拒改變、緊抓著已經不合時宜的人事物不放，導致該結束的階段遲遲無法真正落幕。' },
    { id:14, name:'節制',     en:'Temperance',        keyword:'調和、耐心、中庸',
      upright:'代表以耐心與智慧調和對立的兩端，透過循序漸進的方式找到平衡點，避免極端與躁進。',
      reversed:'暗示生活或情緒失衡、缺乏耐心而躁進行事，或是該調和的關係與資源出現失調，宜放慢腳步重新校準。' },
    { id:15, name:'惡魔',     en:'The Devil',         keyword:'束縛、慾望、依附',
      upright:'代表被物質慾望、恐懼或不健康的依附關係所束縛，看似身不由己，實則是自己選擇留在原地。',
      reversed:'代表開始意識到束縛的存在、萌生掙脫的念頭，是擺脫舊有依附模式、重獲自由的轉機。' },
    { id:16, name:'高塔',     en:'The Tower',         keyword:'劇變、崩塌、覺醒',
      upright:'代表突如其來的劇變震動了原本看似穩固的基礎，過程雖然震撼，卻也揭露了長期被忽視的問題核心。',
      reversed:'暗示劇變的威力有所緩解，或是持續逃避、壓抑該面對的危機，使問題以更緩慢卻更磨人的方式延續。' },
    { id:17, name:'星星',     en:'The Star',          keyword:'希望、療癒、信念',
      upright:'代表歷經風雨後重新燃起希望，是療癒、恢復信心與看見未來願景的階段，宜保持信念、順勢而為。',
      reversed:'暗示對未來感到失望、信心動搖，或是希望感暫時黯淡，宜給自己多一點時間重新找回信念。' },
    { id:18, name:'月亮',     en:'The Moon',          keyword:'迷惘、潛意識、不確定',
      upright:'代表處於資訊不明朗、真相尚未浮現的階段，容易受情緒、幻想或恐懼影響判斷，宜謹慎求證、避免妄下定論。',
      reversed:'暗示迷霧逐漸散去、真相開始浮現，或是持續被莫名的焦慮與恐懼困擾，需要更多釐清與安全感。' },
    { id:19, name:'太陽',     en:'The Sun',           keyword:'成功、喜悅、活力',
      upright:'代表充滿活力、喜悅與正面能量的階段，事情朝向順利明朗的方向發展，是值得慶賀與展現自我的時刻。',
      reversed:'暗示原本該有的喜悅打了折扣、成果不如預期，或是過度樂觀而忽略了潛在的問題，宜務實看待現況。' },
    { id:20, name:'審判',     en:'Judgement',         keyword:'覺醒、反省、重新評估',
      upright:'代表經歷一番自我反省後迎來覺醒的時刻，過去的經驗與選擇被重新檢視，帶來釋懷與新的方向感。',
      reversed:'暗示對過去的自己過度苛責、陷入悔恨難以釋懷，或是逃避該面對的自我覺察與重新評估。' },
    { id:21, name:'世界',     en:'The World',         keyword:'圓滿、完成、整合',
      upright:'代表一個重要階段圓滿落幕，過程中的努力與學習都已整合到位，是值得肯定成果、慶祝完成的時刻。',
      reversed:'暗示事情尚未真正完成、還差臨門一腳，或是因為害怕結束而遲遲不肯讓這個階段真正劃下句點。' },
  ];
  // 小阿爾克那56張：權杖(火/行動事業)、聖杯(水/情感關係)、寶劍(風/思想決策)、錢幣(土/物質財務)四種花色，
  // 各14張（首牌至十＋侍者/騎士/皇后/國王四張宮廷牌）。牌義採「花色主題×數字/宮廷主題」組合生成，
  // 為塔羅教學上常見的解讀邏輯，已於下方演算方法說明中誠實揭露此組合式生成方式。
  const TAROT_SUITS = [
    { key:'wands',     name:'權杖', element:'火', theme:'行動、企圖心、事業拓展與創造力' },
    { key:'cups',      name:'聖杯', element:'水', theme:'情感、關係、直覺與內心世界' },
    { key:'swords',    name:'寶劍', element:'風', theme:'思想、溝通、衝突與決策' },
    { key:'pentacles', name:'錢幣', element:'土', theme:'物質、財務、健康與實際成果' },
  ];
  const TAROT_RANKS = [
    { key:'ace',   name:'首牌', num:1,  upTheme:'全新的開始與潛力，能量剛剛萌芽、充滿可能性',        rvTheme:'起步受阻、時機尚未成熟，或錯失了開始的最佳時刻' },
    { key:'2',     name:'二',   num:2,  upTheme:'面臨選擇與平衡，需要在兩者之間權衡取捨',            rvTheme:'選擇陷入猶豫不決，或雙方失衡、關係緊張' },
    { key:'3',     name:'三',   num:3,  upTheme:'初步成長與合作，成果開始顯現、值得期待',            rvTheme:'合作出現摩擦，或成長的腳步遭遇延遲與挫折' },
    { key:'4',     name:'四',   num:4,  upTheme:'穩定與暫時休整，是打好基礎、稍作喘息的階段',        rvTheme:'停滯過久導致失去動力，或穩定表象下暗藏不安' },
    { key:'5',     name:'五',   num:5,  upTheme:'面臨衝突與變動的考驗，競爭與壓力隨之而來',          rvTheme:'衝突逐漸平息，或持續內耗、遲遲無法化解紛爭' },
    { key:'6',     name:'六',   num:6,  upTheme:'和諧與給予，關係或局勢往修復、平衡的方向前進',      rvTheme:'付出與收穫失衡，或該有的和解遲遲未能發生' },
    { key:'7',     name:'七',   num:7,  upTheme:'省思與評估，適合停下腳步重新檢視策略與方向',        rvTheme:'過度猶豫不決、想法太多卻遲遲無法行動' },
    { key:'8',     name:'八',   num:8,  upTheme:'全力投入與精熟展現，行動力與效率都處於高點',        rvTheme:'行動受到阻礙，或用力過猛導致失衡、耗竭' },
    { key:'9',     name:'九',   num:9,  upTheme:'接近完成的階段，但也可能伴隨疲憊感或孤獨感',        rvTheme:'因過度焦慮或不安全感而阻礙了即將到來的成果' },
    { key:'10',    name:'十',   num:10, upTheme:'該階段走向圓滿或極致，事情告一段落、有始有終',      rvTheme:'該結束的遲遲未結束，或圓滿的表象下留有遺憾' },
    { key:'page',  name:'侍者', num:11, upTheme:'學習與消息，帶著初學者般的好奇心探索新領域',        rvTheme:'消息不實、準備不足，或缺乏耐心而學習半途而廢' },
    { key:'knight', name:'騎士', num:12, upTheme:'積極行動與追求目標，帶有衝勁十足的行動派特質',      rvTheme:'行動魯莽衝動，或方向錯誤、白費力氣空轉' },
    { key:'queen', name:'皇后', num:13, upTheme:'成熟內化該領域的力量，展現滋養、包容與直覺智慧',    rvTheme:'過度壓抑自身需求，或該有的包容變成了縱容' },
    { key:'king',  name:'國王', num:14, upTheme:'掌控與精通，在該領域展現權威與穩健的決策能力',      rvTheme:'濫用權威、獨斷專行，或該有的掌控力正在流失' },
  ];
  function buildMinorArcana(){
    const cards = [];
    let idCounter = 22; // 大阿爾克那已佔用0~21
    TAROT_SUITS.forEach(suit=>{
      TAROT_RANKS.forEach(rank=>{
        cards.push({
          id: idCounter++,
          name: `${suit.name}${rank.name}`,
          en: `${rank.num<=10?rank.num:rank.key} of ${suit.key}`,
          keyword: `${suit.element}元素・${rank.name}`,
          suit: suit.key, suitName: suit.name, rankKey: rank.key,
          upright: `在${suit.theme}方面，${rank.upTheme}。`,
          reversed: `在${suit.theme}方面，${rank.rvTheme}。`,
        });
      });
    });
    return cards;
  }
  const TAROT_DECK = [...TAROT_MAJOR, ...buildMinorArcana()];

  // ---------- 牌陣定義 ----------
  const TAROT_SPREADS = {
    single: { label:'單張日籤', count:1, positions:[
      { label:'今日指引', hint:'代表當下最需要留意的訊息或方向' },
    ]},
    three: { label:'三張牌陣（過去・現在・未來）', count:3, positions:[
      { label:'過去', hint:'影響現況的背景因素或已發生的事' },
      { label:'現在', hint:'目前所處的狀態與核心課題' },
      { label:'未來', hint:'依現況發展下去，較可能出現的走向' },
    ]},
    celtic: { label:'凱爾特十字（進階牌陣）', count:10, positions:[
      { label:'1・現況',       hint:'目前所處的核心狀態' },
      { label:'2・挑戰',       hint:'當下面臨的阻礙或交叉影響的力量' },
      { label:'3・根基／遠因', hint:'這件事背後更深層、較早的成因' },
      { label:'4・近因／過去', hint:'剛過去、對現況有直接影響的事件' },
      { label:'5・可能結果',   hint:'若順著目前方向發展，較理想的可能性' },
      { label:'6・近期未來',   hint:'即將發生、接下來會遇到的狀況' },
      { label:'7・自身狀態',   hint:'你目前的內在心態與立場' },
      { label:'8・外在環境',   hint:'他人看法或外在環境帶來的影響' },
      { label:'9・希望或恐懼', hint:'你內心真正的期待，或隱藏的擔憂' },
      { label:'10・最終結果',  hint:'綜合以上各項，事情較可能的最終走向' },
    ]},
  };
  // ---------- 真隨機抽牌（Fisher-Yates洗牌），每次呼叫皆重新隨機排列，並獨立隨機判定正逆位 ----------
  function tarotShuffleDeck(){
    const deck = TAROT_DECK.map(c=>c);
    for(let i=deck.length-1; i>0; i--){
      const j = Math.floor(Math.random()*(i+1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }
  function tarotDraw(spreadKey){
    const spread = TAROT_SPREADS[spreadKey];
    if(!spread) return null;
    const shuffled = tarotShuffleDeck();
    const drawn = shuffled.slice(0, spread.count).map((card, i)=>({
      position: spread.positions[i],
      card,
      reversed: Math.random() < 0.5,
    }));
    return { spreadKey, spreadLabel: spread.label, drawn };
  }

  const TAROT_TOPIC_INTRO = {
    general: '綜合運勢',
    love:    '感情關係',
    career:  '事業工作',
    money:   '財務金錢',
  };
  function renderTarotTab(ctx){
    const panel = document.getElementById('panel-tarot');
    if(!panel) return;
    panel.innerHTML = '';
    panel.appendChild(el(`<div>
      <div class="compat-intro">塔羅牌與「易經卦象」同屬不需出生資料的占卜工具，但採用不同的運作方式——這裡是<b>每次點擊都重新隨機洗牌</b>，而非依生日數字換算的固定結果，更貼近傳統占卜「應事而起」的精神。完整收錄78張牌（22張大阿爾克那＋56張小阿爾克那），支援單張日籤、三張牌陣（過去現在未來）、凱爾特十字（進階10張牌陣）三種牌陣，並會隨機判定正逆位。</div>
      <div class="card" id="tarotFormCard">
        <div class="form-grid">
          <div class="field"><label for="tarotSpread">選擇牌陣</label>
            <select id="tarotSpread">
              <option value="single">單張日籤（1張）</option>
              <option value="three">三張牌陣：過去・現在・未來（3張）</option>
              <option value="celtic">凱爾特十字：進階牌陣（10張）</option>
            </select>
          </div>
          <div class="field"><label for="tarotTopic">想聚焦的主題（選填）</label>
            <select id="tarotTopic">
              <option value="general">綜合運勢</option>
              <option value="love">感情關係</option>
              <option value="career">事業工作</option>
              <option value="money">財務金錢</option>
            </select>
          </div>
        </div>
        <button type="button" class="btn-primary" id="tarotDrawBtn" style="margin-top:10px;">🔀 洗牌並抽牌</button>
      </div>
      <div id="tarotResult"></div>
    </div>`));

    document.getElementById('tarotDrawBtn').addEventListener('click', ()=>{
      const resultBox = document.getElementById('tarotResult');
      const spreadKey = document.getElementById('tarotSpread').value;
      const topicKey = document.getElementById('tarotTopic').value;
      const result = tarotDraw(spreadKey);
      if(!result){
        resultBox.innerHTML = `<div class="error-box" style="margin-top:14px;">牌陣選擇有誤，請重新選擇後再試一次。</div>`;
        return;
      }
      let html = `<div class="card" style="margin-top:14px;">
        <h3 style="margin:0 0 10px;font-family:var(--serif);color:var(--gold-soft);">🃏 ${result.spreadLabel}・聚焦主題：${TAROT_TOPIC_INTRO[topicKey]}</h3>
        <p style="font-size:14px;color:var(--paper-dim);">本次抽牌時間：${new Date().toLocaleString('zh-TW')}（每次點擊「洗牌並抽牌」都會重新隨機排列78張牌，結果不會重複套用固定模板）</p>
      </div>`;

      result.drawn.forEach(d=>{
        const meaning = d.reversed ? d.card.reversed : d.card.upright;
        html += `<div class="card" style="margin-top:12px;">
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px;">
            <h4 style="margin:0;color:var(--gold-soft);">${d.position.label}</h4>
            <div>${tagChip(d.card.name)}${tagChip(d.reversed?'逆位':'正位')}</div>
          </div>
          <p style="font-size:14px;color:var(--paper-dim);margin:0 0 8px;">牌陣位置意義：${d.position.hint}</p>
          <p style="font-size:14px;color:var(--paper);line-height:1.85;margin:0;"><b style="color:var(--jade-soft);">${d.card.keyword}</b>——${meaning}</p>
        </div>`;
      });

      html += explainDetail(`
        <h5>抽牌是真的隨機，還是固定套版？</h5>
        <p style="font-size:14px;color:var(--paper-dim);line-height:1.85;">每次按下「洗牌並抽牌」，系統都會用 Fisher-Yates 洗牌演算法將78張牌重新隨機排列，並各自獨立判定正逆位（各約50%機率），不是套用固定模板或依你的生日數字換算——這點與同分類下「易經卦象」（依生日數字決定性換算）的運作方式不同，兩者互為對照，各有適合的使用情境。</p>
        <h5>78張牌的牌義是怎麼來的？</h5>
        <p style="font-size:14px;color:var(--paper-dim);line-height:1.85;">22張大阿爾克那（愚者到世界）為逐一撰寫的完整牌義，採萊德偉特體系（Rider-Waite-Smith）的傳統詮釋為基礎；56張小阿爾克那（權杖、聖杯、寶劍、錢幣四種花色，各14張）則採「花色主題×數字/宮廷牌主題」組合生成——例如「權杖三」＝「權杖（行動、事業）」主題套用「三（初步成長合作）」主題組合而成，這是塔羅教學上常見的解讀邏輯之一，並非每張都各自獨立撰寫的一手資料，特此誠實說明，避免造成78張牌深度完全一致的錯誤印象。</p>
        <h5>凱爾特十字牌陣的10個位置代表什麼？</h5>
        <p style="font-size:14px;color:var(--paper-dim);line-height:1.85;">依序為：現況、挑戰、根基／遠因、近因／過去、可能結果、近期未來、自身狀態、外在環境、希望或恐懼、最終結果，是塔羅占卜中最經典的進階牌陣之一，適合完整梳理一件事情的來龍去脈。</p>
        <h5>塔羅牌準嗎？</h5>
        <p style="font-size:14px;color:var(--paper-dim);line-height:1.85;">塔羅牌的「隨機抽牌」本身是真實、可驗證的隨機過程，但牌義解讀屬於傳統占卜詮釋體系，並無科學實證基礎能證明牌卡與現實事件之間存在因果關係，本站將塔羅牌歸類為「🔮傳統詮釋」等級（與易經卦象同級），僅供自我探索與思考的參考工具，不宜作為醫療、法律、財務等重大決策的依據。</p>
      `);

      resultBox.innerHTML = '';
      resultBox.appendChild(el(`<div>${html}</div>`));
      resultBox.scrollIntoView({behavior:'smooth', block:'start'});
    });
  }

  function renderYijing(ctx){
    const panel = document.getElementById('panel-yijing');
    const yj = computeYijing(ctx);
    const {upper, lower, bianUpper, bianLower} = yj;
    const rel = wxRelationYijing(upper.wuxing, lower.wuxing);
    const dayGanWxForYj = GAN_WX[ctx.bazi.pillars.day.gan];

    let html = '';
    if(ctx.p.unknownHour){
      html += `<div class="error-box" style="border-color:var(--gold-soft);color:var(--gold-soft);margin-bottom:16px;">⚠️ 你的出生時辰為「未知」，但易經「年月日時起卦法」需要時辰才能起卦。系統暫以「午時」（接近中午）代入計算本卦、動爻與變卦，這並非你真正的出生時辰，因此下方卦象僅供大方向參考。若能確認實際出生時辰後重新測算，結果會更貼近真實命卦。</div>`;
    }
    html += explainSimple(`
      <p>依你出生的農曆年、月、日與時辰，用傳統「梅花易數．年月日時起卦法」真實換算，得出本卦為 <b style="color:var(--gold-soft);">${yj.benName}</b>——上卦「${upper.name}」（${upper.nature}，${upper.keyword}），下卦「${lower.name}」（${lower.nature}，${lower.keyword}）。</p>
      <p>上卦代表你目前對外顯現、比較容易被看見的狀態；下卦代表你內心真正的想法與現況根基。兩者五行關係為「${rel.type}」：${rel.text}。</p>
      <p>第 <b style="color:var(--gold-soft);">${yj.moveLine}</b> 爻（${YAO_POS_NAME[yj.moveIdx]}爻）為「動爻」，是這一卦目前變化最劇烈、最需要留意的位置；${YAO_POS_MEANING[yj.moveIdx]}</p>
      <p>動爻變化之後，本卦會轉變為「變卦」<b style="color:var(--gold-soft);">${yj.bianName}</b>，代表事情持續發展下去，可能演變的方向。</p>
    `);

// ---- 事業／婚姻／桃花／感情 白話解讀（依上下卦真實象徵與動爻位置演算） ----
    const PEACH_TRIGRAMS = ['兌','離'];
    const isPeach = PEACH_TRIGRAMS.includes(upper.name) || PEACH_TRIGRAMS.includes(lower.name);
    const peachWhich = [];
    if(PEACH_TRIGRAMS.includes(upper.name)) peachWhich.push(`上卦「${upper.name}」`);
    if(PEACH_TRIGRAMS.includes(lower.name)) peachWhich.push(`下卦「${lower.name}」`);

    const wealthTrigram = wxRelationYijing(dayGanWxForYj, upper.wuxing);
    html += domainSection('事業／婚姻／桃花／感情／財運／健康 白話解讀', [
      { icon:'💼', title:'事業', tag:upper.keyword,
        paras:[
          `上卦「${upper.name}」代表你目前在外、在事業上呈現出的樣貌：${upper.trait}`,
          `第${yj.moveLine}爻為動爻，${YAO_POS_MEANING[yj.moveIdx]}反映到事業上，代表這正是你目前工作上變化最大、最該留心處理的環節。`
        ]},
      { icon:'💍', title:'婚姻', tag:rel.type,
        paras:[
          `下卦「${lower.name}」代表你內心真正的狀態與根基：${lower.trait}上卦「${upper.name}」則代表你在感情關係中對外呈現、或容易吸引到的對象特質。`,
          `兩卦五行「${rel.type}」——${rel.text}，這是本卦用來判斷你與伴侶（或婚姻關係）互動狀態的重要線索。`
        ]},
      { icon:'🌸', title:'桃花', tag:isPeach?'見悅麗之卦':'桃花較不顯著',
        paras: isPeach
          ? [`易經中「兌」為喜悅、「離」為光明外顯，兩者皆與人緣、魅力關聯度較高，而你的本卦${peachWhich.join('、')}恰好出現，代表這段時間你的人際魅力、異性緣會比較容易被人注意到。`]
          : [`易經中「兌」（喜悅）、「離」（光明外顯）與人緣桃花關聯度較高，但這兩卦並未出現在你本卦的上下卦之中，代表目前這段時間桃花星不算突出，人緣魅力比較需要靠後天主動經營累積。`]
        },
      { icon:'💗', title:'感情', tag:'上卦×下卦',
        paras:[
          `把「上卦」（你對外展現、想要的關係樣貌：${upper.trait}）與「下卦」（你內心真實的感受與需求：${lower.trait}）放在一起看，就是易經判斷感情狀態最直接的方式——上卦看「表現」，下卦看「真心」。`,
          `本卦轉為變卦「${yj.bianName}」，也提醒你這段感情關係目前正處於變動之中，宜多觀察、順勢而為，不宜強求。`
        ]},
      { icon:'💰', title:'財運', tag:wealthTrigram.type,
        paras:[
          `以出生日主五行「${dayGanWxForYj}」對照上卦「${upper.name}」（${upper.wuxing}行）的關係為「${wealthTrigram.type}」——${wealthTrigram.text}，可作為近期財運順逆的簡易參考：相生、比和較為順遂，相剋則提醒理財決策要更謹慎。`,
          `第${yj.moveLine}爻動爻所在位置也提醒，這段時間財務上最需要留意變化的環節，宜提前規劃、避免臨時倉促決定。`
        ]},
      { icon:'❤️‍🩹', title:'健康', tag:lower.wuxing,
        paras:[
          `下卦「${lower.name}」（${lower.wuxing}行）代表內在根基與身心狀態，中醫五行養生觀念中「${lower.wuxing}」對應「${ORGAN_MAP[lower.wuxing]||''}」，是這段時間身心較需要留意保養的部位（僅為命理養生參考，非醫學診斷）。`,
          `若動爻恰好落在下卦（第一至第三爻），代表近期身心狀態變化較明顯，建議多留意休息與情緒調節；若有實際不適仍應以正規醫療院所診斷為準。`
        ]},
    ], '易經卦象採「梅花易數．年月日時起卦法」，以出生年月日時代替傳統臨場起卦時的外緣訊息，是此法的簡化應用；正統梅花易數起卦講求「應事而起」，即依當下發生的具體事件、時間起卦最為精準，此處僅供命理面向的一般參考，不宜視為對特定單一事件的精準占卜。');

    


    html += `<div class="hex-pair">
      <div class="hex-box">
        <div class="hex-tag">本卦 · 目前狀態</div>
        <div class="hex-name">${yj.benName}</div>
        <div class="hex-sub">上${upper.name}(${upper.symbol}) · 下${lower.name}(${lower.symbol})</div>
        ${hexLinesHtml(yj.benLines, yj.moveIdx)}
      </div>
      <div class="hex-box is-bian">
        <div class="hex-tag">變卦 · 未來趨勢</div>
        <div class="hex-name">${yj.bianName}</div>
        <div class="hex-sub">上${bianUpper.name}(${bianUpper.symbol}) · 下${bianLower.name}(${bianLower.symbol})</div>
        ${hexLinesHtml(yj.bianLines, null)}
      </div>
    </div>`;

    html += explainDetail(`
      <h5>八卦分別代表什麼？</h5>
      <div class="bagua-grid">
        ${Object.values(BAGUA).map(b=>`<div class="bagua-card"><div class="bg-sym">${b.symbol}</div><div class="bg-name">${b.name}為${b.nature}</div><div class="bg-sub">${b.wuxing}行 · ${b.family} · ${b.keyword}</div></div>`).join('')}
      </div>
      <h5>本卦是怎麼起出來的？</h5>
      <p style="font-size:14px;color:var(--paper-dim);line-height:1.85;">採用「梅花易數．年月日時起卦法」：以出生年支數（子1、丑2…亥12，即${yj.yearZhiNum}）、農曆月數（${yj.monthNum}）、農曆日數（${yj.dayNum}）三者相加得數字${yj.sum1}，除以8取餘數決定「上卦」（餘數為0則以8計）；再將此數字加上時辰數（子1…亥12，即${yj.hourNum}）得${yj.sum2}，除以8取餘數決定「下卦」，並將同一個數字除以6取餘數決定「動爻」位置（餘數為0則以6計）。上卦代表外在環境或未來趨向，下卦代表自身內在與當下根基，動爻則是這一卦變化的關鍵所在。</p>
      <h5>六爻的爻位分別代表什麼？</h5>
      <ul>${YAO_POS_NAME.map((nm,i)=>`<li><b>${nm}爻</b>：${YAO_POS_MEANING[i]}</li>`).join('')}</ul>
      <h5>本卦與變卦的差別？</h5>
      <p style="font-size:14px;color:var(--paper-dim);line-height:1.85;">「本卦」反映的是目前當下的狀態與格局；當動爻的陰陽產生變化（陽變陰、陰變陽）之後，整卦會轉變成另一個卦，稱為「變卦」，代表順著目前趨勢發展下去，未來事情可能演變的方向。本卦看「現況」，變卦看「趨勢」，兩者合看才是完整的易經卦象解讀方式。</p>
    `);

    panel.innerHTML='';
    panel.appendChild(el(`<div>${html}</div>`));
  }

  // ---------- v7.8新增，v9.7升級：姓名改運建議——依用神引擎（扶抑＋調候綜合判斷）演算候選用字，
  //             並新增雙字名支援。所有候選字五格皆直接呼叫N.analyzeName()驗證（與姓名學頁籤同一套公式），
  //             不另外重複實作五格計算公式，避免手動重算與主引擎產生落差。 ----------
  // v9.7新增：康熙筆畫字典收錄約27,500字，涵蓋大量CJK擴充區（如Extension-A，Unicode U+3400~U+4DBF）
  // 的罕見異體字、甲骨文考證用字，這些字雖有正確筆畫數據，但多數輸入法打不出來、也不適合真人命名，
  // 若不過濾，會讓姓名建議結果被這類生僻字佔滿。此處僅保留最常用的「CJK統一表意文字基本區」
  // （U+4E00~U+9FFF，涵蓋絕大多數台灣戶政姓名學實務會用到的正體字），過濾邏輯與筆畫、五行、81數理計算完全無關，
  // 純粹是候選字池的「可用性」篩選，不影響任何命理演算法本身。
  // v9.7：改採「常用命名用字白名單」而非對27,500字康熙字典做數值篩選（Unicode範圍、筆畫數等）——
  // 實測發現即使排除CJK擴充區罕見異體字、簡體字、1~3畫結構字，數值篩選仍無法排除大量雖屬常見
  // 「CJK統一表意文字基本區」、筆畫數正常，但實務上罕用於真人命名的字（如生僻文言字、古地名用字等），
  // 因為「適合命名與否」本質上是語感、字義層次的判斷，無法單純用Unicode區塊或筆畫數區間篩出。
  // 故改為直接提供一份約200字的常用命名字白名單（涵蓋男女姓名常見用字，橫跨五行各類），
  // 候選字僅從此白名單中依「筆畫五行是否符合用神」「搭配後五格數理是否為吉」篩選排序，
  // 確保每個推薦結果都是實務上真的會用在姓名裡的字；筆畫、五行、81數理計算仍100%呼叫
  // N.strokeOf()／N.analyzeName()等與「姓名學」頁籤共用的同一套公式，僅候選字來源改變。
  const NAMING_WHITELIST = [
    '安','宇','宸','恩','悅','惠','愛','慈','慧','昀','昕','昊','昇','明','昌','晴','晨','晗','智','曜','曦',
    '欣','欽','歆','洋','洛','浩','海','涵','淇','淳','清','淵','添','渝','湘','溪','漢','澄','澤','瀚',
    '燁','熙','熹','琛','琪','琳','琦','瑄','瑋','瑞','瑤','瑩','璇','璟','珊','珮','珣','琇','珩',
    '皓','益','盛','睿','磊','祐','祈','禎','祺','秉','立','竣','筠','紘','綺','緯','翊','翔','翎','翰',
    '育','舒','芊','芃','芷','若','苓','茉','茜','荃','莉','莞','萱','葳','蓁','蓉','蕎','蕙','蕾','薇',
    '虹','蓮','詠','詩','語','誠','謙','豪','貝','賢','軒','逸','逢','邦','郁','鈞','鋒','霖','霆',
    '青','靖','靜','馨','鴻','麒','麗','黎','丞','世','中','丹','之','允','元','兆','光',
    '兒','冠','初','劭','勁','勵','勳','千','卉','卓','原','君','品','嘉','喬','妍','妤','姍','姝','娜',
    '婕','婉','孜','孝','宏','宗','宜','家','容','寧','實','寬','尉','尚','屏','岑','峻','崇','崑','嵐',
    '巍','希','平','幸','庭','弘','彥','彤','彬','彩','彰','德','心','志','怡','恆','恬','悌','惟','惠',
    '慎','慧','憲','懿','成','承','政','敏','文','斐','新','旭','昆','昱','晉','景','智','曉','有','杰',
    '柏','柔','柳','桂','梅','棟','榆','榮','樺','樂','橙','正','歐','武','毅','水','永','汝','沁','沐',
    '波','泓','泰','洪','浚','涓','涵','淨','清','淩','然','煦','熒','燦','爾','牧','玄','玲','珍','珠',
    '珂','琅','瓔','甫','生','用','田','甲','申','益','真','知','石','碩','秀','程','穎','章','竹','紹',
    '維','緹','翌','翠','聰','聖','肇','育','致','舜','良','艾','芝','芙','花','英','茵','華','菁','萌',
    '葉','蒂','蓓','蘭','衡','衿','裕','言','訓','詞','謹','谷','貞','貴','費','資','辰','迪','远','连',
    '道','達','邁','邵','郡','鄉','鈺','鈴','銘','錫','鎮','長','閎','阜','陞','雁','雅','雍','雨','雪',
    '雲','霄','霈','露','靈','韜','頌','項','順','頤','顥','顯','風','飛','餘','馥','驛','骥','高','鴻',
    '鵬','麟','麥','黛','齊','昶','旻','晞','晏','曦','沅','潔','煒','煌','珉','琨','瑾','璋','稜','箴',
  ];
  function buildNamingCandidatePool(){
    const seen = new Set();
    const pool = [];
    NAMING_WHITELIST.forEach(ch=>{
      if(seen.has(ch)) return;
      const strokes = N.strokeOf(ch);
      if(strokes===null) return;
      seen.add(ch);
      pool.push({ ch, strokes });
    });
    return pool;
  }
  const NUM_TO_WX_LOCAL = n => {
    const m = n % 10;
    if (m === 1 || m === 2) return '木';
    if (m === 3 || m === 4) return '火';
    if (m === 5 || m === 6) return '土';
    if (m === 7 || m === 8) return '金';
    return '水';
  };
  function diversifyByStroke(list, cap, capPerStroke, strokeKey){
    const seenCount = {}; const out = [];
    for(const c of list){
      const k = strokeKey(c);
      seenCount[k] = (seenCount[k]||0)+1;
      if(seenCount[k] > capPerStroke) continue;
      out.push(c);
      if(out.length>=cap) break;
    }
    return out;
  }
  function buildNameSuggestions(surname, targetWxList, givenLen){
    givenLen = givenLen===2 ? 2 : 1;
    const surnameChars = surname.split('');
    const lastSurnameChar = surnameChars[surnameChars.length - 1];
    const lastStrokes = N.strokeOf(lastSurnameChar);
    if(lastStrokes === null){ return { error: true, targetWxList }; }

    // 第一字（緊鄰姓氏，主要決定「人格」數理）：從完整康熙字典篩選出筆畫換算五行屬於目標用神、
    // 且搭配姓氏後人格數理為「吉」的候選字，依筆畫數排序後取樣，確保後續組合的運算量可控。
    const firstRaw = [];
    buildNamingCandidatePool().forEach(({ch, strokes}) => {
      if(surnameChars.includes(ch)) return;
      if(!targetWxList.includes(NUM_TO_WX_LOCAL(strokes))) return;
      const renge = lastStrokes + strokes;
      const rengeFortune = N.NUMEROLOGY_81[((renge - 1) % 81) + 1] || '';
      if(!rengeFortune.startsWith('吉')) return;
      firstRaw.push({ ch, strokes });
    });
    firstRaw.sort((a,b)=>a.strokes-b.strokes);

    if(givenLen===1){
      const firstPool = diversifyByStroke(firstRaw, 40, 3, c=>c.strokes);
      const candidates = [];
      firstPool.forEach(c=>{
        const r = N.analyzeName(surname, c.ch);
        if(r.error) return;
        const renge = r.details.find(d=>d.name==='人格');
        const zongge = r.details.find(d=>d.name==='總格');
        candidates.push({ given:c.ch, strokes:c.strokes, renge, zongge, jiCount:r.details.filter(d=>d.fortune.startsWith('吉')).length });
      });
      candidates.sort((a,b)=>{
        const aBoth = a.zongge && a.zongge.fortune.startsWith('吉') ? 0 : 1;
        const bBoth = b.zongge && b.zongge.fortune.startsWith('吉') ? 0 : 1;
        if(aBoth!==bBoth) return aBoth-bBoth;
        return b.jiCount - a.jiCount;
      });
      return { error:false, targetWxList, givenLen:1, candidates: diversifyByStroke(candidates, 14, 3, c=>c.strokes) };
    }

    // 雙字名：第一字取前25個候選（依筆畫多樣化取樣），第二字從全字典（筆畫1~20常用範圍）取樣60個，
    // 兩兩配對後統一呼叫N.analyzeName()驗證完整五格，僅保留人格、地格、總格皆為「吉」的組合，
    // 最終依「吉格數」排序取前14筆——此為控制瀏覽器運算量（25×60=1500次五格運算）下的合理取樣規模。
    const firstPool = diversifyByStroke(firstRaw, 25, 4, c=>c.strokes);
    const secondRaw = buildNamingCandidatePool().filter(c=>!surnameChars.includes(c.ch));
    secondRaw.sort((a,b)=>a.strokes-b.strokes);
    const secondPool = diversifyByStroke(secondRaw, 60, 6, c=>c.strokes);

    const pairResults = [];
    const seenGiven = new Set();
    firstPool.forEach(c1=>{
      secondPool.forEach(c2=>{
        if(c1.ch===c2.ch) return;
        const given = c1.ch + c2.ch;
        if(seenGiven.has(given)) return;
        const r = N.analyzeName(surname, given);
        if(r.error) return;
        const jiCount = r.details.filter(d=>d.fortune.startsWith('吉')).length;
        const renge = r.details.find(d=>d.name==='人格');
        const dige = r.details.find(d=>d.name==='地格');
        const zongge = r.details.find(d=>d.name==='總格');
        if(!(renge.fortune.startsWith('吉') && dige.fortune.startsWith('吉') && (!zongge || zongge.fortune.startsWith('吉')))) return;
        seenGiven.add(given);
        pairResults.push({ given, strokes:[c1.strokes,c2.strokes], renge, dige, zongge, jiCount, sancai:r.sancai });
      });
    });
    pairResults.sort((a,b)=> b.jiCount - a.jiCount || (a.strokes[0]+a.strokes[1]) - (b.strokes[0]+b.strokes[1]));
    return { error:false, targetWxList, givenLen:2, candidates: pairResults.slice(0,14) };
  }
  function renderNameSuggestions(surname, wuxing, bazi){
    const lastStrokes = N.strokeOf(surname[surname.length-1]);
    if(lastStrokes === null){
      return `<div class="explain-box" style="margin-top:24px;"><h4>🌿 姓名改運建議</h4><p style="font-size:14px;color:var(--paper-dim);">姓氏「${escapeHtml(surname)}」中的字未收錄於本站康熙筆畫字典，暫無法即時演算改運候選用字，建議查閱正式康熙字典核對筆畫後另行分析。</p></div>`;
    }
    // v9.7升級：改用「用神引擎」（扶抑旺衰＋調候綜合判斷，與「八字命盤」頁籤新增的用神分析同一套邏輯）
    // 取代先前單純「命盤最弱五行」的判斷依據；若無法取得完整八字（理論上不會發生，此處僅作防呆），退回舊版邏輯。
    const ys = bazi ? computeYongshenEngine(bazi) : null;
    const targetWxList = ys ? ys.fuyiYongShen : [wuxingDominant(wuxing).weakest[0]];
    const targetLabel = targetWxList.join('、');
    let html = `<div class="explain-box" style="margin-top:24px;" id="nameSugBox">
      <h4>🌿 姓名改運建議（v9.7升級：依用神引擎即時演算）</h4>
      <p style="font-size:14px;color:var(--paper-dim);line-height:1.85;">${ys ? `依「八字命盤」頁籤的用神分析（扶抑旺衰「${ys.strengthLabel}」${ys.tiaohou.need?`＋調候喜「${ys.tiaohou.need}」`:''}），你命盤建議的用神方向為「<b style="color:var(--gold-soft);">${targetLabel}</b>」` : `你的命盤中五行「<b style="color:var(--gold-soft);">${targetLabel}</b>」力量相對最弱`}，姓名學上可透過「名」的用字五行來輔助補強。以下候選字／候選組合皆從約200字的常用命名白名單中依筆畫五行與五格吉數即時篩選排序，並直接呼叫與「姓名學」頁籤相同的五格公式驗證計算（<b>v9.7調整</b>：先前版本直接篩選完整27,500字康熙字典，容易選出罕見異體字或不適合真人命名的生僻字，現改為僅從常用命名字白名單中挑選，確保每個建議都是實務上可用的字）。</p>
      <div class="radio-row" style="margin-bottom:12px;">
        <label class="radio-pill active" data-len="1"><input type="radio" name="nameSugLen" value="1" checked style="display:none;">單字名</label>
        <label class="radio-pill" data-len="2"><input type="radio" name="nameSugLen" value="2" style="display:none;">雙字名</label>
      </div>
      <div id="nameSugResult"></div>
      <p style="font-size:14px;color:var(--paper-dim);margin-top:10px;">姓名學對整體運勢的影響力有限，仍建議以八字命盤與紫微斗數為主要依據，正式改名請諮詢專業命理師並留意戶政登記相關規定。</p>
    </div>`;
    return html;
  }
  function renderNameSuggestionResult(container, surname, targetWxList, givenLen){
    const sug = buildNameSuggestions(surname, targetWxList, givenLen);
    if(sug.candidates.length === 0){
      container.innerHTML = `<p style="font-size:14px;color:var(--paper-dim);">目前字典中暫未篩選到同時符合用神五行「${targetWxList.join('、')}」與五格吉數的${givenLen===1?'候選字':'候選組合'}，建議請專業命理師依更完整字庫另行命名。</p>`;
      return;
    }
    let html;
    if(givenLen===1){
      html = `<table class="data-table"><tr><th>候選字</th><th>筆畫</th><th>五行</th><th>人格數理</th><th>總格數理</th></tr>`;
      sug.candidates.forEach(c=>{
        html += `<tr><td class="hl">${escapeHtml(surname)}<b style="color:var(--gold-soft);">${c.given}</b></td><td>${c.strokes}</td><td>${NUM_TO_WX_LOCAL(c.strokes)}</td><td>${c.renge.num}・${c.renge.fortune}</td><td>${c.zongge?`${c.zongge.num}・${c.zongge.fortune}`:'（姓氏含未收錄字，暫無法計算）'}</td></tr>`;
      });
      html += `</table>`;
    }else{
      html = `<table class="data-table"><tr><th>候選組合</th><th>筆畫</th><th>人格</th><th>地格</th><th>總格</th><th>三才</th></tr>`;
      sug.candidates.forEach(c=>{
        html += `<tr><td class="hl">${escapeHtml(surname)}<b style="color:var(--gold-soft);">${c.given}</b></td><td>${c.strokes.join('+')}</td><td>${c.renge.num}・${c.renge.fortune}</td><td>${c.dige.num}・${c.dige.fortune}</td><td>${c.zongge?`${c.zongge.num}・${c.zongge.fortune}`:'—'}</td><td>${c.sancai}</td></tr>`;
      });
      html += `</table>`;
    }
    container.innerHTML = html;
  }

  function renderName(name, surname, givenName, wuxing, bazi){
    const panel = document.getElementById('panel-name');
    if(name.error){
      if(name.unsupportedLength){
        panel.innerHTML = `<div class="error-box">「${escapeHtml(surname)}${escapeHtml(givenName)}」的姓名字數組合（姓${surname.length}字＋名${givenName.length}字）超出本站姓名學模組目前支援的範圍。傳統五格剖象法的「地格」「外格」公式，只有在下列4種組合下才有姓名學界公認一致的標準寫法：<br>①單姓(1字)＋單名(1字)　②單姓(1字)＋雙名(2字)　③複姓(2字)＋單名(1字)　④複姓(2字)＋雙名(2字)，也就是姓名總字數需在2~4字之間、且「名」最多2個字。若名字達3字以上，不同姓名學流派對地格／外格的算法並不一致，為避免用單一流派的簡化公式冒充「標準答案」誤導你，此組合暫不計算，建議諮詢專業命理老師以其慣用流派公式分析。</div>`;
        return;
      }
      panel.innerHTML = `<div class="error-box">姓名中的「${name.missingChars.join('、')}」目前未收錄於本站康熙筆畫字典（目前收錄約27,500字常見姓氏與姓名用字），為避免提供錯誤數據，此項暫不計算。建議查閱正式康熙字典核對筆畫後另行分析。</div>`;
      return;
    }
    const renge = name.details.find(d=>d.name==='人格');
    const zongge = name.details.find(d=>d.name==='總格');
    const goodCount = name.details.filter(d=>d.fortune.startsWith('吉')).length;

    let html = explainSimple(`
      <p>「${surname}${givenName}」這個名字，五格中屬於「吉」的有<b style="color:var(--gold-soft);">${goodCount}／5</b>格。</p>
      <p>其中最重要的「人格」（代表你的性格特質與整體命運核心）數理是 <b style="color:var(--gold-soft);">${renge?renge.num:''}</b>，屬「${renge?renge.fortune:''}」；「總格」（代表36歲以後的整體際遇）數理是 <b style="color:var(--gold-soft);">${zongge?zongge.num:''}</b>，屬「${zongge?zongge.fortune:''}」。</p>
      <p>三才配置「${name.sancai}」是天格、人格、地格三者五行組合而成的排列，用來看這三個階段的五行是否能互相搭配順暢；姓名學的分析僅供命名或改名時的參考之一，實際運勢仍以八字命盤為主要依據。</p>
    `);

// ---- 事業／婚姻／桃花／感情 白話解讀（依真實五格數理與三才五行生剋演算） ----
    const waige = name.details.find(d=>d.name==='外格');
    const dige = name.details.find(d=>d.name==='地格');
    const WX_GENERATE_N = {'木':'火','火':'土','土':'金','金':'水','水':'木'};
    const WX_OVERCOME_N = {'木':'土','火':'金','土':'水','金':'木','水':'火'};
    function relationText(a,b){
      if(a===b) return '比和（同屬性，個性一致）';
      if(WX_GENERATE_N[a]===b) return `相生（${a}生${b}，順暢）`;
      if(WX_GENERATE_N[b]===a) return `相生（${b}生${a}，順暢）`;
      if(WX_OVERCOME_N[a]===b) return `相剋（${a}剋${b}，稍有阻力）`;
      if(WX_OVERCOME_N[b]===a) return `相剋（${b}剋${a}，稍有阻力）`;
      return '普通';
    }
    const sancaiChars = name.sancai.split('');
    const rel1 = sancaiChars.length>=2 ? relationText(sancaiChars[0], sancaiChars[1]) : '';
    const rel2 = sancaiChars.length>=3 ? relationText(sancaiChars[1], sancaiChars[2]) : '';
    const harmonyGood = (rel1.includes('相生')||rel1.includes('比和')) && (rel2.includes('相生')||rel2.includes('比和'));

    const tiange = name.details.find(d=>d.name==='天格');
    html += domainSection('事業／婚姻／桃花／感情／財運／健康 白話解讀', [
      { icon:'💼', title:'事業', tag:renge?renge.fortune:'',
        paras:[
          `「人格」數理${renge?renge.num:''}屬「${renge?renge.wuxing:''}」、「${renge?renge.fortune:''}」，這是姓名學中判斷個人事業發展主要依據的一格，五行「${renge?renge.wuxing:''}」的人在工作風格上${WX_PLAIN_METAPHOR[renge?renge.wuxing:'']||''}`,
          `「總格」數理${zongge?zongge.num:''}（${zongge?zongge.fortune:''}）則代表36歲以後中晚年的事業際遇走向，可作為長期發展的參考。`
        ]},
      { icon:'💍', title:'婚姻／家庭', tag:harmonyGood?'三才配置順':'三才略有阻力',
        paras:[
          `三才配置「${name.sancai}」中，天格與人格${rel1}，人格與地格${rel2}，整體而言配置${harmonyGood?'偏向順暢，代表姓名給人的協調感較佳，也間接有利於家庭關係的和諧經營':'有相剋的情況，這不代表命中注定不好，只是提醒在人際與家庭互動上可能需要多一點耐心溝通'}。`,
          `「地格」數理${dige?dige.num:''}（${dige?dige.fortune:''}）也與早年的家庭基礎、成長環境的和諧度有關。`
        ]},
      { icon:'🌸', title:'桃花／人緣', tag:waige?waige.fortune:'',
        paras:[
          `「外格」代表你在外的人際關係與社交形象，數理${waige?waige.num:''}屬「${waige?waige.fortune:''}」，${waige&&waige.fortune.startsWith('吉')?'代表對外的人緣、社交魅力較容易獲得他人好感，社交場合中容易被注意到':'代表對外社交需要更主動一些，人緣魅力比較需要靠實際相處後才會被看見，初次見面的印象可以再多加經營'}。`
        ]},
      { icon:'💗', title:'感情', tag:'人格×外格',
        paras:[
          `姓名學對「感情」的解讀相對間接，主要是把「人格」（內在性格）與「外格」（對外表現）合看：人格${renge?renge.wuxing:''}屬性影響你談感情時比較自然的相處方式，外格則影響你吸引對象、展現魅力的社交表現。`
        ]},
      { icon:'💰', title:'財運', tag:zongge?zongge.fortune:'',
        paras:[
          `「總格」數理${zongge?zongge.num:''}（${zongge?zongge.fortune:''}）除了代表中晚年事業際遇，也常被用來輔助判斷一生財富格局的厚薄；「天格」數理${tiange?tiange.num:''}（${tiange?tiange.fortune:''}）則與祖蔭、早年資源、財庫根基相關。`,
          `${zongge&&zongge.fortune.startsWith('吉')?'總格數理屬吉，代表姓名對財富格局有加分作用，但實際財運仍以八字命盤的財星力量為主要依據，姓名學僅是輔助參考。':'總格數理不算特別突出，不代表財運差，姓名學在財運上的解釋力本就有限，建議以「綜合運勢報告」中的財運分析為主要參考。'}`
        ]},
      { icon:'❤️‍🩹', title:'健康', tag:renge?renge.fortune:'',
        paras:[
          `姓名學中，「人格」數理若帶有較多凶數（如與疾病、意外相關的凶數），傳統上會提醒多留意健康；你的人格數理${renge?renge.num:''}屬「${renge?renge.fortune:''}」，${renge&&renge.fortune.startsWith('吉')?'整體而言不帶明顯健康凶意，維持正常作息即可。':'建議搭配「綜合運勢報告」中依五行養生給出的健康分析一併參考，並維持規律作息與定期健康檢查。'}`
        ]},
    ], '相較於八字與紫微斗數，姓名學對婚姻、桃花、感情、財運、健康等領域的對應本來就較為間接、非其強項，主要仍以「人格」判斷整體性格為核心，以上解讀僅供命名或改名時的輔助參考，實際運勢建議以八字命盤與紫微斗數為主要依據。');

    


    html += `<div class="grid-5g">`;
    name.details.forEach(g=>{
      const good = g.fortune.startsWith('吉');
      html += `<div class="g5-card"><div class="gname">${g.name}</div><div class="gnum">${g.num}</div><div class="gfortune ${good?'good':'bad'}">${g.wuxing} · ${g.fortune}</div></div>`;
    });
    html += `</div>`;
    html += `<table class="data-table"><tr><th>三才配置(天格-人格-地格)</th><td class="hl">${name.sancai}</td></tr></table>`;
    html += `<p style="font-size:14px;color:var(--paper-dim);">姓名學採熊崎氏五格剖象法，筆畫以康熙字典為準；三才五行配置與81數理僅供命名參考之一，實務上仍應綜合字義、音韻與個人喜好。</p>`;

    html += explainDetail(`
      <h5>五格各自代表什麼？</h5>
      <ul>${name.details.map(g=>`<li><b>${g.name}（${g.num}，${g.wuxing}，${g.fortune}）</b>：${FIVE_GE_MEANING[g.name]}</li>`).join('')}</ul>
      <h5>五格是怎麼算出來的？</h5>
      <p style="font-size:14px;color:var(--paper-dim);line-height:1.85;">熊崎氏五格剖象法是依姓氏與名字每個字的康熙字典筆畫數，用固定公式組合出天格、人格、地格、外格、總格五個數字，再對照「81數理吉凶表」判斷每一格是吉是凶、對照筆畫尾數判斷五行屬性（1、2畫尾數屬木；3、4畫屬火；5、6畫屬土；7、8畫屬金；9、0畫屬水）。</p>
      <h5>三才配置是什麼？</h5>
      <p style="font-size:14px;color:var(--paper-dim);line-height:1.85;">三才配置是取天格、人格、地格三者的五行屬性依序排列（例如「${name.sancai}」），用來判斷這三個五行之間是相生（順暢）還是相剋（阻礙），藉此輔助評估姓名整體給人的協調感，但這只是姓名學眾多評估面向中的一環，不宜單獨用來論斷吉凶。</p>
    `);

    if(wuxing){ html += renderNameSuggestions(surname, wuxing, bazi); }

    panel.innerHTML='';
    panel.appendChild(el(`<div>${html}</div>`));

    // v9.7新增：姓名改運建議的單字名／雙字名切換互動（需在panel實際掛載到DOM後才能綁定事件）
    if(wuxing){
      const sugBox = document.getElementById('nameSugBox');
      if(sugBox){
        const ys = bazi ? computeYongshenEngine(bazi) : null;
        const targetWxList = ys ? ys.fuyiYongShen : [wuxingDominant(wuxing).weakest[0]];
        const resultBox = document.getElementById('nameSugResult');
        let curLen = 1;
        renderNameSuggestionResult(resultBox, surname, targetWxList, curLen);
        sugBox.querySelectorAll('.radio-pill').forEach(lbl=>{
          lbl.addEventListener('click', ()=>{
            sugBox.querySelectorAll('.radio-pill').forEach(l=>l.classList.remove('active'));
            lbl.classList.add('active');
            lbl.querySelector('input').checked = true;
            curLen = parseInt(lbl.dataset.len, 10);
            renderNameSuggestionResult(resultBox, surname, targetWxList, curLen);
          });
        });
      }
    }
  }

  // ---------- 綜合運勢報告：規則式生成（依實際排盤結果組合，非隨機） ----------
  // 五行對應臟腑（中醫五行養生概念，僅供生活化參考，非醫學診斷）
  const ORGAN_MAP = {'木':'肝、膽、筋骨與眼睛','火':'心臟、小腸與血液循環系統','土':'脾胃、消化系統與肌肉','金':'肺、大腸、呼吸系統與皮膚','水':'腎、膀胱與泌尿生殖系統'};
  // 五行相剋（木剋土、土剋水、水剋火、火剋金、金剋木）沿用下方「合盤比對」模組中已定義的 WX_KE 字典，此處不重複宣告

  function computeReportStats(ctx){
    const {p,bazi,wuxing,shishen,dayun,ziwei,astro,ascendant,name} = ctx;
    const dom = wuxingDominant(wuxing);
    const scCounter = countShishen(shishen);
    const dayGan = bazi.pillars.day.gan;
    const dayZhi = bazi.pillars.day.zhi;
    const dayGanWx = GAN_WX[dayGan];

    // 日主強弱粗估：同我(比肩劫財)+生我(印)的比例
    const total = Object.values(wuxing).reduce((a,b)=>a+b,0);
    const selfSupport = wuxing[dayGanWx] || 0;
    const generateMap = {'木':'水','火':'木','土':'火','金':'土','水':'金'};
    const supportWx = generateMap[dayGanWx];
    const supportScore = selfSupport + (wuxing[supportWx]||0);
    const strength = supportScore/total; // 越高越「身強」
    const strengthLabel = strength>0.42 ? '偏強' : (strength<0.28? '偏弱' : '中和');

    function ziweiStarsIn(name){ return ziwei ? starsOf(ziwei,name) : []; }
    function starTraitText(stars){
      return stars.map(s=>STAR_MEAN[s]?STAR_MEAN[s].trait:null).filter(Boolean).join('；');
    }

    const guanSha = (scCounter['正官']||0)+(scCounter['七殺']||0);
    const caiXing = (scCounter['正財']||0)+(scCounter['偏財']||0);
    const yinXing = (scCounter['正印']||0)+(scCounter['偏印']||0);
    const shiShang = (scCounter['食神']||0)+(scCounter['傷官']||0);
    const biJie = (scCounter['比肩']||0)+(scCounter['劫財']||0);
    const jieCai = scCounter['劫財']||0;
    const qiSha = scCounter['七殺']||0;
    const isMale = p.gender==='M';

    // ---- 未來5年流年關鍵訊號（供感情／事業／財運／健康各領域抓取具體年份，非另編數據，與「流年運勢」頁籤共用同一套排盤與合沖判斷邏輯） ----
    // v10.5修正（缺失⑤）：改用台灣時區的今天判斷「今年」，取代裝置本地時區（見todayInfo()說明）。
    const nowYearNum = todayInfo().y;
    const natalZhiForFlow = {year:bazi.pillars.year.zhi, month:bazi.pillars.month.zhi, day:dayZhi};
    if(!p.unknownHour && bazi.pillars.hour) natalZhiForFlow.hour = bazi.pillars.hour.zhi;
    const peachZhiForFlow = getPeachZhi(dayZhi);
    const spouseShishenForGender = isMale ? ['正財','偏財'] : ['正官','七殺'];
    const childShishenForGender = isMale ? ['正官','七殺'] : ['食神','傷官'];
    const next5 = [];
    for(let i=0;i<5;i++){
      const y = nowYearNum + i;
      try{
        const yGZ = ganZhiOfYear(y, p.longitude, p.useTrueSolarTime);
        const flowSh = yGZ.gan===dayGan ? '日主' : B.getShishen(dayGan, yGZ.gan);
        const tags = flowTags(natalZhiForFlow, dayZhi, dayGan, yGZ.gan, yGZ.zhi, flowSh, spouseShishenForGender, peachZhiForFlow, '年');
        const isBenMing = tags.includes('值太歲');
        const isChongTaiSui = tags.includes('沖太歲');
        const isXingTaiSui = tags.includes('刑太歲');
        const isHaiTaiSui = tags.includes('害太歲');
        next5.push({y, gz:yGZ.gan+yGZ.zhi, flowSh, tags, isBenMing, isChongTaiSui, isXingTaiSui, isHaiTaiSui});
      }catch(e){ /* 超出曆算範圍的年份略過 */ }
    }
    const loveYears = next5.filter(r=>spouseShishenForGender.includes(r.flowSh)||r.tags.includes('桃花')||r.tags.includes('合配偶宮')||r.tags.includes('姻緣星動')).slice(0,3)
      .map(r=>({y:r.y, gz:r.gz, reason: spouseShishenForGender.includes(r.flowSh) ? `流年走「${r.flowSh}」，命理上正是${isMale?'男命看財星':'女命看官殺'}的姻緣星浮現年份，出現有效對象的機率較高` : (r.tags.includes('桃花') ? '流年地支恰逢桃花位，異性緣與社交邀約明顯增加，適合多參加聚會、擴大生活圈' : '流年與命盤配偶宮相合，感情關係容易加溫、穩定發展')}));
    const marriageCautionYears = next5.filter(r=>r.tags.includes('沖配偶宮')).slice(0,2)
      .map(r=>({y:r.y, gz:r.gz, reason:'流年沖動配偶宮，感情或婚姻容易出現爭執、聚少離多或關係轉折，這一年遇到衝突先冷靜，重大決定（分手、離婚、外遇糾紛）都不宜在氣頭上倉促拍板'}));
    const careerWindowYears = next5.filter(r=>r.tags.includes('升遷責任')||r.tags.includes('創業佳')).slice(0,3)
      .map(r=>({y:r.y, gz:r.gz, reason: r.tags.includes('升遷責任') ? '流年走正官，責任與位階容易提升，是主動爭取升遷、轉正或談加薪的好時機' : '流年走食神／傷官，才華與表現機會增加，適合提企劃案、接副業或小規模試水溫創業'}));
    const careerCautionYears = next5.filter(r=>r.tags.includes('沖事業宮')||r.tags.includes('壓力年')).slice(0,2)
      .map(r=>({y:r.y, gz:r.gz, reason: r.tags.includes('沖事業宮') ? '流年沖動事業宮（月柱），工作異動、轉職或與主管合作單位的關係容易生變，若無十足把握，這年宜以觀察應變為主，避免倉促離職或創業' : '流年走七殺，壓力與挑戰並存、行動力雖強但也容易緊繃，重大決策前建議多聽第二意見'}));
    const wealthCautionYears = next5.filter(r=>r.tags.includes('防破財')).slice(0,2)
      .map(r=>({y:r.y, gz:r.gz, reason:'流年走比肩／劫財，破財訊號較明顯，常見於「借錢給人」「合夥被拖累」「衝動作保背書」，這年若有親友借貸、合資邀約務必謹慎評估、留下白紙黑字'}));
    const TAISUI_REASON = {
      值太歲:'流年地支與生年地支相同，傳統稱「值太歲」（本命年），運勢起伏較大，宜求穩，避免衝動的重大決策，並可留意交通與意外安全',
      沖太歲:'流年地支與生年地支相沖，稱「沖太歲」，情緒與人際較容易有摩擦，簽約、動土、搬家等大事宜格外謹慎確認細節',
      刑太歲:'流年地支與生年地支形成三刑關係，稱「刑太歲」，較容易出現官司糾紛、口舌是非或身體小傷小痛，行事宜多一分忍讓與謹慎',
      害太歲:'流年地支與生年地支形成六害關係，稱「害太歲」，人際互動、合作關係較容易有暗中的摩擦或誤會，宜多留意溝通，避免猜忌',
    };
    const taisuiYears = next5.filter(r=>r.isBenMing||r.isChongTaiSui||r.isXingTaiSui||r.isHaiTaiSui).slice(0,3)
      .map(r=>{
        const types = [];
        if(r.isBenMing) types.push('值太歲');
        if(r.isChongTaiSui) types.push('沖太歲');
        if(r.isXingTaiSui) types.push('刑太歲');
        if(r.isHaiTaiSui) types.push('害太歲');
        return { y:r.y, gz:r.gz, type:types.join('、'), reason: types.map(t=>TAISUI_REASON[t]).join('；') };
      });

    // ---- 感情與婚姻 ----
    let marriage = `日主${strengthLabel}，八字中${caiXing>=3?'財星較旺':(guanSha>=3?'官殺較旺':'財官力量平均')}。`;
    if(dayGanWx==='木'||dayGanWx==='火') marriage += isMale ? '日主屬陽剛性質，對感情投入直接、主導性強，宜多留意傾聽伴侶感受。' : '個性熱情主動，感情表達直率，適合坦誠溝通的相處模式。';
    else marriage += '個性相對內斂沉穩，感情經營傾向細水長流，重視安全感與長期承諾。';
    const spouseStars = ziweiStarsIn('夫妻');
    if(spouseStars.length){ marriage += ` 紫微夫妻宮見「${spouseStars.join('、')}」，${starTraitText(spouseStars)||'感情運勢平穩'}。`; }
    if(astro.Moon){ marriage += ` 月亮落於${astro.Moon.sign}，反映內在情感需求偏向${astro.Moon.sign}的特質，是經營親密關係時值得留意的內在傾向。`; }
    if(astro.Venus){ marriage += ` 金星落於${astro.Venus.sign}，代表在感情裡容易被吸引的特質、以及表達喜歡的方式帶有${astro.Venus.sign}色彩。`; }

    const loveVerdict = isMale
      ? (caiXing>=3 ? '財星偏旺，桃花機會多、異性緣佳，正緣的關鍵不在「等出現」，而在「篩選」——避免同時腳踏多船或見異思遷。' : (caiXing===0 ? '財星在天干地支中不顯，並非沒有姻緣，而是正緣不會主動找上門，需要透過拓展生活圈、朋友介紹主動創造機會。' : '財星力量中等，感情機會平穩出現，穩紮穩打地經營即可有結果。'))
      : (guanSha>=3 ? '官殺偏旺，對伴侶條件與能力較有主見與要求，正緣對象通常在工作能力或社會地位上表現突出；但七殺力量若偏強，也要留意對方個性強勢帶來的相處壓力。' : (guanSha===0 ? '官殺在天干地支中不顯，並非沒有姻緣，而是正緣需要主動經營、透過朋友介紹或擴大交友圈才會出現。' : '官殺力量中等，感情發展速度平穩，循序漸進較容易修成正果。'));
    const loveReasons = [];
    loveReasons.push(isMale ? `八字中財星出現${caiXing}次，命理上男命以財星為妻／女友星，這個數字直接反映妳／你目前的桃花活躍程度與感情機會多寡。` : `八字中官殺出現${guanSha}次，命理上女命以官殺為夫／男友星，這個數字直接反映目前的正緣機會多寡與對象特質。`);
    if(spouseStars.length) loveReasons.push(`紫微夫妻宮見「${spouseStars.join('、')}」，${starTraitText(spouseStars)||'代表配偶類型與相處模式的重要線索'}，可作為判斷「什麼類型的人適合自己」的參考。`);
    if(astro.Venus) loveReasons.push(`金星在${astro.Venus.sign}，說明妳／你容易被${astro.Venus.sign}特質的人吸引，也是自己表達愛意時最自然的方式。`);
    if(biJie>=3) loveReasons.push('比劫（比肩／劫財）力量偏旺，交友圈廣、異性朋友也多，若已有伴侶，需留意朋友或第三者過度介入感情生活，人際界線要清楚。');
    if((scCounter['七殺']||0)>=2) loveReasons.push('命盤七殺力量偏強，感情中行動力與主導性強，但也容易讓對方感受到壓迫感，建議多練習傾聽而非急著下決定。');
    const loveAdvice = [];
    loveAdvice.push(strengthLabel==='偏弱' ? '日主偏弱時，感情中容易一味付出、委屈自己討好對方，建議先把自己的生活與情緒能量顧好，再談穩定關係，正緣才留得住。' : '感情中可以主動一點，但也要留意對方的步調，避免只用自己的方式在愛人。');
    if(loveYears.length){ loveAdvice.push(`近期${loveYears.map(y=>y.y+'年').join('、')}是感情機緣較旺的年份，單身者可主動安排聯誼、參加朋友聚會、報名有興趣的課程，增加認識新對象的機會；已有對象者則適合把握這幾年推進到訂婚、結婚等重要階段。`); }
    else { loveAdvice.push('近5年流年姻緣星訊號不算特別強，代表感情機緣需要更主動創造，建議透過穩定的興趣社群、朋友圈介紹來增加緣分，而不是被動等待「對的人」自己出現。'); }
    if(marriageCautionYears.length){ loveAdvice.push(`需留意${marriageCautionYears.map(y=>y.y+'年').join('、')}：${marriageCautionYears[0].reason}`); }
    loveAdvice.push('若正在猶豫「這段關係該不該繼續」，可以問自己三個問題：吵架後彼此願不願意先低頭溝通？金錢觀與人生規劃是否大方向一致？跟對方在一起時，是更喜歡自己還是更討厭自己？這比單純看命盤更能反映關係品質。');

    // ---- 事業與工作 ----
    let career = `八字中${guanSha>=3?'官殺旺，適合在體制內、具挑戰性或管理職發展':(shiShang>=3?'食傷旺，才華洋溢、創意表現力強，適合創作或專業技術領域':'格局平穩，適合按部就班穩健發展的職涯路徑')}。`;
    const careerStars = ziweiStarsIn('事業');
    if(careerStars.length) career += ` 事業宮見「${careerStars.join('、')}」，${starTraitText(careerStars)||''}。`;
    if(astro.Sun) career += ` 太陽星座為${astro.Sun.sign}，代表外顯的自我實現方向與${astro.Sun.sign}的特質相關。`;
    // v10.5修正（缺失④）：改用精確實歲，取代「西曆年直接相減」的粗略算法（見getPreciseAgeInfo說明）。
    const nowAgeForWork = getPreciseAgeInfo(p).preciseAge;
    const curDuForWork = (dayun.dayunList||[]).find(d=>nowAgeForWork>=parseFloat(d.startAge) && nowAgeForWork<parseFloat(d.endAge)) || dayun.dayunList[dayun.dayunList.length-1];
    let work = `目前大運為「${curDuForWork?curDuForWork.gan+curDuForWork.zhi:''}」（${curDuForWork?curDuForWork.startAge+'~'+curDuForWork.endAge+'歲':''}），`;
    work += biJie>=3 ? '比劫力量偏旺，適合團隊合作或與人共事的工作型態，但也要留意競爭與人際消耗。' : '整體格局中比劫不算突出，較適合發揮個人專業或獨立作業的工作模式。';
    if(dom.strongest) work += ` 五行以「${dom.strongest[0]}」最旺，建議選擇與此五行屬性相關的產業或職能方向可較為順手。`;

    const industryList = (WX_INDUSTRY_DETAIL[dom.strongest?dom.strongest[0]:'']||[]).map(x=>x.name);
    let bizVerdict;
    if(strengthLabel==='偏強' && (caiXing>=2 || guanSha>=2)) bizVerdict = '身強且財官有力，具備扛起責任與調度資源的能量，若已有明確規劃與客源，適合朝獨立接案、開店或創業方向嘗試，會比單純領死薪水更能發揮潛力。';
    else if(strengthLabel==='偏弱') bizVerdict = '日主偏弱，代表現階段承受風險與壓力的能量相對有限，建議先以穩定的受雇工作為主、累積資源與人脈，創業或重大投資可留待身強的大運階段（見下方「重大人生抉擇」）再評估，避免現在硬扛。';
    else bizVerdict = '日主中和，創業或受雇皆可考慮，關鍵在有沒有明確的專業優勢；建議先用「風險可控的小規模嘗試」（接案、兼職副業）測試市場水溫，確認可行再考慮全職投入。';
    const careerReasons = [];
    careerReasons.push(`日主${strengthLabel}，是判斷「適合當老闆還是員工」的關鍵：身強能扛壓力與風險，適合主導型角色；身弱則適合先在體制內累積資源與靠山，再伺機而動。`);
    if(guanSha>=3) careerReasons.push('官殺偏旺，代表責任感強、抗壓性也高，適合在有明確升遷制度或需要決斷力的管理職發展；但七殺過旺時也要留意過勞與人際衝突。');
    if(shiShang>=3) careerReasons.push('食傷偏旺，才華與表達力突出，適合創作、教學、行銷或需要展現個人特色的工作；但傷官偏強時說話較直，職場溝通宜留意分寸，避免得罪主管或客戶。');
    if(biJie>=3) careerReasons.push('比劫力量偏旺，適合團隊合作、業務或需要人脈的工作型態，但同事間的競爭與人情往來也會消耗較多心力。');
    if(careerStars.length) careerReasons.push(`紫微事業宮見「${careerStars.join('、')}」，是判斷適合職場角色（領導型／執行型／幕僚型）的重要線索。`);
    const careerAdvice = [];
    if(industryList.length) careerAdvice.push(`五行最旺為「${dom.strongest[0]}」，對應相對容易發揮的產業方向：${industryList.join('、')}，轉職或選校選系時可優先參考。`);
    if(careerWindowYears.length) careerAdvice.push(`${careerWindowYears.map(y=>`${y.y}年（${y.gz}）`).join('、')}是升遷或才華發揮機會較旺的年份，可提早準備作品集或主動向主管表達企圖心。`);
    else careerAdvice.push('近5年流年在事業上的訊號偏向平穩，代表機會需要自己主動爭取，建議提早規劃1～2個具體目標（證照、專案成果），而非被動等待機會上門。');
    if(careerCautionYears.length) careerAdvice.push(`${careerCautionYears.map(y=>`${y.y}年`).join('、')}宜謹慎評估轉職與創業決定：${careerCautionYears[0].reason}`);
    careerAdvice.push((biJie>=3||shiShang>=2) ? '命盤比劫／傷官力量偏旺，職場上較容易遇到言語是非或功勞被搶，建議薪資、加班、專案成果盡量留下書面紀錄（Email、訊息截圖），避免只靠口頭承諾。' : '目前命盤中「小人訊號」不算明顯，但仍建議與同事保持專業界線，重要口頭承諾養成書面確認的習慣，有備無患。');

    // ---- 財運與投資 ----
    let wealth = `財帛宮與八字財星方面，${caiXing>=3?'正財偏財力量皆偏旺，代表賺錢管道多元、對金錢也相對敏銳':(caiXing>=1?'財星力量中等，收入穩定但爆發力有限，適合穩健理財':'財星在天干地支中較不明顯，不代表賺不到錢，而是財運需要更主動爭取，不會憑空從天而降')}。`;
    const wealthStars = ziweiStarsIn('財帛');
    if(wealthStars.length) wealth += ` 財帛宮見「${wealthStars.join('、')}」，${starTraitText(wealthStars)||''}。`;
    wealth += strengthLabel==='偏強' ? ' 日主偏強，較能承擔財星帶來的壓力，適合積極開源；' : (strengthLabel==='偏弱' ? ' 日主偏弱時財星容易變成負擔，建議以守成、穩健理財為主，避免高風險投資；' : ' 日主中和，開源與守成可保持均衡；');
    wealth += jieCai>=2 ? '命盤中劫財力量偏強，提醒與人合資或借貸往來時要更加謹慎，避免破財。' : '整體財務風險相對可控。';
    const wealthReasons = [];
    wealthReasons.push((scCounter['正財']||0) >= (scCounter['偏財']||0) ? '正財力量相對偏重，代表財運來源以穩定的工作收入為主，偏財（投資、業外收入）屬於錦上添花，不宜本末倒置把主要積蓄壓在高風險投機上。' : '偏財力量相對明顯，代表對投資、業外機會較敏銳，但偏財來得快也可能去得快，建議賺到的偏財至少提撥一部分轉為正財性質的穩定資產（儲蓄、保險、定期定額）。');
    if(jieCai>=2) wealthReasons.push('劫財力量偏強，破財往往不是花在自己身上，而是「借錢給人」「合夥被拖累」「衝動作保背書」，這是命盤上最需要留意的漏財管道。');
    const investWx = dom.strongest ? dom.strongest[0] : '';
    let investAdvice = '建議以穩健配置為主，股票、房地產等各類資產可分散比例，不需集中單一標的。';
    if(investWx==='金') investAdvice = '五行金旺，對數字、規則與趨勢的判斷相對敏銳，操作股票、基金等金融商品時容易得心應手，但仍建議設定停利停損點，避免槓桿過大。';
    else if(investWx==='土') investAdvice = '五行土旺，性格務實穩重，適合長期持有型的資產，如不動產、長期定存或穩健型基金，比短線頻繁進出更適合這個命盤特質。';
    else if(investWx==='木'||investWx==='火') investAdvice = '五行木火旺，行動力強、決策速度快，也容易因一時衝動而重壓單一標的，投資前建議先寫下停損點再進場，避免情緒化交易。';
    else if(investWx==='水') investAdvice = '五行水旺，資金變現與流動能力強，適合多元配置與波段操作，但也要留意資金流向過於分散、缺乏紀律的問題，建議固定比例做長期儲蓄。';
    wealthReasons.push(investAdvice);
    const wealthAdvice = [];
    wealthAdvice.push('理財第一步：先設定「緊急預備金」（約3～6個月生活費）再談投資，這是不看命盤也成立的基本功。');
    if(wealthCautionYears.length) wealthAdvice.push(`${wealthCautionYears.map(y=>`${y.y}年`).join('、')}需留意漏財訊號：${wealthCautionYears[0].reason}`);
    wealthAdvice.push(jieCai>=2 ? '近期若有親友邀約合資、借貸或要求作保，務必量力而為並留下白紙黑字，必要時可先禮貌拒絕，不需要為了面子承擔財務風險。' : '整體財務風險可控，維持記帳與定期檢視資產配置的習慣，長期下來財富累積會比臨時起意的投機更穩定。');

    // ---- 家庭與子女 ----
    let family = `田宅與家庭運勢方面，${yinXing>=3?'印星偏旺，代表長輩緣份深厚、重視家庭傳承':'印星力量一般，建議主動經營與長輩、家人的互動關係'}。`;
    const familyStars = ziweiStarsIn('田宅');
    if(familyStars.length) family += ` 田宅宮見「${familyStars.join('、')}」，${starTraitText(familyStars)||''}。`;
    const childrenStars = ziweiStarsIn('子女');
    const childCount = childShishenForGender.reduce((a,k)=>a+(scCounter[k]||0),0);
    const familyReasons = [];
    familyReasons.push(yinXing>=3 ? '印星偏旺，代表與長輩緣份深、容易得到家人支持，但也要留意過度依賴家人意見，重大決定仍應自己做主。' : '印星力量一般，代表長輩緣份需要主動經營，建議增加固定的家庭互動時間（如每週一通電話、固定聚餐），而不是等有事才聯絡。');
    if(familyStars.length) familyReasons.push(`田宅宮見「${familyStars.join('、')}」，${starTraitText(familyStars)||'反映居家與家族基業的狀態'}，也可作為購屋、搬家時機的參考線索之一。`);
    familyReasons.push(childCount>=3 ? `命理上${isMale?'男命以官殺、女命以食傷':''}作為子女緣的參考之一，命盤中「${childShishenForGender.join('／')}」力量偏旺，代表與子女緣份較深、互動頻繁，教養過程中建議提早建立清楚的原則與界線，避免過度操心。` : (childCount===0 ? `命盤中代表子女緣的「${childShishenForGender.join('／')}」在天干地支中較不明顯，這不代表沒有子女緣，而是親子關係需要更主動投入時間陪伴與經營，緣份不會憑空變深厚。` : `命盤中「${childShishenForGender.join('／')}」力量中等，親子緣份平順，用心陪伴即可維持良好互動。`));
    if(childrenStars.length) familyReasons.push(`紫微子女宮見「${childrenStars.join('、')}」，${starTraitText(childrenStars)||'可作為理解孩子個性與適合培養方向的參考'}。`);
    const familyAdvice = [];
    familyAdvice.push('備孕或家庭規劃屬於人生大事，命理只能提供「相對平穩、資源較充足」的參考年份，實際生育計畫仍應以身體狀況與婦產科醫師建議為主。');
    const familyGoodYears = next5.filter(r=>r.flowSh==='正財'||r.flowSh==='正印').slice(0,2).map(r=>r.y);
    if(familyGoodYears.length) familyAdvice.push(`若正在規劃備孕或添購房產等家庭大事，${familyGoodYears.join('、')}年財星印星相對穩健，資源與後援較充足，可優先考慮；劫財、七殺運的年份則建議先緩一緩重大決定。`);
    familyAdvice.push(yinXing<2 ? '建議主動關心長輩健康狀況，定期安排家人一起健康檢查，感情不會因為忙碌而自動維繫，需要刻意撥出時間。' : '長輩緣份佳，可多聽取家中長輩經驗，但金錢、婚姻等重大決定仍以自己與伴侶的共識為主，避免過度干涉造成家庭摩擦。');

    // ---- 健康（獨立分析，與疾厄宮沖剋分開呈現） ----
    const hazardStars = ziweiStarsIn('疾厄');
    const hasQiSha = qiSha >= 2;
    let hazard = `疾厄宮與八字沖剋方面：`;
    hazard += hasQiSha ? '七殺力量偏強，做事衝勁十足，但也提醒行事宜多評估風險，避免過於躁進。' : '整體格局相對平穩，日常仍建議留意作息與健康管理。';
    if(hazardStars.length) hazard += ` 疾厄宮見「${hazardStars.join('、')}」，${starTraitText(hazardStars)||''}，建議依此留意對應的生活習慣調整。`;
    if(strengthLabel==='偏弱') hazard += ' 日主偏弱，體力與抗壓耐受度需多加保養，避免過度透支。';
    const weakWx = dom.weakest ? dom.weakest[0] : '';
    const strongWx = dom.strongest ? dom.strongest[0] : '';
    const keOfStrong = WX_KE[strongWx];
    const healthReasons = [];
    if(weakWx) healthReasons.push(`五行「${weakWx}」在命盤中力量最弱，中醫五行養生觀念中對應「${ORGAN_MAP[weakWx]}」，是相對需要多花心思保養的部位（僅為命理養生參考，並非醫學診斷）。`);
    if(keOfStrong) healthReasons.push(`五行「${strongWx}」最旺，過旺時容易相對消耗被剋的「${keOfStrong}」（對應${ORGAN_MAP[keOfStrong]}），提醒即使精力旺盛，也別忽略這個部位的保養。`);
    if(hasQiSha) healthReasons.push('命盤七殺力量偏強，個性上做事衝勁十足、行動快，相對也容易緊繃、忽略休息，較常見的風險是心血管負擔與意外擦碰，行事宜多一分謹慎。');
    if(hazardStars.length) healthReasons.push(`紫微疾厄宮見「${hazardStars.join('、')}」，${starTraitText(hazardStars)||'是體質與身心狀態的重要參考線索'}。`);
    if(strengthLabel==='偏弱') healthReasons.push('日主偏弱，代表體力與抗壓的「本錢」相對有限，長期熬夜、過度勞累特別容易反映在身體上，恢復期也會比身強的人略長。');
    const healthAdvice = [];
    if(weakWx && WX_HABIT[weakWx]) healthAdvice.push(`日常保養可從補強最弱的「${weakWx}」五行著手：${WX_HABIT[weakWx]}。`);
    healthAdvice.push(hasQiSha ? '建議固定安排運動釋放壓力（如快走、游泳等中等強度運動），並養成規律作息，避免長期處於高壓緊繃狀態。' : '維持現有的作息與運動習慣即可，健康狀況整體平穩。');
    if(taisuiYears.length) healthAdvice.push(`${taisuiYears.map(y=>`${y.y}年（${y.type}）`).join('、')}傳統上提醒留意血光意外與情緒波動，建議這幾年安排定期健康檢查、開車與運動時更加小心。`);
    healthAdvice.push('以上健康分析屬於命理五行養生的生活化參考，並非醫學診斷；若有實際不適或長期症狀，仍應以正規醫療院所的檢查與醫師專業判斷為準。');

    // ---- 人際關係 ----
    let interpersonal = `比劫（比肩／劫財）出現${biJie}次，${biJie>=3?'代表人脈廣闊、朋友多，重視團隊合作與義氣相挺，但也容易因為朋友、合夥的事務耗費心力或財力':(biJie>=1?'人際關係中規中矩，朋友圈不算大但相處起來穩定':'比劫力量不算突出，個性上較獨立自主，不特別依賴朋友圈，一個人也能把事情處理好')}。`;
    const friendStars = ziweiStarsIn('交友');
    if(friendStars.length) interpersonal += ` 交友宮見「${friendStars.join('、')}」，${starTraitText(friendStars)||''}。`;
    interpersonal += dayGanWx==='木'||dayGanWx==='火' ? ' 日主屬陽剛外顯的五行，社交上容易主動發起邀約、帶動氣氛。' : ' 日主屬相對內斂的五行，社交上偏向被動但耐力持久的相處模式，重質不重量。';

    // ---- 流年運勢與整體運氣 ----
    const currentYearBazi = B.computeFourPillars({year:nowYearNum,month:2,day:15,hour:12,minute:0,tzOffset:8,longitude:p.longitude,useTrueSolarTime:false});
    const flowShishen = B.getShishen(dayGan, currentYearBazi.pillars.year.gan);
    let fortune = `以西元${nowYearNum}年（${currentYearBazi.pillars.year.gan}${currentYearBazi.pillars.year.zhi}年）而言，對日主來說屬於「${flowShishen}」運。`;
    const fortuneDesc = {
      '比肩':'人際往來活躍，凡事宜多與人協商合作，避免單打獨鬥。',
      '劫財':'財務調度需更謹慎，合資合夥前務必詳加評估。',
      '食神':'才華與生活享受運勢佳，適合發展興趣或副業。',
      '傷官':'表現慾與創造力旺盛，但需留意言語溝通上的分寸。',
      '正財':'正財運穩健，適合踏實累積、規劃長期理財。',
      '偏財':'偏財機會增加，但投機性質的決定仍需審慎評估風險。',
      '正官':'責任與規範意識提升，適合爭取升遷或穩定發展的機會。',
      '七殺':'挑戰與壓力並存，行動力強但也容易緊繃，宜適度調節步調。',
      '正印':'學習與貴人運佳，適合進修充電或尋求前輩指導。',
      '偏印':'獨立思考與專業鑽研運勢佳，但人際互動上宜更主動開放。',
      '日主':'同干年（流年天干與日主相同），凡事宜求穩，避免大幅度的重大變動決策。',
    };
    const currentAgeRpt = Math.max(0, nowYearNum - p.y); // v8.8：本年度運勢文字亦依實際年齡切換兒童／青少年／成年版本，避免未成年出現升遷、合資、投機等用語
    const flowShishenTextRpt = shishenHintForAge(flowShishen, currentAgeRpt) || fortuneDesc[flowShishen] || '整體運勢平穩，宜按既定步調穩健前行。';
    fortune += flowShishenTextRpt;
    const thisYearInfo = next5[0] || null;
    const fortuneReasons = [`${nowYearNum}年（${thisYearInfo?thisYearInfo.gz:''}）流年十神屬「${flowShishen}」——${flowShishenTextRpt}`];
    if(thisYearInfo && thisYearInfo.isBenMing) fortuneReasons.push('今年恰逢「值太歲（本命年）」，運勢起伏本就會比其他年份明顯，屬於正常週期性現象，不需過度恐慌，但重大決策仍建議求穩。');
    if(thisYearInfo && thisYearInfo.isChongTaiSui) fortuneReasons.push('今年恰逢「沖太歲」，人際與情緒較容易有摩擦，簽約、動土、搬家等大事宜更謹慎確認細節。');
    if(thisYearInfo && thisYearInfo.isXingTaiSui) fortuneReasons.push('今年恰逢「刑太歲」，較容易出現官司糾紛、口舌是非或身體小傷小痛，行事宜多一分忍讓與謹慎。');
    if(thisYearInfo && thisYearInfo.isHaiTaiSui) fortuneReasons.push('今年恰逢「害太歲」，人際互動、合作關係較容易有暗中的摩擦或誤會，宜多留意溝通，避免猜忌。');
    const fortuneAdvice = [];
    if(taisuiYears.length) fortuneAdvice.push(`未來5年中，${taisuiYears.map(y=>`${y.y}年（${y.type}）`).join('、')}運勢波動相對較大，建議這幾年凡事求穩、避免衝動的重大決定。`);
    else fortuneAdvice.push('未來5年並無明顯值太歲、沖太歲、刑太歲或害太歲年份，整體運勢起伏相對平緩，適合按部就班推進既定計畫。');
    fortuneAdvice.push('掌握運勢高低的實用做法：運勢旺的年份積極把握機會、主動出擊；運勢偏弱或沖煞的年份則以「守成、觀察、累積」為主，不躁進、不做超出能力範圍的重大決定，就能把風險降到最低。');

    const cats = [
      {title:'婚姻感情',icon:'♡',tag:strengthLabel,text:marriage},
      {title:'事業發展',icon:'☆',tag:guanSha>=3?'官殺旺':(shiShang>=3?'食傷旺':'平穩'),text:career},
      {title:'工作型態',icon:'⚒',tag:dom.strongest?dom.strongest[0]+'旺':'',text:work},
      {title:'家庭關係',icon:'⌂',tag:yinXing>=3?'印旺':'一般',text:family},
      {title:'健康與災厄',icon:'⚠',tag:hasQiSha?'需留意':'平穩',text:hazard},
      {title:'財運',icon:'💰',tag:caiXing>=3?'財旺':'平穩',text:wealth},
      {title:'人際關係',icon:'🤝',tag:biJie>=3?'人脈廣':'穩定',text:interpersonal},
      {title:'流年運勢',icon:'✦',tag:flowShishen,text:fortune},
    ];

    return { dom, scCounter, dayGan, dayGanWx, strength, strengthLabel, guanSha, caiXing, yinXing, shiShang, biJie,
      marriage, career, work, family, hazard, wealth, interpersonal, fortune, flowShishen, fortuneDesc, cats, currentYearBazi, hasQiSha,
      // ---- 以下為「綜合運勢報告」頁籤使用的詳細結構化內容（原因＋具體建議＋關鍵年份） ----
      isMale, childShishenForGender, childCount, childrenStars, weakWx, strongWx,
      loveVerdict, loveReasons, loveAdvice, loveYears, marriageCautionYears,
      bizVerdict, careerReasons, careerAdvice, careerWindowYears, careerCautionYears, industryList,
      wealthReasons, wealthAdvice, wealthCautionYears, investAdvice,
      familyReasons, familyAdvice,
      healthReasons, healthAdvice, taisuiYears,
      fortuneReasons, fortuneAdvice, nowYearNum, thisYearInfo,
    };
  }

  // 產生「綜合運勢報告」頁籤中每一張帶有「原因」＋「具體建議」的詳細卡片
  function reportRichCard(icon, title, tag, verdict, reasons, advice, years, yearsLabel){
    let h = `<div class="report-cat"><h3>${icon} ${title} <span class="tag">${tag}</span></h3>`;
    h += `<p style="color:var(--paper);font-size:14.5px;line-height:1.85;margin:0 0 14px;"><b style="color:var(--gold-soft);">一句話結論：</b>${verdict}</p>`;
    h += `<div class="explain-detail">`;
    h += `<h5>為什麼會這樣（原因）</h5><ul>${reasons.map(r=>`<li>${r}</li>`).join('')}</ul>`;
    h += `<h5>怎麼做（具體建議）</h5><ul>${advice.map(a=>`<li>${a}</li>`).join('')}</ul>`;
    if(years && years.length){
      h += `<h5>${yearsLabel||'關鍵時機年份'}</h5><ul>${years.map(y=>`<li><b>${y.y}年（${y.gz}）：</b>${y.reason}</li>`).join('')}</ul>`;
    }
    h += `</div></div>`;
    return h;
  }

  // v8.2新增：跨面向一致性檢查——比對感情／事業／財運／太歲等面向各自獨立算出的未來5年關鍵年份，
  // 找出同一年份出現「機會訊號」與「留意訊號」重疊，或多個面向同時提醒留意的情況，並主動點出這是
  // 「不同面向各自判斷、本就可能不一致」的正常現象，避免使用者看到不同頁籤結論不同時感到混亂或矛盾。
  function buildConsistencyCheck(stats){
    const favorableByYear = {}, cautionByYear = {};
    const addFav = (y,domain,reason)=>{ (favorableByYear[y]=favorableByYear[y]||[]).push({domain,reason}); };
    const addCaution = (y,domain,reason)=>{ (cautionByYear[y]=cautionByYear[y]||[]).push({domain,reason}); };
    stats.loveYears.forEach(r=>addFav(r.y,'感情機緣',r.reason));
    stats.careerWindowYears.forEach(r=>addFav(r.y,'事業機會',r.reason));
    stats.marriageCautionYears.forEach(r=>addCaution(r.y,'感情婚姻',r.reason));
    stats.careerCautionYears.forEach(r=>addCaution(r.y,'事業變動',r.reason));
    stats.wealthCautionYears.forEach(r=>addCaution(r.y,'財務',r.reason));
    stats.taisuiYears.forEach(r=>addCaution(r.y,`太歲（${r.type}）`,r.reason));

    const notes = [];
    Object.keys(favorableByYear).forEach(y=>{
      if(cautionByYear[y]){
        const favDomains = favorableByYear[y].map(x=>x.domain).join('、');
        const cauDomains = cautionByYear[y].map(x=>x.domain).join('、');
        notes.push({y:Number(y), text:`同時出現「${favDomains}」的機會訊號，也出現「${cauDomains}」的留意訊號——這是因為不同面向各自依據獨立的十神／地支關係判斷，同一年份本來就可能有的領域走旺、有的領域需要留意，並非系統判斷矛盾。機會面向可放心把握，留意面向則依對應段落的建議多一分謹慎，兩者並不衝突。`});
      }
    });
    Object.keys(cautionByYear).forEach(y=>{
      if(cautionByYear[y].length>=2){
        const domains = cautionByYear[y].map(x=>x.domain).join('、');
        notes.push({y:Number(y), text:`同時有${cautionByYear[y].length}個面向（${domains}）出現留意訊號，波動性可能相對明顯，但這通常代表「這一年做重大決定前更需要多一層考慮」，而非「一定會發生壞事」；建議這年凡事求穩、重大決策放慢腳步、多聽第二意見即可，不需過度緊張。`});
      }
    });
    notes.sort((a,b)=>a.y-b.y);
    return notes;
  }

  function renderReport(ctx){
    const {name, p} = ctx;
    const panel = document.getElementById('panel-report');
    const stats = computeReportStats(ctx);

    let html = `<p style="color:var(--paper-dim);font-size:14px;line-height:1.8;margin:0 0 20px;">以下內容依你的八字十神、紫微斗數宮位星曜、西洋占星行星星座及真實流年干支綜合演算，針對感情婚姻、事業工作、財運投資、家庭子女、重大人生抉擇、健康與流年運勢逐項給出「原因」與「具體建議」，力求明確、可執行，而非空泛的吉凶用語。</p>`;

    // v10.6新增（缺失⑧修正）：時辰未知時，系統會以中午12:00代入計算時柱，這也會連帶影響本頁「命盤五行分布」
    // 統計中時柱的五行貢獻度；同一份報告群組裡的「命盤解析報告」「命盤時間軸」都有明確提示這件事，
    // 這裡補上一致的警示，避免使用者在完全沒有提示的情況下，誤以為這份最主要的綜合報告是以真實時辰算出。
    if(p.unknownHour){
      html += `<div class="error-box" style="margin-bottom:20px;">⚠️ 你目前是以「時辰未知」排出這份命盤，系統暫以中午12:00代入計算時柱——這會影響時柱本身、下方「命盤五行分布」統計中時柱的五行占比，以及所有與時柱、命宮相關的解讀段落之準確度。若能補齊準確出生時間並重新排盤，這份報告會更貼近你的真實命盤。</div>`;
    }

    const consistencyNotes = buildConsistencyCheck(stats);
    html += `<div class="card" style="margin-bottom:20px;border-color:var(--gold-soft);">
      <h3 style="margin:0 0 10px;font-size:15px;color:var(--gold-soft);">🔎 跨面向一致性檢查（未來5年）</h3>
      <p style="font-size:14px;color:var(--paper-dim);line-height:1.7;margin:0 0 12px;">自動比對下方感情、事業、財運、太歲等段落各自算出的關鍵年份，找出同一年份出現不同訊號重疊的情況，避免各面向各自解讀、互不參照。</p>
      ${consistencyNotes.length ? consistencyNotes.map(n=>`<p style="font-size:14px;color:var(--paper);line-height:1.85;margin:0 0 10px;">${tagChip(n.y+'年')} ${n.text}</p>`).join('') : `<p style="font-size:14px;color:var(--paper-dim);line-height:1.8;margin:0;">目前未來5年各面向的關鍵年份彼此並未重疊，訊號分散在不同年份，可依下方各分類段落個別參考即可。</p>`}
    </div>`;

    html += reportRichCard('💞','感情與婚姻', p.gender==='M'?'看財星':'看官殺', stats.loveVerdict, stats.loveReasons, stats.loveAdvice, [...stats.loveYears, ...stats.marriageCautionYears], '感情關鍵年份');
    html += reportRichCard('💼','事業與工作', stats.guanSha>=3?'官殺旺':(stats.shiShang>=3?'食傷旺':'平穩'), stats.bizVerdict, stats.careerReasons, stats.careerAdvice, [...stats.careerWindowYears, ...stats.careerCautionYears], '事業關鍵年份');
    html += reportRichCard('💰','財運與投資', stats.caiXing>=3?'財旺':'平穩', stats.wealthReasons[0], stats.wealthReasons.slice(1), stats.wealthAdvice, stats.wealthCautionYears, '漏財防範年份');
    html += reportRichCard('❤️‍🩹','健康', stats.hasQiSha?'需留意':'平穩', stats.weakWx?`體質上「${stats.weakWx}」對應的${ORGAN_MAP[stats.weakWx]}相對需要多留意保養。`:'整體體質平穩，維持良好作息即可。', stats.healthReasons, stats.healthAdvice, stats.taisuiYears, '需留意健康與意外風險的年份');
    html += reportRichCard('👪','家庭與子女', stats.yinXing>=3?'印旺':'一般', stats.childCount>=3?'與子女／晚輩緣份較深，親子互動頻繁。':(stats.childCount===0?'子女緣需要更主動經營，用心陪伴即可深厚。':'親子緣份平順，用心經營即可。'), stats.familyReasons, stats.familyAdvice, [], '');

    // ---- 重大人生抉擇 ----
    const migrateStars = ctx.ziwei ? starsOf(ctx.ziwei,'遷移') : [];
    const outboundLean = (stats.strongWx==='水'||stats.strongWx==='木'||migrateStars.length>0);
    const decisionVerdict = outboundLean ? '命盤中變動、流動性質的訊號較明顯，若有出國深造、外派或異地發展的機會，相對容易發揮所長、開拓格局。' : '命盤中根基、穩定性質的訊號較明顯，留在熟悉的環境深耕人脈與專業，通常比貿然遠赴他鄉更容易累積成果。';
    const decisionReasons = [];
    decisionReasons.push(migrateStars.length ? `紫微遷移宮見「${migrateStars.join('、')}」，代表在外發展、出差或異鄉打拼時的運勢與人際表現，是評估「該不該往外走」的重要線索。` : '紫微遷移宮暫無明顯強勢星曜，出外發展的吉凶較不突出，決定仍應以現實條件（語言、資金、家庭牽絆）為主要考量。');
    decisionReasons.push(stats.guanSha>=3 ? '官殺偏旺，重視制度與保障，若兩個工作機會中一個較穩定、一個較有挑戰性，通常穩定體制內的選項會讓你發揮得更好、也更安心。' : (stats.shiShang>=3 ? '食傷偏旺，重視自主與創意發揮，若兩個機會中一個重執行細節、一個重創意主導，通常後者更能讓你發光發熱。' : '官殺與食傷力量相當，兩種類型的機會皆可勝任，選擇時可回歸實際的薪資待遇、成長空間與主管風格來判斷。'));
    const decisionAdvice = [];
    decisionAdvice.push('面對「出國深造 vs 留在國內」：若命盤傾向外出發展、且現實條件（財力、語言、簽證）也具備，可優先考慮；若條件尚未成熟，也可以先留在國內累積實力與存款，等大運轉強時再出發，不必急於一時。');
    decisionAdvice.push('面對「兩個工作機會選哪個」：先列出兩者在「薪資成長性」「主管風格」「未來3年可學到什麼」三個面向的具體差異，再對照上方「命盤傾向的工作型態」做交叉檢查，通常會比單憑直覺更清楚。');
    decisionAdvice.push(`面對「近期適不適合買房、搬家」：可參考上方「財運與投資」及「流年運勢」中列出的關鍵年份——流年走正財、正印時資源較充足、適合置產；流年走劫財、七殺或沖動根基宮時，重大不動產決策則建議暫緩，先觀察一季再決定。`);
    decisionAdvice.push('任何重大人生抉擇，命盤只能提供「傾向」與「相對有利的時間窗」，最終仍要回到自己的財務狀況、家庭共識與真實意願來做決定，這是命理無法取代的部分。');
    html += reportRichCard('🧭','重大人生抉擇', stats.strengthLabel, decisionVerdict, decisionReasons, decisionAdvice, [], '');

    html += reportRichCard('🤝','人際關係', stats.biJie>=3?'人脈廣':'穩定', stats.interpersonal, [stats.interpersonal], ['交友圈廣的人建議設好金錢界線，避免因為義氣而承擔不必要的財務風險；交友圈小的人則可透過共同興趣的社群，慢慢累積穩定而長久的人脈。'], [], '');

    html += reportRichCard('✦','流年運勢與整體運氣', stats.flowShishen, `${stats.nowYearNum}年整體運勢屬於「${stats.flowShishen}」運，${stats.fortuneDesc[stats.flowShishen]||'整體平穩，宜按部就班。'}`, stats.fortuneReasons, stats.fortuneAdvice, stats.taisuiYears, '未來5年需留意的年份');

    if(name.error===false){
      const totalFortune = name.details.find(d=>d.name==='總格');
      html += `<div class="report-cat"><h3>✎ 姓名輔助參考 <span class="tag">${totalFortune.fortune.startsWith('吉')?'吉':'凶'}</span></h3>
        <p>姓名總格數理為${totalFortune.num}（${totalFortune.fortune}），三才配置為「${name.sancai}」，可作為命名或改名時的輔助參考之一，實際運勢仍以八字與大運為主要依據。</p></div>`;
    }

    html += `<p style="color:var(--paper-dim);font-size:14px;line-height:1.7;opacity:.8;margin-top:6px;">以上「關鍵時機年份」皆依你的命盤四柱地支與逐年真實干支演算之合、沖、桃花、十神訊號換算而來，與「流年運勢」「流月流日精算」頁籤共用同一套排盤引擎；各項建議為命理角度的生活化參考，非醫療、法律或投資建議，人生際遇仍取決於個人選擇與行動，重大決策請審慎評估並諮詢對應領域專業人士。</p>`;

    panel.innerHTML='';
    panel.appendChild(el(`<div>${html}</div>`));
  }

  function renderAIQATab(ctx){
    const panel = document.getElementById('panel-aiqa');
    panel.innerHTML = '';
    renderAIQABlock(ctx, panel);
  }

  // ---------- AI 白話追問（BYOK：可選 Claude／ChatGPT／Gemini／Agnes AI／NVIDIA NIM／GroqCloud／OpenRouter／Mistral AI Studio，金鑰僅存於本機瀏覽器，直接從瀏覽器送往各家官方 API，不經過任何第三方伺服器） ----------
  const AI_PROVIDERS = {
    claude: {
      label:'Claude', keyLabel:'Anthropic API Key', keyPlaceholder:'sk-ant-...',
      keyStorage:'zmp_claude_api_key', modelStorage:'zmp_claude_model', defaultModel:'claude-sonnet-4-6',
      applyLink:'https://console.anthropic.com', applyName:'console.anthropic.com',
      needsModel:true, needsEndpoint:false, modelsEndpoint:'https://api.anthropic.com/v1/models',
      note:'Claude 模型名稱可直接輸入；若原廠新增／替換模型，不需改程式即可使用。',
    },
    openai: {
      label:'ChatGPT', keyLabel:'OpenAI API Key', keyPlaceholder:'sk-...',
      keyStorage:'zmp_openai_api_key', modelStorage:'zmp_openai_model', defaultModel:'gpt-5.6-luna',
      applyLink:'https://platform.openai.com/api-keys', applyName:'platform.openai.com',
      needsModel:true, needsEndpoint:false, modelsEndpoint:'https://api.openai.com/v1/models',
      note:'模型名稱可直接輸入；不把模型清單寫死在程式中。',
    },
    gemini: {
      label:'Gemini', keyLabel:'Google AI API Key', keyPlaceholder:'AIza...',
      keyStorage:'zmp_gemini_api_key', modelStorage:'zmp_gemini_model', defaultModel:'gemini-2.5-flash',
      applyLink:'https://aistudio.google.com/apikey', applyName:'aistudio.google.com',
      needsModel:true, needsEndpoint:false, modelsEndpoint:'https://generativelanguage.googleapis.com/v1beta/openai/models',
      note:'Gemini 模型名稱可直接輸入；模型清單可由官方 API 動態取得。',
    },
    agnes: {
      label:'Agnes AI', keyLabel:'Agnes AI API Key', keyPlaceholder:'貼上你的 Agnes AI API Key',
      keyStorage:'zmp_agnes_api_key', modelStorage:'zmp_agnes_model', defaultModel:'agnes-2.5-flash',
      endpointStorage:'zmp_agnes_endpoint', endpointPlaceholder:'https://apihub.agnes-ai.com/v1',
      officialBaseUrl:'https://apihub.agnes-ai.com/v1',
      needsModel:true, needsEndpoint:true, endpointOptional:true,
      note:'Agnes AI 使用 OpenAI 相容介面；推薦以 agnes-2.5-flash 為主，也可輸入 agnes-3.0-flash。模型名稱保持可編輯，不寫死免費模型。',
    },
    nvidia: {
      label:'NVIDIA NIM', keyLabel:'NVIDIA NIM API Key', keyPlaceholder:'貼上 NVIDIA API Key',
      keyStorage:'zmp_nvidia_nim_api_key', modelStorage:'zmp_nvidia_nim_model', defaultModel:'',
      endpointStorage:'zmp_nvidia_nim_endpoint', endpointPlaceholder:'https://integrate.api.nvidia.com/v1',
      officialBaseUrl:'https://integrate.api.nvidia.com/v1',
      modelsEndpoint:'https://integrate.api.nvidia.com/v1/models',
      needsModel:true, needsEndpoint:true, endpointOptional:true,
      applyLink:'https://build.nvidia.com/settings/api-keys', applyName:'build.nvidia.com',
      note:'NVIDIA NIM 的可用模型會變動；請用「取得模型清單」或直接輸入原廠目前可用的模型 ID，不把免費模型寫死。',
    },
    groq: {
      label:'GroqCloud', keyLabel:'Groq API Key', keyPlaceholder:'gsk_...',
      keyStorage:'zmp_groq_api_key', modelStorage:'zmp_groq_model', defaultModel:'',
      officialBaseUrl:'https://api.groq.com/openai/v1',
      modelsEndpoint:'https://api.groq.com/openai/v1/models',
      needsModel:true, needsEndpoint:false,
      applyLink:'https://console.groq.com/keys', applyName:'console.groq.com',
      note:'Groq 採 OpenAI 相容 Chat Completions；模型名稱可由官方 /models 動態取得，免費額度／可用模型依帳戶與原廠政策而變動。',
    },
    openrouter: {
      label:'OpenRouter', keyLabel:'OpenRouter API Key', keyPlaceholder:'sk-or-v1-...',
      keyStorage:'zmp_openrouter_api_key', modelStorage:'zmp_openrouter_model', defaultModel:'openrouter/free',
      officialBaseUrl:'https://openrouter.ai/api/v1',
      modelsEndpoint:'https://openrouter.ai/api/v1/models',
      needsModel:true, needsEndpoint:false,
      applyLink:'https://openrouter.ai/keys', applyName:'openrouter.ai',
      note:'預設使用 openrouter/free 動態路由，不鎖定某一個免費模型；也可直接輸入任何目前可用的 provider/model 或 :free 模型。',
    },
    mistral: {
      label:'Mistral AI Studio', keyLabel:'Mistral API Key', keyPlaceholder:'貼上 Mistral API Key',
      keyStorage:'zmp_mistral_api_key', modelStorage:'zmp_mistral_model', defaultModel:'',
      officialBaseUrl:'https://api.mistral.ai/v1',
      modelsEndpoint:'https://api.mistral.ai/v1/models',
      needsModel:true, needsEndpoint:false,
      applyLink:'https://console.mistral.ai/api-keys/', applyName:'Mistral AI Studio',
      note:'Mistral Studio 目前提供 Free mode；模型名稱可由官方 /models 取得並可手動輸入，避免原廠換模型後程式失效。',
    },
  };
  const AI_PROVIDER_KEY = 'zmp_ai_provider';
  const AI_LIMITS = Object.freeze({ RPM:14, RPD:49, TPM:19000, MAX_QUEUE_WAIT_MS:90000, TIMEOUT_MS:60000 });
  const AI_USAGE_KEY = 'fivelens_ai_usage_v1';
  let aiRequestQueue = Promise.resolve();
  function aiUsageLoad(){ try{ const v=JSON.parse(localStorage.getItem(AI_USAGE_KEY)||'{}'); return v&&typeof v==='object'?v:{}; }catch(e){ return {}; } }
  function aiUsageSave(v){ try{ localStorage.setItem(AI_USAGE_KEY, JSON.stringify(v)); }catch(e){} }
  function aiPrune(u, now){
    const day=new Date(now).toISOString().slice(0,10);
    if(u.day!==day){ u.day=day; u.daily=0; }
    u.recent=Array.isArray(u.recent)?u.recent.filter(x=>x&&now-x.ts<60000):[];
    u.recentTokens=Array.isArray(u.recentTokens)?u.recentTokens.filter(x=>x&&now-x.ts<60000):[];
  }
  function aiEstimateTokens(options){
    const body=options&&options.body ? String(options.body) : '';
    if(/data:image\//.test(body)||/inline_data/.test(body)) return 8000;
    return Math.max(1, Math.min(9000, Math.ceil(body.length/4)));
  }
  async function aiAcquire(estimated){
    return new Promise((resolve,reject)=>{
      aiRequestQueue=aiRequestQueue.catch(()=>{}).then(async()=>{
        const start=Date.now(), u=aiUsageLoad();
        while(true){
          const now=Date.now(); aiPrune(u,now);
          if((u.daily||0)>=AI_LIMITS.RPD) throw Object.assign(new Error('DAILY_LIMIT'),{code:'AI_DAILY_LIMIT'});
          const rpm=(u.recent||[]).length, tpm=(u.recentTokens||[]).reduce((a,x)=>a+(x.tokens||0),0);
          if(rpm<AI_LIMITS.RPM && tpm+estimated<=AI_LIMITS.TPM){
            u.daily=(u.daily||0)+1; u.recent.push({ts:now}); u.recentTokens.push({ts:now,tokens:estimated}); aiUsageSave(u); return;
          }
          if(now-start>AI_LIMITS.MAX_QUEUE_WAIT_MS) throw Object.assign(new Error('QUEUE_TIMEOUT'),{code:'AI_QUEUE_TIMEOUT'});
          const nexts=[];
          if(rpm>=AI_LIMITS.RPM && u.recent[0]) nexts.push(60000-(now-u.recent[0].ts)+50);
          if(tpm+estimated>AI_LIMITS.TPM && u.recentTokens[0]) nexts.push(60000-(now-u.recentTokens[0].ts)+50);
          await new Promise(r=>setTimeout(r,Math.max(250,Math.min(...nexts.length?nexts:[1000]))));
        }
      });
      aiRequestQueue.then(resolve,reject);
    });
  }
  async function aiFetch(url, options){
    const estimated=aiEstimateTokens(options||{});
    await aiAcquire(estimated);
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),AI_LIMITS.TIMEOUT_MS);
    try{
      const opts=Object.assign({},options||{}, {signal:controller.signal});
      const resp=await fetch(url,opts);
      return resp;
    }catch(e){ if(e&&e.name==='AbortError') throw {status:408, timeout:true}; throw e; }
    finally{ clearTimeout(timer); }
  }
  window.__fiveLensAIUsage = ()=>{ const u=aiUsageLoad(); aiPrune(u,Date.now()); return {rpm:AI_LIMITS.RPM,rpd:AI_LIMITS.RPD,tpm:AI_LIMITS.TPM,daily:u.daily||0,minuteRequests:(u.recent||[]).length,minuteTokens:(u.recentTokens||[]).reduce((a,x)=>a+(x.tokens||0),0)}; };

  function providerBaseUrl(cfg, endpoint){
    return (endpoint || cfg.officialBaseUrl || '').replace(/\/+$/,'');
  }

  function getSavedProviderModel(cfg){
    const raw = cfg.modelStorage ? (Obfuscate.decode(localStorage.getItem(cfg.modelStorage)) || '') : '';
    const legacy = {
      'agnes-2.0-flash':'agnes-2.5-flash',
      'gemini-2.0-flash':'gemini-2.5-flash',
      'gemini-2.0-flash-lite':'gemini-2.5-flash-lite',
      'gpt-4o-mini':'gpt-5.6-luna'
    };
    return legacy[raw] || raw || cfg.defaultModel || '';
  }

  async function fetchProviderModels(cfg, apiKey, endpoint){
    const base = providerBaseUrl(cfg, endpoint);
    const url = endpoint && cfg.needsEndpoint ? (base + '/models') : (cfg.modelsEndpoint || (base + '/models'));
    if(!url) throw new Error('此服務沒有可用的模型清單端點，請直接輸入模型名稱。');
    const headers = { 'Content-Type':'application/json', 'Authorization':'Bearer '+apiKey };
    if(cfg === AI_PROVIDERS.claude){
      headers['x-api-key'] = apiKey;
      delete headers['Authorization'];
      headers['anthropic-version'] = '2023-06-01';
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
    }
    const resp = await aiFetch(url, { method:'GET', headers });
    if(!resp.ok) throw {status:resp.status};
    const data = await resp.json();
    const models = Array.isArray(data.data) ? data.data : (Array.isArray(data.models) ? data.models : []);
    return models.map(m=>m.id || m.name || m.model).filter(Boolean);
  }

  function modelFieldHtml(cfg, idPrefix){
    if(!cfg.needsModel) return '';
    const modelId = idPrefix+'Model';
    const listId = idPrefix+'ModelList';
    const btnId = idPrefix+'LoadModels';
    const statusId = idPrefix+'ModelStatus';
    return `<div class="field"><label>模型名稱</label><div class="ai-key-row" style="flex-wrap:wrap;">
      <input type="text" class="ai-model-input" id="${modelId}" list="${listId}" placeholder="模型名稱${cfg.defaultModel?'，預設：'+cfg.defaultModel:'，請輸入原廠目前可用模型'}" value="">
      <datalist id="${listId}"></datalist>
      ${cfg.modelsEndpoint ? `<button type="button" class="btn-mini" id="${btnId}">↻ 取得模型清單</button><span id="${statusId}" class="ai-qa-hint" style="margin:0;"></span>` : ''}
    </div></div>`;
  }

  function buildChartSummary(ctx){
    const {p, bazi, wuxing, shishen, dayun, ziwei, astro, name} = ctx;
    const P = bazi.pillars;
    const dayGan = P.day.gan, dayZhi = P.day.zhi;
    const total = Object.values(wuxing).reduce((a,b)=>a+b,0)||1;
    const wxSorted = Object.entries(wuxing).sort((a,b)=>b[1]-a[1]);
    const curDu = (dayun.dayunList||[]).find(d=>{
      // v10.5修正（缺失④）：改用精確實歲，取代「西曆年直接相減」的粗略算法（見getPreciseAgeInfo說明）。
      const nowAge = getPreciseAgeInfo(p).preciseAge;
      return nowAge>=parseFloat(d.startAge) && nowAge<parseFloat(d.endAge);
    });
    const sunSign = astro.Sun ? astro.Sun.sign : '未知（時辰未知）';
    const ziweiMing = ziwei ? (ziwei.palaces.find(x=>x.palaceName==='命宮')||{}).stars : null;
    let s = `姓名：${p.surname}${p.givenName}（${p.gender==='M'?'男':'女'}）\n`;
    s += `出生：國曆${p.y}/${p.m}/${p.d} ${p.unknownHour?'時辰未知':String(p.hh).padStart(2,'0')+':'+String(p.mm).padStart(2,'0')}\n`;
    s += `八字四柱：${P.year.gan}${P.year.zhi} ${P.month.gan}${P.month.zhi} ${P.day.gan}${P.day.zhi} ${p.unknownHour?'(時柱未知)':P.hour.gan+P.hour.zhi}\n`;
    s += `日主：${dayGan}（五行屬${GAN_WX[dayGan]}），命盤五行分布：${wxSorted.map(([k,v])=>`${k}${(v/total*100).toFixed(0)}%`).join('、')}\n`;
    if(curDu) s += `目前大運：${curDu.gan}${curDu.zhi}（約${curDu.startAge}~${curDu.endAge}歲）\n`;
    if(ziweiMing && ziweiMing.length) s += `紫微命宮主星：${ziweiMing.join('、')}\n`;
    s += `西洋太陽星座：${sunSign}\n`;
    if(name && name.error===false) s += `姓名學：三才配置「${name.sancai}」\n`;
    return s;
  }

  function renderAIQABlock(ctx, panel){
    const box = el(`<div class="ai-qa-box">
      <h3>🔮 AI白話追問（與命理老師深入對話）</h3>
      <p class="ai-qa-hint">請選擇你想使用的 AI 服務並輸入自己的 API Key，金鑰僅儲存在你目前使用的瀏覽器本機，並直接從你的瀏覽器送往該服務官方 API，不會經過本站或任何第三方伺服器。使用會依你選擇服務的用量計費，費用由你自己的帳戶負擔。<b style="color:var(--gold-soft);">請注意：每次提問時，你的姓名與精確出生年月日時等命盤資料也會一併包含在送出的內容中，請確認你信任所選 AI 服務的隱私權政策後再使用；若不希望姓名被傳送，可在上方表單先改用暱稱重新產生命盤。</b></p>
      <div class="ai-provider-row" id="aiProviderRow">
        ${Object.entries(AI_PROVIDERS).map(([key,cfg])=>`<button type="button" class="ai-provider-btn" data-provider="${key}">${cfg.label}</button>`).join('')}
      </div>
      <div id="aiProviderFields"></div>
      <div class="ai-quick-btns">
        <button type="button" class="btn-mini ai-quick" data-q="我現在的事業／工作發展方向適合怎麼走？有什麼要留意的？">💼 事業</button>
        <button type="button" class="btn-mini ai-quick" data-q="我的感情／婚姻運勢如何？現階段適合主動追求還是耐心等待？">💞 感情</button>
        <button type="button" class="btn-mini ai-quick" data-q="我的財運狀況如何？適合投資理財還是保守儲蓄？">💰 財運</button>
        <button type="button" class="btn-mini ai-quick" data-q="我目前大運走到哪個階段？這個階段整體要注意什麼？">🌙 大運</button>
        <button type="button" class="btn-mini ai-quick" data-q="根據我的命盤，日常生活有什麼具體的補運建議？">🍀 補運</button>
      </div>
      <div class="ai-chat-log" id="aiChatLog"></div>
      <div class="ai-input-row">
        <textarea id="aiUserInput" placeholder="輸入你想問命理老師的問題…（例如：我今年適合換工作嗎？）"></textarea>
        <button type="button" class="btn-primary" id="aiSendBtn" style="white-space:nowrap;">送出</button>
      </div>
    </div>`);
    panel.appendChild(box);

    const providerRow = box.querySelector('#aiProviderRow');
    const fieldsBox = box.querySelector('#aiProviderFields');
    const logEl = box.querySelector('#aiChatLog');
    const inputEl = box.querySelector('#aiUserInput');
    const sendBtn = box.querySelector('#aiSendBtn');
    const chartSummary = buildChartSummary(ctx);
    let chatHistory = []; // [{role,content}]
    let aiBusy = false;
    let currentProvider = localStorage.getItem(AI_PROVIDER_KEY) || 'claude';
    if(!AI_PROVIDERS[currentProvider]) currentProvider = 'claude';

    function renderProviderFields(){
      const cfg = AI_PROVIDERS[currentProvider];
      const savedKey = Obfuscate.decode(localStorage.getItem(cfg.keyStorage)) || '';
      const savedModel = getSavedProviderModel(cfg);
      const savedEndpoint = cfg.needsEndpoint ? (Obfuscate.decode(localStorage.getItem(cfg.endpointStorage)) || '') : '';
      fieldsBox.innerHTML = `
        <div class="field"><label>${cfg.keyLabel}</label>
          <div class="ai-key-row">
            <input type="password" id="aiApiKey" placeholder="${cfg.keyPlaceholder}" value="${escapeHtml(savedKey)}">
            <label><input type="checkbox" id="aiKeyRemember" ${savedKey?'checked':''}> 記住金鑰（本機儲存，已加入輕量混淆，仍建議公用電腦不要勾選）</label>
          </div>
        </div>
        ${cfg.needsEndpoint ? `<div class="field"><label>${cfg.endpointOptional?'Base URL（選填，留空使用官方端點）':'API 端點網址'}</label><div class="ai-key-row"><input type="text" class="ai-endpoint-input" id="aiEndpoint" placeholder="${cfg.endpointPlaceholder}" value="${escapeHtml(savedEndpoint)}"></div></div>` : ''}
        ${modelFieldHtml(cfg,'ai')}
        <p class="ai-qa-hint">${cfg.applyLink ? `尚未申請金鑰？前往 <a href="${cfg.applyLink}" target="_blank" rel="noopener">${cfg.applyName}</a> 申請。` : ''} ${cfg.note||''}</p>
      `;
      const aiModelEl = fieldsBox.querySelector('#aiModel');
      if(aiModelEl) aiModelEl.value = savedModel || cfg.defaultModel || '';
      const aiLoadBtn = fieldsBox.querySelector('#aiLoadModels');
      if(aiLoadBtn){
        aiLoadBtn.addEventListener('click', async ()=>{
          const statusEl = fieldsBox.querySelector('#aiModelStatus');
          const key = fieldsBox.querySelector('#aiApiKey').value.trim();
          const endpoint = fieldsBox.querySelector('#aiEndpoint')?.value.trim() || '';
          if(!key){ showFriendlyError(`請先輸入你的 ${cfg.keyLabel}。`, {focusEl: fieldsBox.querySelector('#aiApiKey')}); return; }
          aiLoadBtn.disabled = true; if(statusEl) statusEl.textContent='載入中…';
          try{
            const models = await fetchProviderModels(cfg, key, endpoint);
            const list = fieldsBox.querySelector('#aiModelList');
            list.innerHTML = models.map(id=>`<option value="${escapeHtml(id)}"></option>`).join('');
            if(statusEl) statusEl.textContent = `已載入 ${models.length} 個模型，可直接選擇或手動輸入新模型。`;
          }catch(err){
            console.error(err);
            if(statusEl) statusEl.textContent = '模型清單取得失敗，請直接輸入原廠模型名稱。';
          }finally{ aiLoadBtn.disabled=false; }
        });
      }
    }
    function setProvider(key){
      currentProvider = key;
      localStorage.setItem(AI_PROVIDER_KEY, key);
      providerRow.querySelectorAll('.ai-provider-btn').forEach(b=>b.classList.toggle('active', b.dataset.provider===key));
      renderProviderFields();
    }
    providerRow.querySelectorAll('.ai-provider-btn').forEach(b=>{
      b.addEventListener('click', ()=>setProvider(b.dataset.provider));
    });
    setProvider(currentProvider);

    function addMsg(role, text){
      const div = document.createElement('div');
      div.className = 'ai-msg ' + role;
      div.textContent = text;
      logEl.appendChild(div);
      logEl.scrollTop = logEl.scrollHeight;
      return div;
    }

    const SYSTEM_PROMPT = `你是一位溫暖親切、講話白話易懂的命理老師。以下是使用者的真實命盤資料（皆為天文演算法精算結果，非隨意編造），請根據這份資料回答使用者的問題，語氣自然、具體、有溫度，避免制式化的免責聲明堆疊，但如涉及重大人生決定（如辭職、投資、婚姻），可簡短提醒使用者仍需自行審慎評估。回答請用繁體中文，控制在300字以內，除非使用者要求更詳細。\n\n【命盤資料】\n${chartSummary}`;

    async function callClaude(apiKey, model){
      const resp = await aiFetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{
          'Content-Type':'application/json', 'x-api-key': apiKey,
          'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true',
        },
        body: JSON.stringify({ model, max_tokens:900, system:SYSTEM_PROMPT, messages:chatHistory }),
      });
      if(!resp.ok) throw {status:resp.status};
      const data = await resp.json();
      return (data.content||[]).map(b=>b.text||'').join('\n').trim();
    }
    async function callOpenAICompatible(url, apiKey, model){
      const resp = await aiFetch(url, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+apiKey },
        body: JSON.stringify({
          model, max_tokens:900,
          messages:[{role:'system', content:SYSTEM_PROMPT}, ...chatHistory],
        }),
      });
      if(!resp.ok) throw {status:resp.status};
      const data = await resp.json();
      if(data.choices && data.choices[0] && data.choices[0].message) return data.choices[0].message.content.trim();
      if(data.content) return typeof data.content==='string' ? data.content.trim() : JSON.stringify(data.content);
      return JSON.stringify(data).slice(0,500);
    }
    async function callGemini(apiKey, model){
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const resp = await aiFetch(url, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({
          system_instruction:{ parts:[{text:SYSTEM_PROMPT}] },
          contents: chatHistory.map(m=>({ role: m.role==='assistant'?'model':'user', parts:[{text:m.content}] })),
        }),
      });
      if(!resp.ok) throw {status:resp.status};
      const data = await resp.json();
      const parts = (((data.candidates||[])[0]||{}).content||{}).parts || [];
      return parts.map(p=>p.text||'').join('').trim();
    }

    async function sendQuestion(question){
      if(!question || !question.trim() || aiBusy) return;
      const providerKey = currentProvider;
      const cfg = AI_PROVIDERS[providerKey];
      const keyEl = fieldsBox.querySelector('#aiApiKey');
      const rememberEl = fieldsBox.querySelector('#aiKeyRemember');
      const modelEl = fieldsBox.querySelector('#aiModel');
      const endpointEl = fieldsBox.querySelector('#aiEndpoint');
      const apiKey = keyEl.value.trim();
      if(!apiKey){ showFriendlyError(`請先輸入你的 ${cfg.keyLabel}。`, {focusEl: keyEl}); return; }
      const model = modelEl ? (modelEl.value.trim() || cfg.defaultModel) : cfg.defaultModel;
      const endpoint = endpointEl ? endpointEl.value.trim() : '';
      if(cfg.needsEndpoint && !cfg.endpointOptional && !endpoint){ showFriendlyError('請先輸入 API 端點網址。', {focusEl: endpointEl}); return; }

      if(rememberEl.checked){
        localStorage.setItem(cfg.keyStorage, Obfuscate.encode(apiKey));
        if(cfg.modelStorage) localStorage.setItem(cfg.modelStorage, Obfuscate.encode(model));
        if(cfg.endpointStorage) localStorage.setItem(cfg.endpointStorage, Obfuscate.encode(endpoint));
      }else{
        localStorage.removeItem(cfg.keyStorage);
      }

      addMsg('user', question);
      chatHistory.push({role:'user', content:question});
      inputEl.value = '';
      sendBtn.disabled = true;
      aiBusy = true;
      const thinkingEl = addMsg('assistant', '命理老師正在為你推算中…');

      try{
        let text;
        if(cfg.needsModel && !model){
          throw {configError:true, message:'請輸入模型名稱，或先按「取得模型清單」選擇目前可用模型。'};
        }
        if(providerKey==='claude') text = await callClaude(apiKey, model);
        else if(providerKey==='gemini') text = await callGemini(apiKey, model);
        else {
          const baseUrl = providerBaseUrl(cfg, endpoint);
          if(!baseUrl) throw {configError:true, message:'此服務缺少 API 端點設定。'};
          text = await callOpenAICompatible(baseUrl+'/chat/completions', apiKey, model);
        }
        text = (text||'').trim() || '（沒有取得回應內容）';
        thinkingEl.remove();
        addMsg('assistant', text);
        chatHistory.push({role:'assistant', content:text});
        if(chatHistory.length>12) chatHistory = chatHistory.slice(-12);
      }catch(err){
        console.error(err);
        thinkingEl.remove();
        let msg = `${cfg.label} 連線發生錯誤。`;
        const status = err && err.status;
        if(err && err.configError) msg = err.message;
        else if(err && err.code==='AI_DAILY_LIMIT') msg = '今日 AI 安全請求額度已達 49 次，為避免觸發原廠限制，今天不再送出新的 AI 請求。';
        else if(err && err.code==='AI_QUEUE_TIMEOUT') msg = '目前 AI 請求量較高，等待時間過長，為避免重複送出請求，這次先停止，請稍後再試。';
        else if(status===401||status===403) msg = 'API Key 無效、過期，或沒有權限，請確認金鑰是否正確。';
        else if(status===429) msg = 'API 請求過於頻繁或額度已用完，系統已啟用安全控速，請稍後再試。';
        else if(status===408) msg = 'AI 服務回應逾時，請稍後再試或更換模型。';
        else if(status) msg = `${cfg.label} API 回應錯誤（狀態碼 ${status}）。`;
        else msg = `連線失敗，可能是網路問題，或瀏覽器封鎖了對 ${cfg.label} 服務的直接請求。若持續失敗，請確認金鑰／端點設定是否正確，或改用其他網路環境再試一次。`;
        addMsg('error', msg);
        chatHistory.pop();
      }finally{
        aiBusy = false;
        sendBtn.disabled = false;
      }
    }

    sendBtn.addEventListener('click', ()=>sendQuestion(inputEl.value));
    inputEl.addEventListener('keydown', (e)=>{
      if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendQuestion(inputEl.value); }
    });
    box.querySelectorAll('.ai-quick').forEach(b=>{
      b.addEventListener('click', ()=>sendQuestion(b.dataset.q));
    });
  }

  // ---------- 合盤比對（雙人相性比較：八字日主生剋／地支合沖／姻緣星互見／西洋星座元素配對） ----------
  const WX_SHENG = {'木':'火','火':'土','土':'金','金':'水','水':'木'}; // 五行相生
  const WX_KE = {'木':'土','土':'水','水':'火','火':'金','金':'木'};     // 五行相剋
  const ZODIAC_GROUP = {
    '牡羊座':'火','獅子座':'火','射手座':'火',
    '金牛座':'土','處女座':'土','摩羯座':'土',
    '雙子座':'風','天秤座':'風','水瓶座':'風',
    '巨蟹座':'水','天蠍座':'水','雙魚座':'水',
  };
  const ZODIAC_GROUP_NAME = {'火':'火象星座','土':'土象星座','風':'風象星座','水':'水象星座'};

  // v5.6更新：原五行/地支/姻緣星/星座四項評分之「負面組合」下限偏高（理論最低分約34分），
  // 導致命盤角度明顯不合的兩人仍會顯示3字頭以上分數、與0~100分視覺呈現的直覺不符。
  // 此處調降各負面情境（相剋、六沖、姻緣星皆未互見、元素相對）的最低分，讓總分能實際涵蓋更寬的區間。
  function compatWxRelation(wxA, wxB){
    if(wxA===wxB) return {type:'same', text:`雙方日主同屬「${wxA}」，個性、價值觀與做事節奏容易相近，相處起來很有共鳴，但也要留意「太像」有時反而少了互補與新鮮感，遇到意見不合時容易兩人都很堅持。`, score:20};
    if(WX_SHENG[wxA]===wxB) return {type:'sheng', text:`甲方五行「${wxA}」生乙方五行「${wxB}」，甲方會不自覺地照顧、支持乙方，是很自然的付出型關係，乙方也容易從甲方身上獲得資源與安全感。`, score:30};
    if(WX_SHENG[wxB]===wxA) return {type:'sheng', text:`乙方五行「${wxB}」生甲方五行「${wxA}」，乙方會不自覺地照顧、支持甲方，是很自然的付出型關係，甲方也容易從乙方身上獲得資源與安全感。`, score:30};
    if(WX_KE[wxA]===wxB) return {type:'ke', text:`甲方五行「${wxA}」剋乙方五行「${wxB}」，這段關係中甲方個性或做事風格容易對乙方形成較強的主導與約束，需要雙方有意識地磨合、多站在對方角度溝通，才能把「剋」轉化為「互相成就」。`, score:5};
    if(WX_KE[wxB]===wxA) return {type:'ke', text:`乙方五行「${wxB}」剋甲方五行「${wxA}」，這段關係中乙方個性或做事風格容易對甲方形成較強的主導與約束，需要雙方有意識地磨合、多站在對方角度溝通，才能把「剋」轉化為「互相成就」。`, score:5};
    return {type:'neutral', text:'兩人五行關係較中性。', score:14};
  }

  function compatZhiRelation(zhiA, zhiB, ganA, ganB){
    const notes = []; let score = 10;
    if(LIUHE_MAP[zhiA]===zhiB){ notes.push(`日支「${zhiA}」與「${zhiB}」為六合關係，代表兩人在日常相處、生活步調上容易一拍即合，是傳統命理中相當受重視的正緣訊號之一。`); score = 25; }
    if(CLASH_MAP[zhiA]===zhiB){ notes.push(`日支「${zhiA}」與「${zhiB}」為六沖關係，代表兩人個性、生活習慣或價值觀差異較大，相處中比較容易有摩擦與拉扯，需要更多耐心溝通與包容，但沖也常帶來強烈的吸引力，不代表不能長久，端看雙方是否願意花心力經營。`); score = 2; }
    if(isGanHe(ganA, ganB)){ notes.push(`日干「${ganA}」與「${ganB}」天干相合，兩人的核心個性容易互相吸引、彼此欣賞，是很好的情感基礎。`); score = Math.max(score, 22); }
    if(notes.length===0) notes.push('兩人日柱地支之間沒有出現明顯的合或沖關係，屬於平穩中性，相性好壞主要取決於後天相處與經營。');
    return {text: notes.join(' '), score};
  }

  function compatSpouseStar(dayGanA, dayGanB, genderA, genderB){
    const spouseStarsFor = g => g==='M' ? ['正財','偏財'] : ['正官','七殺'];
    const aSeesB = B.getShishen(dayGanA, dayGanB);
    const bSeesA = B.getShishen(dayGanB, dayGanA);
    const aHit = spouseStarsFor(genderA).includes(aSeesB);
    const bHit = spouseStarsFor(genderB).includes(bSeesA);
    let text, score;
    if(aHit && bHit){ text = `雙方互為對方的姻緣星（甲方見乙方為「${aSeesB}」，乙方見甲方為「${bSeesA}」），這是八字合婚中相當理想的雙向互見格局，代表兩人天生容易被彼此吸引，也容易走入穩定關係。`; score = 20; }
    else if(aHit || bHit){ const who = aHit ? '甲方見乙方' : '乙方見甲方'; const star = aHit ? aSeesB : bSeesA; text = `${who}為「${star}」，屬於單向的姻緣星互見，代表其中一方對另一方會有明顯的吸引與在意，另一方則需要更多時間與相處才能加深感情，關係可以走得穩，但需要多一點主動經營。`; score = 10; }
    else{ text = `雙方日干十神關係中沒有出現典型的姻緣星互見，這不代表沒有緣分，只是這段關係比較不是「一見鍾情」型，更需要靠共同經歷、時間累積來培養感情。`; score = 2; }
    return {text, score};
  }

  function compatZodiac(signA, signB){
    if(!signA || !signB || signA.startsWith('未知') || signB.startsWith('未知')){
      return {text:'其中一方時辰未知或無法精算太陽星座，此項比對僅供參考。', score:12};
    }
    const gA = ZODIAC_GROUP[signA], gB = ZODIAC_GROUP[signB];
    if(gA===gB) return {text:`雙方同屬「${ZODIAC_GROUP_NAME[gA]}」（${signA}、${signB}），彼此的價值觀、生活步調與能量頻率非常接近，相處起來很有默契，也容易一起玩、一起衝，是同頻共振型的組合。`, score:25};
    const complementary = (gA==='火'&&gB==='風')||(gA==='風'&&gB==='火')||(gA==='土'&&gB==='水')||(gA==='水'&&gB==='土');
    if(complementary) return {text:`「${signA}」與「${signB}」在西洋占星傳統分類中屬於互補元素組合，一方帶來熱情或行動力，另一方提供穩定或深度支持，是公認相性不錯、容易互相加分的搭配。`, score:20};
    const opposing = (gA==='火'&&gB==='水')||(gA==='水'&&gB==='火')||(gA==='土'&&gB==='風')||(gA==='風'&&gB==='土');
    if(opposing) return {text:`「${signA}」與「${signB}」元素屬性相對，一方重視感受與直覺，另一方重視邏輯與規則，初期較容易因價值觀差異產生摩擦，但只要願意理解對方的表達方式，反而能學到很多自己缺乏的特質。`, score:3};
    return {text:`「${signA}」與「${signB}」屬於中性搭配，相性好壞主要取決於雙方性格與相處磨合，星座僅供輔助參考。`, score:12};
  }

  // ---------- v7.6新增：手相面相分析（上傳照片，呼叫使用者自帶金鑰之視覺辨識AI，依傳統面相／手相學給白話事業財運參考） ----------
  // 重要設計原則（請保留，勿隨意刪除）：
  // 1. 本功能定位為「使用者對自己的娛樂性自我覺察」，UI文案與AI系統提示皆明確引導僅上傳本人照片，
  //    不鼓勵、不設計任何「評估他人（求職者／生意夥伴／下屬）」的使用情境——用外貌特徵評斷他人能力或品格
  //    不僅無科學依據，也可能構成不公平的差別待遇，這是面相學／手相學類功能需要特別謹慎之處。
  // 2. AI系統提示明確要求：不做人品／誠信／智力等負面論斷、不做健康疾病壽命判斷，全程以「傳統面相學認為…」
  //    語氣呈現，清楚定位為民俗文化參考而非科學結論。
  const PALMFACE_VISION_NOTE = {
    claude:true, openai:true, gemini:true, agnes:null, nvidia:null, groq:null, openrouter:null, mistral:null,
  };
  // ================= v8.6合併自v7.9.7：團隊相容性分析／企業擇日／行銷個人化引擎 =================
  function bizShishenRelation(dayGanA, dayGanB){
    const roleText = {
      '比肩':'夥伴同質型：想法與行事風格相近，溝通門檻低、決策速度快，但也容易在資源與話語權上互相競爭，建議及早明確劃分職責範圍。',
      '劫財':'夥伴同質型：想法與行事風格相近，溝通門檻低、決策速度快，但也容易在資源與話語權上互相競爭，建議及早明確劃分職責範圍。',
      '食神':'創意互補型：容易互相激盪出新想法與新做法，適合共同開發新產品或新事業線。',
      '傷官':'創意互補型：容易互相激盪出新想法與新做法，適合共同開發新產品或新事業線，惟需留意雙方是否都能接受直言不諱的溝通風格。',
      '正財':'資源互補型：一方重穩健執行、一方帶來資源或機會，適合分別擔任財務／營運與業務／開發角色。',
      '偏財':'資源互補型：一方重穩健執行、一方帶來資源或機會，適合分別擔任財務／營運與業務／開發角色。',
      '正官':'權責分明型：適合有明確上下屬關係或分工界線的合作模式，需留意權力是否平衡，避免單方過度主導。',
      '七殺':'權責分明型：適合有明確上下屬關係或分工界線的合作模式，需留意權力是否平衡，避免單方過度主導。',
      '正印':'支持信任型：容易互相支援、傳承經驗與資源，適合導師型或資深帶新人的合作關係。',
      '偏印':'支持信任型：容易互相支援、傳承經驗與資源，適合導師型或資深帶新人的合作關係，但也要留意想法是否過於相近而缺乏挑戰意見的聲音。',
    };
    if(dayGanA===dayGanB){
      return {text:'雙方日主天干完全相同，行事直覺與價值觀高度一致，合作起來默契十足，但決策時也容易「盲點相同」，建議刻意引入第三方觀點以平衡團隊視野。', score:14};
    }
    const aSeesB = B.getShishen(dayGanA, dayGanB);
    const bSeesA = B.getShishen(dayGanB, dayGanA);
    const t1 = roleText[aSeesB], t2 = roleText[bSeesA];
    if(t1 && t2 && t1===t2) return {text:t1, score:20};
    if(t1 || t2) return {text:t1 || t2, score:12};
    return {text:'雙方十神關係中性，合作模式較不落入特定典型，實際搭配效果取決於雙方共事經驗與默契培養。', score:8};
  }

  const BIZ_ROLE_BY_WX = {
    '木':{role:'開創型／業務拓展', desc:'行動力強、敢於嘗試新方向，適合擔任業務開發、新事業拓展的角色。'},
    '火':{role:'行銷公關型', desc:'表達力強、感染力足，適合擔任對外溝通、行銷公關、團隊士氣帶動的角色。'},
    '土':{role:'營運後勤型', desc:'穩健踏實、重視流程，適合擔任營運管理、內部協調、後勤支援的角色。'},
    '金':{role:'財務執行型', desc:'重紀律、講求效率與準確，適合擔任財務把關、專案執行、品質控管的角色。'},
    '水':{role:'策略研發型', desc:'思考靈活、善於布局，適合擔任策略規劃、研發創新、風險評估的角色。'},
  };

  function teamScoreTier(score){
    if(score>=65) return {label:'高度互補', color:'var(--jade-soft)'};
    if(score>=40) return {label:'中性偏穩', color:'var(--gold-soft)'};
    return {label:'需要磨合', color:'var(--crimson-soft)'};
  }

  function renderTeamCompatTab(ctx){
    const panel = document.getElementById('panel-teamcompat');
    if(!panel) return;
    panel.innerHTML = '';

    const members = [
      { name: `${ctx.p.surname}${ctx.p.givenName}（你）`, gender: ctx.p.gender,
        date:`${ctx.p.y}-${String(ctx.p.m).padStart(2,'0')}-${String(ctx.p.d).padStart(2,'0')}`,
        time: ctx.p.unknownHour?'':`${String(ctx.p.hh).padStart(2,'0')}:${String(ctx.p.mm).padStart(2,'0')}`,
        unknownHour: ctx.p.unknownHour, locked:true },
    ];

    const box = el(`<div class="ai-qa-box">
      <h3>👥 團隊相容性分析（創投盡職調查／企業合夥決策參考）</h3>
      <p class="ai-qa-hint">
        輸入團隊成員（合夥人、董事會成員、核心主管）的出生資料，系統會即時演算每一位成員的八字日主與西洋太陽星座，並逐一比對「兩兩配對」的五行生剋、地支合沖、十神商業關係與星座元素契合度，產出<b style="color:var(--gold-soft);">團隊相容性矩陣</b>與<b style="color:var(--gold-soft);">個人商業角色建議</b>。
        <br><br>
        <b style="color:var(--crimson-soft);">重要提醒：</b>本功能是傳統命理學的規則化簡化演算，<b>並非科學或心理測評工具</b>，不應作為聘僱、晉升或其他影響個人權益決策的唯一或主要依據；請務必以能力、經歷、實際合作表現與正式盡職查核為準，本分析僅供團隊溝通與自我覺察的輔助參考。輸入他人資料前，請先取得對方同意。
      </p>
      <div id="teamMemberList"></div>
      <button type="button" class="btn-mini" id="teamAddMemberBtn">➕ 新增成員</button>
      <button type="button" class="btn-primary" id="teamAnalyzeBtn" style="margin-left:10px;">產生團隊相容性分析</button>
      <div id="teamCompatResult"></div>
    </div>`);
    panel.appendChild(box);

    const listEl = box.querySelector('#teamMemberList');
    const resultEl = box.querySelector('#teamCompatResult');
    const MAX_MEMBERS = 8;

    function memberRowHtml(idx, m){
      return `<div class="team-member-row" data-idx="${idx}">
        <div class="field"><label>姓名</label><input type="text" class="tm-name" value="${escapeHtml(m.name||'')}" ${m.locked?'readonly':''} placeholder="成員姓名或代號"></div>
        <div class="field">
          <label>性別</label>
          <div class="radio-row">
            <label class="radio-pill ${m.gender==='M'?'active':''}"><input type="radio" name="tmGender${idx}" value="M" ${m.gender==='M'?'checked':''} ${m.locked?'disabled':''}>男</label>
            <label class="radio-pill ${m.gender==='F'?'active':''}"><input type="radio" name="tmGender${idx}" value="F" ${m.gender==='F'?'checked':''} ${m.locked?'disabled':''}>女</label>
          </div>
        </div>
        <div class="field"><label>出生日期</label><input type="date" class="tm-date" value="${m.date||''}" ${m.locked?'disabled':''}></div>
        <div class="field"><label>出生時間（未知可留空）</label><input type="time" class="tm-time" value="${m.time||''}" ${m.locked?'disabled':''}></div>
        ${m.locked ? '' : `<button type="button" class="btn-mini danger tm-remove" data-idx="${idx}">🗑️ 移除</button>`}
      </div>`;
    }

    function renderMemberList(){
      listEl.innerHTML = members.map((m,i)=>memberRowHtml(i,m)).join('');
      listEl.querySelectorAll('.tm-remove').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          members.splice(parseInt(btn.dataset.idx,10),1);
          renderMemberList();
        });
      });
      listEl.querySelectorAll('.radio-pill').forEach(pill=>{
        pill.addEventListener('click', ()=>{
          const row = pill.closest('.team-member-row');
          row.querySelectorAll('.radio-pill').forEach(p=>p.classList.remove('active'));
          pill.classList.add('active');
        });
      });
    }
    renderMemberList();

    box.querySelector('#teamAddMemberBtn').addEventListener('click', ()=>{
      if(members.length >= MAX_MEMBERS){ showFriendlyError(`為維持矩陣可讀性，單次最多支援 ${MAX_MEMBERS} 位成員。`); return; }
      members.push({name:'', gender:'M', date:'', time:'', locked:false});
      renderMemberList();
    });

    box.querySelector('#teamAnalyzeBtn').addEventListener('click', ()=>{
      const rows = Array.from(listEl.querySelectorAll('.team-member-row'));
      const inputData = [];
      for(const row of rows){
        const idx = parseInt(row.dataset.idx,10);
        const locked = members[idx].locked;
        let name, gender, dateVal, timeVal, unknownHour;
        if(locked){
          name = members[0].name; gender = members[0].gender; dateVal = members[0].date; timeVal = members[0].time; unknownHour = members[0].unknownHour;
        }else{
          name = row.querySelector('.tm-name').value.trim() || `成員${idx+1}`;
          const genderEl = row.querySelector('input[type=radio]:checked');
          gender = genderEl ? genderEl.value : 'M';
          dateVal = row.querySelector('.tm-date').value;
          timeVal = row.querySelector('.tm-time').value;
          unknownHour = !timeVal;
        }
        inputData.push({idx, name, gender, dateVal, timeVal, unknownHour});
      }

      if(inputData.length < 2){ showFriendlyError('請至少輸入 2 位成員的出生資料，才能進行相容性比對。'); return; }

      const computed = [];
      for(const m of inputData){
        const check = validateDateInput(m.dateVal, {who:`「${m.name}」的`});
        if(!check.ok){ showFriendlyError(check.message); return; }
        const {y,m:mm,d} = check;
        let hh=12, min=0;
        if(!m.unknownHour){
          const parts = (m.timeVal||'12:00').split(':').map(Number);
          if(Number.isFinite(parts[0]) && Number.isFinite(parts[1])){ hh=parts[0]; min=parts[1]; }
        }
        try{
          const tzOffset = 8;
          const baziInput = {year:y,month:mm,day:d,hour:hh,minute:min,tzOffset,longitude:121.5,useTrueSolarTime:false};
          const bazi = B.computeFourPillars(baziInput);
          const wuxing = B.wuxingScore(bazi.pillars);
          const jdUT = A.toJD(y,mm,d,(hh+min/60)-tzOffset);
          const astro = AC.computeChart(jdUT);
          computed.push({
            name:m.name, gender:m.gender, unknownHour:m.unknownHour,
            dayGan:bazi.pillars.day.gan, dayZhi:bazi.pillars.day.zhi,
            dayGanWx: GAN_WX[bazi.pillars.day.gan],
            sign: astro.Sun ? astro.Sun.sign : null,
            wuxing,
          });
        }catch(err){
          console.error(err);
          showFriendlyError(`「${m.name}」的命盤計算發生錯誤，請確認出生日期是否正確。`);
          return;
        }
      }

      const pairs = [];
      for(let i=0;i<computed.length;i++){
        for(let j=i+1;j<computed.length;j++){
          const A_ = computed[i], B_ = computed[j];
          const wxRel = compatWxRelation(A_.dayGanWx, B_.dayGanWx);
          const zhiRel = compatZhiRelation(A_.dayZhi, B_.dayZhi, A_.dayGan, B_.dayGan);
          const bizRel = bizShishenRelation(A_.dayGan, B_.dayGan);
          const zodiacRel = compatZodiac(A_.sign, B_.sign);
          const score = Math.max(0, Math.min(100, Math.round(wxRel.score + zhiRel.score + bizRel.score + zodiacRel.score)));
          pairs.push({ i, j, nameA:A_.name, nameB:B_.name, score, wxRel, zhiRel, bizRel, zodiacRel,
            dayGanA:A_.dayGan, dayZhiA:A_.dayZhi, dayGanB:B_.dayGan, dayZhiB:B_.dayZhi });
        }
      }
      pairs.sort((a,b)=>b.score-a.score);
      renderTeamCompatResult(resultEl, computed, pairs);
    });
  }

  function renderTeamCompatResult(resultEl, members, pairs){
    let matrixHtml = `<h3 style="margin:20px 0 10px;">🧩 團隊相容性矩陣</h3>
      <div style="overflow-x:auto;"><table class="data-table team-matrix">
        <tr><th></th>${members.map(m=>`<th>${escapeHtml(m.name)}</th>`).join('')}</tr>
        ${members.map((rowM,i)=>`<tr><th>${escapeHtml(rowM.name)}</th>${members.map((colM,j)=>{
          if(i===j) return `<td class="team-cell-self">—</td>`;
          const pair = pairs.find(p=>(p.i===i&&p.j===j)||(p.i===j&&p.j===i));
          const tier = teamScoreTier(pair.score);
          return `<td class="team-cell" style="background:${tier.color};">${pair.score}</td>`;
        }).join('')}</tr>`).join('')}
      </table></div>`;

    const topPairs = pairs.slice(0,3);
    const riskPairs = [...pairs].sort((a,b)=>a.score-b.score).slice(0,3);
    let pairDetailHtml = `<h3 style="margin:22px 0 10px;">🌟 天生互補的組合</h3>`;
    topPairs.forEach(p=>{
      const dyn = computeRelationshipDynamics(p.dayGanA, p.dayZhiA, p.dayGanB, p.dayZhiB, p.wxRel.type, escapeHtml(p.nameA), escapeHtml(p.nameB));
      pairDetailHtml += `<div class="panel-error-card" style="border-color:var(--jade-soft);background:rgba(127,172,154,0.08);margin-bottom:10px;">
        <b style="color:var(--jade-soft);">${escapeHtml(p.nameA)} × ${escapeHtml(p.nameB)}　${p.score}／100</b><br>
        <span style="font-size:14px;">${p.wxRel.text}</span><br>
        <span style="font-size:14px;">${p.bizRel.text}</span><br>
        <span style="font-size:14px;color:var(--gold-soft);">🧩 分工建議：${dyn.divideText}</span>
      </div>`;
    });
    pairDetailHtml += `<h3 style="margin:22px 0 10px;">⚠️ 較需要磨合的組合</h3>`;
    riskPairs.forEach(p=>{
      const dyn = computeRelationshipDynamics(p.dayGanA, p.dayZhiA, p.dayGanB, p.dayZhiB, p.wxRel.type, escapeHtml(p.nameA), escapeHtml(p.nameB));
      pairDetailHtml += `<div class="panel-error-card" style="margin-bottom:10px;">
        <b>${escapeHtml(p.nameA)} × ${escapeHtml(p.nameB)}　${p.score}／100</b><br>
        <span style="font-size:14px;">${p.wxRel.text}</span><br>
        <span style="font-size:14px;">${p.zhiRel.text}</span><br>
        <span style="font-size:14px;color:var(--crimson-soft);">⚡ 衝突觸發點：${dyn.triggerText}</span>
      </div>`;
    });

    let roleHtml = `<h3 style="margin:22px 0 10px;">🧭 個人商業角色建議（依日主五行）</h3><table class="data-table"><tr><th>成員</th><th>日主五行</th><th>建議角色</th><th>說明</th></tr>`;
    members.forEach(m=>{
      const roleInfo = BIZ_ROLE_BY_WX[m.dayGanWx] || {role:'—',desc:''};
      roleHtml += `<tr><td>${escapeHtml(m.name)}</td><td>${m.dayGanWx}</td><td>${roleInfo.role}</td><td style="font-size:14px;">${roleInfo.desc}</td></tr>`;
    });
    roleHtml += `</table>`;

    const disclaimer = `<div class="disclaimer" style="margin-top:18px;">
      <b>演算方法與使用限制說明：</b>本矩陣之相容性分數，由每位成員的真實出生資料即時演算八字日主、地支與西洋太陽星座後，兩兩比對五行生剋、地支合沖、十神商業關係與星座元素契合度綜合換算而成，屬傳統命理學規則化簡化演算，並非心理測評、人格鑑定或科學驗證之團隊效能預測工具。分數僅反映「命盤角度的相對契合程度」，不代表實際合作成敗，團隊合作成果終究取決於溝通、共同目標與實際執行。<b style="color:var(--crimson-soft);">請勿將本分析作為聘僱、晉升、股權分配或其他影響他人權益重大決策的依據</b>，正式的合夥與人事決策，仍應以能力、經歷、實際合作經驗與正式盡職查核為準。
    </div>`;

    resultEl.innerHTML = matrixHtml + pairDetailHtml + roleHtml + disclaimer;
  }

  // ============================================================
  // v7.9.7新增：② 企業擇日（多位關鍵利害關係人共同吉日篩選，適合簽約／發布會／開幕等企業場合）
  // ============================================================
  function renderBizZeriTab(ctx){
    const panel = document.getElementById('panel-bizzeri');
    if(!panel) return;
    // v10.6修正（缺失⑦）：補上今天日期，供下方「起算日期」欄位設定預設值與最小可選日期。
    const today = todayInfo();
    const defaultDateStr = `${today.y}-${String(today.m).padStart(2,'0')}-${String(today.d).padStart(2,'0')}`;
    panel.innerHTML = '';

    const stakeholders = [
      { name: `${ctx.p.surname}${ctx.p.givenName}（你）`, date:`${ctx.p.y}-${String(ctx.p.m).padStart(2,'0')}-${String(ctx.p.d).padStart(2,'0')}`, locked:true },
    ];

    const box = el(`<div class="ai-qa-box">
      <h3>🏢 企業擇日（多位關鍵人物共同吉日篩選）</h3>
      <p class="ai-qa-hint">
        企業重大決策（簽約、開幕、發布會、上市掛牌等）往往涉及不只一位關鍵人物。本功能會針對你輸入的<b style="color:var(--gold-soft);">每一位關鍵人物</b>分別演算其八字日主，並在指定的日期區間內，找出「對全體關鍵人物都相對有利、且沒有人明顯沖剋」的共同吉日，而非只以單一人的命盤為準。
      </p>
      <div id="bizMemberList"></div>
      <button type="button" class="btn-mini" id="bizAddMemberBtn">➕ 新增關鍵人物</button>
      <div class="form-grid" style="margin-top:16px;">
        <div class="field"><label for="bizEventType">事項類型</label>
          <select id="bizEventType">
            <option value="open">開業／簽約</option>
            <option value="general">一般吉日／諸事皆宜</option>
            <option value="move">搬家／入宅（新辦公室）</option>
            <option value="travel">出行／遠行（出差／考察）</option>
          </select>
        </div>
        <div class="field"><label for="bizStartDate">起算日期</label><input type="date" id="bizStartDate" value="${defaultDateStr}" min="${defaultDateStr}"></div>
        <div class="field"><label for="bizRangeDays">查詢天數</label><input type="number" id="bizRangeDays" value="60" min="7" max="180"></div>
      </div>
      <button type="button" class="btn-primary" id="bizAnalyzeBtn">開始分析共同吉日</button>
      <div id="bizZeriResult"></div>
    </div>`);
    panel.appendChild(box);

    const listEl = box.querySelector('#bizMemberList');
    const resultEl = box.querySelector('#bizZeriResult');
    const MAX_MEMBERS = 6;

    function rowHtml(idx, m){
      return `<div class="team-member-row" data-idx="${idx}">
        <div class="field"><label>姓名／職稱</label><input type="text" class="bz-name" value="${escapeHtml(m.name||'')}" ${m.locked?'readonly':''} placeholder="例：財務長"></div>
        <div class="field"><label>出生日期</label><input type="date" class="bz-date" value="${m.date||''}" ${m.locked?'disabled':''}></div>
        ${m.locked ? '' : `<button type="button" class="btn-mini danger bz-remove" data-idx="${idx}">🗑️ 移除</button>`}
      </div>`;
    }
    function renderList(){
      listEl.innerHTML = stakeholders.map((m,i)=>rowHtml(i,m)).join('');
      listEl.querySelectorAll('.bz-remove').forEach(btn=>{
        btn.addEventListener('click', ()=>{ stakeholders.splice(parseInt(btn.dataset.idx,10),1); renderList(); });
      });
    }
    renderList();
    box.querySelector('#bizAddMemberBtn').addEventListener('click', ()=>{
      if(stakeholders.length>=MAX_MEMBERS){ showFriendlyError(`單次最多支援 ${MAX_MEMBERS} 位關鍵人物。`); return; }
      stakeholders.push({name:'', date:'', locked:false});
      renderList();
    });

    box.querySelector('#bizAnalyzeBtn').addEventListener('click', ()=>{
      const rows = Array.from(listEl.querySelectorAll('.team-member-row'));
      const people = [];
      for(const row of rows){
        const idx = parseInt(row.dataset.idx,10);
        const locked = stakeholders[idx].locked;
        const name = locked ? stakeholders[0].name : (row.querySelector('.bz-name').value.trim() || `關鍵人物${idx+1}`);
        const dateVal = locked ? stakeholders[0].date : row.querySelector('.bz-date').value;
        people.push({name, dateVal});
      }
      if(people.length < 1){ showFriendlyError('請至少輸入 1 位關鍵人物的出生資料。'); return; }

      const eventType = box.querySelector('#bizEventType').value;
      const startVal = box.querySelector('#bizStartDate').value;
      const rangeDays = parseInt(box.querySelector('#bizRangeDays').value,10) || 60;
      const startCheck = validateNotPastDate(startVal, {who:'起算'});
      if(!startCheck.ok){ showFriendlyError(startCheck.message); return; }
      const {y:sy, m:sm, d:sd} = startCheck;

      const peopleBazi = [];
      for(const p of people){
        const check = validateDateInput(p.dateVal, {who:`「${p.name}」的`});
        if(!check.ok){ showFriendlyError(check.message); return; }
        const {y,m,d} = check;
        try{
          const bazi = B.computeFourPillars({year:y,month:m,day:d,hour:12,minute:0,tzOffset:8,longitude:121.5,useTrueSolarTime:false});
          peopleBazi.push({name:p.name, dayGan:bazi.pillars.day.gan, dayZhi:bazi.pillars.day.zhi});
        }catch(err){
          console.error(err);
          showFriendlyError(`「${p.name}」的命盤計算發生錯誤，請確認出生日期是否正確。`);
          return;
        }
      }

      runBizZeriAnalysis(resultEl, eventType, sy, sm, sd, rangeDays, peopleBazi);
    });
  }

  function runBizZeriAnalysis(resultEl, eventType, sy, sm, sd, rangeDays, peopleBazi){
    const startMs = Date.UTC(sy, sm-1, sd);
    const rows = [];
    for(let i=0;i<rangeDays;i++){
      const dt = new Date(startMs + i*86400000);
      const y = dt.getUTCFullYear(), m = dt.getUTCMonth()+1, d = dt.getUTCDate();
      let gz;
      try{ gz = B.idxToGZ(B.ganzhiIndex(y,m,d)); }catch(e){ continue; }
      const dayGanX = gz.gan, dayZhiX = gz.zhi;
      const perPerson = peopleBazi.map(p=>{
        const shishenX = dayGanX===p.dayGan ? '日主' : B.getShishen(p.dayGan, dayGanX);
        const { score, tags } = zeriEventScore(eventType, p.dayGan, p.dayZhi, dayGanX, dayZhiX, shishenX);
        return { name:p.name, score, tags };
      });
      const minScore = Math.min(...perPerson.map(p=>p.score));
      const avgScore = perPerson.reduce((a,p)=>a+p.score,0) / perPerson.length;
      const warnPeople = perPerson.filter(p=>p.tags.some(t=>['沖日支','刑日支','害日支'].includes(t))).map(p=>p.name);
      const wd = ['日','一','二','三','四','五','六'][dt.getUTCDay()];
      // v9.8.3新增：彭祖百忌——日期本身的通用禁忌（不分人員，適用當天所有人），與個人沖剋分開標示
      const pengzuHit = pengzuEventHit(dayGanX, dayZhiX, eventType);
      rows.push({ y,m,d,wd, gan:dayGanX, zhi:dayZhiX, minScore, avgScore, warnPeople, tier: zeriTierOf(minScore), pengzuHit });
    }

    const top = [...rows].filter(r=>r.warnPeople.length===0 && r.minScore>=0 && !r.pengzuHit).sort((a,b)=>b.avgScore-a.avgScore).slice(0,10);

    let html = `<div class="decade-summary" style="margin-bottom:16px;">以「${ZERI_EVENT_LABEL[eventType]}」為事項類型，針對 ${peopleBazi.length} 位關鍵人物，掃描 ${sy}/${sm}/${sd} 起共 ${rangeDays} 天，逐日取得真實日柱干支後，分別演算每位關鍵人物的個人吉凶評分，取「全體最低分（木桶原則）」與「平均分」綜合判斷，確保推薦日期不會只對其中一人有利、卻對其他關鍵人物形成沖剋。</div>`;

    if(top.length===0){
      html += `<div class="error-box">此區間內找不到「所有關鍵人物皆無明顯沖剋」的日子，建議放寬查詢區間，或參考下方完整列表中「需留意人員」較少的日子。</div>`;
    }else{
      html += `<h3 style="margin:6px 0 10px;">🌟 全員皆宜推薦日期（前${top.length}名）</h3>`;
      html += `<table class="data-table"><tr><th>日期</th><th>星期</th><th>干支</th><th>平均分</th><th>最低分</th><th>評級</th></tr>`;
      top.forEach(r=>{
        html += `<tr><td>${r.y}/${r.m}/${r.d}</td><td>${r.wd}</td><td class="gz">${r.gan}${r.zhi}</td><td>${r.avgScore.toFixed(1)}</td><td>${r.minScore}</td><td>${tagChip(r.tier)}</td></tr>`;
      });
      html += `</table>`;
    }

    html += `<details style="margin-top:18px;"><summary style="cursor:pointer;color:var(--gold-soft);font-size:14px;">顯示完整 ${rangeDays} 天列表（含各關鍵人物警示狀況與彭祖百忌）</summary>`;
    html += `<table class="data-table" style="margin-top:10px;"><tr><th>日期</th><th>星期</th><th>干支</th><th>平均分</th><th>最低分</th><th>評級</th><th>需留意人員</th><th>彭祖百忌</th></tr>`;
    rows.forEach(r=>{
      html += `<tr><td>${r.y}/${r.m}/${r.d}</td><td>${r.wd}</td><td class="gz">${r.gan}${r.zhi}</td><td>${r.avgScore.toFixed(1)}</td><td>${r.minScore}</td><td>${tagChip(r.tier)}</td><td style="font-size:14px;">${r.warnPeople.length?escapeHtml(r.warnPeople.join('、')):'—'}</td><td style="font-size:14px;color:var(--crimson-soft);">${r.pengzuHit?escapeHtml(r.pengzuHit.hit):'—'}</td></tr>`;
    });
    html += `</table></details>`;

    html += `<div class="disclaimer" style="border-top:none;margin-top:16px;padding-top:0;">
      <b>演算方法說明：</b>本功能為單人擇日引擎的多人延伸版本，每一天皆針對每位關鍵人物分別呼叫與命盤主流程完全相同的干支排盤引擎與評分規則，再以「全體最低分」作為篩選門檻（任何一人明顯沖剋即排除），「平均分」作為排序依據，以模擬企業決策中「不能只顧一人、需兼顧全體關鍵人物」的實務考量；<b>v9.8.3新增</b>：同步核對《彭祖百忌》傳統日禁忌口訣（依日柱天干、地支對照，與建除十二神屬於兩套獨立互補的傳統規則），若當日禁忌內容與此事項類型字面明確對應，即從「推薦日期」中排除，並於完整列表標示供參考。此仍為傳統擇日技法之規則化簡化演算，並未納入生肖沖犯、每日值神、正五行擇日法等更完整體系，正式訂定企業重大日期，仍強烈建議另行諮詢專業命理師並核對通書黃曆。
    </div>`;

    resultEl.innerHTML = html;
  }

  // ============================================================
  // v7.9.7新增：③ 行銷個人化引擎（品牌白牌命理行銷文案產生器，可套用至EDM／會員推播）
  // ============================================================
  function renderMarketingTab(ctx){
    const panel = document.getElementById('panel-marketing');
    if(!panel) return;
    panel.innerHTML = '';

    const { wuxing } = ctx;
    const dom = wuxingDominant(wuxing);
    const weakWx = dom.weakest[0];
    const color = WX_COLOR_NAME[weakWx];
    const item = WX_ITEM[weakWx];
    const habit = WX_HABIT[weakWx];
    const today = todayInfo();

    const templates = [
      { key:'lucky', title:'本週幸運色 × 開運小物', text:`【本週開運提醒】\n依你的命盤五行分析，近期適合補強「${weakWx}」元素：\n🎨 幸運色系：${color}\n🍀 開運小物：${item}\n💡 生活建議：${habit}\n（此為命理命盤演算結果，僅供生活化參考）` },
      { key:'monthly', title:'本月流月提醒文案（EDM／會員推播用）', text:`{顧客姓名} 您好，${today.m}月是您命盤中的重要流月時機。\n本月建議您：多留意與「${weakWx}」相關的機會與人際互動，適度搭配${color}單品，有助於提升整體運勢與行動力。\n若想了解更完整的本月運勢分析，歡迎點擊查看您的專屬命盤報告 →` },
      { key:'brand', title:'品牌白牌通用模板（可置換{品牌}{顧客姓名}變數）', text:`✨ {品牌}專屬命理提醒 ✨\n{顧客姓名}您好！根據命盤五行分析，這陣子最適合您的關鍵字是「${weakWx}」。\n{品牌}為您準備了呼應「${weakWx}」能量的精選好物，點擊立即查看 →\n（本文案由命盤五行分析引擎自動產生，可批次套用至會員EDM／APP推播，僅需置換姓名與命盤資料即可個人化）` },
    ];

    const box = el(`<div class="ai-qa-box">
      <h3>📣 行銷個人化引擎（品牌白牌文案產生器）</h3>
      <p class="ai-qa-hint">
        本功能將你的命盤五行分析結果，轉換為<b style="color:var(--gold-soft);">可直接複製使用的行銷文案模板</b>，適合電商、品牌會員系統串接個人化EDM、APP推播或社群貼文。文案中的 <code>{顧客姓名}</code>、<code>{品牌}</code> 為變數佔位符，實際串接時可由你的會員系統依每位顧客命盤資料自動代入，做到大規模個人化行銷。
      </p>
      <div id="marketingCards"></div>
      <div class="field full" style="margin-top:16px;">
        <label for="mktAiPrompt">✨ AI 潤飾（選填）：想針對哪個主題或平台（例如IG限動、LINE推播、Email主旨）生成更完整的文案？</label>
        <textarea id="mktAiPrompt" placeholder="例：幫我把「本週幸運色」寫成適合IG限動的活潑短文，附3個表情符號"></textarea>
        <button type="button" class="btn-primary" id="mktAiBtn" style="margin-top:8px;">🔮 用AI生成客製文案</button>
      </div>
      <div id="mktAiResult"></div>
    </div>`);
    panel.appendChild(box);

    const cardsEl = box.querySelector('#marketingCards');
    cardsEl.innerHTML = templates.map(t=>`
      <div class="panel-error-card" style="border-style:solid;border-color:var(--gold-soft);background:rgba(201,161,90,0.06);margin-bottom:14px;">
        <b style="color:var(--gold-soft);">${escapeHtml(t.title)}</b>
        <pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;margin:8px 0;">${escapeHtml(t.text)}</pre>
        <button type="button" class="btn-mini mkt-copy" data-key="${t.key}">📋 複製文案</button>
      </div>
    `).join('');
    cardsEl.querySelectorAll('.mkt-copy').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const t = templates.find(x=>x.key===btn.dataset.key);
        try{
          await navigator.clipboard.writeText(t.text);
          showFriendlyError('已複製到剪貼簿！', {type:'success'});
        }catch(e){
          showFriendlyError('複製失敗，請手動選取文字複製（部分瀏覽器需在安全連線環境下才能使用自動複製功能）。');
        }
      });
    });

    box.querySelector('#mktAiBtn').addEventListener('click', async ()=>{
      const promptEl = box.querySelector('#mktAiPrompt');
      const resultBox = box.querySelector('#mktAiResult');
      const userAsk = promptEl.value.trim();
      const provider = localStorage.getItem(AI_PROVIDER_KEY) || 'claude';
      const cfg = AI_PROVIDERS[provider] || AI_PROVIDERS.claude;
      const apiKey = Obfuscate.decode(localStorage.getItem(cfg.keyStorage)) || '';
      const model = getSavedProviderModel(cfg);
      const endpoint = cfg.endpointStorage ? (Obfuscate.decode(localStorage.getItem(cfg.endpointStorage)) || '') : '';
      if(!apiKey){ showFriendlyError(`請先到「AI白話追問」分頁設定你的 ${cfg.keyLabel}（金鑰在各AI功能分頁間共用，只需設定一次）。`); return; }
      if(cfg.needsModel && !model){ showFriendlyError(`請先在「AI白話追問」分頁輸入 ${cfg.label} 的模型名稱，或使用「取得模型清單」。`); return; }
      const sys = `你是一位精通命理行銷文案的品牌顧問。以下是根據使用者命盤五行分析得出的基礎素材，請依使用者指定的主題／平台，將素材改寫成更完整、更吸引人的行銷文案，語氣需符合對應平台調性（例如IG限動活潑、Email正式）。文案中請保留 {顧客姓名} {品牌} 等變數佔位符供品牌端後續批次套用。回答僅需輸出文案本身，不需要額外說明。`;
      const baseMaterial = `【命盤五行基礎素材】\n最弱五行：${weakWx}\n幸運色：${color}\n開運小物：${item}\n生活建議：${habit}\n\n【使用者需求】\n${userAsk || '請生成一則適合一般社群貼文的開運提醒文案'}`;
      resultBox.innerHTML = `<div class="ai-msg assistant">AI 文案顧問生成中…</div>`;
      try{
        let text;
        if(provider==='claude'){
          const resp = await aiFetch('https://api.anthropic.com/v1/messages', {
            method:'POST',
            headers:{
              'Content-Type':'application/json', 'x-api-key': apiKey,
              'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true',
            },
            body: JSON.stringify({ model, max_tokens:900, system:sys, messages:[{role:'user', content:baseMaterial}] }),
          });
          if(!resp.ok) throw {status:resp.status};
          const data = await resp.json();
          text = (data.content||[]).map(b=>b.text||'').join('\n').trim();
        }else if(provider==='gemini'){
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
          const resp = await aiFetch(url, {
            method:'POST', headers:{ 'Content-Type':'application/json' },
            body: JSON.stringify({ system_instruction:{ parts:[{text:sys}] }, contents:[{role:'user', parts:[{text:baseMaterial}]}] }),
          });
          if(!resp.ok) throw {status:resp.status};
          const data = await resp.json();
          const parts = (((data.candidates||[])[0]||{}).content||{}).parts || [];
          text = parts.map(p=>p.text||'').join('').trim();
        }else{
          const url = provider==='openai' ? 'https://api.openai.com/v1/chat/completions' : ((endpoint || cfg.officialBaseUrl || '').replace(/\/+$/,'')+'/chat/completions');
          const resp = await aiFetch(url, {
            method:'POST',
            headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+apiKey },
            body: JSON.stringify({ model, max_tokens:900, messages:[{role:'system', content:sys}, {role:'user', content:baseMaterial}] }),
          });
          if(!resp.ok) throw {status:resp.status};
          const data = await resp.json();
          if(data.choices && data.choices[0] && data.choices[0].message) text = data.choices[0].message.content.trim();
          else if(data.content) text = typeof data.content==='string' ? data.content.trim() : JSON.stringify(data.content);
          else text = JSON.stringify(data).slice(0,500);
        }
        resultBox.innerHTML = `<div class="ai-msg assistant" style="white-space:pre-wrap;">${escapeHtml((text||'').trim()||'（沒有取得回應內容）')}</div>`;
      }catch(err){
        console.error(err);
        let msg = `${cfg.label} 連線發生錯誤。`;
        const status = err && err.status;
        if(status===401||status===403) msg = 'API Key 無效、過期，或沒有權限，請確認金鑰是否正確。';
        else if(status===429) msg = 'API 請求過於頻繁或額度已用完，系統已啟用安全控速，請稍後再試。';
        else if(status===408) msg = 'AI 服務回應逾時，請稍後再試或更換模型。';
        else if(status) msg = `${cfg.label} API 回應錯誤（狀態碼 ${status}）。`;
        else msg = `連線失敗，可能是網路問題，或瀏覽器封鎖了對 ${cfg.label} 服務的直接請求。若持續失敗，請確認金鑰／端點設定是否正確，或改用其他網路環境再試一次。`;
        resultBox.innerHTML = `<div class="error-box">${escapeHtml(msg)}</div>`;
      }
    });
  }

  // ============================================================
  // v10.7新增：④ 企業方案（把「團隊相容性」「企業擇日」包裝成B2B專業服務的介紹＋洽詢頁）
  // 對應商業方案①：企業用人決策顧問系統。本頁不需另外收費串接金流，先以「留下聯絡方式」
  // 的洽詢表單（透過 mailto 開啟使用者自己的郵件軟體寄出，不經過我方伺服器）作為第一版，
  // 待有實際洽詢量後再評估是否要接金流或CRM。
  // ============================================================
  function renderBizPlanTab(ctx){
    const panel = document.getElementById('panel-bizplan');
    if(!panel) return;
    panel.innerHTML = '';

    const box = el(`<div class="ai-qa-box">
      <h3>🏆 企業方案——把「團隊相容性」與「企業擇日」升級成專業版顧問服務</h3>
      <p class="ai-qa-hint">
        你剛剛體驗過的「👥 團隊相容性」與「🏢 企業擇日」，除了個人自用，也很適合直接應用在
        <b style="color:var(--gold-soft);">組建新團隊、招募面試前參考、重大簽約／開幕擇日</b>
        等企業決策場景。企業方案提供更完整的專業版報告格式與批次分析額度，讓你可以直接把結果
        用在人資會議、董事會簡報等正式場合。
      </p>

      <div class="tam-grid" style="margin:20px 0;">
        <div class="tam-card biz-plan-card">
          <div class="tam-label">單次分析</div>
          <div class="tam-num">NT$1,999<span style="font-size:13px;color:var(--paper-dim);">／次</span></div>
          <div class="tam-desc">最多6人團隊相容性矩陣，或一次企業擇日批次分析；輸出可列印的專業版報告（含企業品牌欄位）</div>
        </div>
        <div class="tam-card biz-plan-card biz-plan-card-featured">
          <div class="tam-label">企業月訂閱 <span class="biz-plan-badge">熱門</span></div>
          <div class="tam-num">NT$2,999<span style="font-size:13px;color:var(--paper-dim);">／月</span></div>
          <div class="tam-desc">當月無限次數使用團隊相容性與企業擇日，適合人資部門常態招募、多場活動擇日需求</div>
        </div>
        <div class="tam-card biz-plan-card">
          <div class="tam-label">客製顧問方案</div>
          <div class="tam-num">洽詢報價</div>
          <div class="tam-desc">大型企業／連鎖品牌，可另外討論白牌報告、批次匯入現有員工資料、專屬客戶經理等需求</div>
        </div>
      </div>

      <p class="field-hint" style="margin:4px 0 18px;">
        以上為初期定價方案，正式報價請以洽詢後之書面報價單為準；本頁僅供功能介紹與需求登記，尚未串接線上刷卡付款。
      </p>

      <div class="card" style="margin-top:4px;">
        <h4 style="margin:0 0 12px;">📮 留下聯絡方式，我們會盡快與您聯繫</h4>
        <div class="form-grid">
          <div class="field"><label for="bizPlanCompany">公司／團隊名稱</label><input type="text" id="bizPlanCompany" placeholder="例：○○股份有限公司"></div>
          <div class="field"><label for="bizPlanContact">聯絡人姓名</label><input type="text" id="bizPlanContact" placeholder="例：陳小姐"></div>
          <div class="field"><label for="bizPlanEmail">聯絡Email</label><input type="email" id="bizPlanEmail" placeholder="example@company.com"></div>
          <div class="field"><label for="bizPlanPhone">聯絡電話（選填）</label><input type="tel" id="bizPlanPhone" placeholder="例：0912-345-678"></div>
          <div class="field full">
            <label for="bizPlanInterest">有興趣的方案</label>
            <select id="bizPlanInterest">
              <option value="單次分析">單次分析（NT$1,999／次）</option>
              <option value="企業月訂閱">企業月訂閱（NT$2,999／月）</option>
              <option value="客製顧問方案">客製顧問方案（洽詢報價）</option>
              <option value="還在了解中">還在了解中，想先問問看</option>
            </select>
          </div>
          <div class="field full"><label for="bizPlanNote">想解決的問題／需求說明（選填）</label><textarea id="bizPlanNote" placeholder="例：我們近期要招募3位業務，想在面試前先做團隊相容性參考"></textarea></div>
        </div>
        <button type="button" class="btn-primary" id="bizPlanSubmitBtn" style="margin-top:14px;">📮 送出洽詢</button>
        <div id="bizPlanResult"></div>
      </div>
    </div>`);
    panel.appendChild(box);

    box.querySelector('#bizPlanSubmitBtn').addEventListener('click', ()=>{
      const company = box.querySelector('#bizPlanCompany').value.trim();
      const contact = box.querySelector('#bizPlanContact').value.trim();
      const email = box.querySelector('#bizPlanEmail').value.trim();
      const phone = box.querySelector('#bizPlanPhone').value.trim();
      const interest = box.querySelector('#bizPlanInterest').value;
      const note = box.querySelector('#bizPlanNote').value.trim();
      const resultBox = box.querySelector('#bizPlanResult');

      if(!contact || !email){
        showFriendlyError('請至少填寫聯絡人姓名與Email，方便我們與您聯繫。');
        return;
      }
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if(!emailPattern.test(email)){
        showFriendlyError('Email格式看起來不太正確，請確認後再試一次。');
        return;
      }

      const subject = encodeURIComponent(`【企業方案洽詢】${company||'（未填公司名稱）'} - ${interest}`);
      const bodyLines = [
        `公司／團隊名稱：${company||'（未填）'}`,
        `聯絡人：${contact}`,
        `Email：${email}`,
        `電話：${phone||'（未填）'}`,
        `有興趣的方案：${interest}`,
        `需求說明：${note||'（未填）'}`,
      ];
      const body = encodeURIComponent(bodyLines.join('\n'));
      const mailtoUrl = `mailto:felix670131@gmail.com?subject=${subject}&body=${body}`;

      // v10.7：先以開啟使用者自己的郵件軟體寄出洽詢信作為第一版做法，不會把資料傳到我方伺服器，
      // 也不需要任何後端串接就能立即使用；未來若要接自己的CRM或後端記錄，可在此處另外呼叫API。
      window.open(mailtoUrl, '_blank');
      resultBox.innerHTML = `<div class="panel-error-card" style="border-color:var(--jade-soft);background:rgba(184,146,90,0.08);margin-top:14px;">
        ✅ 已為您開啟郵件軟體並帶入洽詢內容，請確認後點擊寄送即可。若您的裝置沒有預設郵件軟體，
        也可以直接複製以下內容，寄到 <b>felix670131@gmail.com</b>：
        <pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;margin:10px 0 0;">${escapeHtml(bodyLines.join('\n'))}</pre>
      </div>`;
      showFriendlyError('已為您開啟郵件軟體，請確認內容後送出。', {type:'success'});
    });
  }

  function renderPalmFaceTab(ctx){
    const panel = document.getElementById('panel-palmface');
    panel.innerHTML = '';
    const box = el(`<div class="ai-qa-box">
      <h3>✋ 手相面相分析（傳統民俗參考，非科學方法）</h3>
      <p class="ai-qa-hint">
        面相學與手相學是東亞傳統民俗文化的一部分，目前並無科學實證能證明手掌紋路或臉部特徵可預測性格、命運或事業成敗——本功能與站上其他命理模組一樣，<b style="color:var(--gold-soft);">純粹提供娛樂與自我覺察參考</b>，不是醫療、心理或人格鑑定工具。
        <br><br>
        <b style="color:var(--crimson-soft);">請只上傳「你自己」的照片。</b>本功能不建議、也不應該被用來評估求職者、生意夥伴、下屬或任何其他人——用外貌特徵評斷他人能力、品格或可信度，不僅沒有科學依據，也可能構成不公平的差別待遇；任何徵才、合作或信任判斷，請以能力、經歷、實際表現與正式的盡職查核為準。
        <br><br>
        本功能沿用「AI白話追問」頁籤已設定的AI服務與金鑰（各服務中具備影像辨識能力的模型才能使用；NVIDIA NIM／GroqCloud／OpenRouter／Mistral AI Studio 也可直接切換）；你上傳的照片會直接由你的瀏覽器送往你所選擇的AI服務官方API（與文字問答相同的「不經本站伺服器」架構），請確認你信任該服務的隱私權政策後再上傳。照片僅用於當次分析、不會被本站保存，但也請避免上傳含他人臉孔或身分證件等內容的照片。
      </p>

      <div class="ai-provider-row" id="pfProviderRow">
        ${Object.entries(AI_PROVIDERS).map(([key,cfg])=>`<button type="button" class="ai-provider-btn" data-provider="${key}">${cfg.label}</button>`).join('')}
      </div>
      <div id="pfProviderFields"></div>

      <div class="pf-upload-grid">
        <div class="pf-upload-slot">
          <label>手掌照片（選填，建議手心朝上、光線充足、掌紋清晰）</label>
          <input type="file" accept="image/*" id="pfPalmFile">
          <div class="pf-preview" id="pfPalmPreview"><span class="pf-preview-empty">尚未選擇照片</span></div>
        </div>
        <div class="pf-upload-slot">
          <label>臉部照片（選填，建議正面、光線充足、五官清晰）</label>
          <input type="file" accept="image/*" id="pfFaceFile">
          <div class="pf-preview" id="pfFacePreview"><span class="pf-preview-empty">尚未選擇照片</span></div>
        </div>
      </div>
      <p class="ai-qa-hint">至少上傳一張照片即可分析；兩張都上傳可獲得更完整的綜合解讀。照片會先在你的瀏覽器內自動縮小至最長邊1024px以內，再送出分析。</p>

      <button type="button" class="btn-primary" id="pfSubmitBtn">開始分析</button>
      <div id="pfResult"></div>
    </div>`);
    panel.appendChild(box);

    const providerRow = box.querySelector('#pfProviderRow');
    const fieldsBox = box.querySelector('#pfProviderFields');
    const resultBox = box.querySelector('#pfResult');
    const submitBtn = box.querySelector('#pfSubmitBtn');
    let currentProvider = localStorage.getItem(AI_PROVIDER_KEY) || 'claude';
    if(!AI_PROVIDERS[currentProvider]) currentProvider = 'claude';
    let palmDataUrl = null, faceDataUrl = null;

    function renderProviderFields(){
      const cfg = AI_PROVIDERS[currentProvider];
      const savedKey = Obfuscate.decode(localStorage.getItem(cfg.keyStorage)) || '';
      const savedModel = getSavedProviderModel(cfg);
      const savedEndpoint = cfg.needsEndpoint ? (Obfuscate.decode(localStorage.getItem(cfg.endpointStorage)) || '') : '';
      const visionNote = PALMFACE_VISION_NOTE[currentProvider];
      fieldsBox.innerHTML = `
        <div class="field"><label>${cfg.keyLabel}</label>
          <div class="ai-key-row">
            <input type="password" id="pfApiKey" placeholder="${cfg.keyPlaceholder}" value="${escapeHtml(savedKey)}">
            <label><input type="checkbox" id="pfKeyRemember" ${savedKey?'checked':''}> 記住金鑰（本機儲存，已加入輕量混淆）</label>
          </div>
        </div>
        ${cfg.needsEndpoint ? `<div class="field"><label>${cfg.endpointOptional?'Base URL（選填，留空使用官方端點）':'API 端點網址'}</label><div class="ai-key-row"><input type="text" id="pfEndpoint" placeholder="${cfg.endpointPlaceholder}" value="${escapeHtml(savedEndpoint)}"></div></div>` : ''}
        ${modelFieldHtml(cfg,'pf')}
        ${visionNote===false ? `<p class="ai-qa-hint" style="color:var(--crimson-soft);">⚠️ ${cfg.label} 預設模型不支援影像辨識，此功能可能無法使用。</p>`
          : visionNote===null ? `<p class="ai-qa-hint" style="color:var(--crimson-soft);">⚠️ ${cfg.label} 是否支援影像辨識，取決於你填入的模型名稱是否為具備視覺能力的版本，請自行確認。</p>` : ''}
      `;
      const pfModelEl = fieldsBox.querySelector('#pfModel');
      if(pfModelEl) pfModelEl.value = savedModel || cfg.defaultModel || '';
      const pfLoadBtn = fieldsBox.querySelector('#pfLoadModels');
      if(pfLoadBtn){
        pfLoadBtn.addEventListener('click', async ()=>{
          const statusEl = fieldsBox.querySelector('#pfModelStatus');
          const key = fieldsBox.querySelector('#pfApiKey').value.trim();
          const endpoint = fieldsBox.querySelector('#pfEndpoint')?.value.trim() || '';
          if(!key){ showFriendlyError(`請先輸入你的 ${cfg.keyLabel}。`, {focusEl: fieldsBox.querySelector('#pfApiKey')}); return; }
          pfLoadBtn.disabled = true; if(statusEl) statusEl.textContent='載入中…';
          try{
            const models = await fetchProviderModels(cfg, key, endpoint);
            const list = fieldsBox.querySelector('#pfModelList');
            list.innerHTML = models.map(id=>`<option value="${escapeHtml(id)}"></option>`).join('');
            if(statusEl) statusEl.textContent = `已載入 ${models.length} 個模型，可直接選擇或手動輸入新模型。`;
          }catch(err){
            console.error(err);
            if(statusEl) statusEl.textContent = '模型清單取得失敗，請直接輸入原廠模型名稱。';
          }finally{ pfLoadBtn.disabled=false; }
        });
      }
    }
    function setProvider(key){
      currentProvider = key;
      providerRow.querySelectorAll('.ai-provider-btn').forEach(b=>b.classList.toggle('active', b.dataset.provider===key));
      renderProviderFields();
    }
    providerRow.querySelectorAll('.ai-provider-btn').forEach(b=>{ b.addEventListener('click', ()=>setProvider(b.dataset.provider)); });
    setProvider(currentProvider);

    // ---- 圖片壓縮：縮小至最長邊1024px以內並轉為JPEG dataURL，降低傳輸量與API費用 ----
    function resizeImageFile(file){
      return new Promise((resolve, reject)=>{
        const reader = new FileReader();
        reader.onerror = ()=>reject(new Error('讀取檔案失敗'));
        reader.onload = ()=>{
          const img = new Image();
          img.onerror = ()=>reject(new Error('圖片載入失敗，請確認檔案格式'));
          img.onload = ()=>{
            const maxSide = 1024;
            let {width, height} = img;
            if(width>maxSide || height>maxSide){
              const ratio = Math.min(maxSide/width, maxSide/height);
              width = Math.round(width*ratio); height = Math.round(height*ratio);
            }
            const canvas = document.createElement('canvas');
            canvas.width = width; canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    }
    function wirePreview(fileInputId, previewId, onDone){
      const input = box.querySelector('#'+fileInputId);
      const preview = box.querySelector('#'+previewId);
      input.addEventListener('change', async ()=>{
        const file = input.files && input.files[0];
        if(!file) return;
        if(!file.type.startsWith('image/')){ showFriendlyError('請選擇圖片檔案'); return; }
        preview.innerHTML = '<span class="pf-preview-empty">處理中…</span>';
        try{
          const dataUrl = await resizeImageFile(file);
          onDone(dataUrl);
          preview.innerHTML = `<img src="${dataUrl}" alt="預覽">`;
        }catch(err){
          console.error(err);
          preview.innerHTML = '<span class="pf-preview-empty">圖片處理失敗，請換一張再試</span>';
          onDone(null);
        }
      });
    }
    wirePreview('pfPalmFile','pfPalmPreview', dataUrl=>{ palmDataUrl = dataUrl; });
    wirePreview('pfFaceFile','pfFacePreview', dataUrl=>{ faceDataUrl = dataUrl; });

    const PF_SYSTEM_PROMPT = `你是一位熟悉東方傳統面相學與手相學的命理老師。使用者上傳了自己的手掌與/或臉部照片，請你依據傳統面相學、手相學的說法，針對「事業／財運／商業決策」相關主題（例如：事業線、財帛宮、田宅宮、鼻相、額頭、下巴、貴人運、決策風格、適合的行業方向、投資理財傾向等）給出白話、正向、具建設性的分析。

請務必遵守以下原則：
1. 全程以「傳統面相學／手相學認為…」的口吻描述，清楚表明這是傳統民俗說法，不是科學或醫學判斷，避免使用斷言式的語氣。
2. 絕對不對使用者的人品、誠信、智力做出負面或武斷的論斷（例如不可說「面相顯示此人不可信」之類的話），評論僅限個人發展傾向與正向建議。
3. 不進行健康、疾病、壽命相關的面相或手相判斷。
4. 若使用者只上傳一張照片（僅手相或僅面相），只分析該張照片對應的主題，不要臆測或編造未提供的資訊。
5. 回答請用繁體中文，控制在500字以內，並用「財運面相／手相」「事業面相／手相」「決策風格」「綜合建議」等小標題分段，最後加一句提醒：本分析僅供娛樂與自我覺察參考，重大商業或財務決策仍請以實際規劃與專業意見為準。`;

    function buildImageParts(){
      const parts = [];
      if(palmDataUrl) parts.push({label:'手掌照片', dataUrl:palmDataUrl});
      if(faceDataUrl) parts.push({label:'臉部照片', dataUrl:faceDataUrl});
      return parts;
    }
    function splitDataUrl(dataUrl){
      const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
      return m ? {mime:m[1], data:m[2]} : {mime:'image/jpeg', data:''};
    }

    async function callClaudeVision(apiKey, model, images, question){
      const content = [];
      images.forEach(img=>{
        const {mime, data} = splitDataUrl(img.dataUrl);
        content.push({type:'text', text:`【${img.label}】`});
        content.push({type:'image', source:{type:'base64', media_type:mime, data}});
      });
      content.push({type:'text', text:question});
      const resp = await aiFetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{
          'Content-Type':'application/json', 'x-api-key': apiKey,
          'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true',
        },
        body: JSON.stringify({ model, max_tokens:1000, system:PF_SYSTEM_PROMPT, messages:[{role:'user', content}] }),
      });
      if(!resp.ok) throw {status:resp.status};
      const data = await resp.json();
      return (data.content||[]).map(b=>b.text||'').join('\n').trim();
    }
    async function callOpenAICompatibleVision(url, apiKey, model, images, question){
      const content = [{type:'text', text:question}];
      images.forEach(img=>{
        const {mime, data} = splitDataUrl(img.dataUrl);
        content.push({type:'text', text:`【${img.label}】`});
        content.push({type:'image_url', image_url:{url:`data:${mime};base64,${data}`}});
      });
      const resp = await aiFetch(url, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+apiKey },
        body: JSON.stringify({ model, max_tokens:1000, messages:[{role:'system', content:PF_SYSTEM_PROMPT}, {role:'user', content}] }),
      });
      if(!resp.ok) throw {status:resp.status};
      const data = await resp.json();
      if(data.choices && data.choices[0] && data.choices[0].message) return data.choices[0].message.content.trim();
      return JSON.stringify(data).slice(0,500);
    }
    async function callGeminiVision(apiKey, model, images, question){
      const parts = [{text:question}];
      images.forEach(img=>{
        const {mime, data} = splitDataUrl(img.dataUrl);
        parts.push({text:`【${img.label}】`});
        parts.push({inline_data:{mime_type:mime, data}});
      });
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const resp = await aiFetch(url, {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ system_instruction:{parts:[{text:PF_SYSTEM_PROMPT}]}, contents:[{role:'user', parts}] }),
      });
      if(!resp.ok) throw {status:resp.status};
      const data = await resp.json();
      const outParts = (((data.candidates||[])[0]||{}).content||{}).parts || [];
      return outParts.map(p=>p.text||'').join('').trim();
    }

    let visionBusy = false;
    submitBtn.addEventListener('click', async ()=>{
      const images = buildImageParts();
      if(images.length===0){ showFriendlyError('請至少上傳一張手掌或臉部照片。'); return; }
      if(visionBusy) return;
      const providerKey = currentProvider;
      const cfg = AI_PROVIDERS[providerKey];
      const keyEl = fieldsBox.querySelector('#pfApiKey');
      const rememberEl = fieldsBox.querySelector('#pfKeyRemember');
      const modelEl = fieldsBox.querySelector('#pfModel');
      const endpointEl = fieldsBox.querySelector('#pfEndpoint');
      const apiKey = keyEl.value.trim();
      if(!apiKey){ showFriendlyError(`請先輸入你的 ${cfg.keyLabel}。`, {focusEl: keyEl}); return; }
      const model = modelEl ? (modelEl.value.trim() || cfg.defaultModel) : cfg.defaultModel;
      const endpoint = endpointEl ? endpointEl.value.trim() : '';
      if(cfg.needsEndpoint && !cfg.endpointOptional && !endpoint){ showFriendlyError('請先輸入 API 端點網址。', {focusEl: endpointEl}); return; }

      if(rememberEl.checked){
        localStorage.setItem(cfg.keyStorage, Obfuscate.encode(apiKey));
        if(cfg.modelStorage) localStorage.setItem(cfg.modelStorage, Obfuscate.encode(model));
        if(cfg.endpointStorage) localStorage.setItem(cfg.endpointStorage, Obfuscate.encode(endpoint));
      }else{
        localStorage.removeItem(cfg.keyStorage);
      }

      const question = `以下是我的${images.map(i=>i.label).join('與')}，請依上述原則為我分析。`;
      submitBtn.disabled = true;
      visionBusy = true;
      resultBox.innerHTML = `<div class="ai-msg assistant">命理老師正在為你端詳照片、推算中…</div>`;

      try{
        let text;
        if(cfg.needsModel && !model){
          throw {configError:true, message:'請輸入模型名稱，或先按「取得模型清單」選擇目前可用模型。'};
        }
        if(providerKey==='claude') text = await callClaudeVision(apiKey, model, images, question);
        else if(providerKey==='gemini') text = await callGeminiVision(apiKey, model, images, question);
        else {
          const baseUrl = providerBaseUrl(cfg, endpoint);
          if(!baseUrl) throw {configError:true, message:'此服務缺少 API 端點設定。'};
          text = await callOpenAICompatibleVision(baseUrl+'/chat/completions', apiKey, model, images, question);
        }
        text = (text||'').trim() || '（沒有取得回應內容）';
        resultBox.innerHTML = `<div class="ai-msg assistant" style="white-space:pre-wrap;">${escapeHtml(text)}</div>`;
      }catch(err){
        console.error(err);
        let msg = `${cfg.label} 連線發生錯誤。`;
        const status = err && err.status;
        if(err && err.configError) msg = err.message;
        else if(err && err.code==='AI_DAILY_LIMIT') msg = '今日 AI 安全請求額度已達 49 次，為避免觸發原廠限制，今天不再送出新的 AI 請求。';
        else if(err && err.code==='AI_QUEUE_TIMEOUT') msg = '目前 AI 請求量較高，等待時間過長，為避免重複送出請求，這次先停止，請稍後再試。';
        else if(status===401 || status===403) msg = 'API Key 無效或權限不足，請確認金鑰是否正確。';
        else if(status===429) msg = 'API 額度已達上限或請求過於頻繁，系統會自動控速，請稍後再試。';
        else if(status===408) msg = 'AI 服務回應逾時，請稍後再試或更換模型。';
        else if(status) msg = `${cfg.label} 回傳錯誤（狀態碼 ${status}），該模型可能不支援影像辨識，請確認模型名稱後再試。`;
        resultBox.innerHTML = `<div class="error-box">${escapeHtml(msg)}</div>`;
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  // ================= v9.8.1新增：關係／團隊相處模擬器（升級「合盤比對」「團隊相容性」，不建立新引擎） =================
  // 設計理念：合盤比對與團隊相容性原本只輸出「分數」，這裡在既有的 compatWxRelation()／compatZhiRelation()
  // 兩項既有比對結果上，額外解讀出「衝突觸發點」「誰適合先提案／破冰」「怎麼分工」三項可執行洞察，
  // 用同一份已排出的雙方八字資料（日主陰陽、日支合沖刑害、五行生剋類型），不重新計算或另立規則。
  function computeRelationshipDynamics(dayGanA, dayZhiA, dayGanB, dayZhiB, wxRelType, nameA, nameB){
    const isClash = CLASH_MAP[dayZhiA] === dayZhiB;
    const isXingRel = isXing(dayZhiA, dayZhiB);
    const isHaiRel = HAI_MAP[dayZhiA] === dayZhiB;
    const isHe = LIUHE_MAP[dayZhiA] === dayZhiB;

    let triggerText;
    if(isClash) triggerText = `兩人日支相沖，衝突最容易在「方向與決定」上爆發——例如該往哪裡去、該怎麼做決定時，雙方容易各持己見、互不相讓。建議吵起來的當下先各自冷靜，避免在情緒最高點時逼對方馬上表態或做決定。`;
    else if(isXingRel) triggerText = `兩人日支相刑，衝突比較不是一次性大吵，而是同一件事反覆拿出來計較、翻舊帳，容易陷入「這件事我們是不是討論過了」的迴圈。建議每次討論完明確做個結論、記錄下來，避免懸而未決一再重提。`;
    else if(isHaiRel) triggerText = `兩人日支相害，衝突多半不是正面對撞，而是誤會與小情緒累積——一方覺得被忽略，另一方覺得莫名其妙被遷怒。建議有不舒服的感覺就盡早講開，不要放著發酵成大問題。`;
    else if(isHe) triggerText = `兩人日支六合，整體衝突頻率相對較低，但要留意「太合拍」有時反而讓雙方在該有不同意見時不敢表達。建議刻意練習把小小的不滿說出口，避免長期累積。`;
    else triggerText = `兩人日支之間沒有明顯的合沖刑害訊號，命盤角度看不出特別集中的摩擦點，實際衝突模式更多取決於雙方各自的個性與溝通習慣，而非命盤結構性因素。`;

    const yyA = B.GAN_YINYANG[dayGanA], yyB = B.GAN_YINYANG[dayGanB];
    let proposeText;
    if(yyA==='陽' && yyB==='陰') proposeText = `${nameA}日主屬陽干，個性上通常較主動、敢於先開口；${nameB}日主屬陰干，較擅長觀察與細節把關。想推動新提案、討論改變時，建議由${nameA}先起頭破冰，${nameB}負責補充考量不周之處，兩人搭配容易互補。`;
    else if(yyB==='陽' && yyA==='陰') proposeText = `${nameB}日主屬陽干，個性上通常較主動、敢於先開口；${nameA}日主屬陰干，較擅長觀察與細節把關。想推動新提案、討論改變時，建議由${nameB}先起頭破冰，${nameA}負責補充考量不周之處，兩人搭配容易互補。`;
    else if(yyA==='陽' && yyB==='陽') proposeText = `兩人日主都屬陽干，個性都偏主動、有主見，優點是行動力都很夠，但也容易因為都想主導而互相搶話。建議討論重大事情前先講好「這次誰先講、誰先聽」，輪流主導會比同時搶話更有效率。`;
    else proposeText = `兩人日主都屬陰干，個性都偏內斂、謹慎，優點是決定前都會多方考慮，但也可能出現「兩人都在等對方先開口」的狀況。建議刻意練習主動表達想法，不要總是等對方先提。`;

    let divideText;
    if(wxRelType==='sheng') divideText = `五行生剋上有一方在「生」（付出、支持）另一方，這種關係天生適合分工：由「生」的一方負責提供資源、開路搭橋，「被生」的一方負責承接、深化執行與細節落實，各司其職會比硬要對等分工更順暢。`;
    else if(wxRelType==='ke') divideText = `五行生剋上有一方在「剋」（主導、約束）另一方，若不刻意調整分工，容易變成一方一直在管、另一方一直被管的疲乏感。建議明確劃分「誰在哪個領域說了算」，各自有明確的主導範圍，減少互相干涉的摩擦。`;
    else if(wxRelType==='same') divideText = `兩人日主同五行，做事風格與偏好可能很像，分工上建議刻意「差異化」而非重疊——與其兩人都想做同一塊、互相踩線，不如刻意分配不同領域讓各自發揮，反而能截長補短。`;
    else divideText = `五行關係較中性，分工上沒有命盤角度的明顯建議，可依雙方實際專長與意願自然分配即可。`;

    return { triggerText, proposeText, divideText, isClash, isXingRel, isHaiRel, isHe };
  }
  function relationshipDynamicsHtml(dyn, contextLabel){
    return `<h3 style="margin:24px 0 10px;font-family:var(--serif);color:var(--gold-soft);">🎭 相處模擬器${contextLabel?`（${contextLabel}）`:''}</h3>
      ${domainSection('可執行的相處洞察', [
        {icon:'⚡', title:'衝突觸發點', tag:dyn.isClash?'相沖需留意':(dyn.isXingRel?'相刑需留意':(dyn.isHaiRel?'相害需留意':(dyn.isHe?'六合較和諧':'中性'))), paras:[dyn.triggerText]},
        {icon:'🙋', title:'誰適合先提案／破冰', tag:'依日主陰陽判斷', paras:[dyn.proposeText]},
        {icon:'🧩', title:'怎麼分工比較順', tag:'依五行生剋判斷', paras:[dyn.divideText]},
      ])}
      <p style="font-size:14px;color:var(--paper-dim);margin-top:4px;">以上洞察由日主陰陽屬性與五行生剋、地支合沖刑害關係規則化轉換而成，是命盤角度的傾向參考，實際相處模式仍取決於雙方真實個性與溝通意願。</p>`;
  }

  function renderCompat(ctxA, dataB){
    const resultBox = document.getElementById('compatResult');
    const A_p = ctxA.p, A_bazi = ctxA.bazi, A_astro = ctxA.astro;
    const dayGanA = A_bazi.pillars.day.gan, dayZhiA = A_bazi.pillars.day.zhi, dayGanWxA = GAN_WX[dayGanA];
    const dayGanB = dataB.bazi.pillars.day.gan, dayZhiB = dataB.bazi.pillars.day.zhi, dayGanWxB = GAN_WX[dayGanB];
    const signA = A_astro.Sun ? A_astro.Sun.sign : '未知';
    const signB = dataB.astro.Sun ? dataB.astro.Sun.sign : '未知';

    const wxRel = compatWxRelation(dayGanWxA, dayGanWxB);
    const zhiRel = compatZhiRelation(dayZhiA, dayZhiB, dayGanA, dayGanB);
    const spouseRel = compatSpouseStar(dayGanA, dayGanB, A_p.gender, dataB.gender);
    const zodiacRel = compatZodiac(signA, signB);

    const totalScore = Math.max(0, Math.min(100, Math.round(wxRel.score + zhiRel.score + spouseRel.score + zodiacRel.score)));
    let scoreLabel, scoreTip;
    if(totalScore>=80){ scoreLabel='天作之合型'; scoreTip='命盤角度顯示兩人相當契合，多個指標同時偏向正面，是相性很高的組合，仍建議珍惜並用心經營。'; }
    else if(totalScore>=60){ scoreLabel='高度合拍型'; scoreTip='整體相性偏正向，兩人有不錯的緣分基礎，相處中若遇到小摩擦，多半能靠溝通順利化解。'; }
    else if(totalScore>=35){ scoreLabel='互補磨合型'; scoreTip='兩人各有明顯的相合與相沖之處，關係屬於「有挑戰也有回饋」的類型，需要雙方都有意願理解與包容差異，才能走得長久。'; }
    else{ scoreLabel='挑戰經營型'; scoreTip='命盤角度顯示兩人多項指標同時偏向相剋、相沖或元素相對，相處上可能需要付出更多耐心與溝通成本，但差異大不等於不適合，許多長久關係也是靠後天用心經營而成，命盤僅供參考，不代表關係的絕對上限。'; }

    const html = `
      <div class="compat-score-wrap">
        <div class="compat-score-num">${totalScore}<span>／100</span></div>
        <div style="flex:1;min-width:220px;">
          <div class="compat-score-label">${escapeHtml(A_p.surname)}${escapeHtml(A_p.givenName)} × ${escapeHtml(dataB.surname)}${escapeHtml(dataB.givenName||'')}　${scoreLabel}</div>
          <div class="compat-score-bar-bg"><div class="compat-score-bar-fill" style="width:${totalScore}%;"></div></div>
        </div>
      </div>
      <p style="color:var(--paper-dim);font-size:14px;line-height:1.85;margin-bottom:22px;">${scoreTip}</p>
      ${domainSection('相性比對細項', [
        {icon:'☯️', title:'八字日主五行生剋', tag:wxRel.type==='sheng'?'相生加分':(wxRel.type==='ke'?'相剋需磨合':'同氣相求'), paras:[wxRel.text]},
        {icon:'🀄', title:'日柱地支合沖', tag:zhiRel.score>=20?'合多於沖':(zhiRel.score<=8?'沖動明顯':'中性'), paras:[zhiRel.text]},
        {icon:'💘', title:'姻緣星互見', tag:spouseRel.score>=20?'雙向互見':(spouseRel.score>=12?'單向互見':'需要培養'), paras:[spouseRel.text]},
        {icon:'✨', title:'西洋星座元素配對', tag:signA+' × '+signB, paras:[zodiacRel.text]},
      ])}
      ${relationshipDynamicsHtml(computeRelationshipDynamics(dayGanA, dayZhiA, dayGanB, dayZhiB, wxRel.type, escapeHtml(A_p.surname)+escapeHtml(A_p.givenName), escapeHtml(dataB.surname)+escapeHtml(dataB.givenName||'')), '伴侶關係')}
      <div class="disclaimer" style="border-top:none;margin-top:6px;padding-top:0;">
        <b>資料來源與演算方法：</b>本比對之雙方八字四柱、日主五行、十神關係、地支合沖，以及西洋太陽星座，皆分別呼叫與命盤主流程完全相同的天文排盤引擎即時演算，非套用固定合婚表。相性總分為四個面向（五行生剋、地支合沖、姻緣星互見、星座元素）依傳統命理／占星規則轉換之相對指標，用於呈現「命盤角度的契合程度」，並非精確的關係成功率預測，感情關係最終仍取決於雙方的相處、溝通與共同經營，僅供參考。
      </div>
      ${(ctxA.p.unknownHour || dataB.unknownHour) ? `<div class="error-box" style="margin-top:14px;">⚠️ ${ctxA.p.unknownHour && dataB.unknownHour ? '甲方與乙方皆為「時辰未知」' : (ctxA.p.unknownHour ? '甲方為「時辰未知」' : '乙方為「時辰未知」')}，系統暫以中午12:00代入計算時柱與太陽星座，這會影響日主日柱、姻緣星互見與太陽星座等關鍵比對項目的準確性——換言之，這份合盤結果，比對的其實是「以中午出生」為前提的另一組命盤，並非真實命盤。若能補齊準確出生時間，比對結果會更貼近真實命盤。</div>` : ''}
    `;
    resultBox.innerHTML = html;
    resultBox.scrollIntoView({behavior:'smooth', block:'start'});
  }

  document.getElementById('compatSubmitBtn')?.addEventListener('click', ()=>{
    if(!lastCtx){ showFriendlyError('請先完成上方「輸入出生資料」排出你自己（甲方）的命盤，再進行合盤比對。'); return; }
    const cSurname = document.getElementById('cSurname').value.trim() || '乙方';
    const cGivenName = document.getElementById('cGivenName').value.trim();
    const cGender = document.querySelector('input[name=cGender]:checked').value;
    const cDateVal = document.getElementById('cBirthDate').value;
    if(!cDateVal){ showFriendlyError('請選擇乙方出生日期'); return; }
    const cTimeVal = document.getElementById('cBirthTime').value || '12:00';
    const cUnknownHour = document.getElementById('cUnknownHour').checked;
    const cLongitude = parseFloat(document.getElementById('cLongitude').value)||121.5;
    const cLatitude = parseFloat(document.getElementById('cLatitude').value)||25.03;
    if(isNaN(cLongitude) || Math.abs(cLongitude)>180){ showFriendlyError('乙方經度數值有誤，請輸入 -180 至 180 之間的數字（東經為正）。'); return; }
    if(isNaN(cLatitude) || Math.abs(cLatitude)>90){ showFriendlyError('乙方緯度數值有誤，請輸入 -90 至 90 之間的數字（北緯為正）。'); return; }
    const [cy,cm,cd] = cDateVal.split('-').map(Number);
    let [chh,cmm] = cTimeVal.split(':').map(Number);
    if(cUnknownHour){ chh=12; cmm=0; }

    try{
      const tzOffset = 8;
      const baziInputB = {year:cy,month:cm,day:cd,hour:chh,minute:cmm,tzOffset,longitude:cLongitude,useTrueSolarTime:true};
      const baziB = B.computeFourPillars(baziInputB);
      const wuxingB = B.wuxingScore(baziB.pillars);
      const jdUTB = A.toJD(cy,cm,cd,(chh+cmm/60)-tzOffset);
      const astroB = AC.computeChart(jdUTB);
      renderCompat(lastCtx, {
        surname:cSurname, givenName:cGivenName, gender:cGender, y:cy, m:cm, d:cd,
        bazi:baziB, wuxing:wuxingB, astro:astroB, unknownHour:cUnknownHour,
      });
    }catch(err){
      console.error(err);
      showFriendlyError('乙方命盤計算發生錯誤，請確認出生日期是否正確（支援範圍約西元1901~2098年）。');
    }
  });

  // ---------- 流年運勢 9~90歲：以真實命盤四柱＋逐年干支演算 ----------
  const CLASH_MAP = {'子':'午','丑':'未','寅':'申','卯':'酉','辰':'戌','巳':'亥','午':'子','未':'丑','申':'寅','酉':'卯','戌':'辰','亥':'巳'};
  const LIUHE_MAP = {'子':'丑','丑':'子','寅':'亥','亥':'寅','卯':'戌','戌':'卯','辰':'酉','酉':'辰','巳':'申','申':'巳','午':'未','未':'午'};
  const GAN_HE_PAIRS = [['甲','己'],['乙','庚'],['丙','辛'],['丁','壬'],['戊','癸']];
  function isGanHe(g1,g2){ return GAN_HE_PAIRS.some(pair=> (pair[0]===g1&&pair[1]===g2)||(pair[1]===g1&&pair[0]===g2)); }
  // 地支六害：子未害、丑午害、寅巳害、卯辰害、申亥害、酉戌害
  const HAI_MAP = {'子':'未','未':'子','丑':'午','午':'丑','寅':'巳','巳':'寅','卯':'辰','辰':'卯','申':'亥','亥':'申','酉':'戌','戌':'酉'};
  // 地支三刑：寅巳申（無恩之刑）、丑戌未（恃勢之刑）、子卯（無禮之刑，兩兩相刑）、辰午酉亥（自刑，需兩字相同）
  const XING_TRIPLET_1 = ['寅','巳','申'];
  const XING_TRIPLET_2 = ['丑','戌','未'];
  const XING_SELF = ['辰','午','酉','亥'];
  function isXing(a, b){
    if(a===b) return XING_SELF.includes(a); // 自刑：地支相同且屬辰午酉亥
    if(XING_TRIPLET_1.includes(a) && XING_TRIPLET_1.includes(b)) return true;
    if(XING_TRIPLET_2.includes(a) && XING_TRIPLET_2.includes(b)) return true;
    if((a==='子'&&b==='卯')||(a==='卯'&&b==='子')) return true;
    return false;
  }
  // 三合桃花：申子辰見酉、寅午戌見卯、巳酉丑見午、亥卯未見子
  const PEACH_GROUP = [
    {members:['申','子','辰'], peach:'酉'},
    {members:['寅','午','戌'], peach:'卯'},
    {members:['巳','酉','丑'], peach:'午'},
    {members:['亥','卯','未'], peach:'子'},
  ];
  function getPeachZhi(refZhi){
    const g = PEACH_GROUP.find(g=>g.members.includes(refZhi));
    return g ? g.peach : null;
  }
  const PALACE_LABEL = {year:'根基／長輩宮', month:'事業／父母手足宮', day:'配偶宮', hour:'子女／晚年宮'};
  const PALACE_CLASH_TAG = {year:'沖根基宮', month:'沖事業宮', day:'沖配偶宮', hour:'沖子女宮'};

  const LN_TAG_STYLE = {
    '桃花':{bg:'rgba(198,107,100,0.14)',fg:'var(--crimson-soft)',bd:'var(--crimson-soft)'},
    '沖配偶宮':{bg:'rgba(178,59,53,0.16)',fg:'var(--crimson-soft)',bd:'var(--crimson)'},
    '沖事業宮':{bg:'rgba(178,59,53,0.14)',fg:'var(--crimson-soft)',bd:'var(--crimson-soft)'},
    '沖根基宮':{bg:'rgba(178,59,53,0.12)',fg:'var(--crimson-soft)',bd:'var(--line)'},
    '沖子女宮':{bg:'rgba(178,59,53,0.12)',fg:'var(--crimson-soft)',bd:'var(--line)'},
    '合配偶宮':{bg:'rgba(127,172,154,0.16)',fg:'var(--jade-soft)',bd:'var(--jade)'},
    '天干相合':{bg:'rgba(127,172,154,0.12)',fg:'var(--jade-soft)',bd:'var(--jade-soft)'},
    '姻緣星動':{bg:'rgba(198,107,100,0.14)',fg:'var(--crimson-soft)',bd:'var(--crimson-soft)'},
    '正財旺':{bg:'rgba(127,172,154,0.14)',fg:'var(--jade-soft)',bd:'var(--jade-soft)'},
    '偏財機會':{bg:'rgba(51,68,122,0.14)',fg:'var(--gold-soft)',bd:'var(--gold-soft)'},
    '創業佳':{bg:'rgba(184,146,90,0.16)',fg:'var(--jade-soft)',bd:'var(--jade)'},
    '防破財':{bg:'rgba(178,59,53,0.14)',fg:'var(--crimson-soft)',bd:'var(--crimson-soft)'},
    '壓力年':{bg:'rgba(178,59,53,0.14)',fg:'var(--crimson-soft)',bd:'var(--crimson-soft)'},
    '升遷責任':{bg:'rgba(51,68,122,0.14)',fg:'var(--gold-soft)',bd:'var(--gold-soft)'},
    '貴人進修':{bg:'rgba(127,172,154,0.14)',fg:'var(--jade-soft)',bd:'var(--jade-soft)'},
    '同干年':{bg:'rgba(51,68,122,0.14)',fg:'var(--gold-soft)',bd:'var(--gold-soft)'},
    '值太歲':{bg:'rgba(51,68,122,0.16)',fg:'var(--gold-soft)',bd:'var(--gold)'},
    '沖太歲':{bg:'rgba(178,59,53,0.18)',fg:'var(--crimson-soft)',bd:'var(--crimson)'},
    '刑太歲':{bg:'rgba(178,59,53,0.14)',fg:'var(--crimson-soft)',bd:'var(--crimson-soft)'},
    '害太歲':{bg:'rgba(178,59,53,0.10)',fg:'var(--crimson-soft)',bd:'var(--line)'},
    '同干月':{bg:'rgba(51,68,122,0.14)',fg:'var(--gold-soft)',bd:'var(--gold-soft)'},
    '同干日':{bg:'rgba(51,68,122,0.14)',fg:'var(--gold-soft)',bd:'var(--gold-soft)'},
  };
  // v8.8：新增可選的 age 參數，未成年（<18歲）時標籤文字改用 LN_TAG_MINOR_LABEL 的中性用語顯示，
  // 樣式（顏色）仍依原始標籤 t 對照 LN_TAG_STYLE，僅顯示文字不同，內部資料與評分邏輯不受影響。
  // 注意：呼叫端若用 array.map(tagChip) 會把索引值當成第二參數傳入，因此涉及未成年判斷的呼叫都改用
  // array.map(t=>tagChip(t, age)) 明確帶入實際年齡，其餘不需年齡判斷的呼叫維持 array.map(t=>tagChip(t))。
  function tagChip(t, age){
    const s = LN_TAG_STYLE[t] || {bg:'rgba(51,68,122,0.10)',fg:'var(--paper-dim)',bd:'var(--line)'};
    const label = (typeof age==='number' && !isNaN(age) && age<18 && LN_TAG_MINOR_LABEL[t]) ? LN_TAG_MINOR_LABEL[t] : t;
    return `<span class="ltag" style="background:${s.bg};color:${s.fg};border-color:${s.bd};">${label}</span>`;
  }

  const SHISHEN_HINT = {
    '比肩':'人脈往來頻繁，凡事宜與人商量，合夥出資要更謹慎。',
    '劫財':'荷包容易漏財，借貸、投資、合夥都要三思，避免破財。',
    '食神':'心情愉快、才華容易被看見，適合經營興趣、才藝或副業。',
    '傷官':'想法多、表現慾強，是轉換跑道或嘗試新事業的年份，但言語要收斂，避免因言惹禍。',
    '正財':'正財穩定入袋，本業收入、加薪或穩健理財是這年的重點。',
    '偏財':'偏財機會浮現（投資、兼差、業外收入），但投機性強，切勿貪心大額下注。',
    '正官':'責任加重、有升遷或轉正的機會，按部就班會走得比較順。',
    '七殺':'壓力與挑戰並存，行動力強但情緒容易緊繃，重大決策前務必多評估風險。',
    '正印':'貴人運佳，適合進修、考證照或尋求前輩、長輩提攜。',
    '偏印':'獨立鑽研運強，想法特別、專業能有突破，但人際互動要更主動開放。',
    '日主':'同干年（流年天干與日主相同），凡事宜求穩，避免衝動做重大變動的決定。',
  };

  // v8.8新增：0~17歲（未成年）不應出現投資、兼差、創業、升遷、婚姻／桃花等成人情境的提醒文字，
  // 因此依「兒童（0~11歲）」「青少年（12~17歲）」分別提供貼近該階段生活情境的措辭；
  // 18歲以上（成年）仍沿用原本的 SHISHEN_HINT，內容與行為不變。
  const SHISHEN_HINT_CHILD = {
    '比肩':'人際互動熱絡，容易和同儕玩在一起，藉機引導孩子學習分享與相處的分寸。',
    '劫財':'玩具、文具等個人物品較容易遺失或損壞，適合藉機建立愛惜物品的習慣。',
    '食神':'心情愉快、才藝表現容易被看見，適合安排才藝課、體能活動或發展興趣。',
    '傷官':'想法多、表達慾強，聰明活潑但情緒起伏較大，宜多留意言語禮貌，避免與同學、手足起爭執。',
    '正財':'生活與學習狀況穩定，維持規律作息、按部就班即可。',
    '偏財':'容易有小驚喜、小禮物或意外收穫，是建立正確金錢觀念的好時機，家長宜引導量力而為，避免養成亂花錢的習慣。',
    '正官':'規矩觀念增強，適合建立生活常規與紀律，按表操課會走得比較順。',
    '七殺':'活動力旺盛、精力充沛，但情緒容易緊繃，建議安排適度運動釋放精力，並多留意居家與戶外活動安全。',
    '正印':'長輩緣佳、貴人運旺，適合學習新事物、閱讀啟蒙或才藝訓練。',
    '偏印':'想法獨特、有主見，學習吸收能力不錯，可多鼓勵人際互動更主動開放一些。',
    '日主':'同干年（流年天干與日主相同），生活作息宜求穩定規律，避免過度躁動或大幅度改變。',
  };
  const SHISHEN_HINT_TEEN = {
    '比肩':'交友圈擴大、人際互動頻繁，凡事宜多與家人師長商量，共同出資或借貸更要謹慎。',
    '劫財':'零用錢或個人物品較容易超支損耗，適合開始學習基礎理財與儲蓄觀念。',
    '食神':'才華容易展現，適合發展興趣、參加社團或才藝競賽，成果值得期待。',
    '傷官':'想法活躍、表現慾強，是嘗試新事物、參加比賽的好時機，但言語要收斂，避免與師長同學起衝突。',
    '正財':'學習與生活步調穩定，若有打工或零用錢，適合養成記帳與儲蓄的習慣。',
    '偏財':'意外機會增加（如比賽獎金、短期打工收入），但不宜有投機心態，理財決定建議先與家人討論。',
    '正官':'責任感增強，擔任班級幹部或負責重要任務有機會受到肯定，按部就班會走得比較順。',
    '七殺':'課業或活動壓力較大，行動力強但情緒容易緊繃，重大決定前宜多與師長家人討論、評估風險。',
    '正印':'貴人運佳，適合進修、參加課外學習或尋求師長前輩指導提攜。',
    '偏印':'獨立思考能力強，想法特別、學習上能有突破，但人際互動可以更主動開放一些。',
    '日主':'同干年（流年天干與日主相同），凡事宜求穩，避免衝動做重大變動的決定。',
  };
  // 依年齡取得對應版本的十神提醒文字：0~11歲兒童版、12~17歲青少年版、18歲以上成年版。
  // age 為 undefined／NaN（例如尚未帶入實際年齡的呼叫點）時，一律視為成年版，維持既有行為不變。
  function shishenHintForAge(shishen, age){
    if(typeof age==='number' && !isNaN(age)){
      if(age<12) return SHISHEN_HINT_CHILD[shishen] || SHISHEN_HINT[shishen] || '';
      if(age<18) return SHISHEN_HINT_TEEN[shishen] || SHISHEN_HINT[shishen] || '';
    }
    return SHISHEN_HINT[shishen] || '';
  }
  // 未成年不宜直接標示「桃花／姻緣星動／配偶宮」等婚戀字眼，也不宜標示「偏財機會／創業佳／升遷責任／防破財」
  // 等投資、創業、職場字眼；標籤本身（非僅內文說明）一併替換為貼近未成年生活情境的中性用語。
  const LN_TAG_MINOR_LABEL = {
    '桃花':'人緣佳', '姻緣星動':'人緣佳', '合配偶宮':'人際和諧', '沖配偶宮':'人際摩擦',
    '偏財機會':'意外驚喜', '創業佳':'才藝發展', '升遷責任':'責任感增強', '防破財':'愛惜物品',
  };

  // 取得某年立春後的真實年柱干支（呼叫與本站八字排盤相同的天文節氣引擎）
  function ganZhiOfYear(calendarYear, longitude, useTrueSolarTime){
    const r = B.computeFourPillars({year:calendarYear, month:2, day:15, hour:12, minute:0, tzOffset:8, longitude, useTrueSolarTime:!!useTrueSolarTime});
    return r.pillars.year;
  }

  // 地支藏干次要十神（增加分析的真實層次，非僅取單一天干）
  // v8.9.3修正：原本固定跳過「本氣」，但寅／丑／未／申這4個地支的「中氣」或「餘氣」在特定60甲子組合下
  // 會與該柱自己的天干重複（例如丙寅年，寅的中氣正好也是丙），導致附註把主十神自己又列一次，
  // 讀起來像多了一個獨立訊號。修正為：額外排除「與本柱天干相同」的藏干，只顯示真正不同的次要十神。
  function hiddenShishenText(dayGan, zhi, pillarGan){
    const hidden = B.ZHI_HIDDEN[zhi] || [];
    if(hidden.length<=1) return '';
    const rest = hidden.slice(1).filter(([g])=>g!==pillarGan).map(([g])=>B.getShishen(dayGan, g));
    if(rest.length===0) return '';
    return `（地支藏干另帶${rest.join('、')}之氣）`;
  }

  function marriageDecadeText(gender, spouseYears, peachYears, clashYears, heYears, totalYears){
    if(totalYears===0) return '此區間資料不足，暫不評估。';
    let t = '';
    if(spouseYears>0) t += `十年內有 <b>${spouseYears}</b> 個年份姻緣星（${gender==='M'?'正財／偏財':'正官／七殺'}）浮現，是比較容易認識對象、關係升溫或考慮進入婚姻的時間點；`;
    if(peachYears>0) t += `另有 <b>${peachYears}</b> 個桃花年，單身者人際魅力提升、有機會遇到心儀對象，${gender==='M'?'已婚男士':'已婚女士'}則要留意分寸，避免因曖昧或誘惑影響家庭；`;
    if(heYears>0) t += `其中 <b>${heYears}</b> 個年份與配偶宮六合，感情關係容易更緊密、有機會論及婚嫁或修復關係；`;
    if(clashYears>0) t += `另有 <b>${clashYears}</b> 個年份流年沖動配偶宮，感情或婚姻容易出現爭執、聚少離多或關係轉折，建議這幾年多溝通、少猜忌，重大決定（如離婚、外遇糾紛）更要冷靜；`;
    if(!t) t = '整體婚姻感情運勢平穩，維持原有相處步調、用心經營即可，沒有特別需要提高警覺的年份。';
    return t;
  }

  function bizDecadeText(favCount, cautionCount, totalYears){
    if(totalYears===0) return '';
    if(favCount>=cautionCount && favCount>0){
      return `十年內約有 <b>${favCount}</b> 個年份財源、創意條件較佳，是評估創業、開發副業或擴大投資的相對好時機，建議挑選這些年份啟動計畫，仍要先小規模測試再放大；`;
    } else if(cautionCount>favCount){
      return `十年內約有 <b>${cautionCount}</b> 個年份不利大額投資或合夥創業，若已在創業路上，這些年要特別注意資金調度與合夥糾紛，避免因人破財；`;
    }
    return '創業條件普通，建議以穩紮穩打、先累積資源與人脈為主，不必躁進。';
  }

  // ---------- 流年運勢視覺化圖表（依真實流年十神／合沖訊號換算之相對分數繪製折線圖，非另編數據） ----------
  function buildFortuneChartSvg(ageRows, fullDayun){
    const W = 920, H = 230, padL = 34, padR = 14, padT = 20, padB = 34;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const minAge = ageRows[0].age, maxAge = ageRows[ageRows.length-1].age;
    const span = Math.max(1, maxAge-minAge);
    const xOf = age => padL + (age-minAge)/span * plotW;
    const yOf = score => padT + (1 - score/100) * plotH;
    const pathPts = ageRows.map(r=>`${xOf(r.age).toFixed(1)},${yOf(r.score).toFixed(1)}`);
    const linePath = 'M' + pathPts.join(' L');
    const areaPath = linePath + ` L${xOf(maxAge).toFixed(1)},${(padT+plotH).toFixed(1)} L${xOf(minAge).toFixed(1)},${(padT+plotH).toFixed(1)} Z`;

    let dayunLines = '', dayunLabels = '';
    fullDayun.forEach(du=>{
      if(du.startAge>minAge && du.startAge<maxAge){
        const x = xOf(du.startAge);
        dayunLines += `<line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${(padT+plotH).toFixed(1)}" stroke="var(--line)" stroke-width="1" stroke-dasharray="3,3"/>`;
      }
      const segStart = Math.max(du.startAge, minAge), segEnd = Math.min(du.endAge, maxAge);
      if(segEnd>segStart){
        const mid = (segStart+segEnd)/2;
        dayunLabels += `<text x="${xOf(mid).toFixed(1)}" y="${(padT-6).toFixed(1)}" text-anchor="middle" font-size="11" fill="var(--gold-soft)" font-family="var(--serif)">${du.gan}${du.zhi}</text>`;
      }
    });
    let xTicks = '';
    for(let a=Math.ceil(minAge/10)*10; a<=maxAge; a+=10){
      xTicks += `<text x="${xOf(a).toFixed(1)}" y="${(H-10).toFixed(1)}" text-anchor="middle" font-size="11" fill="var(--paper-dim)">${a}歲</text>`;
    }
    const yMid = yOf(50);
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">
      <defs>
        <linearGradient id="fcGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--gold)" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="var(--gold)" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      <line x1="${padL}" y1="${yMid.toFixed(1)}" x2="${(W-padR).toFixed(1)}" y2="${yMid.toFixed(1)}" stroke="var(--line)" stroke-width="1"/>
      ${dayunLines}
      <path d="${areaPath}" fill="url(#fcGrad)" stroke="none"/>
      <path d="${linePath}" fill="none" stroke="var(--gold)" stroke-width="2.2"/>
      ${dayunLabels}
      ${xTicks}
    </svg>`;
  }

  // ---------- v8.2新增：大運／流年共用計算（原本內嵌於 renderLiunian，抽成獨立函式後「流年運勢」與新增的
  // 「命盤時間軸」頁籤共用同一套資料來源，確保兩個頁籤呈現的大運與流年資訊 100% 一致，不會各算各的） ----------
  function buildFullDayunList(dayun, bazi){
    const monthGanIdx0 = B.GAN.indexOf(bazi.pillars.month.gan);
    const monthZhiIdx0 = B.ZHI.indexOf(bazi.pillars.month.zhi);
    const isForward = dayun.isForward;
    const startAgeF = parseFloat(dayun.startAge);
    const fullDayun = (dayun.dayunList||[]).map(d=>({gan:d.gan, zhi:d.zhi, startAge:parseFloat(d.startAge), endAge:parseFloat(d.endAge)}));
    let lastEnd = fullDayun.length ? fullDayun[fullDayun.length-1].endAge : startAgeF;
    let stepBase = fullDayun.length;
    while(lastEnd < 91){
      stepBase += 1;
      const step = isForward ? stepBase : -stepBase;
      const ganIdx = ((monthGanIdx0+step)%10+10)%10;
      const zhiIdx = ((monthZhiIdx0+step)%12+12)%12;
      const startAge = startAgeF + (stepBase-1)*10;
      const endAge = startAgeF + stepBase*10;
      fullDayun.push({gan:B.GAN[ganIdx], zhi:B.ZHI[zhiIdx], startAge, endAge});
      lastEnd = endAge;
    }
    return fullDayun;
  }
  const LN_TAG_WEIGHT = {
    '正財旺':3,'創業佳':2.5,'貴人進修':3,'合配偶宮':2.5,'天干相合':1.5,'偏財機會':2,'升遷責任':1,
    '同干年':0.5,'桃花':1,'姻緣星動':1,
    '防破財':-3,'壓力年':-2.5,'沖配偶宮':-2,'沖事業宮':-2.5,'沖根基宮':-1.5,'沖子女宮':-1.5,
    '值太歲':-1,'沖太歲':-2.5,'刑太歲':-2,'害太歲':-1.5,
  };
  function buildAgeRowsAndScore(ctx){
    const {p, bazi} = ctx;
    const dayGan = bazi.pillars.day.gan;
    const dayZhi = bazi.pillars.day.zhi;
    const peachZhi = getPeachZhi(dayZhi);
    const spouseStars = p.gender==='M' ? ['正財','偏財'] : ['正官','七殺'];
    const natalZhi = {year:bazi.pillars.year.zhi, month:bazi.pillars.month.zhi, day:dayZhi};
    if(!p.unknownHour && bazi.pillars.hour) natalZhi.hour = bazi.pillars.hour.zhi;
    const MAX_YEAR = 2098;
    const ageRows = [];
    for(let age=9; age<=90; age++){
      const calendarYear = p.y + age;
      if(calendarYear>MAX_YEAR) break;
      let yGZ;
      try{ yGZ = ganZhiOfYear(calendarYear, p.longitude, p.useTrueSolarTime); }catch(e){ continue; }
      const flowShishen = B.getShishen(dayGan, yGZ.gan);
      const tags = flowTags(natalZhi, dayZhi, dayGan, yGZ.gan, yGZ.zhi, flowShishen, spouseStars, peachZhi, '年');
      ageRows.push({age, calendarYear, gz:yGZ.gan+yGZ.zhi, shishen:flowShishen, tags, hiddenText:hiddenShishenText(dayGan, yGZ.zhi, yGZ.gan)});
    }
    ageRows.forEach(r=>{
      let raw = 0;
      r.tags.forEach(t=>{ raw += (LN_TAG_WEIGHT[t]||0); });
      r.score = Math.max(8, Math.min(95, Math.round(50 + raw*6)));
    });
    return ageRows;
  }

  // ================= v9.7新增：反饋校準機制（MVP）——讓使用者針對各項判斷給予👍👎，並提供聚合統計 =================
  // 設計理念：這是「先埋點、後分析」的第一步。本版本僅做到：①在關鍵判斷旁提供輕量回饋按鈕
  // ②將回饋存在使用者自己的裝置（localStorage，不上傳雲端，與全站「資料不上雲端」原則一致）
  // ③提供一個聚合統計頁籤，讓使用者自己也能看到「哪些類型的判斷被自己標記為準/不準」。
  // 本版本尚未做到「依回饋自動調整演算法權重」（真正的自我校準），這需要更大量的回饋資料與離線分析，
  // 是後續版本可以在此基礎上繼續擴充的方向，此處誠實標示為MVP（最小可行版本）。
  const FEEDBACK_KEY = 'zhenmingpan_feedback_v1';
  const FEEDBACK_MAX = 500;
  function getFeedbackList(){
    try{ const arr = JSON.parse(localStorage.getItem(FEEDBACK_KEY) || '[]'); return Array.isArray(arr) ? arr : []; }
    catch(e){ return []; }
  }
  function submitFeedback(category, label, vote){
    const list = getFeedbackList();
    list.push({ category, label, vote, ts: Date.now() });
    while(list.length > FEEDBACK_MAX) list.shift();
    try{ localStorage.setItem(FEEDBACK_KEY, JSON.stringify(list)); }
    catch(e){ showFriendlyError('回饋紀錄儲存失敗，可能是瀏覽器儲存空間已滿，或目前處於無痕模式導致無法使用本機儲存。'); }
  }
  function getFeedbackStats(){
    const list = getFeedbackList();
    const byCategory = {};
    list.forEach(item=>{
      if(!byCategory[item.category]) byCategory[item.category] = { up:0, down:0 };
      if(item.vote==='up') byCategory[item.category].up++;
      else if(item.vote==='down') byCategory[item.category].down++;
    });
    return { total: list.length, byCategory, raw: list };
  }
  function clearFeedback(){ try{ localStorage.removeItem(FEEDBACK_KEY); }catch(e){} }

  // 每個回饋widget依category+label產生唯一DOM id（同一頁可能有多個回饋點，例如流年運勢每個年份各一個）
  function feedbackWidgetHtml(category, label){
    const uid = 'fb_' + category + '_' + Array.from(label).reduce((h,c)=>((h<<5)-h+c.charCodeAt(0))|0, 0);
    return `<div class="feedback-widget" data-category="${escapeHtml(category)}" data-label="${escapeHtml(label)}" id="${uid}" style="display:flex;align-items:center;gap:10px;margin-top:10px;font-size:14px;color:var(--paper-dim);">
      <span>這個判斷準嗎？</span>
      <button type="button" class="fb-btn fb-up" style="border:1px solid var(--jade-soft);color:var(--jade-soft);background:transparent;border-radius:8px;padding:3px 10px;cursor:pointer;">👍 準</button>
      <button type="button" class="fb-btn fb-down" style="border:1px solid var(--crimson-soft);color:var(--crimson-soft);background:transparent;border-radius:8px;padding:3px 10px;cursor:pointer;">👎 不準</button>
      <span class="fb-thanks" style="display:none;color:var(--gold-soft);">已記錄，感謝回饋！</span>
    </div>`;
  }
  function wireFeedbackWidgets(root){
    root.querySelectorAll('.feedback-widget').forEach(widget=>{
      if(widget.dataset.wired) return;
      widget.dataset.wired = '1';
      const category = widget.dataset.category, label = widget.dataset.label;
      widget.querySelectorAll('.fb-btn').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const vote = btn.classList.contains('fb-up') ? 'up' : 'down';
          submitFeedback(category, label, vote);
          widget.querySelectorAll('.fb-btn').forEach(b=>{ b.disabled = true; b.style.opacity = 0.4; });
          widget.querySelector('.fb-thanks').style.display = 'inline';
        });
      });
    });
  }

  // ================= v9.8.1新增：人生事件紀錄（共用資料層）=================
  // 設計理念：「時辰反推校準器」與「人生事件回測」兩項新功能都需要使用者輸入真實發生過的人生事件
  // （日期＋類型），故抽出成一份共用的資料結構與存取函式，避免兩處各自維護一份重複資料。
  // 與「準確度回饋」機制一致：全部存在使用者自己裝置的localStorage，不上傳雲端。
  const EVENT_LOG_KEY = 'zhenmingpan_events_v1';
  const EVENT_LOG_MAX = 200;
  // 事件類型＋其對應的「預期流年訊號」（對照buildAgeRowsAndScore／flowTags產生的LN_TAG_WEIGHT標籤），
  // 用於時辰校準與回測比對——例如「結婚」事件發生的那一年，若流年標籤中有「合配偶宮」或「姻緣星動」，
  // 視為該時辰假設或該模組「命中」；此對照表是本功能的核心依據，未來如需更精細，可繼續擴充。
  const EVENT_CATEGORIES = [
    { id:'upgrade',  label:'升學／考試',   expectTags:['貴人進修'] },
    { id:'move',     label:'搬家／遷移',   expectTags:['沖根基宮','壓力年'] },
    { id:'breakup',  label:'分手／離婚',   expectTags:['沖配偶宮'] },
    { id:'marriage', label:'結婚／訂婚',   expectTags:['合配偶宮','姻緣星動','桃花'] },
    { id:'job',      label:'換工作／升遷', expectTags:['升遷責任','創業佳','沖事業宮'] },
    { id:'illness',  label:'重大病痛',     expectTags:['壓力年','沖根基宮'] },
    { id:'money',    label:'財務重大變動', expectTags:['正財旺','偏財機會','防破財'] },
    { id:'other',    label:'其他重大事件', expectTags:[] },
  ];
  const EVENT_CATEGORY_MAP = Object.fromEntries(EVENT_CATEGORIES.map(c=>[c.id, c]));
  function getEventLog(){
    try{ const arr = JSON.parse(localStorage.getItem(EVENT_LOG_KEY) || '[]'); return Array.isArray(arr) ? arr : []; }
    catch(e){ return []; }
  }
  function saveEventLog(list){
    try{ localStorage.setItem(EVENT_LOG_KEY, JSON.stringify(list)); }
    catch(e){ showFriendlyError('事件紀錄儲存失敗，可能是瀏覽器儲存空間已滿，或目前處於無痕模式導致無法使用本機儲存。'); }
  }
  function addLifeEvent(dateStr, categoryId, note){
    const list = getEventLog();
    list.push({ id:'ev_'+Date.now()+'_'+Math.random().toString(36).slice(2,7), date:dateStr, category:categoryId, note:note||'', ts:Date.now() });
    while(list.length > EVENT_LOG_MAX) list.shift();
    saveEventLog(list);
    return list;
  }
  function deleteLifeEvent(id){
    saveEventLog(getEventLog().filter(e=>e.id!==id));
  }
  function eventLogTableHtml(events, opts){
    opts = opts || {};
    if(events.length===0){
      return `<p style="font-size:14px;color:var(--paper-dim);">尚未輸入任何人生事件。</p>`;
    }
    let html = `<table class="data-table"><tr><th>日期</th><th>類型</th><th>備註</th>${opts.deletable?'<th></th>':''}</tr>`;
    events.slice().sort((a,b)=>a.date.localeCompare(b.date)).forEach(ev=>{
      const cat = EVENT_CATEGORY_MAP[ev.category];
      html += `<tr><td>${escapeHtml(ev.date)}</td><td>${cat?escapeHtml(cat.label):escapeHtml(ev.category)}</td><td>${escapeHtml(ev.note||'—')}</td>${opts.deletable?`<td><button type="button" class="btn-mini danger event-del-btn" data-id="${ev.id}">刪除</button></td>`:''}</tr>`;
    });
    html += `</table>`;
    return html;
  }
  // 共用的「新增事件」表單HTML＋事件綁定，供時辰校準器／人生事件回測兩處呼叫，避免重複實作
  function eventLogFormHtml(formId){
    return `<div class="card" id="${formId}" style="margin-top:14px;">
      <div class="form-grid">
        <div class="field"><label for="${formId}_date">事件發生日期（約略即可）</label><input type="date" id="${formId}_date"></div>
        <div class="field"><label for="${formId}_cat">事件類型</label>
          <select id="${formId}_cat">${EVENT_CATEGORIES.map(c=>`<option value="${c.id}">${c.label}</option>`).join('')}</select>
        </div>
      </div>
      <div class="field full" style="margin-top:8px;"><label for="${formId}_note">備註（選填）</label><input type="text" id="${formId}_note" placeholder="例如：從台北搬到高雄"></div>
      <button type="button" class="btn-primary" id="${formId}_addBtn" style="margin-top:10px;">＋ 新增事件</button>
      <div id="${formId}_list" style="margin-top:14px;"></div>
    </div>`;
  }
  function wireEventLogForm(formId, onChange){
    function redraw(){
      const list = getEventLog();
      document.getElementById(formId+'_list').innerHTML = eventLogTableHtml(list, {deletable:true});
      document.querySelectorAll(`#${formId}_list .event-del-btn`).forEach(btn=>{
        btn.addEventListener('click', ()=>{ deleteLifeEvent(btn.dataset.id); redraw(); if(onChange) onChange(); });
      });
    }
    document.getElementById(formId+'_addBtn').addEventListener('click', ()=>{
      const dateEl = document.getElementById(formId+'_date');
      const catEl = document.getElementById(formId+'_cat');
      const noteEl = document.getElementById(formId+'_note');
      if(!dateEl.value){ showFriendlyError('請先選擇事件發生日期。'); return; }
      addLifeEvent(dateEl.value, catEl.value, noteEl.value);
      dateEl.value = ''; noteEl.value = '';
      redraw();
      if(onChange) onChange();
    });
    redraw();
  }

  // ================= v9.8.1新增：人生事件回測（升級「準確度回饋」，共用人生事件紀錄資料層）=================
  // 設計理念：與「時辰校準器」共用同一份人生事件紀錄，但這裡用的是使用者「已確認」的命盤（ctx.bazi），
  // 只跑一次（不像時辰校準器要跑12個時辰假設），檢查每個事件發生年份的流年訊號是否命中預期類型，
  // 讓使用者看到「我的命盤在哪些類型的事件上訊號較準」。目前僅涵蓋「八字流年」模組，紫微流年與西洋占星
  // 行運的回測屬於後續可擴充方向，此處誠實標示範圍，不誇大涵蓋度。
  function computeLifeEventBacktest(ctx){
    const { p, bazi } = ctx;
    const events = getEventLog();
    const usableEvents = events.filter(ev=>{
      const cat = EVENT_CATEGORY_MAP[ev.category];
      return cat && cat.expectTags.length>0 && /^\d{4}-\d{2}-\d{2}$/.test(ev.date);
    });
    if(usableEvents.length===0) return null;
    const dayGan = bazi.pillars.day.gan, dayZhi = bazi.pillars.day.zhi;
    const peachZhi = getPeachZhi(dayZhi);
    const spouseStars = p.gender==='M' ? ['正財','偏財'] : ['正官','七殺'];
    const natalZhi = { year:bazi.pillars.year.zhi, month:bazi.pillars.month.zhi, day:dayZhi };
    if(!p.unknownHour && bazi.pillars.hour) natalZhi.hour = bazi.pillars.hour.zhi;

    const perEvent = usableEvents.map(ev=>{
      const cat = EVENT_CATEGORY_MAP[ev.category];
      const [ey] = ev.date.split('-').map(Number);
      let yGZ, tags = [];
      try{
        yGZ = ganZhiOfYear(ey, p.longitude, p.useTrueSolarTime);
        const flowShishen = B.getShishen(dayGan, yGZ.gan);
        tags = flowTags(natalZhi, dayZhi, dayGan, yGZ.gan, yGZ.zhi, flowShishen, spouseStars, peachZhi, '年');
      }catch(e){ /* 年份超出曆算範圍時略過該筆 */ }
      const matched = cat.expectTags.filter(t=>tags.includes(t));
      return { event:ev, cat, yearGZ:yGZ, allTags:tags, matched, hit: matched.length>0 };
    });

    const byCategory = {};
    perEvent.forEach(r=>{
      if(!byCategory[r.cat.id]) byCategory[r.cat.id] = { label:r.cat.label, hit:0, total:0 };
      byCategory[r.cat.id].total++;
      if(r.hit) byCategory[r.cat.id].hit++;
    });
    const overallHit = perEvent.filter(r=>r.hit).length;
    return { perEvent, byCategory, overallHit, overallTotal: perEvent.length, skippedCount: events.length - usableEvents.length };
  }

  function renderLifeEventBacktestSection(ctx){
    const bt = computeLifeEventBacktest(ctx);
    let html = `<h3 style="margin:26px 0 12px;font-family:var(--serif);color:var(--gold-soft);">📈 人生事件回測</h3>`;
    html += `<div class="compat-intro">把你真實發生過的人生事件（結婚、換工作、搬家等）輸入進來，系統會用你「目前確認的命盤」檢查該年份的流年訊號是否命中對應類型——這是目前唯一能讓你看到「我的命盤到底準在哪」的方式，跟上方單純按👍👎不同，是拿真實事件直接對照。目前僅涵蓋八字流年模組，紫微流年與西洋占星行運的回測尚未涵蓋在內。</div>`;
    html += eventLogFormHtml('backtestEvents');

    if(bt){
      html += `<div class="card" style="margin-top:14px;"><h4 style="margin:0 0 10px;color:var(--gold-soft);">整體命中率：${bt.overallHit}／${bt.overallTotal}（${bt.overallTotal>0?Math.round(bt.overallHit/bt.overallTotal*100):0}%）</h4>
        <table class="data-table"><tr><th>事件類型</th><th>命中</th><th>總數</th><th>命中率</th></tr>
        ${Object.values(bt.byCategory).map(c=>`<tr><td>${c.label}</td><td style="color:var(--jade-soft);">${c.hit}</td><td>${c.total}</td><td>${Math.round(c.hit/c.total*100)}%</td></tr>`).join('')}
        </table>
      </div>`;
      html += `<div class="card" style="margin-top:14px;"><h4 style="margin:0 0 10px;color:var(--gold-soft);">逐筆事件明細</h4>`;
      bt.perEvent.forEach(r=>{
        html += `<div style="padding:8px 0;border-bottom:1px solid var(--line);">
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;">
            <span>${r.event.date}・${r.cat.label}${r.event.note?`（${escapeHtml(r.event.note)}）`:''}</span>
            <span>${r.hit?tagChip('命中：'+r.matched.join('、')):tagChip('未命中該年訊號')}</span>
          </div>
        </div>`;
      });
      html += `</div>`;
      if(bt.skippedCount>0) html += `<p style="font-size:14px;color:var(--paper-dim);margin-top:8px;">另有 ${bt.skippedCount} 筆「其他重大事件」未納入回測（無對應流年訊號可判斷）。</p>`;
    }

    html += explainDetail(`
      <h5>「命中」是怎麼判定的？</h5>
      <p style="font-size:14px;color:var(--paper-dim);line-height:1.85;">每個事件類型都對照一組「預期流年訊號」（例如「結婚」對照「合配偶宮」「姻緣星動」「桃花」），系統用你目前確認的命盤，計算該事件發生年份的流年訊號（與「流年運勢」頁籤同一套邏輯），只要出現任一預期訊號就算「命中」。這是規則式比對，不是AI判斷，也沒有「模糊命中」的灰色地帶。</p>
      <h5>命中率低代表命盤不準嗎？</h5>
      <p style="font-size:14px;color:var(--paper-dim);line-height:1.85;">不一定。命中率會受幾個因素影響：事件分類是否精確（例如「換工作」但其實是被資遣，情緒訊號可能更接近「壓力年」而非「升遷責任」）、事件數量是否足夠（樣本太少誤差大）、以及本站流年訊號本身的判斷粒度（僅涵蓋十神與地支合沖刑害，並非完整子平法的所有技法）。命中率是「這一套簡化規則對你個人的相對吻合度」，不是對整個八字學說準確性的檢驗。</p>
    `);
    return html;
  }

  function renderFeedbackStats(ctx){
    const panel = document.getElementById('panel-feedback');
    if(!panel) return;
    function draw(){
      const stats = getFeedbackStats();
      let html = `<div class="compat-intro">你在各頁籤點選過的「這個判斷準嗎？」回饋會統計在這裡，資料只存在你自己的裝置中（localStorage），不會上傳雲端或傳送給任何人；目前僅提供聚合檢視，尚未用於自動調整演算法權重（詳見下方說明）。</div>`;
      if(stats.total===0){
        html += `<div class="error-box">目前還沒有任何回饋紀錄，到「流年運勢」「擇日」「年度綜合摘要」等頁籤點選👍／👎即可開始累積。</div>`;
      }else{
        html += `<div class="card" style="margin-top:14px;"><h3 style="margin:0 0 12px;font-family:var(--serif);color:var(--gold-soft);">回饋統計（共 ${stats.total} 筆）</h3>
          <table class="data-table"><tr><th>類型</th><th>👍 準</th><th>👎 不準</th><th>準確率</th></tr>`;
        Object.entries(stats.byCategory).forEach(([cat, s])=>{
          const rate = (s.up+s.down)>0 ? Math.round(s.up/(s.up+s.down)*100) : 0;
          html += `<tr><td>${escapeHtml(cat)}</td><td style="color:var(--jade-soft);">${s.up}</td><td style="color:var(--crimson-soft);">${s.down}</td><td>${rate}%</td></tr>`;
        });
        html += `</table></div>`;
        html += `<button type="button" class="btn-mini danger" id="fbClearBtn" style="margin-top:14px;">清除所有回饋紀錄</button>`;
      }
      html += explainDetail(`
        <h5>這個機制目前做到什麼程度？</h5>
        <p style="font-size:14px;color:var(--paper-dim);line-height:1.85;">目前是「MVP最小可行版本」，只做到蒐集你自己標記的準／不準統計，讓你自己能檢視哪些類型的判斷你覺得比較準；<b>尚未</b>做到依這些回饋自動調整命盤演算法的權重（真正的「自我校準」）。原因是：要讓調整真正有意義，需要夠大量、夠多樣本的回饋資料，且回饋本身帶有主觀性（同一個判斷不同人可能有不同感受），貿然依少量回饋調整核心演算法反而可能造成誤差，這是後續版本可以在此基礎上，搭配更嚴謹的統計方法繼續發展的方向。</p>
        <h5>回饋資料會被上傳嗎？</h5>
        <p style="font-size:14px;color:var(--paper-dim);line-height:1.85;">不會。所有回饋只存在你目前使用的瀏覽器裝置中（localStorage），與全站「資料不上雲端」的隱私原則一致；清除瀏覽器資料或更換裝置會遺失回饋紀錄，若需保留可搭配「命盤存摺」的匯出功能自行備份（未來版本可考慮將回饋資料一併納入匯出範圍）。</p>
      `);
      html += renderLifeEventBacktestSection(ctx);
      panel.innerHTML = '';
      panel.appendChild(el(`<div>${html}</div>`));
      const clearBtn = document.getElementById('fbClearBtn');
      if(clearBtn) clearBtn.addEventListener('click', ()=>{
        if(confirm('確定要清除所有回饋紀錄嗎？此動作無法復原。')){ clearFeedback(); draw(); }
      });
      wireEventLogForm('backtestEvents', ()=>draw());
    }
    draw();
  }

  function renderLiunian(ctx){
    const {p, bazi, wuxing} = ctx;
    const dayun = ctx.dayun;
    const panel = document.getElementById('panel-liunian');
    const dayGan = bazi.pillars.day.gan;
    const dayZhi = bazi.pillars.day.zhi;
    const dayGanWx = GAN_WX[dayGan];

    // 日主強弱（與「綜合運勢報告」同一套真實命盤五行分數估算，非另編數據）
    const totalWx = Object.values(wuxing).reduce((a,b)=>a+b,0);
    const generateMap = {'木':'水','火':'木','土':'火','金':'土','水':'金'};
    const supportWx = generateMap[dayGanWx];
    const supportScore = (wuxing[dayGanWx]||0) + (wuxing[supportWx]||0);
    const strength = totalWx>0 ? supportScore/totalWx : 0.35;
    const strengthLabel = strength>0.42 ? '偏強' : (strength<0.28 ? '偏弱' : '中和');

    // 大運序列：直接取用命盤真實計算出的 dayun.dayunList（8步大運，公式與排盤引擎完全一致），
    // 若起運歲數較早、原始8步大運仍不足涵蓋90歲，才依相同公式往後延伸。
    // v8.2：此計算已抽成 buildFullDayunList／buildAgeRowsAndScore 共用函式，與「命盤時間軸」頁籤共用同一組結果。
    const fullDayun = buildFullDayunList(dayun, bazi);
    const ageRows = buildAgeRowsAndScore(ctx); // {age, calendarYear, gz, shishen, tags, hiddenText, score}

    if(ageRows.length===0){
      panel.innerHTML = `<div class="error-box">出生年份超出本站曆算支援範圍（約西元1901~2098年），暫無法產生流年運勢。</div>`;
      return;
    }

    const totalWxAll = Object.values(wuxing).reduce((a,b)=>a+b,0) || 1;
    const wxBarsHtml = ['木','火','土','金','水'].map(wx=>{
      const pct = (wuxing[wx]||0)/totalWxAll*100;
      return `<div class="wx-row"><div class="wxname">${wx}</div><div class="bar-bg"><div class="bar-fill" style="width:${pct.toFixed(0)}%"></div></div><div class="wxval">${pct.toFixed(0)}%</div></div>`;
    }).join('');
    const fortuneChartBlock = `<div class="fortune-chart-wrap">
      <h4>📈 9~90歲整體運勢走勢圖（依每年正向／需謹慎訊號綜合評分，大運轉換點已標註）</h4>
      ${buildFortuneChartSvg(ageRows, fullDayun)}
      <p style="font-size:14px;color:var(--paper-dim);margin-top:8px;">分數以50分為基準，依當年流年十神、合沖等真實訊號加權換算之相對指標，非精確吉凶預測，用於快速掌握人生高低起伏的走勢參考。</p>
      <div class="fc-wx-bars">
        <h4 style="margin-top:16px;">🌿 命盤五行能量分布（貫穿全年運勢的底層基礎）</h4>
        ${wxBarsHtml}
      </div>
    </div>`;

    let html = fortuneChartBlock + `<div class="ln-legend">
      <div class="lg-item"><span class="lg-dot" style="background:var(--crimson-soft);"></span>桃花／姻緣／沖配偶宮：感情婚姻相關年份</div>
      <div class="lg-item"><span class="lg-dot" style="background:var(--jade-soft);"></span>正財／創業佳／貴人進修／合配偶宮：正向發展年份</div>
      <div class="lg-item"><span class="lg-dot" style="background:var(--gold-soft);"></span>偏財機會／升遷責任／值太歲：機會與責任並存年份</div>
      <div class="lg-item"><span class="lg-dot" style="background:var(--crimson);"></span>防破財／壓力年／沖事業宮／沖根基宮／沖子女宮／沖太歲／刑太歲／害太歲：宜謹慎保守年份，留意血光意外與情緒衝突</div>
    </div>
    <div class="decade-summary" style="margin-bottom:20px;">
      日主五行屬<b>${dayGanWx}</b>，命盤整體判斷為「<b>${strengthLabel}</b>」。${strengthLabel==='偏弱' ? '日主偏弱者，當流年財星（正財、偏財）或官殺星力量過重時，容易因財或因工作壓力而耗身勞心，理財與健康都建議保守為上；' : (strengthLabel==='偏強' ? '日主偏強者，能承擔較大的財務槓桿與工作強度，遇到財星、官殺旺的年份可以更積極把握機會；' : '日主中和，整體抗壓與承載能力平均，可依各年份十神訊號彈性調整步調；')}以下逐十年大運、逐年細列分析。
    </div>`;

    fullDayun.forEach(du=>{
      const rows = ageRows.filter(r=> r.age>=du.startAge && r.age<du.endAge);
      if(rows.length===0) return;
      const duShishen = B.getShishen(dayGan, du.gan);
      const duWx = GAN_WX[du.gan];
      // v8.8：事業、婚姻、正偏財、創業等屬於「成年情境」的統計與建議，只採計本十年中已成年（18歲以後）
      // 的年份；未成年年份不計入統計，避免出現「9歲該投資」之類不合齡的建議（對應本次修正的核心問題）。
      const adultRows = rows.filter(r=>r.age>=18);
      const isAllMinorDecade = adultRows.length===0; // 整個大運都在未成年階段
      const isMixedDecade = adultRows.length>0 && adultRows.length<rows.length; // 大運跨越成年分界
      const spouseYears = adultRows.filter(r=>r.tags.includes('姻緣星動')).length;
      const peachYears = adultRows.filter(r=>r.tags.includes('桃花')).length;
      const clashYears = adultRows.filter(r=>r.tags.includes('沖配偶宮')).length;
      const heYears = adultRows.filter(r=>r.tags.includes('合配偶宮')).length;
      const workClashYears = adultRows.filter(r=>r.tags.includes('沖事業宮')).length;
      const zcFavYears = adultRows.filter(r=>r.tags.includes('創業佳')||r.tags.includes('偏財機會')).length;
      const zcCautionYears = adultRows.filter(r=>r.tags.includes('防破財')||r.tags.includes('壓力年')).length;
      const zhengCaiYears = adultRows.filter(r=>r.tags.includes('正財旺')).length;
      const pianCaiYears = adultRows.filter(r=>r.tags.includes('偏財機會')).length;
      const taisuiRows = rows.filter(r=>r.tags.includes('值太歲')||r.tags.includes('沖太歲')||r.tags.includes('刑太歲')||r.tags.includes('害太歲'));
      const childClashYears = adultRows.filter(r=>r.tags.includes('沖子女宮')).length;

      let careerText, marriageText, bizText, wealthText, familyText;
      if(isAllMinorDecade){
        // 整個大運皆為未成年階段：事業、婚姻、正偏財、創業一律不評估，改以成長階段重點取代，
        // 避免出現投資、創業、升遷、婚戀等不合齡建議。
        const childHint = shishenHintForAge(duShishen, rows[0].age);
        careerText = `此十年約為 <b>${Math.round(du.startAge)}~${Math.round(du.endAge)}歲</b> 的未成年成長階段，重點在於學業、才藝與生活習慣的培養，暫不評估職場升遷或轉職相關運勢。${childHint}`;
        marriageText = '此十年為未成年成長階段，暫不評估婚姻感情相關運勢，人際互動重點在於同儕相處與家庭關係。';
        wealthText = '此十年為未成年成長階段，理財重點在於建立基本金錢觀念（如零用錢管理、儲蓄習慣），暫不評估投資或正偏財相關運勢。';
        bizText = '此十年為未成年成長階段，暫不評估創業或投資相關運勢。';
        familyText = '此十年為未成年成長階段，家庭互動重點在於與父母、手足的相處與溝通，暫不評估與（未來）子女晚輩相關的互動。';
      } else {
        const mixedPrefix = isMixedDecade ? `（此十年跨越成年分界，以下事業、婚姻、財運、創業相關評估僅採計已成年後的 <b>${adultRows.length}</b> 個年份；未成年階段以學業與成長為重，不列入評估。）` : '';
        careerText = mixedPrefix + (SHISHEN_HINT[duShishen] || '此十年運勢平穩，依既定步調穩健發展即可。');
        if(workClashYears>0) careerText += ` 其中有 <b>${workClashYears}</b> 個年份流年沖動事業宮（月柱），工作異動、轉職、與主管或合作單位的關係較容易出現變化，若無把握，該年宜以觀察應變為主，避免倉促決定離職或創業。`;
        marriageText = marriageDecadeText(p.gender, spouseYears, peachYears, clashYears, heYears, adultRows.length);
        bizText = bizDecadeText(zcFavYears, zcCautionYears, adultRows.length);
        wealthText = `正財方面約有 <b>${zhengCaiYears}</b> 個年份收入穩健成長；偏財方面約有 <b>${pianCaiYears}</b> 個年份有業外機會浮現，投機性質的決定仍建議量力而為，不孤注一擲。`;
        if(strengthLabel==='偏弱' && (zhengCaiYears+pianCaiYears)>=3) wealthText += ' 由於日主偏弱而這十年財星較旺，賺錢機會雖多，也容易因財耗身、操心勞碌，建議量入為出，避免揹負超出能力的財務壓力。';
        familyText = childClashYears>0 ? `這十年中有 <b>${childClashYears}</b> 個成年後年份流年沖動子女宮（時柱），與子女或晚輩的溝通較容易出現摩擦，或家中孩子健康、課業上需要多費心關注，建議提早建立好溝通默契。` : '子女與家庭關係整體平穩，用心經營即可維持良好互動。';
      }
      let healthText = duShishen==='七殺' ? (isAllMinorDecade ? '此十年大運走七殺，精力旺盛、活動力強，但情緒也容易緊繃波動，建議安排規律的體能活動抒發精力，並多留意居家與戶外活動安全。' : '此十年大運走七殺，行動力強、衝勁十足，但也相對容易緊繃勞累，建議固定安排運動釋放壓力，行車與運動時多一分謹慎，避免意外血光。') : (duShishen==='傷官' ? '此十年較容易因言語或情緒起伏影響身心狀態，建議多留意睡眠品質與情緒紓壓管道。' : '此十年整體健康狀況相對平穩，維持良好作息即可。');
      if(taisuiRows.length){
        const adultTaisuiRows = taisuiRows.filter(r=>r.age>=18);
        const minorTaisuiRows = taisuiRows.filter(r=>r.age<18);
        if(adultTaisuiRows.length) healthText += ` 其中 <b>${adultTaisuiRows.map(r=>r.calendarYear+'年（'+r.tags.filter(t=>t==='值太歲'||t==='沖太歲'||t==='刑太歲'||t==='害太歲').join('、')+'）').join('、')}</b> 犯太歲，傳統上提醒這幾年運勢起伏較大、意外血光機率略增，簽約、動土、開車、投資等重大決定宜格外謹慎，並可安排定期健康檢查。`;
        if(minorTaisuiRows.length) healthText += ` 另外 <b>${minorTaisuiRows.map(r=>r.calendarYear+'年（'+r.tags.filter(t=>t==='值太歲'||t==='沖太歲'||t==='刑太歲'||t==='害太歲').join('、')+'）').join('、')}</b> 為未成年階段的犯太歲年份，傳統上提醒這幾年較容易情緒起伏或磕碰意外，家長宜留意居家與交通安全，並可安排定期健康檢查。`;
      }

      html += `<div class="decade-block">
        <h3>大運「${du.gan}${du.zhi}」<span class="dsub">約 ${Math.round(du.startAge)}~${Math.round(du.endAge)} 歲・五行屬${duWx}・十神：${duShishen}</span></h3>
        <div class="decade-summary">
          <p><b>【事業工作】</b>${careerText}</p>
          <p><b>【婚姻桃花】</b>${marriageText}</p>
          <p><b>【正財偏財】</b>${wealthText}</p>
          <p><b>【創業評估】</b>${bizText}</p>
          <p><b>【健康與太歲】</b>${healthText}</p>
          <p><b>【子女家庭】</b>${familyText}</p>
        </div>
        <table class="ln-table">
          <tr><th>年齡</th><th>西元</th><th>干支</th><th>十神</th><th>重點提醒</th></tr>
          ${rows.map(r=>`<tr>
            <td class="age">${r.age}歲</td>
            <td class="age">${r.calendarYear}</td>
            <td class="gz">${r.gz}</td>
            <td>${r.shishen}</td>
            <td>${r.tags.length?`<div class="ltags">${r.tags.map(t=>tagChip(t, r.age)).join('')}</div>`:''}${shishenHintForAge(r.shishen, r.age)}${r.hiddenText}</td>
          </tr>`).join('')}
        </table>
      </div>`;
    });

    html += `<div class="disclaimer" style="border-top:none;margin-top:6px;padding-top:0;">
      <b>資料來源與演算方法：</b>流年干支以本站與八字排盤相同的天文節氣引擎（依真太陽時／時區設定即時運算 24 節氣邊界）逐年推算「立春後」的真實年柱干支，並非套用固定表格；大運序列直接取自命盤實際起運歲數與順逆排法（陽男陰女順排、陰男陽女逆排），超出原始 8 步大運時再以相同公式延伸。
      沖合以命盤四柱（年、月、日${p.unknownHour?'':'、時'}柱）之地支對照流年地支的真實六沖、六合關係逐年判斷；桃花以日支三合桃花法則推算；姻緣星、正財偏財、創業建議則依流年天干與日主的真實十神關係（正財偏財、正官七殺、食神傷官、比肩劫財等）及地支藏干次要十神綜合評估；日主強弱則採與「綜合運勢報告」相同的命盤五行分數估算。
      以上皆為命理傳統技法之規則化演算，提供的是「相對機率較高」的提醒年份，並非絕對會發生的事件，實際仍需綜合當年環境、個人決定與行動而定，重大人生決策（結婚、創業、投資）務必審慎評估並諮詢對應領域專業人士。
    </div>`;
    html += feedbackWidgetHtml('流年運勢 9~90歲', `${p.y}年生`);

    panel.innerHTML='';
    panel.appendChild(el(`<div>${html}</div>`));
    wireFeedbackWidgets(panel);
  }

  // ---------- 流月流日精算：逐日直接呼叫「與命盤完全相同」的排盤引擎，非查表、非近似 ----------
  // 說明：節氣交界可能發生在一天中的任何時刻（例如下午才交節），若只用節氣交界的「日期」去切分月份區間，
  // 會與同一顆引擎在該日「正午」實際算出的月柱產生一天之差的誤判。因此改採「逐日呼叫 computeFourPillars」，
  // 直接取用引擎本身對每一天正午所判定的月柱／日柱，再依月柱是否改變自動分段——保證與命盤主流程 100% 一致。
  const JIE_SEQ_LY = ['立春','驚蟄','清明','立夏','芒種','小暑','立秋','白露','寒露','立冬','大雪','小寒'];
  const CAUTION_TAGS = ['沖配偶宮','沖事業宮','沖根基宮','沖子女宮','防破財','壓力年','沖太歲','刑太歲','害太歲'];
  const GOOD_TAGS = ['正財旺','創業佳','貴人進修','合配偶宮'];
  const LY_TZ = 8;

  // 取得指定「八字年」逐日的真實月柱／日柱，並依月柱變化分段成12個流月區塊。
  // 重要細節：立春（乃至其餘11個「節」）可能發生在一天中的任何時刻，並非都在清晨。若事先用「節氣交界的日期」
  // 去框定天數範圍，當交界發生在該日「正午之後」時，正午取樣會判定該日仍屬前一個八字年／月，導致多出一天誤差。
  // 因此改採「不預設邊界日期」的作法：對候選日期範圍內每一天，直接呼叫排盤引擎、讀取引擎自己算出的
  // baziYear 是否等於欲查詢的年份，只保留判定相符的日子——與命盤主流程（用同一顆引擎判斷年柱）100% 同步。
  function computeBaziYearCalendar(baziYear, longitude, useTrueSolarTime){
    const yGZ = ganZhiOfYear(baziYear, longitude, useTrueSolarTime);
    // 節氣表僅需算一次，掃描期間內每天共用（傳入 precomputedTerms），避免重複求解節氣、大幅提升效能
    const terms = A.getSolarTermsRange(baziYear-2, baziYear+3);
    // 寬鬆掃描範圍：該西元年1/1 起，涵蓋到次年3/1（留足緩衝，確保完整涵蓋立春前後的所有交界情況）
    const scanStart = new Date(Date.UTC(baziYear, 0, 1));
    const scanEnd = new Date(Date.UTC(baziYear+1, 2, 1));

    const days = [];
    let cur = new Date(scanStart);
    while(cur < scanEnd){
      const y=cur.getUTCFullYear(), m=cur.getUTCMonth()+1, d=cur.getUTCDate();
      const full = B.computeFourPillars({year:y, month:m, day:d, hour:12, minute:0, tzOffset:LY_TZ, longitude, useTrueSolarTime, precomputedTerms:terms});
      if(full.baziYear === baziYear){
        days.push({ y, m, d, monthGan:full.pillars.month.gan, monthZhi:full.pillars.month.zhi, dayGan:full.pillars.day.gan, dayZhi:full.pillars.day.zhi });
      }
      cur.setUTCDate(cur.getUTCDate()+1);
    }
    const months = [];
    days.forEach(d=>{
      const last = months[months.length-1];
      if(last && last.gan===d.monthGan && last.zhi===d.monthZhi){ last.days.push(d); }
      else { months.push({ gan:d.monthGan, zhi:d.monthZhi, days:[d] }); }
    });
    if(months.length!==12) return null; // 理論上恆為12個節氣月，非12則視為異常年份，交由呼叫端顯示錯誤訊息
    return { yearGZ:yGZ, months };
  }

  // 將任一流動干支（流年／流月／流日通用）對照命盤四柱，產生沖合桃花等標籤
  function flowTags(natalZhi, dayZhi, dayGan, flowGan, flowZhi, flowShishen, spouseStars, peachZhi, unitLabel){
    const tags = [];
    if(flowZhi===peachZhi) tags.push('桃花');
    if(spouseStars.includes(flowShishen)) tags.push('姻緣星動');
    if(LIUHE_MAP[dayZhi]===flowZhi) tags.push('合配偶宮');
    if(isGanHe(dayGan, flowGan)) tags.push('天干相合');
    Object.keys(natalZhi).forEach(k=>{
      if(CLASH_MAP[natalZhi[k]]===flowZhi) tags.push(PALACE_CLASH_TAG[k]);
    });
    if(flowShishen==='正財') tags.push('正財旺');
    if(flowShishen==='偏財') tags.push('偏財機會');
    if(flowShishen==='食神'||flowShishen==='傷官') tags.push('創業佳');
    if(flowShishen==='比肩'||flowShishen==='劫財') tags.push('防破財');
    if(flowShishen==='七殺') tags.push('壓力年');
    if(flowShishen==='正官') tags.push('升遷責任');
    if(flowShishen==='正印'||flowShishen==='偏印') tags.push('貴人進修');
    if(flowGan===dayGan) tags.push(unitLabel==='年' ? '同干年' : (unitLabel==='月' ? '同干月' : '同干日'));
    if(unitLabel==='年' && natalZhi.year){
      if(flowZhi===natalZhi.year) tags.push('值太歲');
      if(CLASH_MAP[natalZhi.year]===flowZhi) tags.push('沖太歲');
      if(isXing(natalZhi.year, flowZhi)) tags.push('刑太歲');
      if(HAI_MAP[natalZhi.year]===flowZhi) tags.push('害太歲');
    }
    return tags;
  }

  // v10.5修正（缺失⑤）：改用「UTC時間+8小時」推算台灣當地日期，不再直接信任使用者裝置
  // 自己的本地時區設定——原本的寫法對身處海外時區（僑胞、留學生、出差等）的使用者，
  // 「今天」可能已經跟台灣實際日期差了一天，導致擇日／農民曆等12處功能誤判日期。
  // 此寫法無論使用者裝置設定在哪個時區，換算出來的都是台灣（UTC+8）當地的今天。
  function todayInfo(){ const n = new Date(Date.now() + 8*3600*1000); return {y:n.getUTCFullYear(), m:n.getUTCMonth()+1, d:n.getUTCDate()}; }

  // v10.5新增（缺失①④修正）：統一的「精確年齡」工具，取代全站多處「西曆年直接相減」的粗略算法。
  //   preciseAge：精確實歲（已正確判斷今年生日是否已過），供「大限／大運目前走到哪個十年階段」
  //               這類以「距出生精確經過時間」為基準的連續區間比對使用（缺失④）。
  //   xuSui     ：正確的虛歲——依「今天的農曆年」與「出生的農曆年」相減再+1計算，
  //               而非原本直接用西曆1/1當作換歲基準點（缺失①），與本站文件所述定義一致。
  //   若萬一超出萬年曆資料涵蓋範圍導致農曆換算失敗，退回舊版簡化算法，確保功能不會整個掛掉。
  function getPreciseAgeInfo(p){
    const t = todayInfo();
    const birthdayPassed = (t.m > p.m) || (t.m === p.m && t.d >= p.d);
    const preciseAge = t.y - p.y - (birthdayPassed ? 0 : 1);
    let xuSui;
    try{
      const todayLunarYear = L.solarToLunar(t.y, t.m, t.d, 8).lunarYear;
      const birthLunarYear = L.solarToLunar(p.y, p.m, p.d, 8).lunarYear;
      xuSui = todayLunarYear - birthLunarYear + 1;
    }catch(e){
      xuSui = t.y - p.y + 1; // 退回舊版簡化算法（極端邊界防呆）
    }
    return { preciseAge, xuSui, birthdayPassed };
  }

  function renderLiuyue(ctx){
    const {p, bazi} = ctx;
    const panel = document.getElementById('panel-liuyue');
    const dayGan = bazi.pillars.day.gan;
    const dayZhi = bazi.pillars.day.zhi;
    const peachZhi = getPeachZhi(dayZhi);
    const spouseStars = p.gender==='M' ? ['正財','偏財'] : ['正官','七殺'];
    const natalZhi = {year:bazi.pillars.year.zhi, month:bazi.pillars.month.zhi, day:dayZhi};
    if(!p.unknownHour && bazi.pillars.hour) natalZhi.hour = bazi.pillars.hour.zhi;

    const today = todayInfo();

    // ---- 今日速覽：直接以完整精算引擎即時計算「今天」的流年/流月/流日 ----
    let todayBox = '';
    try{
      const todayFull = B.computeFourPillars({year:today.y, month:today.m, day:today.d, hour:12, minute:0, tzOffset:LY_TZ, longitude:p.longitude, useTrueSolarTime:p.useTrueSolarTime});
      const yF = todayFull.pillars.year, mF = todayFull.pillars.month, dF = todayFull.pillars.day;
      const yShishen = B.getShishen(dayGan, yF.gan);
      const mShishen = B.getShishen(dayGan, mF.gan);
      const dShishen = dF.gan===dayGan ? '日主' : B.getShishen(dayGan, dF.gan);
      const yTags = flowTags(natalZhi, dayZhi, dayGan, yF.gan, yF.zhi, yShishen, spouseStars, peachZhi, '年');
      const mTags = flowTags(natalZhi, dayZhi, dayGan, mF.gan, mF.zhi, mShishen, spouseStars, peachZhi, '月');
      const dTags = flowTags(natalZhi, dayZhi, dayGan, dF.gan, dF.zhi, dShishen, spouseStars, peachZhi, '日');
      const allTags = [...new Set([...yTags, ...mTags, ...dTags])];
      const cautionSet = CAUTION_TAGS;
      const goodSet = GOOD_TAGS;
      const hasCaution = allTags.some(t=>cautionSet.includes(t));
      const hasGood = allTags.some(t=>goodSet.includes(t));
      const judgeLabel = hasCaution && !hasGood ? '宜謹慎保守' : (hasGood && !hasCaution ? '相對有利' : '平穩，依常規行事即可');
      const todayAge = Math.max(0, today.y - p.y); // v8.8：今日速覽也依實際年齡切換兒童／青少年／成年版提醒文字
      todayBox = `<div class="today-box">
        <h3>◈ 今日速覽（${today.y}/${today.m}/${today.d}）　<span style="font-size:14px;color:var(--paper-dim);">今日綜合傾向：<b style="color:var(--gold-soft);">${judgeLabel}</b></span></h3>
        <div class="today-grid">
          <div class="today-pill"><b>流年</b>${yF.gan}${yF.zhi}・${yShishen}</div>
          <div class="today-pill"><b>流月</b>${mF.gan}${mF.zhi}・${mShishen}</div>
          <div class="today-pill"><b>流日</b>${dF.gan}${dF.zhi}・${dShishen}</div>
        </div>
        ${allTags.length?`<div class="ltags">${allTags.map(t=>tagChip(t, todayAge)).join('')}</div>`:''}
        <p>${dShishen==='日主'?shishenHintForAge('日主', todayAge):shishenHintForAge(dShishen, todayAge)||'今日流日十神訊號不明顯，依日常步調行事即可。'}${hiddenShishenText(dayGan, dF.zhi, dF.gan)}</p>
        <p style="opacity:.75;">此為以「今天」為查詢時間點，即時呼叫與命盤相同之精算引擎所得，非查表估算；此區塊每次開啟頁面時會依當下系統日期重新計算。</p>
      </div>`;
    }catch(e){
      console.error('今日速覽計算失敗', e);
      todayBox = `<div class="error-box">今日速覽計算失敗，可能是系統日期超出曆算支援範圍。</div>`;
    }

    // ---- 查詢年份控制列 ----
    const defaultYear = today.m>=2 ? today.y : today.y-1;
    const controls = `<div class="liuyue-controls">
      <label>查詢西元年（以立春為界之八字年）：<input type="number" id="liuyueYearInput" min="1902" max="2097" value="${defaultYear}"></label>
      <button type="button" id="liuyueQueryBtn">查詢該年12個流月</button>
      <button type="button" id="liuyueTodayBtn" class="ghost">回到今年</button>
    </div>`;

    panel.innerHTML = '';
    panel.appendChild(el(`<div>${todayBox}${controls}<div id="liuyueYearContent"></div></div>`));

    document.getElementById('liuyueQueryBtn').addEventListener('click', ()=>{
      const y = parseInt(document.getElementById('liuyueYearInput').value, 10);
      buildLiuyueYear(ctx, y);
    });
    document.getElementById('liuyueTodayBtn').addEventListener('click', ()=>{
      document.getElementById('liuyueYearInput').value = defaultYear;
      buildLiuyueYear(ctx, defaultYear);
    });

    buildLiuyueYear(ctx, defaultYear);
  }


  // ================= v9.7新增：年度綜合摘要——跨系統（八字流年／紫微流年命宮／西洋占星實際行運）AI敘事整合 =================
  // 設計理念：不重新發明第二套判斷邏輯，三個系統的訊號皆直接呼叫各頁籤已在使用、已通過自我測試的原始函式
  // （八字流年→buildAgeRowsAndScore／紫微→取自然命盤宮位資料／占星→A.toJD+AC.computeChart實際計算行運行星位置，
  // 並非憑經驗估算），僅在最後將三組獨立訊號以規則式（非隨機、非外部AI）方式組合成一段跨系統交叉解讀文字。
  // ================= v9.8.1新增：命盤驅動的個人策略系統（升級「年度綜合摘要」5a＋全新「行動計畫」5b） =================
  // 設計理念：5a（月度重點分析邏輯）與5b（待辦／日曆持續互動層）共用同一份月度訊號計算函式，
  // 差別只在5a把結果「顯示」在年度綜合摘要頁籤，5b則額外加上「待辦事項」持續累積互動層，
  // 避免兩處各自重算月度訊號、產生兩套可能互相矛盾的邏輯。
  const GOAL_CATEGORIES = [
    { id:'career', label:'事業／工作',   favorTags:['升遷責任','創業佳','貴人進修'], avoidTags:['沖事業宮'] },
    { id:'wealth', label:'財務／投資',   favorTags:['正財旺','偏財機會'], avoidTags:['防破財'] },
    { id:'love',   label:'感情／婚姻',   favorTags:['合配偶宮','姻緣星動','桃花'], avoidTags:['沖配偶宮'] },
    { id:'health', label:'健康／養生',   favorTags:['貴人進修'], avoidTags:['壓力年','沖根基宮'] },
    { id:'study',  label:'學習／考試',   favorTags:['貴人進修'], avoidTags:['壓力年'] },
    { id:'general',label:'綜合／尚未設定明確目標', favorTags:[], avoidTags:[] },
  ];
  const GOAL_CATEGORY_MAP = Object.fromEntries(GOAL_CATEGORIES.map(g=>[g.id, g]));
  // 計算指定年份的12個月，依使用者設定的目標類別，逐月比對該月流月訊號是否命中「有利」或「宜避免」，
  // 產出「適合衝刺／平穩／宜守成」三級建議，重用computeBaziYearCalendar()與flowTags()，不另立新規則。
  function computeMonthlyStrategy(ctx, targetYear, goalCategoryId){
    const { p, bazi } = ctx;
    const goal = GOAL_CATEGORY_MAP[goalCategoryId] || GOAL_CATEGORY_MAP.general;
    let data;
    try{ data = computeBaziYearCalendar(targetYear, p.longitude, p.useTrueSolarTime); }catch(e){ return null; }
    if(!data) return null;
    const dayGan = bazi.pillars.day.gan, dayZhi = bazi.pillars.day.zhi;
    const peachZhi = getPeachZhi(dayZhi);
    const spouseStars = p.gender==='M' ? ['正財','偏財'] : ['正官','七殺'];
    const natalZhi = { year:bazi.pillars.year.zhi, month:bazi.pillars.month.zhi, day:dayZhi };
    if(!p.unknownHour && bazi.pillars.hour) natalZhi.hour = bazi.pillars.hour.zhi;

    const monthNames = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
    const months = data.months.map((m, idx)=>{
      const shishen = B.getShishen(dayGan, m.gan);
      const tags = flowTags(natalZhi, dayZhi, dayGan, m.gan, m.zhi, shishen, spouseStars, peachZhi, '月');
      const favorHit = goal.favorTags.filter(t=>tags.includes(t));
      const avoidHit = goal.avoidTags.filter(t=>tags.includes(t));
      let tier, advice;
      if(favorHit.length>0 && avoidHit.length===0){ tier='衝刺'; advice=`本月出現「${favorHit.join('、')}」訊號，是這個目標類別較適合主動出擊、爭取機會的月份。`; }
      else if(avoidHit.length>0 && favorHit.length===0){ tier='守成'; advice=`本月出現「${avoidHit.join('、')}」訊號，建議這個月以穩健守成為主，避免在這個目標類別上做重大新決定。`; }
      else if(favorHit.length>0 && avoidHit.length>0){ tier='觀察'; advice=`本月同時出現有利訊號「${favorHit.join('、')}」與需留意訊號「${avoidHit.join('、')}」，機會與風險並存，建議謹慎評估後再行動。`; }
      else { tier='平穩'; advice='本月沒有特別突出的訊號，維持既有步調即可。'; }
      return { monthIndex: idx+1, label: monthNames[idx] || `第${idx+1}月`, gan:m.gan, zhi:m.zhi, shishen, tags, tier, advice };
    });
    return { targetYear, goal, months };
  }
  const STRATEGY_TIER_COLOR = { '衝刺':'var(--jade-soft)', '守成':'var(--crimson-soft)', '觀察':'var(--gold-soft)', '平穩':'var(--paper-dim)' };

  function computeYearSynthesis(ctx, targetYear){
    const { p, bazi, ziwei, astro } = ctx;

    // ① 八字流年：直接複用「流年運勢」頁籤的同一份資料
    const ageRows = buildAgeRowsAndScore(ctx);
    const baziRow = ageRows.find(r=>r.calendarYear===targetYear);

    // ② 紫微流年命宮：傳統上「流年命宮」＝命盤中地支與流年地支相同的那一宮（無論其命盤本名為何宮）
    let ziweiInfo = null;
    if(ziwei && ziwei.palaces){
      const yGZ = ganZhiOfYear(targetYear, p.longitude, p.useTrueSolarTime);
      const flowPalace = ziwei.palaces.find(pz=>pz.zhi===yGZ.zhi);
      if(flowPalace){
        ziweiInfo = { yearGZ:yGZ, palaceName:flowPalace.palaceName, stars:flowPalace.stars, zhi:flowPalace.zhi };
      }
    }

    // ③ 西洋占星實際行運：以選定年份7/1 UTC正午為代表性快照，實際呼叫本站行星位置引擎計算（非估算），
    // 僅取木星／土星（傳統上代表「一整年」尺度的機會與課題）與太陽（年度核心主題）三顆與本命盤做相位比對，
    // 並重複使用「西洋占星」頁籤同一套 AC.computeAspects() 相位判斷函式，避免另立一套相位容許度規則。
    let astroInfo = null;
    if(astro){
      try{
        const jdT = A.toJD(targetYear, 7, 1, 12);
        const transitChart = AC.computeChart(jdT);
        const merged = {};
        Object.entries(astro).forEach(([k,v])=>{ merged['本命_'+k] = v; });
        ['Sun','Jupiter','Saturn'].forEach(k=>{ if(transitChart[k]) merged['行運_'+k] = transitChart[k]; });
        const allAspects = AC.computeAspects(merged);
        const crossAspects = allAspects.filter(a=>
          (a.a.startsWith('本命_') && a.b.startsWith('行運_')) || (a.a.startsWith('行運_') && a.b.startsWith('本命_'))
        ).map(a=>{
          const natalSide = a.a.startsWith('本命_') ? a.a : a.b;
          const transitSide = a.a.startsWith('行運_') ? a.a : a.b;
          return { natal:natalSide.replace('本命_',''), transit:transitSide.replace('行運_',''), name:a.name, symbol:a.symbol, orb:a.orb };
        });
        astroInfo = { transitChart, crossAspects };
      }catch(e){ astroInfo = null; }
    }

    return { targetYear, baziRow, ziweiInfo, astroInfo };
  }

  const ASPECT_TONE = { '合相':'neutral', '六合':'good', '拱相':'good', '刑相':'bad', '沖相':'bad' };
  const PLANET_LABEL_ZH = { Sun:'太陽', Moon:'月亮', Mercury:'水星', Venus:'金星', Mars:'火星', Jupiter:'木星', Saturn:'土星', Uranus:'天王星', Neptune:'海王星' };

  function renderYearSynthText(syn){
    const parts = [];
    let goodCount=0, badCount=0;

    // 八字流年段落
    if(syn.baziRow){
      const r = syn.baziRow;
      const tone = r.score>=60 ? 'good' : (r.score<=40 ? 'bad' : 'neutral');
      if(tone==='good') goodCount++; if(tone==='bad') badCount++;
      parts.push(`<b style="color:var(--gold-soft);">八字流年</b>：${syn.targetYear}年為「${r.gz}」年，流年主氣對你日主而言主要呈現「${r.shishen}」的作用，${r.tags.length?`並帶有「${r.tags.join('、')}」等訊號，`:''}綜合評分約${r.score}/100（${tone==='good'?'偏向順遂':tone==='bad'?'需留意調整':'平穩發展'}）。`);
    }
    // 紫微流年段落
    if(syn.ziweiInfo){
      const zi = syn.ziweiInfo;
      const starText = zi.stars.length ? `「${zi.stars.join('、')}」等星曜` : '暫無主星坐守';
      parts.push(`<b style="color:var(--jade-soft);">紫微流年命宮</b>：${syn.targetYear}年（${zi.yearGZ.gan}${zi.yearGZ.zhi}年）的流年命宮落在你命盤中的「${zi.palaceName}」宮位（地支${zi.zhi}），該宮坐有${starText}，這是這一年紫微斗數角度上「命運焦點」較容易顯現的生活領域。`);
    }
    // 占星行運段落
    if(syn.astroInfo && syn.astroInfo.crossAspects.length){
      const notable = syn.astroInfo.crossAspects.slice(0,3);
      notable.forEach(a=>{ const t = ASPECT_TONE[a.name]; if(t==='good') goodCount++; if(t==='bad') badCount++; });
      const aspectText = notable.map(a=>{
        const t = ASPECT_TONE[a.name];
        const toneWord = t==='good' ? '（助力型相位）' : t==='bad' ? '（挑戰型相位）' : '（中性相位）';
        return `行運${PLANET_LABEL_ZH[a.transit]||a.transit}與本命${PLANET_LABEL_ZH[a.natal]||a.natal}形成「${a.name}」${a.symbol}${toneWord}`;
      }).join('；');
      parts.push(`<b style="color:var(--crimson-soft);">西洋占星實際行運</b>：以${syn.targetYear}年年中為快照實際計算行運木星、土星、太陽的位置，與本命盤比對後，較值得留意的相位包括：${aspectText}。`);
    }else if(syn.astroInfo){
      parts.push(`<b style="color:var(--crimson-soft);">西洋占星實際行運</b>：${syn.targetYear}年年中快照下，行運木星、土星、太陽與本命盤各行星之間並無明顯相位（容許度6度內），代表這一年占星角度上沒有特別強烈的外在推力或阻力，運勢走向較多取決於你自身的主動選擇。`);
    }

    // 綜合摘要段落：依三系統訊號方向的一致 / 分歧程度組成結語
    let verdict;
    if(goodCount>=2 && badCount===0) verdict = '三個系統的訊號方向大致一致，都偏向正面，這一年可以相對積極地推進計畫、把握機會。';
    else if(badCount>=2 && goodCount===0) verdict = '三個系統都出現需要留意的訊號，建議這一年做重大決定前更謹慎評估、保留彈性與備案，避免同時啟動太多變動。';
    else if(goodCount>0 && badCount>0) verdict = '三個系統的訊號有正面也有需要留意的地方，代表這一年可能是「機會與挑戰並存」的一年——與其問「今年好不好」，不如具體看是哪個生活領域偏向順遂、哪個領域需要更小心，分開因應會更實際。';
    else verdict = '整體訊號偏向平穩中性，這一年較適合穩紮穩打、延續既有步調，不必因為單一系統的某個訊號就過度緊張或躁進。';
    parts.push(`<b style="color:var(--gold);">跨系統綜合解讀</b>：${verdict}`);

    return parts;
  }

  // ================= v9.8.1新增：行動計畫（5b）——持續性待辦／目標追蹤層，獨立於分析類頁籤 =================
  // 設計理念：與其他分析頁籤（查一次就走）性質不同，這是需要「每週回來看」的持續互動層，故獨立成
  // 全新頂層選單，而非塞進「流年流月」這種純分析分類。直接重用computeMonthlyStrategy()（5a）算出的
  // 月度重點行動，讓使用者可以針對建議「衝刺」的月份新增具體待辦事項並勾選完成進度，資料存於
  // localStorage（與全站「資料不上雲端」原則一致）。
  const TODO_KEY = 'zhenmingpan_todos_v1';
  const TODO_MAX = 300;
  function getTodoList(){
    try{ const arr = JSON.parse(localStorage.getItem(TODO_KEY) || '[]'); return Array.isArray(arr) ? arr : []; }
    catch(e){ return []; }
  }
  function saveTodoList(list){
    try{ localStorage.setItem(TODO_KEY, JSON.stringify(list)); }
    catch(e){ showFriendlyError('待辦事項儲存失敗，可能是瀏覽器儲存空間已滿，或目前處於無痕模式導致無法使用本機儲存。'); }
  }
  function addTodo(year, month, text){
    const list = getTodoList();
    list.push({ id:'td_'+Date.now()+'_'+Math.random().toString(36).slice(2,7), year, month, text, done:false, ts:Date.now() });
    while(list.length > TODO_MAX) list.shift();
    saveTodoList(list);
    return list;
  }
  function toggleTodo(id){
    const list = getTodoList();
    const t = list.find(x=>x.id===id);
    if(t) t.done = !t.done;
    saveTodoList(list);
  }
  function deleteTodo(id){
    saveTodoList(getTodoList().filter(t=>t.id!==id));
  }

  function renderActionPlanTab(ctx){
    const panel = document.getElementById('panel-actionplan');
    if(!panel) return;
    const today = todayInfo();
    const yearOptions = [];
    for(let y=today.y-1; y<=today.y+5; y++) yearOptions.push(y);
    panel.innerHTML = '';
    panel.appendChild(el(`<div>
      <div class="compat-intro">把「年度綜合摘要」算出的月度重點行動，變成可以逐月追蹤、打勾完成的行動看板——這是全站唯一設計給你「每週回來看」而不是「查一次就走」的頁籤。選好西元年與目標領域後，下方會依「衝刺／守成／觀察／平穩」分月呈現，你可以在任一個月新增具體待辦事項並勾選完成進度，資料只存在你自己的裝置中。</div>
      <div class="card" id="actionPlanFormCard">
        <div class="form-grid">
          <div class="field"><label for="apYear">選擇西元年</label>
            <select id="apYear">${yearOptions.map(y=>`<option value="${y}" ${y===today.y?'selected':''}>${y}年</option>`).join('')}</select>
          </div>
          <div class="field"><label for="apGoal">目標領域</label>
            <select id="apGoal">${GOAL_CATEGORIES.map(g=>`<option value="${g.id}">${g.label}</option>`).join('')}</select>
          </div>
        </div>
      </div>
      <div id="actionPlanResult"></div>
    </div>`));

    document.getElementById('apYear').addEventListener('change', run);
    document.getElementById('apGoal').addEventListener('change', run);
    run();

    function run(){
      const resultBox = document.getElementById('actionPlanResult');
      const year = parseInt(document.getElementById('apYear').value, 10);
      const goalId = document.getElementById('apGoal').value;
      const strategy = computeMonthlyStrategy(ctx, year, goalId);
      if(!strategy){
        resultBox.innerHTML = `<div class="error-box" style="margin-top:14px;">此年份月度資料計算失敗，可嘗試切換鄰近年份。</div>`;
        return;
      }
      const todos = getTodoList().filter(t=>t.year===year);
      let html = `<div style="margin-top:14px;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;">`;
      strategy.months.forEach(m=>{
        const monthTodos = todos.filter(t=>t.month===m.monthIndex);
        const doneCount = monthTodos.filter(t=>t.done).length;
        html += `<div class="card" style="padding:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <h4 style="margin:0;font-family:var(--serif);color:var(--gold-soft);">${m.label}<span style="font-size:14px;color:${STRATEGY_TIER_COLOR[m.tier]};margin-left:8px;">${m.tier}</span></h4>
            <span style="font-size:14px;color:var(--paper-dim);">${doneCount}／${monthTodos.length} 完成</span>
          </div>
          <p style="font-size:14px;color:var(--paper-dim);line-height:1.7;margin:0 0 10px;">${m.advice}</p>
          <div class="todo-list" data-month="${m.monthIndex}">
            ${monthTodos.map(t=>`<div class="todo-item" data-id="${t.id}" style="display:flex;align-items:center;gap:8px;padding:4px 0;">
              <input type="checkbox" class="todo-check" ${t.done?'checked':''}>
              <span style="flex:1;font-size:14px;${t.done?'text-decoration:line-through;color:var(--paper-dim);':''}">${escapeHtml(t.text)}</span>
              <button type="button" class="todo-del btn-mini danger" style="padding:2px 8px;">✕</button>
            </div>`).join('')}
          </div>
          <div style="display:flex;gap:6px;margin-top:8px;">
            <input type="text" class="todo-input" placeholder="新增待辦..." style="flex:1;padding:6px 10px;border-radius:8px;border:1px solid var(--line);background:var(--ink-900);color:var(--paper);font-size:14px;">
            <button type="button" class="btn-mini todo-add" data-month="${m.monthIndex}">＋</button>
          </div>
        </div>`;
      });
      html += `</div>`;
      html += explainDetail(`
        <h5>這個頁籤跟「年度綜合摘要」的月度行動有什麼不同？</h5>
        <p style="font-size:14px;color:var(--paper-dim);line-height:1.85;">兩者背後是<b>同一套</b>月度分析引擎（<code>computeMonthlyStrategy()</code>），「年度綜合摘要」著重在跟另外兩套系統（紫微流年、西洋占星）的跨系統交叉解讀，本頁則是拿掉跨系統敘事、專注在「逐月待辦追蹤」這個持續性任務——分析邏輯完全一致，不會有兩頭資料兜不起來的問題。</p>
        <h5>待辦事項會被上傳嗎？</h5>
        <p style="font-size:14px;color:var(--paper-dim);line-height:1.85;">不會，待辦事項與準確度回饋、人生事件紀錄一致，只存在你目前使用的瀏覽器裝置中（localStorage）；目前全站只有「命盤存摺」會在登入後同步到雲端，方便換裝置查看。</p>
      `);
      resultBox.innerHTML = '';
      resultBox.appendChild(el(`<div>${html}</div>`));

      resultBox.querySelectorAll('.todo-add').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const monthIdx = parseInt(btn.dataset.month, 10);
          const input = btn.parentElement.querySelector('.todo-input');
          if(!input.value.trim()) return;
          addTodo(year, monthIdx, input.value.trim());
          run();
        });
      });
      resultBox.querySelectorAll('.todo-input').forEach(input=>{
        input.addEventListener('keydown', (e)=>{
          if(e.key==='Enter') input.parentElement.querySelector('.todo-add').click();
        });
      });
      resultBox.querySelectorAll('.todo-check').forEach(cb=>{
        cb.addEventListener('change', ()=>{
          const id = cb.closest('.todo-item').dataset.id;
          toggleTodo(id);
          run();
        });
      });
      resultBox.querySelectorAll('.todo-del').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const id = btn.closest('.todo-item').dataset.id;
          deleteTodo(id);
          run();
        });
      });
    }
  }

  function renderYearSynth(ctx){
    const panel = document.getElementById('panel-yearsynth');
    if(!panel) return;
    const today = todayInfo();
    const yearOptions = [];
    for(let y=today.y-1; y<=today.y+5; y++) yearOptions.push(y);
    panel.innerHTML = '';
    panel.appendChild(el(`<div>
      <div class="compat-intro">將你的八字流年、紫微流年命宮、西洋占星實際行運（行運木星／土星／太陽與本命盤的相位）三套獨立系統的訊號整合在同一頁，並在最後給出跨系統的綜合解讀——三個系統彼此獨立計算，方向一致時代表訊號較強，方向分歧時也會誠實呈現，而不是強行湊出一個結論。<b>v9.8.1新增</b>：可設定你今年的目標領域，系統會依此產生12個月的重點行動月曆；若想搭配待辦事項持續追蹤，可至左側選單「🎯 行動計畫」使用。</div>
      <div class="card" id="yearsynthFormCard">
        <div class="form-grid">
          <div class="field"><label for="yearsynthYear">選擇西元年</label>
            <select id="yearsynthYear">${yearOptions.map(y=>`<option value="${y}" ${y===today.y?'selected':''}>${y}年</option>`).join('')}</select>
          </div>
          <div class="field"><label for="yearsynthGoal">今年的目標領域</label>
            <select id="yearsynthGoal">${GOAL_CATEGORIES.map(g=>`<option value="${g.id}">${g.label}</option>`).join('')}</select>
          </div>
        </div>
      </div>
      <div id="yearsynthResult"></div>
    </div>`));

    document.getElementById('yearsynthYear').addEventListener('change', run);
    document.getElementById('yearsynthGoal').addEventListener('change', run);
    run();

    function run(){
      const resultBox = document.getElementById('yearsynthResult');
      const year = parseInt(document.getElementById('yearsynthYear').value, 10);
      const goalId = document.getElementById('yearsynthGoal').value;
      let syn;
      try{ syn = computeYearSynthesis(ctx, year); }
      catch(e){ resultBox.innerHTML = `<div class="error-box">此年份跨系統摘要計算時發生錯誤，可嘗試切換鄰近年份。</div>`; return; }
      const parts = renderYearSynthText(syn);
      let html = `<div class="card" style="margin-top:14px;">
        <h3 style="margin:0 0 12px;font-family:var(--serif);color:var(--gold-soft);">${year}年 跨系統綜合摘要</h3>
        ${parts.map(p=>`<p style="font-size:14px;line-height:1.9;color:var(--paper);margin:0 0 12px;">${p}</p>`).join('')}
      </div>`;

      const strategy = computeMonthlyStrategy(ctx, year, goalId);
      if(strategy){
        html += `<div class="card" style="margin-top:14px;overflow-x:auto;">
          <h3 style="margin:0 0 10px;font-family:var(--serif);color:var(--gold-soft);">📋 ${year}年「${strategy.goal.label}」月度重點行動</h3>
          <table class="data-table"><tr><th>月份</th><th>月柱</th><th>十神</th><th>建議</th><th>說明</th></tr>
          ${strategy.months.map(m=>`<tr><td>${m.label}</td><td class="gz">${m.gan}${m.zhi}</td><td>${m.shishen}</td><td style="color:${STRATEGY_TIER_COLOR[m.tier]};font-weight:700;">${m.tier}</td><td style="font-size:14px;">${m.advice}</td></tr>`).join('')}
          </table>
          <p style="font-size:14px;color:var(--paper-dim);margin-top:10px;">想針對「${strategy.goal.label}」搭配待辦事項逐月追蹤進度，可至左側選單「🎯 行動計畫」使用同一份月度分析並新增待辦。</p>
        </div>`;
      }

      html += explainDetail(`
        <h5>三套系統各自怎麼算出來的？</h5>
        <ul>
          <li><b>八字流年：</b>直接取用「流年運勢」頁籤同一份逐年評分資料（依十神、地支合沖刑害等訊號綜合評分），並非另外重算。</li>
          <li><b>紫微流年命宮：</b>依傳統「流年命宮＝命盤中地支與流年地支相同的宮位」規則，取出該宮位在你命盤中原本坐守的星曜。</li>
          <li><b>西洋占星實際行運：</b>以選定年份7月1日（UTC正午）為代表性快照，實際呼叫本站行星位置引擎計算當時木星、土星、太陽的黃經位置，與本命盤做相位比對——這是「真的算出來」的行運位置，不是套用固定文字模板。</li>
        </ul>
        <h5>為什麼只挑7月1日一天，而不是整年逐日計算？</h5>
        <p style="font-size:14px;color:var(--paper-dim);line-height:1.85;">木星、土星移動速度慢（木星約每年移動一個星座，土星約2.5年移動一個星座），以年中作為代表性快照已能反映當年度的大致行運狀態；若要逐日追蹤精確的相位入場／離場時間點，屬於更進階的「行運時間軸」功能，不在本頁範圍內。</p>
        <h5>三個系統的訊號不一致時，該聽哪一個？</h5>
        <p style="font-size:14px;color:var(--paper-dim);line-height:1.85;">八字、紫微、西洋占星是三套獨立發展、判斷邏輯完全不同的命理體系，本來就不保證每次都得出相同方向的結論；本頁刻意不強行「調和」三者去湊出單一結論，而是誠實呈現各自的判斷，交叉比對時「多個系統方向一致」通常代表訊號較值得留意，「系統之間方向分歧」則代表這一年可能不同生活領域各有不同的際遇，建議具體看是哪個領域偏向順遂、哪個領域需要留意，而非用單一分數概括整年。此為規則式的訊號整合，並非由外部AI生成文字，也不等同於任何一套系統的完整、正式論命。</p>
        <h5>月度重點行動是怎麼算出來的？（v9.8.1新增）</h5>
        <p style="font-size:14px;color:var(--paper-dim);line-height:1.85;">依你選擇的目標領域（例如「事業／工作」），對照一組「有利訊號」與「宜留意訊號」（與「流年運勢」「時辰校準器」「人生事件回測」共用同一份訊號對照表），逐月呼叫與「流月流日精算」頁籤相同的月柱排盤與流月訊號判斷邏輯，只要該月出現對應訊號就標示「衝刺」或「守成」，兩者都出現則標示「觀察」，都沒出現則為「平穩」。這是規則化的簡化建議，並未納入你當月實際行程、精力狀態等真實生活因素，重大決定仍應綜合自身實際狀況判斷，不宜只依月曆標示行動。</p>
      `);
      html += feedbackWidgetHtml('年度綜合摘要', `${year}年`);
      resultBox.innerHTML = '';
      resultBox.appendChild(el(`<div>${html}</div>`));
      wireFeedbackWidgets(resultBox);
    }
  }

  function buildLiuyueYear(ctx, baziYear){
    const {p, bazi} = ctx;
    const content = document.getElementById('liuyueYearContent');
    if(!content) return;
    if(!baziYear || baziYear<1902 || baziYear>2097){
      content.innerHTML = `<div class="error-box">請輸入西元1902~2097範圍內的年份（需前後各留1年供節氣邊界運算，對應本站曆算支援範圍約1901~2098年）。</div>`;
      return;
    }
    let data;
    try{ data = computeBaziYearCalendar(baziYear, p.longitude, p.useTrueSolarTime); }catch(e){ console.error(e); data=null; }
    if(!data){
      content.innerHTML = `<div class="error-box">該年節氣邊界運算失敗，暫無法產生流月流日資料，請嘗試鄰近年份。</div>`;
      return;
    }
    const dayGan = bazi.pillars.day.gan;
    const dayZhi = bazi.pillars.day.zhi;
    const peachZhi = getPeachZhi(dayZhi);
    const spouseStars = p.gender==='M' ? ['正財','偏財'] : ['正官','七殺'];
    const natalZhi = {year:bazi.pillars.year.zhi, month:bazi.pillars.month.zhi, day:dayZhi};
    if(!p.unknownHour && bazi.pillars.hour) natalZhi.hour = bazi.pillars.hour.zhi;
    const termsForJianchu = A.getSolarTermsRange(baziYear-2, baziYear+3); // v9.7：供getJianchuPrecise交節日判定使用，範圍與computeBaziYearCalendar一致
    const today = todayInfo();

    let html = `<div class="ln-legend">
      <div class="lg-item"><span class="lg-dot" style="background:var(--crimson-soft);"></span>桃花／姻緣／沖配偶宮：感情婚姻相關</div>
      <div class="lg-item"><span class="lg-dot" style="background:var(--jade-soft);"></span>正財／創業佳／貴人進修／合配偶宮：正向發展</div>
      <div class="lg-item"><span class="lg-dot" style="background:var(--gold-soft);"></span>偏財機會／升遷責任：機會與責任並存</div>
      <div class="lg-item"><span class="lg-dot" style="background:var(--crimson);"></span>防破財／壓力年／沖事業宮／沖根基宮／沖子女宮：宜謹慎保守</div>
    </div>
    <div class="decade-summary" style="margin-bottom:20px;">
      八字年 <b>${baziYear}</b>（${data.yearGZ.gan}${data.yearGZ.zhi}年，自${baziYear}年立春起算）共12個真實節氣月，以下逐月列出月柱干支，並展開該月每一天的真實流日干支（點擊月份標題可收合／展開）。
    </div>`;

    const baziYearAge = Math.max(0, baziYear - p.y); // v8.8：流月流日精算頁面亦依該八字年之實際年齡切換提醒版本
    data.months.forEach((mo, idx)=>{
      const monthShishen = B.getShishen(dayGan, mo.gan);
      const monthTags = flowTags(natalZhi, dayZhi, dayGan, mo.gan, mo.zhi, monthShishen, spouseStars, peachZhi, '月');
      const days = mo.days;
      const isTodayMonth = days.some(d=>d.y===today.y && d.m===today.m && d.d===today.d);
      const collapsedClass = isTodayMonth ? '' : 'collapsed';
      const first = days[0], last = days[days.length-1];
      const jieName = JIE_SEQ_LY[idx] || '';
      const rangeText = `${first.y}/${first.m}/${first.d}${jieName?`（${jieName}）`:''}〜${last.y}/${last.m}/${last.d}`;

      html += `<div class="month-card ${collapsedClass}">
        <div class="month-head" data-toggle="1">
          <h3>${mo.gan}${mo.zhi}月 <span class="dsub">${rangeText}・五行${GAN_WX[mo.gan]}・十神：${monthShishen}</span>${isTodayMonth?'<span class="today-badge">本月</span>':''}</h3>
          <span class="chev">▾</span>
        </div>
        <div class="month-body">
          <p class="month-hint"><b>本月提醒：</b>${shishenHintForAge(monthShishen, baziYearAge)||'此月運勢平穩，依既定步調行事即可。'}${monthTags.length?`　${monthTags.map(t=>tagChip(t, baziYearAge)).join('')}`:''}</p>
          <table class="ln-table">
            <tr><th>日期</th><th>星期</th><th>干支</th><th>十神</th><th>沖煞・建除</th><th>重點提醒</th></tr>
            ${days.map(d=>{
              const dShishen = d.dayGan===dayGan ? '日主' : B.getShishen(dayGan, d.dayGan);
              const dTags = flowTags(natalZhi, dayZhi, dayGan, d.dayGan, d.dayZhi, dShishen, spouseStars, peachZhi, '日');
              const isToday = d.y===today.y && d.m===today.m && d.d===today.d;
              const wd = ['日','一','二','三','四','五','六'][new Date(Date.UTC(d.y,d.m-1,d.d)).getUTCDay()];
              // v8.9.1新增：沖煞（是否沖到本命生肖）＋建除十二神（以該流月月支為基準推算）
              const dChongSha = AL.personalizeChongSha(d.dayZhi, natalZhi.year, dayZhi);
              const dJianchu = getJianchuPrecise(d.y, d.m, d.d, termsForJianchu);
              const chongCell = `沖${dChongSha.chongZodiac}・煞${dChongSha.shaDirection}${dChongSha.chongUserZodiac?'<span style="color:var(--crimson-soft);">・沖你生肖</span>':''}<br><span style="opacity:.75;">${dJianchu?dJianchu.name+(dJianchu.tier==='黃道'?'(黃道)':'')+(dJianchu.carried?'*':''):'—'}</span>`;
              return `<tr class="${isToday?'today-row':''}">
                <td class="age">${d.y}/${d.m}/${d.d}${isToday?'<span class="today-badge">今</span>':''}</td>
                <td>${wd}</td>
                <td class="gz">${d.dayGan}${d.dayZhi}</td>
                <td>${dShishen}</td>
                <td style="font-size:14px;">${chongCell}</td>
                <td>${dTags.length?`<div class="ltags">${dTags.map(t=>tagChip(t, baziYearAge)).join('')}</div>`:''}${shishenHintForAge(dShishen, baziYearAge)}</td>
              </tr>`;
            }).join('')}
          </table>
        </div>
      </div>`;
    });

    html += `<div class="disclaimer" style="border-top:none;margin-top:6px;padding-top:0;">
      <b>資料來源與演算方法：</b>流月流日並非套用固定對照表或線性推算近似值，而是對該八字年（自立春至次年立春前）內每一天，逐日呼叫與命盤主流程完全相同的排盤引擎（真實24節氣＋真太陽時），取得引擎對「當天正午」實際判定的月柱與日柱，再依月柱是否改變自動切分成流月區塊——因此每一天的干支、乃至月份交界的那一天算在前一個月或後一個月，都與命盤本身的排盤邏輯100%一致，不會出現「查表法」在節氣當天可能發生的一天誤差。沖合桃花等標籤之判斷邏輯與「流年運勢」頁籤相同，皆對照命盤四柱真實地支逐項比對。「今日速覽」區塊每次載入頁面時都會以系統當下日期重新呼叫排盤引擎即時運算，並非固定內容。<b>v8.9.1新增</b>「沖煞・建除」欄：沖煞依該日地支與你命盤年支（生肖）比對是否沖犯，並列出通用煞方位；建除十二神以該流月之月支為基準推算，與「擇日」頁籤使用同一套 <code>almanac-core.js</code> 通書規則引擎，兩處判斷結果保證一致。<b>v9.7修正</b>：建除十二神已改為呼叫 <code>getJianchuPrecise()</code>，正確處理節氣交節日「沿用前一日值神」的傳統疊值規則（畫面上以「＊」標示交節日），不再是先前對交節當天一律套公式的簡化版本。
      以上仍屬命理傳統技法之規則化演算結果，供行事參考，並非絕對命定；重大決策仍請綜合實際狀況審慎評估並諮詢對應領域專業人士。
    </div>`;

    content.innerHTML = '';
    content.appendChild(el(`<div>${html}</div>`));
    content.querySelectorAll('.month-head').forEach(h=>{
      h.addEventListener('click', ()=>{ h.closest('.month-card').classList.toggle('collapsed'); });
    });
  }

  // ================= v7.8新增：擇日——逐日呼叫與命盤相同之干支排盤引擎，依合沖刑害＋喜用五行＋十神訊號規則化評分 =================
  const ZERI_EVENT_LABEL = { general:'一般吉日／諸事皆宜', move:'搬家／入宅', open:'開業／簽約', wedding:'結婚／訂婚', travel:'出行／遠行', interview:'面試', sign:'簽約（正式文件）', shop:'開店／開幕', propose:'求婚', surgery:'手術／醫療處置', post:'重要發文／公開發布', negotiate:'重要談判' };
  // ================= v9.8.1新增：擇日Copilot——從「查吉日」升級為「針對場景給可執行建議＋替代時段」 =================
  // 設計理念：不建立第二套排盤/評分系統，而是在既有 zeriEventScore() 引擎上擴充事項類型（面試、簽約、
  // 開店、求婚、搬家、手術、發文、談判），每種類型除了原本的日期評分邏輯外，額外附上「可執行建議」與
  // 「當日替代時辰」，讓使用者從「看到一個吉日」進一步得到「幾點去比較好、要注意什麼」的具體行動指引。
  const ZERI_COPILOT_ADVICE = {
    general:  { action:'諸事皆宜的日子，可安排任何你原本猶豫該排哪天的事務。', avoid:'無特別禁忌，仍建議避開評級「不宜」的日子。' },
    move:     { action:'安排在上午至中午時段進場較為理想，搬運過程中避免與人爭執口角。', avoid:'避免在「沖生肖」或「沖日柱」標記的日子搬家、動工。' },
    open:     { action:'開業／簽約當天可準備吉祥物品（盆栽、紅包）於現場，簽約時間建議選在財星或責任星有利的時段。', avoid:'避免选在「防破財」標籤出現的日子談判金額細節。' },
    wedding:  { action:'訂婚、結婚儀式建議安排在姻緣星動或配偶星臨門的日子，證婚時段可參考下方推薦時辰。', avoid:'避免「沖配偶宮」或沖犯雙方生肖的日子。' },
    travel:   { action:'長途出行建議避開沖犯自己生肖的日子；短程或臨時出行影響較小，可放寬標準。', avoid:'避免「外出宜謹慎」標籤明顯的日子做重大交通安排。' },
    interview:{ action:'面試建議選在有貴人／印星訊號的日子，當天可提前15分鐘到場穩定心情，談吐上多展現沉穩而非強勢。', avoid:'避免評級「不宜」或沖犯生肖的日子安排重要面試，臨時被通知面試時，可改用下方「替代時段」找當天較穩妥的時間帶。' },
    sign:     { action:'簽約前一晚整理好合約條文重點，簽署時間建議選在財星有利或日主穩定的時段，避免匆忙簽署未看清的細節。', avoid:'避免在「防破財」或沖日柱的日子簽署重大金額合約，若無法更改日期，務必請專業人士（律師／會計師）覆核條款。' },
    shop:     { action:'開店／開幕儀式建議選在財星或食傷（利表達創意）有利的日子，開幕時段可安排在上午人潮聚集前先完成祭拜儀式。', avoid:'避免「防破財」標籤明顯的日子作為正式開幕日，可考慮改為試營運。' },
    propose:  { action:'求婚建議選在姻緣星動或桃花訊號出現的日子，時段上晚間較能營造氣氛，事前可先確認對方當天行程是否從容不趕時間。', avoid:'避免對方當週明顯忙碌或雙方剛發生爭執的日子求婚，命理訊號只是輔助，情緒與時機的判斷仍以你對兩人關係的了解為主。' },
    surgery:  { action:'非緊急手術可與醫師討論排程時，優先參考評級「平」以上、且沒有「沖日柱」標記的日子；緊急手術請以醫療專業判斷為唯一依據，不應為了配合日期延誤治療。', avoid:'絕對避免僅因日期不理想而延後緊急手術，醫療安全永遠優先於擇日參考。' },
    post:     { action:'重要發文（產品發布、重大宣布）建議選在食神／傷官（利表達、創意）有利的日子，發文時段可參考該平台的流量高峰時段而非單純命理時辰。', avoid:'避免在「壓力年」同期或情緒明顯低落時發布重要公開內容，容易語氣失準。' },
    negotiate:{ action:'重要談判建議選在日主穩定、責任星或財星有利的日子，談判當天可參考下方推薦時辰安排在你精神狀態較好的時段開會。', avoid:'避免「防破財」或沖日柱的日子進行金額、條件的最終拍板，可安排在這類日子先蒐集資訊、延後拍板決定。' },
  };
  const ZERI_EVENT_GROUPS = [
    { label:'一般', items:['general'] },
    { label:'婚戀', items:['wedding','propose'] },
    { label:'職涯', items:['interview'] },
    { label:'商業', items:['open','sign','shop','negotiate'] },
    { label:'居住／出行', items:['move','travel'] },
    { label:'健康', items:['surgery'] },
    { label:'內容發布', items:['post'] },
  ];
  // 新事項類型的評分邏輯：與既有wedding/open/move/travel同一套權重風格，僅換不同十神組合對照
  function zeriEventScoreCopilotExt(eventType, shishenX){
    const tags = [];
    let score = 0;
    if(eventType === 'interview'){
      if(['正印','偏印'].includes(shishenX)){ score += 2; tags.push('貴人扶持'); }
      if(shishenX === '正官'){ score += 1; tags.push('利正式職位'); }
      if(shishenX === '七殺'){ score -= 1; tags.push('壓力感較重'); }
    }else if(eventType === 'sign'){
      if(['正財','偏財'].includes(shishenX)){ score += 2; tags.push('財星臨門'); }
      if(['比肩','劫財'].includes(shishenX)){ score -= 1; tags.push('防破財'); }
    }else if(eventType === 'shop'){
      if(['正財','偏財'].includes(shishenX)){ score += 1; tags.push('財星臨門'); }
      if(['食神','傷官'].includes(shishenX)){ score += 1; tags.push('利創意表達'); }
    }else if(eventType === 'propose'){
      // 桃花/姻緣邏輯已在zeriEventScore主函式對eventType==='wedding'處理，propose另外在此加分避免重複判斷桃花
      if(['正官','七殺','正財','偏財'].includes(shishenX)){ score += 1; tags.push('配偶星臨'); }
    }else if(eventType === 'surgery'){
      if(['正印','偏印'].includes(shishenX)){ score += 2; tags.push('利靜養恢復'); }
      if(shishenX === '七殺'){ score -= 2; tags.push('意外風險提高，宜格外謹慎'); }
      if(shishenX === '傷官'){ score -= 1; tags.push('宜謹慎'); }
    }else if(eventType === 'post'){
      if(['食神','傷官'].includes(shishenX)){ score += 2; tags.push('利表達創意'); }
      if(shishenX === '七殺'){ score -= 1; tags.push('語氣容易失準'); }
    }else if(eventType === 'negotiate'){
      if(['正官','七殺'].includes(shishenX)){ score += 1; tags.push('利據理力爭'); }
      if(['正印','偏印'].includes(shishenX)){ score += 1; tags.push('利冷靜判斷'); }
      if(['比肩','劫財'].includes(shishenX)){ score -= 1; tags.push('防破財'); }
    }
    return { score, tags };
  }
  // 當日推薦時辰：依十二時辰地支與日主日支的六合／六沖／三刑／六害關係排序，合為佳、沖為避
  function zeriBestShichen(dayZhi){
    return SHICHEN_LIST.map((sc, idx)=>{
      const zhi = B.ZHI[idx];
      let score = 0, tag = '平穩，無特別加減分';
      if(LIUHE_MAP[zhi]===dayZhi){ score = 2; tag = '合日支，時段較穩妥'; }
      else if(CLASH_MAP[zhi]===dayZhi){ score = -3; tag = '沖日支，建議盡量避開'; }
      else if(isXing(zhi, dayZhi)){ score = -1; tag = '刑日支，宜謹慎行事'; }
      else if(HAI_MAP[zhi]===dayZhi){ score = -1; tag = '害日支，宜謹慎行事'; }
      return { ...sc, zhi, score, tag };
    }).sort((a,b)=>b.score-a.score);
  }


  Object.assign(LN_TAG_STYLE, {
    '上吉':{bg:'rgba(127,172,154,0.18)',fg:'var(--jade-soft)',bd:'var(--jade)'},
    '不宜':{bg:'rgba(178,59,53,0.16)',fg:'var(--crimson-soft)',bd:'var(--crimson)'},
  });

  function zeriEventScore(eventType, dayGan, dayZhi, dayGanX, dayZhiX, shishenX){
    let score = 0; const tags = [];
    if(isGanHe(dayGan, dayGanX)){ score += 2; tags.push('天干合日主'); }
    if(LIUHE_MAP[dayZhiX] === dayZhi){ score += 2; tags.push('合日支'); }
    if(CLASH_MAP[dayZhiX] === dayZhi){ score -= 3; tags.push('沖日支'); }
    if(isXing(dayZhiX, dayZhi)){ score -= 2; tags.push('刑日支'); }
    if(HAI_MAP[dayZhiX] === dayZhi){ score -= 1; tags.push('害日支'); }
    if(eventType === 'wedding' || eventType === 'propose'){
      if(dayZhiX === getPeachZhi(dayZhi)){ score += 2; tags.push('姻緣星動'); }
      if(['正官','七殺','正財','偏財'].includes(shishenX)){ score += 1; tags.push('配偶星臨'); }
    }else if(eventType === 'open'){
      if(['正財','偏財'].includes(shishenX)){ score += 2; tags.push('財星臨門'); }
      if(['比肩','劫財'].includes(shishenX)){ score -= 1; tags.push('防破財'); }
      if(['正官','七殺'].includes(shishenX)){ score += 1; tags.push('責任加重宜謹慎'); }
    }else if(eventType === 'move'){
      if(['正印','偏印'].includes(shishenX)){ score += 1; tags.push('利安宅'); }
      if(['七殺','傷官'].includes(shishenX)){ score -= 1; tags.push('宜謹慎'); }
    }else if(eventType === 'travel'){
      if(['食神','傷官'].includes(shishenX)){ score += 1; tags.push('外出順遂'); }
      if(shishenX === '七殺'){ score -= 1; tags.push('外出宜謹慎'); }
    }else if(['interview','sign','shop','surgery','post','negotiate'].includes(eventType)){
      // v9.8.1新增：擇日Copilot擴充事項類型，評分邏輯統一由zeriEventScoreCopilotExt()處理
      const ext = zeriEventScoreCopilotExt(eventType, shishenX);
      score += ext.score; tags.push(...ext.tags);
    }
    return { score, tags };
  }
  function zeriTierOf(score){
    if(score >= 4) return '上吉';
    if(score >= 2) return '吉';
    if(score <= -2) return '不宜';
    return '平';
  }
  function runZeriAnalysis(ctx){
    const { bazi, wuxing } = ctx;
    const resultBox = document.getElementById('zeriResult');
    if(!resultBox) return;
    const eventType = document.getElementById('zeriEventType').value;
    const startVal = document.getElementById('zeriStartDate').value;
    const rangeDays = parseInt(document.getElementById('zeriRangeDays').value, 10) || 60;
    // v10.6修正（缺失⑦）：起算日期不可早於今天，否則系統會照常算出一串已經過去、失去參考意義的「建議日期」。
    const startCheck = validateNotPastDate(startVal, {who:'起算'});
    if(!startCheck.ok){ resultBox.innerHTML = `<div class="error-box">${startCheck.message}</div>`; return; }
    const [sy, sm, sd] = [startCheck.y, startCheck.m, startCheck.d];
    const dayGan = bazi.pillars.day.gan;
    const dayZhi = bazi.pillars.day.zhi;
    const weakWx = wuxingDominant(wuxing).weakest[0];

    // v8.9.1新增：預先算好查詢區間可能跨到的節氣表（供逐日呼叫computeFourPillars取得月支，供建除十二神判斷用），
    // 避免每天重複求解節氣、且與命盤主流程排盤引擎100%共用同一份節氣資料。
    const endDt0 = new Date(Date.UTC(sy, sm - 1, sd) + (rangeDays + 2) * 86400000);
    const precomputedTermsZeri = A.getSolarTermsRange(sy - 1, Math.max(sy, endDt0.getUTCFullYear()) + 1);
    const userYearZhi = bazi.pillars.year.zhi; // 使用者命盤生肖（年支）

    const rows = [];
    const startMs = Date.UTC(sy, sm - 1, sd);
    for(let i = 0; i < rangeDays; i++){
      const dt = new Date(startMs + i * 86400000);
      const y = dt.getUTCFullYear(), m = dt.getUTCMonth() + 1, d = dt.getUTCDate();
      let gz;
      try{ gz = B.idxToGZ(B.ganzhiIndex(y, m, d)); }catch(e){ continue; }
      const dayGanX = gz.gan, dayZhiX = gz.zhi;
      const shishenX = dayGanX === dayGan ? '日主' : B.getShishen(dayGan, dayGanX);
      const { score, tags } = zeriEventScore(eventType, dayGan, dayZhi, dayGanX, dayZhiX, shishenX);
      let finalScore = score;
      if(B.GAN_WUXING[dayGanX] === weakWx){ finalScore += 1; tags.push(`合喜用五行「${weakWx}」`); }

      // v8.9.1新增：①生肖沖煞（是否沖到你的生肖或沖你日柱）②建除十二神（黃道/黑道分級）
      // v9.7：改呼叫getJianchuPrecise，正確處理節氣交節日的「疊值」傳統規則
      const chongSha = AL.personalizeChongSha(dayZhiX, userYearZhi, dayZhi);
      const jc = getJianchuPrecise(y, m, d, precomputedTermsZeri);

      if(chongSha.chongUserZodiac){ finalScore -= 2; tags.push(`沖生肖(${chongSha.chongZodiac})`); }
      if(chongSha.chongUserDayZhi){ finalScore -= 1; tags.push('沖日柱'); }
      if(jc){
        if(jc.tier === '黃道') { finalScore += 1; tags.push(`建除${jc.name}(黃道)`); }
        else if(jc.tier === '較不宜') { finalScore -= 1; tags.push(`建除${jc.name}`); }
      }
      // v9.8.3新增：彭祖百忌——若該日干或日支的傳統禁忌口訣與此事項類型明確對應，額外扣分並標記
      const pengzuHit = pengzuEventHit(dayGanX, dayZhiX, eventType);
      if(pengzuHit){ finalScore -= 2; tags.push(`彭祖百忌：${pengzuHit.hit}`); }

      const wd = ['日','一','二','三','四','五','六'][dt.getUTCDay()];
      rows.push({ y, m, d, wd, gan:dayGanX, zhi:dayZhiX, shishen:shishenX, score:finalScore, tags, tier:zeriTierOf(finalScore),
        chongZodiac: chongSha.chongZodiac, shaDirection: chongSha.shaDirection, jianchu: jc ? jc.name : '—' });
    }

    const top = [...rows].sort((a,b)=>b.score-a.score).filter(r=>r.score>=2).slice(0,10);

    let html = `<div class="decade-summary" style="margin-bottom:16px;">以「${ZERI_EVENT_LABEL[eventType]}」為事項類型，掃描 ${sy}/${sm}/${sd} 起共 ${rangeDays} 天，逐日取得真實日柱干支，依你命盤日主的天干五合、地支六合／六沖／三刑／六害，以及命盤中最弱五行（喜用簡化原則，與「補運建議」同一套邏輯）、對應十神訊號逐日評分。</div>`;

    if(top.length === 0){
      html += `<div class="error-box">此區間內沒有評分特別突出的日子（可能吉凶參半），建議放寬查詢區間，或直接展開下方完整列表，挑選「平」以上且沒有「不宜」標籤的日子。</div>`;
    }else{
      html += `<h3 style="margin:6px 0 10px;">🌟 推薦日期（依評分排序，前${top.length}名）</h3>`;
      html += `<table class="data-table"><tr><th>日期</th><th>星期</th><th>干支</th><th>十神</th><th>沖煞</th><th>建除</th><th>評級</th><th>重點</th></tr>`;
      top.forEach(r=>{
        html += `<tr><td>${r.y}/${r.m}/${r.d}</td><td>${r.wd}</td><td class="gz">${r.gan}${r.zhi}</td><td>${r.shishen}</td><td>沖${r.chongZodiac}・煞${r.shaDirection}</td><td>${r.jianchu}</td><td>${tagChip(r.tier)}</td><td>${r.tags.length?r.tags.map(t=>tagChip(t)).join(''):'—'}</td></tr>`;
      });
      html += `</table>`;

      // v9.8.1新增：擇日Copilot——針對排名第一的推薦日期，給出可執行建議＋當日推薦時辰（替代時段）
      const advice = ZERI_COPILOT_ADVICE[eventType];
      const bestDay = top[0];
      const shichenRanked = zeriBestShichen(bestDay.zhi);
      const bestShichen = shichenRanked.filter(s=>s.score>=0).slice(0,3);
      const avoidShichen = shichenRanked.filter(s=>s.score<0);
      html += `<div class="card" style="margin-top:16px;">
        <h3 style="margin:0 0 10px;font-family:var(--serif);color:var(--gold-soft);">🎯 針對「${ZERI_EVENT_LABEL[eventType]}」的可執行建議</h3>
        <p style="font-size:14px;color:var(--paper);line-height:1.85;margin:0 0 10px;"><b style="color:var(--jade-soft);">建議做法：</b>${advice?advice.action:'掌握推薦日期即可，無額外場景建議。'}</p>
        <p style="font-size:14px;color:var(--paper-dim);line-height:1.85;margin:0 0 14px;"><b style="color:var(--crimson-soft);">留意事項：</b>${advice?advice.avoid:'避開評級「不宜」的日子。'}</p>
        <h4 style="margin:0 0 8px;color:var(--gold-soft);font-size:14px;">以 ${bestDay.y}/${bestDay.m}/${bestDay.d}（${bestDay.gan}${bestDay.zhi}日）為例的當日推薦時辰</h4>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
          ${bestShichen.map(s=>`<span class="ltag" style="background:rgba(127,172,154,0.14);color:var(--jade-soft);border-color:var(--jade-soft);">${s.name}（${s.range}）${s.tag}</span>`).join('')}
        </div>
        ${avoidShichen.length?`<div style="display:flex;gap:8px;flex-wrap:wrap;">${avoidShichen.map(s=>`<span class="ltag" style="background:rgba(178,59,53,0.12);color:var(--crimson-soft);border-color:var(--crimson-soft);">${s.name}（${s.range}）${s.tag}</span>`).join('')}</div>`:''}
        <p style="font-size:14px;color:var(--paper-dim);margin-top:10px;">若首選日期臨時無法配合，可從上方「推薦日期」表格挑選第2、3名作為替代日期，或從完整列表中挑選評級「吉」以上的其他日子。</p>
      </div>`;
    }

    html += `<details style="margin-top:18px;"><summary style="cursor:pointer;color:var(--gold-soft);font-size:14px;">顯示完整 ${rangeDays} 天列表</summary>`;
    html += `<table class="data-table" style="margin-top:10px;"><tr><th>日期</th><th>星期</th><th>干支</th><th>十神</th><th>沖煞</th><th>建除</th><th>評級</th><th>重點</th></tr>`;
    rows.forEach(r=>{
      html += `<tr><td>${r.y}/${r.m}/${r.d}</td><td>${r.wd}</td><td class="gz">${r.gan}${r.zhi}</td><td>${r.shishen}</td><td>沖${r.chongZodiac}・煞${r.shaDirection}</td><td>${r.jianchu}</td><td>${tagChip(r.tier)}</td><td>${r.tags.length?r.tags.map(t=>tagChip(t)).join(''):'—'}</td></tr>`;
    });
    html += `</table></details>`;

    html += `<div class="disclaimer" style="border-top:none;margin-top:16px;padding-top:0;">
      <b>演算方法說明：</b>本功能逐日呼叫與命盤主流程完全相同的干支排盤引擎，取得每一天實際的日柱天干地支，並依「天干五合／地支六合」加分、「地支六沖／三刑／六害」扣分、命盤中最弱五行（取代精確喜用神判斷之簡化補強原則，詳見「命盤解析報告」補運建議說明）加分，再依事項類型（搬家／開業／結婚／出行）疊加對應十神訊號權重。<b>v8.9.1新增</b>：同時比對通書「生肖沖煞」（該日沖你的命盤生肖或沖你日柱者扣分並標示）與「建除十二神」（從月支起「建」，依地支順序推算至日支，「除危定執」列黃道加分、「閉破」列較不宜扣分，其餘「建滿平收／成開」則不加減分），加總後分級為「上吉／吉／平／不宜」。「沖煞」欄同時顯示該日通用之煞方位（依日支三合局換算），供你參考當日不宜的行進方位。<b>v9.7修正</b>：建除十二神已改用 <code>getJianchuPrecise()</code>，正確處理節氣交節日沿用前一日值神的傳統疊值規則，修正先前對交節當天一律套公式的簡化限制。此為傳統擇日技法之規則化簡化演算，亦未納入正五行擇日法、日課格局、每日值神以外的其他神煞等更完整的傳統擇日體系，正式訂定搬家、開業、婚嫁等重大日期，仍強烈建議另行核對通書黃曆或諮詢專業命理師。
    </div>`;

    html += feedbackWidgetHtml('擇日', `${ZERI_EVENT_LABEL[eventType]||eventType}・${startVal}起${rangeDays}天`);
    resultBox.innerHTML = '';
    resultBox.appendChild(el(`<div>${html}</div>`));
    wireFeedbackWidgets(resultBox);
  }

  // ================= v8.9.5新增：農民曆通書——每日宜忌通書／十二生肖流年速覽／每日胎神占方／剖腹擇日 =================
  // 設計理念：四項功能皆重用命盤主流程的干支排盤引擎（B.computeFourPillars／B.idxToGZ／B.ganzhiIndex）與既有的
  // almanac-core.js 通書規則（AL.getJianchu／AL.getChongSha／AL.getDailyGods），確保與「擇日」「流月流日精算」
  // 頁籤算出的干支、建除、沖煞、方位神100%一致，不另行編造第二套規則。四項功能皆須先完成上方「輸入出生資料」
  // 排出命盤後才會顯示，以便與你的命盤生肖、日柱交叉比對；若僅想查通用黃曆資訊（不需個人命盤），下方每一項
  // 也都會清楚標示哪些欄位是通用60甲子規則、哪些是疊加你命盤資料後的個人化結果。

  // ---------- 42事項通書宜忌：以「六大類別」代表事項對照建除十二神，同類事項共用同一套宜忌判斷 ----------
  const ALMANAC_ITEMS = [
    {id:'jisi', name:'祭祀', cat:'祭祀'}, {id:'qifu', name:'祈福', cat:'祭祀'}, {id:'qiusi', name:'求嗣', cat:'祭祀'},
    {id:'kaiguang', name:'開光', cat:'祭祀'}, {id:'zhaijiao', name:'齋醮', cat:'祭祀'}, {id:'choushen', name:'酬神', cat:'祭祀'},
    {id:'dingmeng', name:'訂盟', cat:'婚嫁'}, {id:'najia', name:'納采', cat:'婚嫁'}, {id:'wenming', name:'問名', cat:'婚嫁'},
    {id:'jiaqu', name:'嫁娶', cat:'婚嫁'}, {id:'guanji', name:'冠笄', cat:'婚嫁'}, {id:'huiqinyou', name:'會親友', cat:'婚嫁'},
    {id:'jinrenkou', name:'進人口', cat:'婚嫁'}, {id:'anchuang', name:'安床', cat:'婚嫁'}, {id:'hezhang', name:'合帳', cat:'婚嫁'},
    {id:'yixi', name:'移徙', cat:'婚嫁'}, {id:'ruzhai', name:'入宅', cat:'婚嫁'},
    {id:'kaishi', name:'開市', cat:'商業'}, {id:'lijuan', name:'立券', cat:'商業'}, {id:'jiaoyi', name:'交易', cat:'商業'},
    {id:'nacai', name:'納財', cat:'商業'}, {id:'qianyue', name:'簽約', cat:'商業'}, {id:'kaiye', name:'開業', cat:'商業'},
    {id:'guabian', name:'掛匾', cat:'商業'}, {id:'xiuzao', name:'修造', cat:'商業'}, {id:'dongtu', name:'動土', cat:'商業'},
    {id:'shuzhu', name:'豎柱上梁', cat:'商業'}, {id:'anmen', name:'安門', cat:'商業'}, {id:'chuanjing', name:'穿井', cat:'商業'},
    {id:'anjixie', name:'安機械', cat:'商業'},
    {id:'chuxing', name:'出行', cat:'生活'}, {id:'jiechu', name:'解除', cat:'生活'}, {id:'muyu', name:'沐浴', cat:'生活'},
    {id:'lifa', name:'理髮', cat:'生活'}, {id:'jiazhijia', name:'整手足甲', cat:'生活'}, {id:'caiyi', name:'裁衣', cat:'生活'},
    {id:'saoshewu', name:'掃舍宇', cat:'生活'},
    {id:'zaizhong', name:'栽種', cat:'農牧'}, {id:'muyang', name:'牧養', cat:'農牧'}, {id:'nachu', name:'納畜', cat:'農牧'},
    {id:'potu', name:'破土', cat:'喪葬'}, {id:'anzang', name:'安葬', cat:'喪葬'},
  ];
  const ALMANAC_CAT_LIST = ['祭祀','婚嫁','商業','生活','農牧','喪葬'];
  const ALMANAC_CAT_ICON = {'祭祀':'🙏','婚嫁':'💍','商業':'🏢','生活':'🧺','農牧':'🌾','喪葬':'⚰️'};
  // 建除十二神×六大類別 宜忌對照（'yi'=宜／'ji'=忌／null=未特別標示，屬中性）。
  // 此為傳統通書「十二值日宜忌」之類別化簡化版本，取多方通行口訣交叉核對後之常見版本，
  // 並未細分至傳統精確通書逐一事項各自獨立判斷的程度，正式使用仍建議另行核對通書黃曆或諮詢專業命理師。
  const JIANCHU_CAT_RULE = {
    '建':{'祭祀':'yi','婚嫁':null,'商業':null,'生活':'yi','農牧':null,'喪葬':'ji'},
    '除':{'祭祀':'yi','婚嫁':'ji','商業':null,'生活':'yi','農牧':null,'喪葬':null},
    '滿':{'祭祀':'yi','婚嫁':'yi','商業':'yi','生活':'ji','農牧':'yi','喪葬':'ji'},
    '平':{'祭祀':null,'婚嫁':null,'商業':null,'生活':'yi','農牧':'ji','喪葬':null},
    '定':{'祭祀':'yi','婚嫁':'yi','商業':'yi','生活':'ji','農牧':null,'喪葬':null},
    '執':{'祭祀':null,'婚嫁':'yi','商業':'ji','生活':null,'農牧':'yi','喪葬':null},
    '破':{'祭祀':'ji','婚嫁':'ji','商業':'ji','生活':'ji','農牧':'ji','喪葬':'ji'},
    '危':{'祭祀':'yi','婚嫁':'ji','商業':null,'生活':'ji','農牧':null,'喪葬':null},
    '成':{'祭祀':'yi','婚嫁':'yi','商業':'yi','生活':'yi','農牧':'yi','喪葬':'yi'},
    '收':{'祭祀':'yi','婚嫁':'yi','商業':'yi','生活':'ji','農牧':'yi','喪葬':null},
    '開':{'祭祀':'yi','婚嫁':'yi','商業':'yi','生活':'yi','農牧':null,'喪葬':'ji'},
    '閉':{'祭祀':null,'婚嫁':'ji','商業':'ji','生活':'ji','農牧':null,'喪葬':'yi'},
  };
  function almanacCatStatus(jianchuName, cat){
    const row = JIANCHU_CAT_RULE[jianchuName];
    return row ? (row[cat] || null) : null;
  }
  // 取得指定西曆日期之完整通書資訊：干支、建除、沖煞、方位神——與「擇日」「流月流日精算」頁籤共用同一套引擎
  // ================= v9.8.3新增：彭祖百忌——真實傳統通書日禁忌口訣，補強「農民曆通書」「擇日Copilot」
  // 「企業擇日」三處的專業判斷依據 =================
  // 內容為《彭祖百忌》十天干十二地支共22句傳統口訣，已交叉核對多方獨立命理文獻來源，彼此一致；
  // 這是命理館、農民曆、通書實務上除了建除十二神之外，最常被同時查閱的日禁忌系統（依日柱天干、地支
  // 分別各自對照一句禁忌），與建除十二神屬於兩套獨立、互補的傳統規則，非互相取代。
  const PENGZU_GAN = {
    '甲':'甲不開倉，財物耗散', '乙':'乙不栽植，千株不長', '丙':'丙不修灶，必見災殃', '丁':'丁不剃頭，頭生瘡癤', '戊':'戊不受田，田主不祥',
    '己':'己不破券，二比並亡', '庚':'庚不經絡，織機虛張', '辛':'辛不合醬，主人不嘗', '壬':'壬不汲水，更難提防', '癸':'癸不詞訟，理弱敵強',
  };
  const PENGZU_ZHI = {
    '子':'子不問卜，自惹禍殃', '丑':'丑不冠帶，主不還鄉', '寅':'寅不祭祀，鬼神不嘗', '卯':'卯不穿井，水泉不香', '辰':'辰不哭泣，必主重喪',
    '巳':'巳不遠行，財物伏藏', '午':'午不苫蓋，屋主更張', '未':'未不服藥，毒氣入腸', '申':'申不安床，鬼祟入房', '酉':'酉不會客，賓主無情',
    '戌':'戌不吃犬，作怪上床', '亥':'亥不嫁娶，不利新郎',
  };
  function getPengzuTaboo(dayGan, dayZhi){
    return { gan: PENGZU_GAN[dayGan] || null, zhi: PENGZU_ZHI[dayZhi] || null };
  }
  // 依彭祖百忌禁忌內容，判斷是否命中特定擇日事項的禁忌關鍵字（僅在字面明確對應時才視為命中，
  // 避免過度延伸解讀；未命中不代表該事項無其他考量，僅代表未觸及彭祖百忌字面禁忌）
  const PENGZU_EVENT_KEYWORDS = {
    move:['安床'], sign:['開倉','詞訟'], open:['開倉'], shop:['開倉'], wedding:['嫁娶','冠帶'], propose:['嫁娶'],
    surgery:['服藥'], negotiate:['詞訟'], travel:['遠行'],
  };
  function pengzuEventHit(dayGan, dayZhi, eventType){
    const taboo = getPengzuTaboo(dayGan, dayZhi);
    const keywords = PENGZU_EVENT_KEYWORDS[eventType];
    if(!keywords) return null;
    const combined = (taboo.gan||'') + (taboo.zhi||'');
    const hit = keywords.find(kw=>combined.includes(kw));
    return hit ? { hit, taboo } : null;
  }

  function computeAlmanacDay(y, m, d, precomputedTerms){
    const dGZ = B.idxToGZ(B.ganzhiIndex(y, m, d));
    let monthZhi = null;
    try{
      const fp = B.computeFourPillars({ year:y, month:m, day:d, hour:12, minute:0, tzOffset:8, longitude:120, useTrueSolarTime:false, precomputedTerms });
      monthZhi = fp.pillars.month.zhi;
    }catch(e){ /* 節氣邊界極端情況求解失敗時，僅略過建除判斷 */ }
    const jc = getJianchuPrecise(y, m, d, precomputedTerms); // v9.7：改用交節日精確判定版本
    const cs = AL.getChongSha(dGZ.zhi);
    const gods = AL.getDailyGods(dGZ.gan);
    const pengzu = getPengzuTaboo(dGZ.gan, dGZ.zhi); // v9.8.3新增：彭祖百忌
    return { y, m, d, gan:dGZ.gan, zhi:dGZ.zhi, monthZhi, jianchu: jc, chongSha: cs, gods, pengzu };
  }

  function almanacDateStr(y,m,d){ return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }

  function renderAlmanacTab(ctx){
    const panel = document.getElementById('panel-almanac');
    if(!panel) return;
    const today = todayInfo();
    const defaultDateStr = almanacDateStr(today.y, today.m, today.d);
    panel.innerHTML = '';
    panel.appendChild(el(`<div>
      <div class="compat-intro">查詢任一西曆日期的傳統通書宜忌，共收錄42項常見事項（分為祭祀、婚嫁、商業、生活、農牧、喪葬六大類），依當日「建除十二神」判斷宜忌，並疊加你命盤生肖是否被當日沖犯；事項眾多，可用下方分類與篩選彈性縮小範圍，或切換「本月一覽」快速掃過整個月份。</div>
      <div class="card" id="almanacFormCard">
        <div class="form-grid">
          <div class="field"><label for="almanacDate">查詢日期</label><input type="date" id="almanacDate" value="${defaultDateStr}"></div>
          <div class="field"><label for="almanacFilterSelect">顯示篩選</label>
            <select id="almanacFilterSelect">
              <option value="all">全部事項（宜／忌／中性）</option>
              <option value="yi">只看「宜」的事項</option>
              <option value="ji">只看「忌」的事項</option>
            </select>
          </div>
        </div>
        <div class="field full" style="margin-top:2px;">
          <label>事項類別（可複選，預設全選）</label>
          <div class="radio-row" id="almanacCatRow">
            ${ALMANAC_CAT_LIST.map(c=>`<label class="radio-pill active" data-cat="${c}"><input type="checkbox" value="${c}" checked style="display:none;">${ALMANAC_CAT_ICON[c]} ${c}</label>`).join('')}
          </div>
        </div>
        <div class="field full" style="display:flex;flex-direction:row;align-items:stretch;gap:8px;flex-wrap:wrap;margin-top:8px;">
          <button type="button" class="btn-primary" id="almanacPrevBtn" style="width:auto;flex:0 0 auto;">◀ 前一天</button>
          <button type="button" class="btn-primary" id="almanacTodayBtn" style="width:auto;flex:0 0 auto;">回到今天</button>
          <button type="button" class="btn-primary" id="almanacNextBtn" style="width:auto;flex:0 0 auto;">後一天 ▶</button>
          <button type="button" class="btn-primary" id="almanacMonthBtn" style="width:auto;flex:0 0 auto;">📅 查看本月一覽</button>
        </div>
      </div>
      <div id="almanacResult"></div>
    </div>`));

    function selectedCats(){
      return Array.from(panel.querySelectorAll('#almanacCatRow input:checked')).map(i=>i.value);
    }
    panel.querySelectorAll('#almanacCatRow .radio-pill').forEach(lbl=>{
      lbl.addEventListener('click', (e)=>{
        e.preventDefault();
        const cb = lbl.querySelector('input');
        cb.checked = !cb.checked;
        lbl.classList.toggle('active', cb.checked);
        runAlmanacDay(ctx);
      });
    });
    const dateInput = document.getElementById('almanacDate');
    dateInput.addEventListener('change', ()=>runAlmanacDay(ctx));
    document.getElementById('almanacFilterSelect').addEventListener('change', ()=>runAlmanacDay(ctx));
    document.getElementById('almanacPrevBtn').addEventListener('click', ()=>{ shiftAlmanacDate(-1); runAlmanacDay(ctx); });
    document.getElementById('almanacNextBtn').addEventListener('click', ()=>{ shiftAlmanacDate(1); runAlmanacDay(ctx); });
    document.getElementById('almanacTodayBtn').addEventListener('click', ()=>{ dateInput.value = defaultDateStr; runAlmanacDay(ctx); });
    document.getElementById('almanacMonthBtn').addEventListener('click', ()=>runAlmanacMonth(ctx));

    function shiftAlmanacDate(deltaDays){
      const [y,m,d] = dateInput.value.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m-1, d) + deltaDays*86400000);
      dateInput.value = almanacDateStr(dt.getUTCFullYear(), dt.getUTCMonth()+1, dt.getUTCDate());
    }
    runAlmanacDay(ctx);

    function runAlmanacDay(ctx){
      const resultBox = document.getElementById('almanacResult');
      const val = dateInput.value;
      if(!val){ resultBox.innerHTML = `<div class="error-box">請先選擇查詢日期。</div>`; return; }
      const [y,m,d] = val.split('-').map(Number);
      const cats = selectedCats();
      const filterMode = document.getElementById('almanacFilterSelect').value;
      const precomputedTerms = A.getSolarTermsRange(y-1, y+1);
      const info = computeAlmanacDay(y, m, d, precomputedTerms);
      const userYearZhi = ctx.bazi.pillars.year.zhi;
      const userDayZhi = ctx.bazi.pillars.day.zhi;
      const chongUserZodiac = info.chongSha.chongZhi === userYearZhi;
      const chongUserDay = info.chongSha.chongZhi === userDayZhi;
      let lunarStr = '';
      try{ const ln = L.solarToLunar(y,m,d,8); lunarStr = `農曆 ${ln.lunarYear}年${ln.isLeap?'閏':''}${ln.monthName}${ln.dayName}`; }catch(e){}

      let html = `<div class="card" style="margin-top:14px;">
        <h3 style="margin:0 0 10px;font-family:var(--serif);color:var(--gold-soft);">${y}/${m}/${d}（${lunarStr}）　日柱：<span class="gz">${info.gan}${info.zhi}</span></h3>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px;">
          ${tagChip(`建除：${info.jianchu?info.jianchu.name:'—'}（${info.jianchu?info.jianchu.tier:'—'}）`)}
          ${tagChip(`沖${info.chongSha.chongZodiac}生肖・煞${info.chongSha.shaDirection}`)}
          ${tagChip(`財神${info.gods.caishen}／喜神${info.gods.xishi}／福神${info.gods.fushen}`)}
          ${chongUserZodiac?tagChip('沖你的生肖'):''}${chongUserDay?tagChip('沖你的日柱'):''}
        </div>
        <div style="font-size:14px;color:var(--crimson-soft);line-height:1.7;margin-top:6px;">📜 彭祖百忌：${info.pengzu.gan}；${info.pengzu.zhi}</div>
      </div>`;

      const rows = ALMANAC_ITEMS.filter(it=>cats.includes(it.cat)).map(it=>{
        const status = info.jianchu ? almanacCatStatus(info.jianchu.name, it.cat) : null;
        return {...it, status};
      }).filter(it=>{
        if(filterMode==='yi') return it.status==='yi';
        if(filterMode==='ji') return it.status==='ji';
        return true;
      });

      if(rows.length===0){
        html += `<div class="error-box" style="margin-top:12px;">目前篩選條件下沒有符合的事項，請調整類別或篩選條件。</div>`;
      }else{
        html += `<div class="jc-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin-top:14px;">`;
        rows.forEach(it=>{
          const badge = it.status==='yi' ? `<span style="color:var(--jade-soft);font-weight:700;">宜</span>` :
                        it.status==='ji' ? `<span style="color:var(--crimson-soft);font-weight:700;">忌</span>` :
                        `<span style="color:var(--paper-dim);">－</span>`;
          html += `<div class="card" style="padding:8px 10px;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:14px;">${ALMANAC_CAT_ICON[it.cat]} ${it.name}</span>${badge}
          </div>`;
        });
        html += `</div>`;
      }

      html += `<div class="disclaimer" style="border-top:none;margin-top:16px;padding-top:0;">
        <b>演算方法說明：</b>本頁42項傳統通書事項依「祭祀、婚嫁、商業、生活、農牧、喪葬」六大類別分組，同一類別內的事項共用同一套建除十二神宜忌判斷（例如「嫁娶」「安床」「移徙」等婚嫁類事項在同一天的宜忌結果相同），此為將傳統通書逐項各自獨立判斷的精確體系加以「類別化」的簡化版本，正式訂定婚喪喜慶、開市動土等重大日期，仍強烈建議另行核對通書黃曆或諮詢專業命理師。<b style="color:var(--gold-soft);">v9.8.3新增</b>：頁面上方已同步顯示《彭祖百忌》——依當日日柱天干、地支對照的傳統日禁忌口訣（例如「申不安床」「亥不嫁娶」），這是與建除十二神並列、命理館與農民曆實務上最常同時查閱的兩套日禁忌系統，兩者屬互補關係而非互相取代。「沖你的生肖／沖你的日柱」為疊加你命盤年支、日柱地支後的個人化提醒，其餘欄位（干支、建除、沖煞、方位神、彭祖百忌）皆為不需個人命盤資料、任一西曆日期皆可查的通用60甲子規則，與「擇日Copilot」頁籤使用同一套 almanac-core.js 引擎與彭祖百忌對照表。
      </div>`;

      resultBox.innerHTML = '';
      resultBox.appendChild(el(`<div>${html}</div>`));
    }

    function runAlmanacMonth(ctx){
      const resultBox = document.getElementById('almanacResult');
      const val = dateInput.value;
      const [y,m] = val.split('-').map(Number);
      const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const precomputedTerms = A.getSolarTermsRange(y-1, y+1);
      const userYearZhi = ctx.bazi.pillars.year.zhi;
      let html = `<div class="card" style="margin-top:14px;overflow-x:auto;">
        <h3 style="margin:0 0 10px;font-family:var(--serif);color:var(--gold-soft);">${y}年${m}月　本月宜忌總覽</h3>
        <table class="data-table"><tr><th>日期</th><th>星期</th><th>干支</th><th>建除</th><th>沖生肖</th><th>宜（節錄）</th><th>忌（節錄）</th></tr>`;
      const wd = ['日','一','二','三','四','五','六'];
      for(let d=1; d<=daysInMonth; d++){
        const info = computeAlmanacDay(y, m, d, precomputedTerms);
        const dt = new Date(Date.UTC(y, m-1, d));
        const yiList = [], jiList = [];
        ALMANAC_ITEMS.forEach(it=>{
          const status = info.jianchu ? almanacCatStatus(info.jianchu.name, it.cat) : null;
          if(status==='yi' && yiList.length<4) yiList.push(it.name);
          if(status==='ji' && jiList.length<4) jiList.push(it.name);
        });
        const chongUser = info.chongSha.chongZhi === userYearZhi;
        html += `<tr class="almanac-row-link" data-d="${d}" style="cursor:pointer;">
          <td>${m}/${d}</td><td>${wd[dt.getUTCDay()]}</td><td class="gz">${info.gan}${info.zhi}</td>
          <td>${info.jianchu?info.jianchu.name:'—'}</td>
          <td>${chongUser?tagChip('沖你的生肖'):'—'}</td>
          <td style="color:var(--jade-soft);">${yiList.join('、')||'—'}</td>
          <td style="color:var(--crimson-soft);">${jiList.join('、')||'—'}</td>
        </tr>`;
      }
      html += `</table>
        <div class="disclaimer" style="border-top:none;margin-top:12px;padding-top:0;">點選任一列可切換回單日詳細檢視；「宜／忌（節錄）」僅列出前4項供快速掃視，完整42項請於單日檢視查看。</div>
      </div>`;
      resultBox.innerHTML = '';
      resultBox.appendChild(el(`<div>${html}</div>`));
      resultBox.querySelectorAll('.almanac-row-link').forEach(tr=>{
        tr.addEventListener('click', ()=>{
          const d = tr.dataset.d;
          dateInput.value = almanacDateStr(y, m, parseInt(d,10));
          runAlmanacDay(ctx);
        });
      });
    }
  }

  // ---------- 十二生肖流年運勢速覽卡：免完整命盤，選生肖＋西元年即可查詢，並可與你命盤生肖交叉比對 ----------
  const ZODIAC_LIST = ['鼠','牛','虎','兔','龍','蛇','馬','羊','猴','雞','狗','豬'];
  const ZODIAC_TO_ZHI = {'鼠':'子','牛':'丑','虎':'寅','兔':'卯','龍':'辰','蛇':'巳','馬':'午','羊':'未','猴':'申','雞':'酉','狗':'戌','豬':'亥'};
  // 地支六破（與六合／六沖／三刑／六害同屬地支關係參考表，almanac-core.js與八字流年頁籤目前未收錄，於此新增）
  const PO_MAP = {'子':'酉','酉':'子','卯':'午','午':'卯','辰':'丑','丑':'辰','未':'戌','戌':'未','寅':'亥','亥':'寅','巳':'申','申':'巳'};
  function zodiacRelationList(zhi){
    const rev = z => AL.ZODIAC_BY_ZHI[z];
    const sanheGroup = (PEACH_GROUP.find(g=>g.members.includes(zhi))||{members:[]}).members.filter(z=>z!==zhi);
    const xingList = B.ZHI.filter(z=>z!==zhi && isXing(zhi,z));
    const selfXing = XING_SELF.includes(zhi);
    return {
      liuhe: LIUHE_MAP[zhi] ? rev(LIUHE_MAP[zhi]) : null,
      clash: CLASH_MAP[zhi] ? rev(CLASH_MAP[zhi]) : null,
      hai: HAI_MAP[zhi] ? rev(HAI_MAP[zhi]) : null,
      po: PO_MAP[zhi] ? rev(PO_MAP[zhi]) : null,
      sanhe: sanheGroup.map(rev),
      xing: xingList.map(rev),
      selfXing,
    };
  }
  function taisuiRelation(zhi, yearZhi){
    if(zhi===yearZhi) return {type:'值太歲', tone:'bad', text:'今年正值你的本命年（值太歲），傳統上運勢起伏較大、諸事宜謹慎，建議配戴平安符或安太歲以求心安。'};
    if(CLASH_MAP[zhi]===yearZhi) return {type:'沖太歲', tone:'bad', text:'今年地支與流年六沖（沖太歲），傳統上代表變動較大、容易有意外波折，凡事宜更謹慎、避免躁進決策。'};
    if(isXing(zhi, yearZhi)) return {type:'刑太歲', tone:'mid', text:'今年地支與流年相刑（刑太歲），人際或法律文書上較容易有糾紛摩擦，簽約合作宜更仔細確認條款。'};
    if(HAI_MAP[zhi]===yearZhi) return {type:'害太歲', tone:'mid', text:'今年地支與流年相害（害太歲），較容易遇到小人是非或誤會，人際互動宜多一分耐心與溝通。'};
    if(PO_MAP[zhi]===yearZhi) return {type:'破太歲', tone:'mid', text:'今年地支與流年相破（破太歲），計畫較容易生變、不如預期，凡事宜多留彈性、避免把行程排得太滿。'};
    if(LIUHE_MAP[zhi]===yearZhi) return {type:'合太歲', tone:'good', text:'今年地支與流年六合（合太歲），傳統上代表貴人運較旺、諸事較容易得到助力，適合主動出擊、把握機會。'};
    return {type:'平順', tone:'neutral', text:'今年地支與流年之間沒有明顯的沖合刑害關係，屬於平穩發展的一年，運勢好壞主要取決於自身努力與既有命盤格局。'};
  }
  function zodiacYearScore(zhi, yearGan, yearZhi, taisui){
    const zWx = B.ZHI_WUXING[zhi];
    const yWx = B.GAN_WUXING[yearGan];
    let base = 3;
    if(taisui.type==='值太歲') base -= 1;
    if(taisui.type==='沖太歲') base -= 2;
    if(taisui.type==='刑太歲' || taisui.type==='害太歲' || taisui.type==='破太歲') base -= 1;
    if(taisui.type==='合太歲') base += 1;
    const rel = zWx===yWx ? 'same' : (WX_SHENG[yWx]===zWx ? 'yShengZ' : (WX_SHENG[zWx]===yWx ? 'zShengY' : (WX_KE[yWx]===zWx ? 'yKeZ' : (WX_KE[zWx]===yWx ? 'zKeY' : 'neutral'))));
    let wealth = base, career = base, love = base, health = base;
    if(rel==='yKeZ'){ wealth += 2; career -= 1; } // 流年剋生肖＝生肖見財，財運加分但克身耗神
    if(rel==='zKeY'){ wealth -= 1; career += 1; } // 生肖剋流年＝生肖見官殺，事業責任加重
    if(rel==='yShengZ'){ health += 1; career += 1; } // 流年生生肖＝有貴人扶助
    if(rel==='zShengY'){ health -= 1; wealth += 1; } // 生肖生流年＝付出耗損但利求財
    if(rel==='same'){ health += 1; love -= 1; }
    if(getPeachZhi(zhi)===yearZhi){ love += 2; }
    if(taisui.type==='沖太歲'){ health -= 1; love -= 1; }
    if(taisui.type==='合太歲'){ love += 1; }
    const clamp = n => Math.max(1, Math.min(5, Math.round(n)));
    return { wealth:clamp(wealth), career:clamp(career), love:clamp(love), health:clamp(health) };
  }
  function starIcons(n){ return '★★★★★'.slice(0,n) + '☆☆☆☆☆'.slice(0, 5-n); }
  const ZODIAC_REMEDY = {
    '值太歲':'安太歲、隨身攜帶平安符，重大決策放慢腳步、多方徵詢意見。',
    '沖太歲':'避免頻繁搬家、換工作等重大變動集中在同一時間點，出入交通工具多留意安全。',
    '刑太歲':'簽約合作前務必仔細確認條款，避免與人發生金錢糾紛或口舌是非。',
    '害太歲':'人際互動多一分耐心，避免因誤會與親友、同事交惡。',
    '破太歲':'重要計畫保留備案與彈性時間，不宜把行程排得太滿。',
    '合太歲':'貴人運較旺，適合主動拓展人脈、爭取合作機會。',
    '平順':'維持既有步調穩健發展即可，可依命盤本身喜用五行方位做加分。',
  };

  // ================= v9.8.9新增：生肖流年速覽四項擴充——生肖配婚吉凶／生肖坐向方位／每月運勢重寫版／年齡週期 =================
  // 設計理念：全部重用既有的地支關係判斷函式（zodiacRelationList／LIUHE_MAP／CLASH_MAP／isXing／HAI_MAP／PEACH_GROUP／
  // PO_MAP）與月柱排盤引擎（computeBaziYearCalendar），不另立第二套地支關係規則；內容分級對應傳統通行的
  // 「十二生肖婚配歌訣」（六合三合為佳、沖為大忌）與「三合局坐向宜忌」，已交叉核對多方獨立命理文獻來源。
  // 「每月運勢」為原創白話文字（依真實流月地支關係生成），非抄錄坊間農民曆之編輯文字。

  // ---------- 1. 生肖配婚吉凶 ----------
  function zodiacMarriageTiers(zhi){
    const rel = zodiacRelationList(zhi);
    const tiers = [];
    ZODIAC_LIST.forEach(z=>{
      const zz = ZODIAC_TO_ZHI[z];
      if(zz===zhi) return;
      let tier=null, note=null;
      if(rel.liuhe===z){ tier='上上等婚配'; note='六合，天作之合，個性步調相合，是傳統婚配歌訣中最推崇的搭配。'; }
      else if(rel.sanhe.includes(z)){ tier='上等婚配'; note='三合，同氣連枝，相處和諧、能互相扶持，屬佳偶良緣。'; }
      else if(rel.clash===z){ tier='大忌婚配'; note='六沖，個性與價值觀差異較大，傳統上視為最需要磨合、甚至建議審慎評估的搭配。'; }
      else if(rel.xing.includes(z)){ tier='不宜婚配'; note='相刑，相處容易有摩擦與糾紛，需要更多耐心與包容。'; }
      else if(rel.hai===z){ tier='不宜婚配'; note='相害，容易有誤會或口舌是非，人際互動宜多留意。'; }
      else if(rel.po===z){ tier='欠佳婚配'; note='相破，計畫容易生變，感情經營上需要更多溝通與彈性。'; }
      else{ tier='普通姻緣'; note='沒有特別明顯的合沖刑害訊號，相處好壞更多取決於雙方個性與用心經營。'; }
      tiers.push({ zodiac:z, tier, note });
    });
    const order = {'上上等婚配':0,'上等婚配':1,'普通姻緣':2,'欠佳婚配':3,'不宜婚配':4,'大忌婚配':5};
    tiers.sort((a,b)=>order[a.tier]-order[b.tier]);
    return tiers;
  }
  const MARRIAGE_TIER_COLOR = {'上上等婚配':'var(--jade-soft)','上等婚配':'var(--jade-soft)','普通姻緣':'var(--paper-dim)','欠佳婚配':'var(--gold-soft)','不宜婚配':'var(--crimson-soft)','大忌婚配':'var(--crimson-soft)'};

  // ---------- 2. 生肖坐向方位 ----------
  // 資料來源：三合局四大分組之宜忌坐向（申子辰宜坐西向東、巳酉丑宜坐南朝北、寅午戌宜坐東向西、亥卯未宜坐北朝南），
  // 已交叉核對多方獨立民俗風水文獻來源，內容一致；此為通用四分組簡化版，並非逐一針對60甲子個人化的精細版本
  // （後者需搭配個人出生年月日干支，屬於「風水方位」頁籤更完整的個人化服務範疇）。
  const ZODIAC_SEAT_GROUP = [
    { members:['申','子','辰'], favor:'坐西向東', avoid:'坐南朝北' },
    { members:['巳','酉','丑'], favor:'坐南朝北', avoid:'坐東向西' },
    { members:['寅','午','戌'], favor:'坐東向西', avoid:'坐北朝南' },
    { members:['亥','卯','未'], favor:'坐北朝南', avoid:'坐西向東' },
  ];
  function zodiacSeatDirection(zhi){
    const g = ZODIAC_SEAT_GROUP.find(g=>g.members.includes(zhi));
    return g ? { favor:g.favor, avoid:g.avoid, groupZodiacs:g.members.map(z=>AL.ZODIAC_BY_ZHI[z]) } : null;
  }

  // ---------- 3. 每月運勢重寫版 ----------
  const MONTHLY_RELATION_TEXT = {
    liuhe:  { title:'貴人相助', tone:'good',    text:'本月地支與生肖六合，人際和諧、貴人運較旺，適合主動出擊、洽談合作。' },
    sanhe:  { title:'順水推舟', tone:'good',    text:'本月地支與生肖三合，運勢平順向上，事情較容易得到助力、事半功倍。' },
    clash:  { title:'諸事謹慎', tone:'bad',     text:'本月地支與生肖相沖，情緒與決策都容易波動，重大決定宜多方考慮，避免衝動行事。' },
    xing:   { title:'糾紛需防', tone:'bad',     text:'本月地支與生肖相刑，人際或合約文書上較易有摩擦，簽約前務必仔細確認條款。' },
    hai:    { title:'小人謹慎', tone:'bad',     text:'本月地支與生肖相害，容易遇到誤會或小人是非，溝通宜更有耐心。' },
    po:     { title:'計畫多變', tone:'bad',     text:'本月地支與生肖相破，計畫較容易生變、不如預期，宜保留彈性與備案。' },
    neutral:{ title:'平穩如常', tone:'neutral', text:'本月地支與生肖無特別合沖刑害訊號，維持既有步調即可，運勢平穩發展。' },
  };
  const MONTHLY_TONE_COLOR = { good:'var(--jade-soft)', bad:'var(--crimson-soft)', neutral:'var(--paper-dim)' };
  function monthZhiRelationType(monthZhi, zhi){
    if(LIUHE_MAP[zhi]===monthZhi) return 'liuhe';
    const sanheGroup = (PEACH_GROUP.find(g=>g.members.includes(zhi))||{members:[]}).members;
    if(sanheGroup.includes(monthZhi) && monthZhi!==zhi) return 'sanhe';
    if(CLASH_MAP[zhi]===monthZhi) return 'clash';
    if(isXing(zhi, monthZhi)) return 'xing';
    if(HAI_MAP[zhi]===monthZhi) return 'hai';
    if(PO_MAP[zhi]===monthZhi) return 'po';
    return 'neutral';
  }
  const ZODIAC_MONTH_NAMES = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
  function computeZodiacMonthlyFortune(zhi, year){
    let data;
    try{ data = computeBaziYearCalendar(year, 120, false); } // 通用經緯度（台灣），不需個人命盤資料
    catch(e){ return null; }
    if(!data || !data.months) return null;
    return data.months.map((m,idx)=>{
      const relType = monthZhiRelationType(m.zhi, zhi);
      const info = MONTHLY_RELATION_TEXT[relType];
      return { monthIndex: idx+1, label: ZODIAC_MONTH_NAMES[idx]||`第${idx+1}月`, gan:m.gan, zhi:m.zhi, relType, ...info };
    });
  }

  // ---------- 4. 年齡週期（本命年／沖太歲，虛歲） ----------
  // 虛歲（傳統計齡法）＝實歲+1（出生當年即算1歲，每逢農曆新年加1歲）；本命年為生肖地支與流年地支相同之年，
  // 每12年一輪，換算虛歲後固定為「虛歲≡1（mod 12）」；沖太歲與本命年固定相差6年一輪，即「虛歲≡7（mod 12）」。
  function zodiacAgeCycle(maxAge){
    maxAge = maxAge || 100;
    const benming = [], chongtaisui = [];
    for(let virtualAge=1; virtualAge<=maxAge; virtualAge+=12) benming.push(virtualAge);
    for(let virtualAge=7; virtualAge<=maxAge; virtualAge+=12) chongtaisui.push(virtualAge);
    return { benming, chongtaisui };
  }

  function renderZodiacYearTab(ctx){
    const panel = document.getElementById('panel-zodiacyear');
    if(!panel) return;
    const today = todayInfo();
    const userYearZhi = ctx.bazi.pillars.year.zhi;
    const userZodiac = AL.ZODIAC_BY_ZHI[userYearZhi];
    const yearOptions = [];
    for(let y=today.y-1; y<=today.y+5; y++) yearOptions.push(y);
    panel.innerHTML = '';
    panel.appendChild(el(`<div>
      <div class="compat-intro">不需完整命盤資料，只要選擇生肖與西元年，即可速覽該年財運／事業／感情／健康四大面向星等評分，並附上與其他生肖的六合、六沖、三合、相刑、相害、相破對照表；<b>v9.8.9新增</b>：生肖配婚吉凶、坐向方位、每月運勢、本命年／沖太歲年齡週期四大項；預設已依你的命盤生肖（${userZodiac}）帶入，可自行切換查詢其他生肖（例如家人）。</div>
      <div class="card" id="zodiacYearFormCard">
        <div class="form-grid">
          <div class="field"><label for="zyYear">查詢西元年</label>
            <select id="zyYear">${yearOptions.map(y=>`<option value="${y}" ${y===today.y?'selected':''}>${y}年</option>`).join('')}</select>
          </div>
        </div>
        <div class="field full" style="margin-top:2px;">
          <label>選擇生肖</label>
          <div class="radio-row" id="zyZodiacRow">
            ${ZODIAC_LIST.map(z=>`<label class="radio-pill${z===userZodiac?' active':''}"><input type="radio" name="zyZodiac" value="${z}" ${z===userZodiac?'checked':''} style="display:none;">${z}</label>`).join('')}
          </div>
        </div>
      </div>
      <div id="zodiacYearResult"></div>
    </div>`));

    panel.querySelectorAll('#zyZodiacRow .radio-pill').forEach(lbl=>{
      lbl.addEventListener('click', ()=>{
        panel.querySelectorAll('#zyZodiacRow .radio-pill').forEach(l=>l.classList.remove('active'));
        lbl.classList.add('active');
        lbl.querySelector('input').checked = true;
        runZodiacYear();
      });
    });
    document.getElementById('zyYear').addEventListener('change', runZodiacYear);
    runZodiacYear();

    function runZodiacYear(){
      const resultBox = document.getElementById('zodiacYearResult');
      const year = parseInt(document.getElementById('zyYear').value, 10);
      const zodiac = panel.querySelector('#zyZodiacRow input:checked').value;
      const zhi = ZODIAC_TO_ZHI[zodiac];
      const yearIdx = ((year - 4) % 60 + 60) % 60;
      const yearGZ = B.idxToGZ(yearIdx);
      const taisui = taisuiRelation(zhi, yearGZ.zhi);
      const scores = zodiacYearScore(zhi, yearGZ.gan, yearGZ.zhi, taisui);
      const rel = zodiacRelationList(zhi);
      const isUserZodiac = zhi === userYearZhi;

      let html = `<div class="card" style="margin-top:14px;">
        <h3 style="margin:0 0 8px;font-family:var(--serif);color:var(--gold-soft);">🐾 ${year}年（${yearGZ.gan}${yearGZ.zhi}年）・生肖「${zodiac}」流年速覽</h3>
        <div style="margin-bottom:10px;">${tagChip(taisui.type)}${isUserZodiac?tagChip('與你命盤生肖相同'):''}</div>
        <div style="color:var(--paper-dim);font-size:14px;line-height:1.7;margin-bottom:14px;">${taisui.text}</div>
        <div class="domain-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;">
          <div class="card" style="padding:10px 12px;"><div style="font-size:14px;color:var(--paper-dim);">💰 財運</div><div style="font-size:18px;color:var(--gold-soft);letter-spacing:1px;">${starIcons(scores.wealth)}</div></div>
          <div class="card" style="padding:10px 12px;"><div style="font-size:14px;color:var(--paper-dim);">☆ 事業</div><div style="font-size:18px;color:var(--gold-soft);letter-spacing:1px;">${starIcons(scores.career)}</div></div>
          <div class="card" style="padding:10px 12px;"><div style="font-size:14px;color:var(--paper-dim);">♡ 感情</div><div style="font-size:18px;color:var(--gold-soft);letter-spacing:1px;">${starIcons(scores.love)}</div></div>
          <div class="card" style="padding:10px 12px;"><div style="font-size:14px;color:var(--paper-dim);">♥ 健康</div><div style="font-size:18px;color:var(--gold-soft);letter-spacing:1px;">${starIcons(scores.health)}</div></div>
        </div>
        <div style="margin-top:14px;padding:10px 12px;background:rgba(51,68,122,0.08);border-radius:10px;font-size:14px;color:var(--paper-dim);">🧭 化解／開運建議：${ZODIAC_REMEDY[taisui.type]}</div>
      </div>`;

      html += `<div class="card" style="margin-top:14px;">
        <h3 style="margin:0 0 10px;font-family:var(--serif);color:var(--gold-soft);">🔗 生肖「${zodiac}」沖合刑害對照表</h3>
        <table class="data-table">
          <tr><th>關係</th><th>對應生肖</th><th>白話說明</th></tr>
          <tr><td>${tagChip('六合')}</td><td>${rel.liuhe||'—'}</td><td>個性、步調相合，容易互相扶持，是傳統上favor的搭配生肖。</td></tr>
          <tr><td>${tagChip('六沖')}</td><td>${rel.clash||'—'}</td><td>個性、價值觀差異較大，相處容易有摩擦，需要更多耐心磨合。</td></tr>
          <tr><td>${tagChip('三合')}</td><td>${rel.sanhe.join('、')||'—'}</td><td>三方生肖同氣連枝，合作、結盟容易事半功倍。</td></tr>
          <tr><td>${tagChip('相刑')}</td><td>${rel.xing.join('、')||(rel.selfXing?zodiac+'（自刑）':'—')}</td><td>容易有糾紛、是非或健康小狀況，凡事宜多一分謹慎。</td></tr>
          <tr><td>${tagChip('相害')}</td><td>${rel.hai||'—'}</td><td>容易遇到誤會或小人是非，人際互動宜多留意。</td></tr>
          <tr><td>${tagChip('相破')}</td><td>${rel.po||'—'}</td><td>計畫容易生變、不如預期，宜保留彈性與備案。</td></tr>
        </table>
      </div>`;

      // v9.8.9新增：① 生肖配婚吉凶
      const marriageTiers = zodiacMarriageTiers(zhi);
      html += `<div class="card" style="margin-top:14px;overflow-x:auto;">
        <h3 style="margin:0 0 10px;font-family:var(--serif);color:var(--gold-soft);">💍 生肖「${zodiac}」配婚吉凶</h3>
        <table class="data-table"><tr><th>對象生肖</th><th>婚配等級</th><th>說明</th></tr>
        ${marriageTiers.map(t=>`<tr><td>${t.zodiac}</td><td style="color:${MARRIAGE_TIER_COLOR[t.tier]};font-weight:700;">${t.tier}</td><td style="font-size:14px;">${t.note}</td></tr>`).join('')}
        </table>
        <p style="font-size:14px;color:var(--paper-dim);margin-top:8px;">依「十二生肖婚配歌訣」傳統原則換算：六合為天作之合、三合為佳偶良緣，六沖為傳統上最需留意的搭配，相刑相害相破則建議多一分包容與溝通。婚姻幸福與否終究取決於雙方相處與經營，此表僅供傳統文化參考，不宜作為感情決策的唯一依據。</p>
      </div>`;

      // v9.8.9新增：② 生肖坐向方位
      const seatDir = zodiacSeatDirection(zhi);
      if(seatDir){
        html += `<div class="card" style="margin-top:14px;">
          <h3 style="margin:0 0 10px;font-family:var(--serif);color:var(--gold-soft);">🧭 生肖「${zodiac}」坐向方位</h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
            ${tagChip(`宜：${seatDir.favor}`)}${tagChip(`忌：${seatDir.avoid}`)}
          </div>
          <p style="font-size:14px;color:var(--paper-dim);line-height:1.85;">生肖「${zodiac}」與「${seatDir.groupZodiacs.filter(z=>z!==zodiac).join('、')}」同屬三合局分組，居家、辦公室或書桌座位傳統上建議選擇「${seatDir.favor}」的座向，較能藏風聚氣；「${seatDir.avoid}」則傳統上較不建議作為長期主要座向。此為依三合局分組的通用簡化版本，若需搭配你個人出生年月日干支的精細化坐向建議，可至「風水方位」頁籤查詢。</p>
        </div>`;
      }

      // v9.8.9新增：③ 每月運勢重寫版
      const monthly = computeZodiacMonthlyFortune(zhi, year);
      if(monthly){
        html += `<div class="card" style="margin-top:14px;overflow-x:auto;">
          <h3 style="margin:0 0 10px;font-family:var(--serif);color:var(--gold-soft);">📅 生肖「${zodiac}」${year}年每月運勢</h3>
          <table class="data-table"><tr><th>月份</th><th>月柱</th><th>運勢</th><th>說明</th></tr>
          ${monthly.map(m=>`<tr><td>${m.label}</td><td class="gz">${m.gan}${m.zhi}</td><td style="color:${MONTHLY_TONE_COLOR[m.tone]};font-weight:700;">${m.title}</td><td style="font-size:14px;">${m.text}</td></tr>`).join('')}
          </table>
        </div>`;
      }

      // v9.8.9新增：④ 年齡週期（本命年／沖太歲，虛歲）
      const ageCycle = zodiacAgeCycle(100);
      html += `<div class="card" style="margin-top:14px;">
        <h3 style="margin:0 0 10px;font-family:var(--serif);color:var(--gold-soft);">🎂 生肖「${zodiac}」本命年／沖太歲年齡週期（虛歲）</h3>
        <p style="font-size:14px;color:var(--paper-dim);margin-bottom:8px;"><b style="color:var(--gold-soft);">本命年（值太歲）虛歲：</b>${ageCycle.benming.join('、')}歲</p>
        <p style="font-size:14px;color:var(--paper-dim);">${tagChip('沖太歲')}<b style="color:var(--crimson-soft);"> 虛歲：</b>${ageCycle.chongtaisui.join('、')}歲</p>
        <p style="font-size:14px;color:var(--paper-dim);margin-top:8px;">虛歲為傳統計齡法（虛歲＝實歲+1，出生當年即算1歲），本命年與沖太歲皆每12年循環一次、相差6年。此為固定週期換算，與你實際出生的西元年份無關，任何生肖「${zodiac}」的人只要虛歲落在上述數字，當年即為本命年或沖太歲年。</p>
      </div>`;

      html += `<div class="disclaimer" style="border-top:none;margin-top:16px;padding-top:0;">
        <b>演算方法說明：</b>本功能屬「不需完整命盤資料、只需生肖與西元年即可查詢」的通用60甲子規則：太歲關係（值／沖／刑／害／破／合太歲）依生肖地支與流年地支之六沖、三刑、六害、六破、六合關係換算；財運／事業／感情／健康四項星等，則以流年天干五行與生肖地支五行之間的生剋關係（生／剋／同五行）疊加太歲關係、桃花地支（三合局對沖之桃花地支）等訊號綜合評分，屬簡化版生肖流年判斷法，比對顆粒度為「生肖」而非完整八字四柱，準確度不如「流年運勢」頁籤中對照你完整命盤四柱所算出的個人化結果，僅供輕量速覽參考。<b style="color:var(--gold-soft);">v9.8.9新增</b>：配婚吉凶與坐向方位依三合局四大分組之傳統通行原則換算，已交叉核對多方獨立文獻來源；每月運勢依真實流月地支與生肖地支之合沖刑害關係、以原創文字生成，非抄錄坊間農民曆內容；年齡週期為虛歲12年循環之固定數學換算。正式論斷仍建議搭配完整命盤（八字命盤／流年運勢頁籤）或諮詢專業命理師。
      </div>`;

      resultBox.innerHTML = '';
      resultBox.appendChild(el(`<div>${html}</div>`));
    }
  }

  // ---------- 每日胎神占方：孕婦專用方位提醒（六十甲子胎神歌訣，通書通用60甲子規則，逐日固定循環） ----------
  // 資料來源：傳統通書「六十甲子胎神歌」，依日柱干支（甲子起）逐一對照胎神所在位置，60組循環一次。
  // 索引方式與B.idxToGZ(idx)相同（idx=0為甲子...idx=59為癸亥），確保與命盤主流程日柱排盤引擎完全對應。
  const TAISHEN_60 = [
    '門碓外東南','碓磨外東南','廚灶外正南','倉庫門外南','房床外正南','門碓外正南','碓磨外正南','廚灶外西南','倉庫門外南','房床外西南',
    '門碓外西南','碓磨外西南','廚灶外正西','倉庫門外西','房床外正西','門碓外正西','碓磨外正西','廚灶外西北','倉庫門外北','房床外西北',
    '門碓外西北','碓磨外西北','廚灶外正北','倉庫門外北','房床外正北','門碓外正北','碓磨外正北','廚灶外東北','倉庫門外東','房床外東北',
    '門碓外東北','碓磨外東北','廚灶外正東','倉庫門外東','房床外正東','門碓外正東','碓磨外正東','廚灶外東南','倉庫門外南','房床外東南',
    '門碓房內東','碓磨房內東','廚灶房內南','倉庫門內南','房床房內南','門碓房內南','碓磨房內西','廚灶房內西','倉庫門內西','房床房內西',
    '門碓房內北','碓磨房內北','廚灶房內北','倉庫門內北','房床房內中','門碓房內中','碓磨房內中','廚灶房內中','倉庫門內中','房床房內中',
  ];
  const TAISHEN_TABOO = ['釘釘子、敲打牆壁','搬動或移動家具、雜物','鑽孔、裝修、動土施工','使用剪刀等利器裁剪','燃燒紙錢、點燃明火','堆放雜物、清出大型垃圾'];
  // 直接以B.ganzhiIndex(y,m,d)算出的60甲子索引（0=甲子...59=癸亥）對照TAISHEN_60，與日柱干支排盤100%一致。
  function getTaishenByIdx(idx){ return TAISHEN_60[((idx%60)+60)%60]; }

  function renderTaishenTab(ctx){
    const panel = document.getElementById('panel-taishen');
    if(!panel) return;
    const today = todayInfo();
    const defaultDateStr = almanacDateStr(today.y, today.m, today.d);
    panel.innerHTML = '';
    panel.appendChild(el(`<div>
      <div class="compat-intro">傳統習俗認為「胎神」每日會依六十甲子日柱循環出現在住家不同方位，懷孕期間應避免在胎神所在方位動土、敲打、搬動家具或使用利器，以免「犯胎神」。此為不需個人命盤資料的通用60甲子規則，任一西曆日期皆可查詢；若正在孕期，建議直接輸入預產期查看整個孕期月曆。</div>
      <div class="card" id="taishenFormCard">
        <div class="form-grid">
          <div class="field"><label for="taishenDate">查詢日期</label><input type="date" id="taishenDate" value="${defaultDateStr}"></div>
        </div>
        <div class="field full" style="display:flex;flex-direction:row;align-items:stretch;gap:8px;flex-wrap:wrap;margin-top:8px;">
          <button type="button" class="btn-primary" id="taishenPrevBtn" style="width:auto;flex:0 0 auto;">◀ 前一天</button>
          <button type="button" class="btn-primary" id="taishenTodayBtn" style="width:auto;flex:0 0 auto;">回到今天</button>
          <button type="button" class="btn-primary" id="taishenNextBtn" style="width:auto;flex:0 0 auto;">後一天 ▶</button>
          <button type="button" class="btn-primary" id="taishenMonthBtn" style="width:auto;flex:0 0 auto;">📅 查看本月胎神月曆</button>
        </div>
      </div>
      <div id="taishenResult"></div>
    </div>`));

    const dateInput = document.getElementById('taishenDate');
    dateInput.addEventListener('change', runTaishenDay);
    document.getElementById('taishenPrevBtn').addEventListener('click', ()=>{ shiftDate(-1); runTaishenDay(); });
    document.getElementById('taishenNextBtn').addEventListener('click', ()=>{ shiftDate(1); runTaishenDay(); });
    document.getElementById('taishenTodayBtn').addEventListener('click', ()=>{ dateInput.value = defaultDateStr; runTaishenDay(); });
    document.getElementById('taishenMonthBtn').addEventListener('click', runTaishenMonth);
    function shiftDate(deltaDays){
      const [y,m,d] = dateInput.value.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m-1, d) + deltaDays*86400000);
      dateInput.value = almanacDateStr(dt.getUTCFullYear(), dt.getUTCMonth()+1, dt.getUTCDate());
    }
    runTaishenDay();

    function runTaishenDay(){
      const resultBox = document.getElementById('taishenResult');
      const val = dateInput.value;
      if(!val){ resultBox.innerHTML = `<div class="error-box">請先選擇查詢日期。</div>`; return; }
      const [y,m,d] = val.split('-').map(Number);
      const idx = B.ganzhiIndex(y,m,d);
      const gz = B.idxToGZ(idx);
      const pos = getTaishenByIdx(idx);
      let lunarStr = '';
      try{ const ln = L.solarToLunar(y,m,d,8); lunarStr = `農曆 ${ln.lunarYear}年${ln.isLeap?'閏':''}${ln.monthName}${ln.dayName}`; }catch(e){}
      const html = `<div class="card" style="margin-top:14px;">
        <h3 style="margin:0 0 10px;font-family:var(--serif);color:var(--gold-soft);">${y}/${m}/${d}（${lunarStr}）　日柱：<span class="gz">${gz.gan}${gz.zhi}</span></h3>
        <div style="display:flex;align-items:center;gap:14px;padding:14px;background:rgba(178,59,53,0.08);border-radius:12px;margin-bottom:12px;">
          <div style="font-size:32px;">🤰</div>
          <div>
            <div style="font-size:14px;color:var(--paper-dim);margin-bottom:2px;">今日胎神占方</div>
            <div style="font-size:19px;font-weight:700;color:var(--crimson-soft);">${pos}</div>
          </div>
        </div>
        <div style="font-size:14px;color:var(--paper-dim);line-height:1.8;">
          <b>今日不宜（該方位）：</b>${TAISHEN_TABOO.join('、')}等。<br>
          若家中無法完全避開該方位的日常起居，傳統習俗建議至少避開「動土、裝修、釘釘、搬動大型家具」等較劇烈的動作，日常靜態活動（如坐臥、閱讀）多不受此限。
        </div>
      </div>`;
      resultBox.innerHTML = '';
      resultBox.appendChild(el(`<div>${html}<div class="disclaimer" style="border-top:none;margin-top:6px;padding-top:0;">
        <b>演算方法說明：</b>胎神占方依傳統通書「六十甲子胎神歌」，以當日日柱干支（60甲子循環）逐一對照固定方位口訣，屬不需個人命盤資料、任一西曆日期皆可查詢的通用60甲子規則，與擇日、農民曆通書頁籤共用同一套日柱排盤引擎。此為民俗文化參考，現代醫學上並無胎神方位影響孕期安全之實證，其核心精神（避免孕期劇烈勞動、裝修噪音與意外碰撞）與現代孕期保健原則相符，但仍以定期產檢與醫師建議為準，不必過度拘泥方位禁忌而增加心理壓力。
      </div></div>`));
    }

    function runTaishenMonth(){
      const resultBox = document.getElementById('taishenResult');
      const [y,m] = dateInput.value.split('-').map(Number);
      const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const wd = ['日','一','二','三','四','五','六'];
      let html = `<div class="card" style="margin-top:14px;overflow-x:auto;">
        <h3 style="margin:0 0 10px;font-family:var(--serif);color:var(--gold-soft);">${y}年${m}月　胎神方位月曆</h3>
        <table class="data-table"><tr><th>日期</th><th>星期</th><th>日柱</th><th>胎神占方</th></tr>`;
      for(let d=1; d<=daysInMonth; d++){
        const idx = B.ganzhiIndex(y,m,d);
        const gz = B.idxToGZ(idx);
        const dt = new Date(Date.UTC(y, m-1, d));
        html += `<tr class="taishen-row-link" data-d="${d}" style="cursor:pointer;"><td>${m}/${d}</td><td>${wd[dt.getUTCDay()]}</td><td class="gz">${gz.gan}${gz.zhi}</td><td style="color:var(--crimson-soft);">${getTaishenByIdx(idx)}</td></tr>`;
      }
      html += `</table><div class="disclaimer" style="border-top:none;margin-top:12px;padding-top:0;">點選任一列可切換回單日詳細檢視，查看當日不宜事項提醒。</div></div>`;
      resultBox.innerHTML = '';
      resultBox.appendChild(el(`<div>${html}</div>`));
      resultBox.querySelectorAll('.taishen-row-link').forEach(tr=>{
        tr.addEventListener('click', ()=>{
          dateInput.value = almanacDateStr(y, m, parseInt(tr.dataset.d,10));
          runTaishenDay();
        });
      });
    }
  }

  // ---------- 剖腹生產擇日：重用擇日／通書引擎，針對預產期區間篩選日子，並逐時辰模擬寶寶四柱五行分布 ----------
  const SHICHEN_LIST = [
    {name:'子時', range:'23:00–00:59', hour:0}, {name:'丑時', range:'01:00–02:59', hour:2},
    {name:'寅時', range:'03:00–04:59', hour:4}, {name:'卯時', range:'05:00–06:59', hour:6},
    {name:'辰時', range:'07:00–08:59', hour:8}, {name:'巳時', range:'09:00–10:59', hour:10},
    {name:'午時', range:'11:00–12:59', hour:12}, {name:'未時', range:'13:00–14:59', hour:14},
    {name:'申時', range:'15:00–16:59', hour:16}, {name:'酉時', range:'17:00–18:59', hour:18},
    {name:'戌時', range:'19:00–20:59', hour:20}, {name:'亥時', range:'21:00–22:59', hour:22},
  ];
  const JIANCHU_BIRTH_RULE = { '建':null, '除':'yi', '滿':'yi', '平':null, '定':'yi', '執':null, '破':'ji', '危':'ji', '成':'yi', '收':'yi', '開':'yi', '閉':'ji' };
  function babyWuxingBalance(pillars){
    const score = B.wuxingScore(pillars);
    const vals = Object.values(score);
    const present = vals.filter(v=>v>0).length;
    const range = Math.max(...vals) - Math.min(...vals);
    return { score, present, range, balance: present*2 - range };
  }

  function renderCsectionTab(ctx){
    const panel = document.getElementById('panel-csection');
    if(!panel) return;
    const { bazi } = ctx;
    const today = todayInfo();
    const defaultDateStr = almanacDateStr(today.y, today.m, today.d);
    panel.innerHTML = '';
    panel.appendChild(el(`<div>
      <div class="compat-intro">依你（母親）命盤日主生肖、日柱，疊加通書建除十二神，為預產期前後區間內的每一天評分，並針對評分較佳的日子逐一模擬十二時辰內寶寶出生時的假想四柱五行分布（是否五行齊全、不過度偏枯），供你與醫師討論排程時的參考方向；醫療安全與母嬰健康務必以主治醫師專業評估為最優先考量，本功能僅為傳統擇日習俗之規則化參考，並非醫療建議。</div>
      <div class="card" id="csectionFormCard">
        <div class="form-grid">
          <div class="field"><label for="csDueDate">預產期</label><input type="date" id="csDueDate" value="${defaultDateStr}" min="${defaultDateStr}"></div>
          <div class="field"><label for="csDaysBefore">預產期前幾天開始查詢</label>
            <select id="csDaysBefore">
              <option value="7">7天</option><option value="14" selected>14天</option><option value="21">21天</option>
            </select>
          </div>
          <div class="field"><label for="csDaysAfter">預產期後幾天結束查詢</label>
            <select id="csDaysAfter">
              <option value="3">3天</option><option value="7" selected>7天</option><option value="10">10天</option>
            </select>
          </div>
        </div>
        <button type="button" class="btn-primary" id="csSubmitBtn">開始分析可考慮日期</button>
      </div>
      <div id="csResult"></div>
    </div>`));

    document.getElementById('csSubmitBtn').addEventListener('click', runCsection);

    function runCsection(){
      const resultBox = document.getElementById('csResult');
      const dueVal = document.getElementById('csDueDate').value;
      // v10.6修正（缺失⑦）：預產期不可早於今天，避免用已經過去的預產期算出一串失去時效性的建議日期。
      const dueCheck = validateNotPastDate(dueVal, {who:'預產期'});
      if(!dueCheck.ok){ resultBox.innerHTML = `<div class="error-box">${dueCheck.message}</div>`; return; }
      const before = parseInt(document.getElementById('csDaysBefore').value, 10);
      const after = parseInt(document.getElementById('csDaysAfter').value, 10);
      const [dy, dm, dd] = [dueCheck.y, dueCheck.m, dueCheck.d];
      const startMs = Date.UTC(dy, dm-1, dd) - before*86400000;
      const totalDays = before + after + 1;
      const endDt0 = new Date(startMs + (totalDays+2)*86400000);
      const precomputedTerms = A.getSolarTermsRange(dy-1, Math.max(dy, endDt0.getUTCFullYear())+1);
      const userYearZhi = bazi.pillars.year.zhi;
      const userDayZhi = bazi.pillars.day.zhi;

      const dayRows = [];
      for(let i=0; i<totalDays; i++){
        const dt = new Date(startMs + i*86400000);
        const y = dt.getUTCFullYear(), m = dt.getUTCMonth()+1, d = dt.getUTCDate();
        const info = computeAlmanacDay(y, m, d, precomputedTerms);
        const birthStatus = info.jianchu ? JIANCHU_BIRTH_RULE[info.jianchu.name] : null;
        const chongMotherZodiac = info.chongSha.chongZhi === userYearZhi;
        const chongMotherDay = info.chongSha.chongZhi === userDayZhi;

        let dayScore = birthStatus==='yi' ? 2 : (birthStatus==='ji' ? -5 : 0);
        if(chongMotherZodiac) dayScore -= 3;
        if(chongMotherDay) dayScore -= 2;

        const slots = SHICHEN_LIST.map(sc=>{
          let bal = { present:0, range:0, balance:-99, score:{} };
          try{
            const fp = B.computeFourPillars({ year:y, month:m, day:d, hour:sc.hour, minute:0, tzOffset:8, longitude:120, useTrueSolarTime:false, precomputedTerms });
            bal = babyWuxingBalance(fp.pillars);
          }catch(e){ /* 節氣邊界極端情況略過該時辰 */ }
          return { ...sc, ...bal };
        }).sort((a,b)=>b.balance-a.balance);

        const bestSlot = slots[0];
        const combinedScore = dayScore + (bestSlot ? bestSlot.balance : 0);
        dayRows.push({ y, m, d, wd:['日','一','二','三','四','五','六'][dt.getUTCDay()], gan:info.gan, zhi:info.zhi,
          jianchu: info.jianchu?info.jianchu.name:'—', birthStatus, chongMotherZodiac, chongMotherDay,
          chongZodiac: info.chongSha.chongZodiac, dayScore, slots, bestSlot, combinedScore,
          excluded: birthStatus==='ji' || chongMotherZodiac });
      }

      const candidates = dayRows.filter(r=>!r.excluded).sort((a,b)=>b.combinedScore-a.combinedScore).slice(0,8);

      let html = `<div class="decade-summary" style="margin-bottom:16px;">預產期 ${dy}/${dm}/${dd}，查詢區間 ${before}天前～${after}天後（共${totalDays}天）。已排除建除「破／危」等較不宜與沖犯你命盤生肖的日子，以下依評分列出較適合與醫師討論排程的日子及其中五行分布較均衡的推薦時辰。</div>`;

      if(candidates.length===0){
        html += `<div class="error-box">此區間內沒有評分特別突出的日子，建議放寬查詢區間，或直接展開下方完整列表自行評估。</div>`;
      }else{
        html += `<h3 style="margin:6px 0 10px;">🌟 較適合考慮的日期（前${candidates.length}名，僅供與醫師討論排程之參考）</h3>`;
        candidates.forEach(r=>{
          const top2 = r.slots.filter(s=>s.balance>-99).slice(0,2);
          html += `<div class="card" style="margin-bottom:10px;padding:12px 14px;">
            <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;align-items:center;">
              <div style="font-weight:700;">${r.y}/${r.m}/${r.d}（星期${r.wd}）　<span class="gz">${r.gan}${r.zhi}</span></div>
              <div>${tagChip(`建除：${r.jianchu}`)}${r.birthStatus==='yi'?tagChip('宜'):''}${r.chongMotherDay?tagChip('沖你日柱，宜留意'):''}</div>
            </div>
            <div style="margin-top:8px;font-size:14px;color:var(--paper-dim);">推薦時辰（寶寶假想四柱五行較齊全均衡）：</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">
              ${top2.map(s=>`<span class="ltag" style="background:rgba(127,172,154,0.14);color:var(--jade-soft);border-color:var(--jade-soft);">${s.name}（${s.range}）五行${s.present}/5齊全</span>`).join('')}
            </div>
          </div>`;
        });
      }

      html += `<details style="margin-top:18px;"><summary style="cursor:pointer;color:var(--gold-soft);font-size:14px;">顯示完整 ${totalDays} 天列表（含已排除日期）</summary>`;
      html += `<table class="data-table" style="margin-top:10px;"><tr><th>日期</th><th>星期</th><th>干支</th><th>建除</th><th>沖你生肖</th><th>狀態</th><th>最佳時辰</th></tr>`;
      dayRows.forEach(r=>{
        html += `<tr><td>${r.y}/${r.m}/${r.d}</td><td>${r.wd}</td><td class="gz">${r.gan}${r.zhi}</td><td>${r.jianchu}</td>
          <td>${r.chongMotherZodiac?'是（'+r.chongZodiac+'）':'—'}</td>
          <td>${r.excluded?tagChip('不建議'):tagChip('可考慮')}</td>
          <td>${r.bestSlot&&r.bestSlot.balance>-99 ? r.bestSlot.name+'（'+r.bestSlot.range+'）' : '—'}</td></tr>`;
      });
      html += `</table></details>`;

      html += `<div class="disclaimer" style="border-top:none;margin-top:16px;padding-top:0;">
        <b>演算方法說明：</b>「日期評分」依通書建除十二神（除危定執成收開列較吉、破危列不宜、其餘中性，並依「生產喜事」之特性略作調整）疊加是否沖犯你（母親）命盤生肖或日柱地支（沖生肖之日直接排除、沖日柱則保留但標示提醒）；「時辰推薦」則針對評分較佳的日子，逐一以你選擇的日期搭配十二時辰代表時刻（例：子時取00:00）呼叫與命盤主流程完全相同的四柱排盤引擎，模擬「假設寶寶在此時辰出生」所排出的假想四柱，並計算其五行（木火土金水）是否五種齊全、分布是否平均（避免過度集中單一五行或完全缺乏某一五行）作為簡化的「八字均衡度」參考指標，分數越高代表五行分布越齊全平均。此為傳統擇日「生辰八字」概念之極簡化規則性演算，並未納入寶寶日主強弱、格局用神、正五行擇日法等更完整的傳統八字論命體系，也完全未考量醫療面向的生產風險（例如週數是否足月、母體與胎兒實際健康狀況等）——這些永遠應以主治醫師的專業判斷為最優先，本功能僅供與醫師討論可考慮的候選日期時作為傳統習俗面向的參考，正式決定剖腹產日期仍強烈建議同時諮詢專業命理師與婦產科醫師。
      </div>`;

      resultBox.innerHTML = '';
      resultBox.appendChild(el(`<div>${html}</div>`));
    }
  }

  // ================= v8.2新增：命盤時間軸——大運×流年×流月三層互動甘特圖 =================
  // 設計理念：大運／流年資料直接呼叫 buildFullDayunList／buildAgeRowsAndScore（與「流年運勢」頁籤共用），
  // 流月資料直接呼叫 computeBaziYearCalendar（與「流月流日精算」頁籤共用），三個頁籤資料來源完全一致；
  // 採「點擊逐層展開」取代拖曳游標，行動裝置操作更直覺，也避免大量資料一次全部渲染影響效能。
  function tlScoreColor(score){
    if(score>=65) return 'var(--jade-soft)';
    if(score<=35) return 'var(--crimson-soft)';
    return 'var(--gold-soft)';
  }

  function renderTimeline(ctx){
    const panel = document.getElementById('panel-timeline');
    if(!panel) return;
    const { p, bazi, dayun } = ctx;
    const dayGan = bazi.pillars.day.gan;
    const dayZhi = bazi.pillars.day.zhi;
    const fullDayun = buildFullDayunList(dayun, bazi);
    const ageRows = buildAgeRowsAndScore(ctx);
    if(ageRows.length===0){
      panel.innerHTML = `<div class="error-box">出生年份超出本站曆算支援範圍（約西元1901~2098年），暫無法產生命盤時間軸。</div>`;
      return;
    }
    const today = todayInfo();
    const currentAge = Math.max(0, Math.min(90, today.y - p.y));

    let html = `<div class="compat-intro">整合「大運」「流年」「流月」三層資料的互動時間軸：點擊①大運展開該十年的每一個流年，點擊②流年展開該年的12個流月。資料與「流年運勢」「流月流日精算」頁籤共用同一套排盤引擎與規則化評分邏輯，三處結果完全一致，非另外估算。</div>`;

    html += `<div class="ln-legend">
      <div class="lg-item"><span class="lg-dot" style="background:var(--jade-soft);"></span>綜合評分偏高：正向發展年份</div>
      <div class="lg-item"><span class="lg-dot" style="background:var(--gold-soft);"></span>綜合評分中等：機會與挑戰並存</div>
      <div class="lg-item"><span class="lg-dot" style="background:var(--crimson-soft);"></span>綜合評分偏低：宜謹慎保守年份</div>
    </div>`;

    html += `<div class="timeline-wrap">
      <div class="tl-row-label">① 大運（點擊展開該十年的流年）</div>
      <div class="tl-row" id="tlDayunRow"></div>
      <div class="tl-row-label">② 流年（點擊展開該年的流月）</div>
      <div class="tl-row" id="tlLiunianRow"><p class="field-hint">請先在上方點選一個大運。</p></div>
      <div class="tl-row-label">③ 流月</div>
      <div class="tl-row" id="tlLiuyueRow"><p class="field-hint">請先在上方點選一個流年。</p></div>
    </div>
    <div class="tl-detail" id="tlDetail"><p class="field-hint">點選任一大運／流年／流月區塊，這裡會顯示該區間的重點解讀。</p></div>`;

    html += `<div class="disclaimer" style="border-top:none;margin-top:16px;padding-top:0;">
      <b>資料來源：</b>大運與流年評分邏輯與「流年運勢 9~90歲」頁籤共用同一套 <code>buildFullDayunList</code>／<code>buildAgeRowsAndScore</code> 函式；流月資料則與「流月流日精算」頁籤共用 <code>computeBaziYearCalendar</code> 函式逐日呼叫排盤引擎換算，三個頁籤資料來源完全一致，非另編估算。評分僅為命理角度的相對指標，並非精確吉凶預測，重大決策仍建議綜合現實條件審慎評估並諮詢對應領域專業人士。
    </div>`;

    panel.innerHTML = '';
    panel.appendChild(el(`<div>${html}</div>`));

    const dayunRow = document.getElementById('tlDayunRow');
    const liunianRow = document.getElementById('tlLiunianRow');
    const liuyueRow = document.getElementById('tlLiuyueRow');
    const defaultDu = fullDayun.find(du=>currentAge>=du.startAge && currentAge<du.endAge) || fullDayun[0];

    function clearActive(row){ row.querySelectorAll('.tl-seg.active').forEach(s=>s.classList.remove('active')); }

    function showDetail(info){
      const box = document.getElementById('tlDetail');
      box.innerHTML = `
        <h3 style="margin:0 0 6px;font-family:var(--serif);color:var(--gold-soft);font-size:17px;">${info.title}</h3>
        <p style="font-size:14px;color:var(--paper-dim);margin:0 0 10px;">${info.sub}</p>
        ${info.tags && info.tags.length ? `<div class="ltags" style="margin-bottom:10px;">${info.tags.map(t=>tagChip(t, info.age)).join('')}</div>` : ''}
        <p style="font-size:14px;color:var(--paper);line-height:1.85;margin:0;">${info.body}</p>
        ${info.linkYear ? `<button type="button" class="btn-mini" id="tlGotoLiuyue" style="margin-top:12px;">於「流月流日精算」查看${info.linkYear}年完整逐日資料 →</button>` : ''}
      `;
      if(info.linkYear){
        document.getElementById('tlGotoLiuyue').addEventListener('click', ()=>{
          const targetBtn = document.querySelector('.tab-btn[data-tab="liuyue"]');
          if(targetBtn) targetBtn.click();
          setTimeout(()=>{
            const input = document.getElementById('liuyueYearInput');
            const btn = document.getElementById('liuyueQueryBtn');
            if(input && btn){ input.value = info.linkYear; btn.click(); }
          }, 60);
        });
      }
    }

    function selectLiuyue(r, mo, monthShishen, segEl){
      clearActive(liuyueRow);
      segEl.classList.add('active');
      const peachZhiLocal = getPeachZhi(dayZhi);
      const spouseStars = p.gender==='M' ? ['正財','偏財'] : ['正官','七殺'];
      const natalZhi = {year:bazi.pillars.year.zhi, month:bazi.pillars.month.zhi, day:dayZhi};
      if(!p.unknownHour && bazi.pillars.hour) natalZhi.hour = bazi.pillars.hour.zhi;
      const monthTags = flowTags(natalZhi, dayZhi, dayGan, mo.gan, mo.zhi, monthShishen, spouseStars, peachZhiLocal, '月');
      const first = mo.days[0], last = mo.days[mo.days.length-1];
      showDetail({
        title: `${mo.gan}${mo.zhi}月　${first.y}/${first.m}/${first.d}〜${last.y}/${last.m}/${last.d}`,
        sub: `五行${GAN_WX[mo.gan]}・十神：${monthShishen}`,
        body: `${shishenHintForAge(monthShishen, r.age)||'此月運勢平穩，依既定步調行事即可。'}`,
        tags: monthTags,
        age: r.age,
        linkYear: r.calendarYear,
      });
    }

    function selectLiunian(r, segEl){
      clearActive(liunianRow);
      segEl.classList.add('active');
      liuyueRow.innerHTML = '<p class="field-hint">計算中…</p>';
      let data;
      try{ data = computeBaziYearCalendar(r.calendarYear, p.longitude, p.useTrueSolarTime); }catch(e){ data=null; }
      liuyueRow.innerHTML = '';
      if(!data){
        liuyueRow.innerHTML = '<p class="field-hint">該年節氣邊界運算失敗，暫無法展開流月，可嘗試鄰近年份。</p>';
      } else {
        const currentMonthIdx = data.months.findIndex(mo=>mo.days.some(d=>d.y===today.y && d.m===today.m && d.d===today.d));
        data.months.forEach((mo, idx)=>{
          const monthShishen = B.getShishen(dayGan, mo.gan);
          const seg = el(`<div class="tl-seg" data-idx="${idx}">
            <div class="tl-gz">${mo.gan}${mo.zhi}</div>
            <div class="tl-sub">${mo.days[0].m}/${mo.days[0].d}〜</div>
            ${idx===currentMonthIdx ? '<span class="tl-now">本月</span>' : ''}
          </div>`);
          seg.addEventListener('click', ()=>selectLiuyue(r, mo, monthShishen, seg));
          liuyueRow.appendChild(seg);
        });
      }
      showDetail({
        title: `${r.calendarYear}年（${r.gz}）　${r.age}歲`,
        sub: `十神：${r.shishen}`,
        body: `${shishenHintForAge(r.shishen, r.age)||'此年運勢平穩，依既定步調行事即可。'}${r.hiddenText||''}`,
        tags: r.tags,
        age: r.age,
      });
    }

    function selectDayun(du, segEl){
      clearActive(dayunRow);
      segEl.classList.add('active');
      const duShishen = B.getShishen(dayGan, du.gan);
      const rows = ageRows.filter(r=>r.age>=du.startAge && r.age<du.endAge);
      const isAllMinorDu = rows.length>0 && rows.every(r=>r.age<18); // v8.8：整個大運皆為未成年時，時間軸摘要也改用成長階段版本
      liunianRow.innerHTML = '';
      const defaultYearRow = rows.find(r=>r.age===currentAge) || rows[0];
      rows.forEach(r=>{
        const seg = el(`<div class="tl-seg" data-age="${r.age}">
          <div class="tl-gz" style="color:${tlScoreColor(r.score)};">${r.gz}</div>
          <div class="tl-sub">${r.calendarYear}・${r.age}歲</div>
          ${r.age===currentAge ? '<span class="tl-now">現在</span>' : ''}
        </div>`);
        seg.addEventListener('click', ()=>selectLiunian(r, seg));
        liunianRow.appendChild(seg);
      });
      liuyueRow.innerHTML = '<p class="field-hint">請先在上方點選一個流年。</p>';
      showDetail({
        title: `大運「${du.gan}${du.zhi}」　約${Math.round(du.startAge)}~${Math.round(du.endAge)}歲`,
        sub: `五行屬${GAN_WX[du.gan]}・十神：${duShishen}`,
        body: isAllMinorDu ? `此十年約為未成年成長階段，重點在於學業、才藝與生活習慣的培養，暫不評估職場升遷或創業相關運勢。${shishenHintForAge(duShishen, rows[0].age)}` : (SHISHEN_HINT[duShishen]||'此十年運勢平穩，依既定步調穩健發展即可。'),
        tags: [],
      });
      if(defaultYearRow){
        const targetSeg = [...liunianRow.children].find(node=>Number(node.dataset.age)===defaultYearRow.age);
        if(targetSeg) selectLiunian(defaultYearRow, targetSeg);
      }
    }

    fullDayun.forEach(du=>{
      const seg = el(`<div class="tl-seg" data-start="${du.startAge}">
        <div class="tl-gz">${du.gan}${du.zhi}</div>
        <div class="tl-sub">${Math.round(du.startAge)}~${Math.round(du.endAge)}歲</div>
        ${(currentAge>=du.startAge && currentAge<du.endAge) ? '<span class="tl-now">現在</span>' : ''}
      </div>`);
      seg.addEventListener('click', ()=>selectDayun(du, seg));
      dayunRow.appendChild(seg);
    });

    const defaultSeg = [...dayunRow.children].find(s=>Number(s.dataset.start)===defaultDu.startAge);
    if(defaultSeg) selectDayun(defaultDu, defaultSeg);
  }

  function renderZeri(ctx){
    const panel = document.getElementById('panel-zeri');
    if(!panel) return;
    const today = todayInfo();
    const defaultDateStr = `${today.y}-${String(today.m).padStart(2,'0')}-${String(today.d).padStart(2,'0')}`;
    panel.innerHTML = '';
    panel.appendChild(el(`<div>
      <div class="compat-intro">依你的命盤日主、地支合沖與五行喜忌，並疊加通書「生肖沖煞」「建除十二神」判斷，為指定期間內的每一天評分，篩選出較適合的日子；<b>v9.8.1升級為「擇日Copilot」</b>：新增面試、簽約、開店、求婚、手術、發文、談判等更貼近實際決策場景的事項類型，並針對推薦日期附上具體可執行建議與當日推薦時辰（替代時段）；<b>v9.8.3新增</b>同步核對《彭祖百忌》傳統日禁忌口訣，若當日禁忌內容與事項類型明確對應會額外扣分並標記；此為傳統擇日技法的規則化演算，僅供參考，正式訂日仍建議諮詢專業命理師或搭配黃曆通書核對，涉及醫療（手術）等決策務必以專業判斷為最優先。</div>
      <div class="card" id="zeriFormCard">
        <div class="form-grid">
          <div class="field"><label for="zeriEventType">事項類型</label>
            <select id="zeriEventType">
              <optgroup label="一般">
                <option value="general">一般吉日／諸事皆宜</option>
              </optgroup>
              <optgroup label="婚戀">
                <option value="wedding">結婚／訂婚</option>
                <option value="propose">求婚</option>
              </optgroup>
              <optgroup label="職涯">
                <option value="interview">面試</option>
              </optgroup>
              <optgroup label="商業">
                <option value="open">開業／簽約</option>
                <option value="sign">簽約（正式文件）</option>
                <option value="shop">開店／開幕</option>
                <option value="negotiate">重要談判</option>
              </optgroup>
              <optgroup label="居住／出行">
                <option value="move">搬家／入宅</option>
                <option value="travel">出行／遠行</option>
              </optgroup>
              <optgroup label="健康">
                <option value="surgery">手術／醫療處置</option>
              </optgroup>
              <optgroup label="內容發布">
                <option value="post">重要發文／公開發布</option>
              </optgroup>
            </select>
          </div>
          <div class="field"><label for="zeriStartDate">起算日期</label><input type="date" id="zeriStartDate" value="${defaultDateStr}" min="${defaultDateStr}"></div>
          <div class="field"><label for="zeriRangeDays">查詢區間</label>
            <select id="zeriRangeDays">
              <option value="30">未來30天</option>
              <option value="60" selected>未來60天</option>
              <option value="90">未來90天</option>
            </select>
          </div>
        </div>
        <button type="button" class="btn-primary" id="zeriSubmitBtn">開始擇日分析</button>
      </div>
      <div id="zeriResult"></div>
    </div>`));
    document.getElementById('zeriSubmitBtn').addEventListener('click', ()=>runZeriAnalysis(ctx));
  }

  // ================= v7.9新增：風水／居家方位——後天八卦九宮方位＋文昌位／桃花位（真實命盤資料換算）＋宅向適配度 =================
  const FS_BAGUA = [
    {dir:'正北', trigram:'坎', wx:'水', domain:'事業運'},
    {dir:'東北', trigram:'艮', wx:'土', domain:'文昌／智慧運'},
    {dir:'正東', trigram:'震', wx:'木', domain:'健康／家庭運'},
    {dir:'東南', trigram:'巽', wx:'木', domain:'財運'},
    {dir:'正南', trigram:'離', wx:'火', domain:'名譽／貴人運'},
    {dir:'西南', trigram:'坤', wx:'土', domain:'婚姻／人和運'},
    {dir:'正西', trigram:'兌', wx:'金', domain:'子女／創意運'},
    {dir:'西北', trigram:'乾', wx:'金', domain:'貴人／領導運'},
  ];
  const FS_OPPOSITE_DIR = {'正北':'正南','正南':'正北','正東':'正西','正西':'正東','東北':'西南','西南':'東北','東南':'西北','西北':'東南'};
  const ZHI_TO_DIR8 = {
    '子':'正北','丑':'東北','寅':'東北','卯':'正東','辰':'東南','巳':'東南',
    '午':'正南','未':'西南','申':'西南','酉':'正西','戌':'西北','亥':'西北'
  };
  const WENCHANG_ZHI_BY_GAN = {'甲':'巳','乙':'午','丙':'申','丁':'酉','戊':'申','己':'酉','庚':'亥','辛':'子','壬':'寅','癸':'卯'};
  const FS_WX_GENERATE = {'木':'火','火':'土','土':'金','金':'水','水':'木'};
  const FS_WX_CONTROL = {'木':'土','土':'水','水':'火','火':'金','金':'木'};

  function fsRelation(fromWx, toWx){
    if(fromWx === toWx) return {type:'比和', tone:'good', text:`同屬「${fromWx}」，氣場相合、力量疊加`};
    if(FS_WX_GENERATE[fromWx] === toWx) return {type:'相生（生助）', tone:'good', text:`「${fromWx}」生「${toWx}」，有助於補強力量`};
    if(FS_WX_GENERATE[toWx] === fromWx) return {type:'洩（被消耗）', tone:'mid', text:`「${toWx}」反過來生「${fromWx}」，力量會被稍微消耗、影響中性偏弱`};
    if(FS_WX_CONTROL[fromWx] === toWx) return {type:'相剋（受克）', tone:'bad', text:`「${fromWx}」剋「${toWx}」，力量會被壓制削弱`};
    if(FS_WX_CONTROL[toWx] === fromWx) return {type:'我剋（耗力）', tone:'mid', text:`「${toWx}」被「${fromWx}」剋，帶有牽制關係、效果打折`};
    return {type:'—', tone:'mid', text:''};
  }
  function fsBoostDirFallback(weakWx){
    const s = FS_BAGUA.find(s=>s.wx===weakWx) || FS_BAGUA.find(s=>FS_WX_GENERATE[s.wx]===weakWx);
    return s ? s.dir : '喜用方位';
  }
  Object.assign(LN_TAG_STYLE, {
    '建議加強':{bg:'rgba(127,172,154,0.18)',fg:'var(--jade-soft)',bd:'var(--jade)'},
    '宜留意':{bg:'rgba(178,59,53,0.14)',fg:'var(--crimson-soft)',bd:'var(--crimson-soft)'},
  });

  function renderFengshui(ctx){
    const panel = document.getElementById('panel-fengshui');
    if(!panel) return;
    const { bazi, wuxing } = ctx;
    const dom = wuxingDominant(wuxing);
    const weakWx = dom.weakest[0];
    const strongWx = dom.strongest[0];
    const yearGan = bazi.pillars.year.gan;
    const dayZhi = bazi.pillars.day.zhi;

    // 文昌位（依年柱天干真實命盤資料換算，傳統文昌位訣）
    const wenchangZhi = WENCHANG_ZHI_BY_GAN[yearGan];
    const wenchangDir = ZHI_TO_DIR8[wenchangZhi];
    // 桃花位（依日柱地支所屬三合局換算，與其他頁籤共用同一套桃花判斷邏輯）
    const peachZhi = getPeachZhi(dayZhi);
    const peachDir = peachZhi ? ZHI_TO_DIR8[peachZhi] : null;

    // 九宮方位運勢對照：找出「最有助補強最弱五行」與「克制最弱五行」的方位
    const boostSector = FS_BAGUA.filter(s=> s.wx===weakWx || FS_WX_GENERATE[s.wx]===weakWx).sort((a,b)=> (a.wx===weakWx?0:1)-(b.wx===weakWx?0:1))[0];
    const cautionSector = FS_BAGUA.find(s=> FS_WX_CONTROL[s.wx]===weakWx);

    let html = `<div class="compat-intro">依你命盤中五行力量最弱的「${weakWx}」，對照「後天八卦九宮方位」的方位五行生剋關係，找出居家中適合加強擺放對應物品的方位，並提供文昌位、桃花位與宅向適配度分析；此為風水學界常見的簡化通用框架，並非精密羅盤實測，僅供生活化參考。</div>`;

    html += `<div class="card" style="margin-bottom:16px;">
      <h3 style="margin:0 0 12px;font-size:15px;">📖 文昌位／桃花位（依你命盤真實資料換算）</h3>
      <table class="data-table">
        <tr><th>項目</th><th>依據</th><th>建議方位</th><th>說明</th></tr>
        <tr><td class="hl">文昌位</td><td>年柱天干「${yearGan}」</td><td class="hl">${wenchangDir}</td><td>依傳統文昌位訣換算，適合安放書桌、閱讀角落，利進修考運、思緒清晰</td></tr>
        <tr><td class="hl">桃花位</td><td>${peachZhi?`日柱地支「${dayZhi}」所屬三合局`:'—'}</td><td class="hl">${peachDir||'—'}</td><td>${peachZhi?'適合擺放鮮花、成對飾品，利人緣桃花、社交場合表現':'此命盤日支未落入標準桃花三合局分類，暫無對應桃花位'}</td></tr>
      </table>
    </div>`;

    // v8.9.1新增：今日方位神（財神／喜神／福神，通書通用規則，依「今天」的日柱天干換算，非命盤資料）
    (function(){
      const today = todayInfo();
      try{
        const todayFull = B.computeFourPillars({year:today.y, month:today.m, day:today.d, hour:12, minute:0, tzOffset:8, longitude:120, useTrueSolarTime:false});
        const todayDayGan = todayFull.pillars.day.gan, todayDayZhi = todayFull.pillars.day.zhi;
        const gods = AL.getDailyGods(todayDayGan);
        const cs = AL.getChongSha(todayDayZhi);
        const matchWenchang = gods.caishen===wenchangDir || gods.xishi===wenchangDir || gods.fushen===wenchangDir;
        const matchPeach = peachDir && (gods.caishen===peachDir || gods.xishi===peachDir || gods.fushen===peachDir);
        html += `<div class="card" style="margin-bottom:16px;">
          <h3 style="margin:0 0 12px;font-size:15px;">🌞 今日方位神（${today.y}/${today.m}/${today.d}・${todayDayGan}${todayDayZhi}日，通書通用規則，每人皆同）</h3>
          <table class="data-table">
            <tr><th>項目</th><th>今日方位</th></tr>
            <tr><td class="hl">財神方位</td><td class="hl">${gods.caishen}${gods.caishen===wenchangDir?tagChip('建議加強'):''}</td></tr>
            <tr><td class="hl">喜神方位</td><td class="hl">${gods.xishi}</td></tr>
            <tr><td class="hl">福神方位</td><td class="hl">${gods.fushen}</td></tr>
            <tr><td class="hl">今日煞方位</td><td>沖${cs.chongZodiac}・煞${cs.shaDirection}（今日不宜朝此方位動土、遠行出發）</td></tr>
          </table>
          <p style="font-size:14px;color:var(--paper-dim);line-height:1.8;margin-top:10px;">此區塊為通書「每日方位神」通用規則，依「今天」日柱天干換算，不需個人命盤資料、每個人查詢結果皆相同；${matchWenchang?`今日恰好與你的<b style="color:var(--gold-soft);">文昌位（${wenchangDir}）</b>方位重疊，若當日有進修考試等安排可多加利用；`:''}${matchPeach?`今日恰好與你的<b style="color:var(--gold-soft);">桃花位（${peachDir}）</b>方位重疊，社交場合可多留意此方位；`:''}${(!matchWenchang && !matchPeach)?'今日方位神與你命盤的文昌位／桃花位方位未重疊，僅供一般參考。':''}此區塊每次開啟頁面時會依系統當下日期重新計算。</p>
        </div>`;
      }catch(e){ console.error('今日方位神計算失敗', e); }
    })();

    html += `<div class="card" style="margin-bottom:16px;">
      <h3 style="margin:0 0 12px;font-size:15px;">🧭 後天八卦九宮方位對照表</h3>
      <table class="data-table">
        <tr><th>方位</th><th>卦位</th><th>五行</th><th>對應生活領域</th><th>與你最弱五行「${weakWx}」的關係</th></tr>
        ${FS_BAGUA.map(s=>{
          const rel = fsRelation(s.wx, weakWx);
          const isBoost = boostSector && s.dir===boostSector.dir;
          const isCaution = cautionSector && s.dir===cautionSector.dir;
          const tag = isBoost ? tagChip('建議加強') : (isCaution ? tagChip('宜留意') : '');
          return `<tr><td class="hl">${s.dir}</td><td>${s.trigram}</td><td>${s.wx}</td><td>${s.domain}</td><td>${rel.type}${tag?` ${tag}`:''}</td></tr>`;
        }).join('')}
      </table>
      <p style="font-size:14px;color:var(--paper-dim);line-height:1.8;margin-top:10px;">${boostSector?`建議在住家「${boostSector.dir}」（${boostSector.domain}）方位擺放${WX_ITEM[weakWx]}，或使用${WX_COLOR_NAME[weakWx]}裝飾，呼應命盤最弱五行「${weakWx}」的補強方向，日常習慣可搭配「${WX_HABIT[weakWx]}」一併調整。`:''}${cautionSector?`「${cautionSector.dir}」（${cautionSector.domain}）方位五行會克制你的最弱五行「${weakWx}」，建議該方位保持整潔、避免堆放雜物或尖角銳器擺設，以免削弱該五行力量。`:''}</p>
    </div>`;

    html += `<div class="card" id="fsFormCard">
      <h3 style="margin:0 0 12px;font-size:15px;">🏠 宅向適配度分析</h3>
      <div class="form-grid">
        <div class="field"><label for="fsFacingDir">房屋／大門主要朝向</label>
          <select id="fsFacingDir">
            <option value="正北">正北</option>
            <option value="東北">東北</option>
            <option value="正東" selected>正東</option>
            <option value="東南">東南</option>
            <option value="正南">正南</option>
            <option value="西南">西南</option>
            <option value="正西">正西</option>
            <option value="西北">西北</option>
          </select>
          <span class="hint">請選擇你家大門或主要窗戶面對屋外的方位，可用手機指南針App概略確認</span>
        </div>
        <div class="field"><label for="fsCityNote">所在地區／城市（選填）</label><input type="text" id="fsCityNote" placeholder="例如：台北市"><span class="hint">僅顯示於分析結果標題，不影響運算結果</span></div>
      </div>
      <button type="button" class="btn-primary" id="fsSubmitBtn">開始宅向分析</button>
    </div>
    <div id="fsResult"></div>`;

    html += `<div class="disclaimer" style="border-top:none;margin-top:16px;padding-top:0;">
      <b>演算方法說明：</b>「文昌位」依年柱天干對照傳統文昌位訣、「桃花位」依日柱地支所屬三合局換算，皆取自你命盤主流程的真實排盤資料，與「八字命盤」頁籤共用同一組四柱，非另行編造或套用固定範本。「後天八卦九宮方位」為風水學界常見的通用分類框架，將住家劃分為八個方位、各自對應不同生活領域與五行屬性；「宅向適配度」則以你輸入的房屋朝向反推「坐山」方位五行，與命盤最弱／最旺五行進行生剋比對。<b>v8.9.1新增</b>「今日方位神」：財神／喜神／福神方位依當天日柱天干換算（財神歌「甲艮乙坤丙丁兌，戊己財神坐坎位，庚辛正東壬癸南」；喜神歌「甲己在艮乙庚乾，丙辛坤位喜神安，丁壬本在離宮坐，戊癸原來在巽間」；福神歌「甲己正北是福神，丙辛西北乾宮存，乙庚坤位戊癸艮，丁壬巽上妙追尋」），屬通書通用規則、不需個人命盤資料，每人查詢結果皆相同，與你命盤算出的文昌位／桃花位重疊時會額外標示；不同萬年曆版本口訣仍可能有出入，此處採命理界交叉核對後最常見之通行版本。以上皆屬「五行方位補強」簡化原則之規則化演算，並未納入實際羅盤測量、房屋精確座向角度、玄空飛星年運盤或巒頭形勢等更完整的傳統風水體系，正式裝修動線與開運物擺放，仍建議實地測量並諮詢專業風水師。
    </div>`;

    panel.innerHTML = '';
    panel.appendChild(el(`<div>${html}</div>`));
    document.getElementById('fsSubmitBtn').addEventListener('click', ()=>runFengshuiAnalysis(weakWx, strongWx));
  }

  function runFengshuiAnalysis(weakWx, strongWx){
    const resultBox = document.getElementById('fsResult');
    if(!resultBox) return;
    const facingDir = document.getElementById('fsFacingDir').value;
    const cityNote = (document.getElementById('fsCityNote').value||'').trim();
    const sittingDir = FS_OPPOSITE_DIR[facingDir];
    const facingSector = FS_BAGUA.find(s=>s.dir===facingDir);
    const sittingSector = FS_BAGUA.find(s=>s.dir===sittingDir);
    const houseWx = sittingSector.wx; // 宅命五行取決於「坐山」（住宅背後方位），而非「向」（開口面對方位）

    const relWeak = fsRelation(houseWx, weakWx);
    const relStrong = fsRelation(houseWx, strongWx);

    const toneLabel = {good:'上吉', mid:'平', bad:'宜留意'};
    const overallTag = tagChip(toneLabel[relWeak.tone] || '平');

    let html = `<div class="decade-summary" style="margin-bottom:16px;">${cityNote?`${cityNote}　`:''}你的房屋朝向「${facingDir}」（${facingSector.trigram}卦），坐山方位為「${sittingDir}」（${sittingSector.trigram}卦，五行屬「${houseWx}」）。</div>`;

    html += `<table class="data-table">
      <tr><th>項目</th><th>內容</th></tr>
      <tr><td>宅向（大門朝向）</td><td class="hl">${facingDir}・${facingSector.trigram}卦・${facingSector.domain}</td></tr>
      <tr><td>宅坐（住宅背後方位）</td><td class="hl">${sittingDir}・${sittingSector.trigram}卦・五行「${houseWx}」</td></tr>
      <tr><td>與命盤最弱五行「${weakWx}」的關係</td><td>${relWeak.type} ${overallTag}</td></tr>
      <tr><td>與命盤最旺五行「${strongWx}」的關係</td><td>${relStrong.type}</td></tr>
    </table>`;

    html += `<p style="font-size:14px;color:var(--paper-dim);line-height:1.85;margin-top:12px;">${relWeak.text}——${relWeak.tone==='good'?`此宅向對你命盤中偏弱的「${weakWx}」有補強效果，屬於較適合居住的格局。`:relWeak.tone==='bad'?`此宅向的五行會壓制你命盤中原本就偏弱的「${weakWx}」，建議搭配${WX_COLOR_NAME[weakWx]}及${WX_ITEM[weakWx]}等物品，於居家「${fsBoostDirFallback(weakWx)}」方位加強補救。`:`此宅向對你命盤五行的影響中性，日常仍可依上方「後天八卦九宮方位對照表」中標示「建議加強」的方位擺放對應物品來補強運勢。`}</p>`;

    resultBox.innerHTML = '';
    resultBox.appendChild(el(`<div>${html}</div>`));
  }

  // ================= 命盤解析報告：粉彩海報版型（易讀摘要頁，資料全部取自命盤真實演算結果） =================
  const ZHI_ZODIAC = {'子':'鼠','丑':'牛','寅':'虎','卯':'兔','辰':'龍','巳':'蛇','午':'馬','未':'羊','申':'猴','酉':'雞','戌':'狗','亥':'豬'};
  const POSTER_WX_COLOR = {'木':'#7a9b7e','火':'#c76b6b','土':'#c9a15a','金':'#a9a2b0','水':'#6f89b0'};
  const WX_DIRECTION = {'木':'東方','火':'南方','土':'中央／自家附近','金':'西方','水':'北方'};
  const WX_COLOR_NAME = {'木':'綠色、淺綠、青色系','火':'紅色、橙色、粉色系','土':'黃色、米色、咖啡色系','金':'白色、金色、銀色系','水':'黑色、藍色、灰色系'};
  const WX_ITEM = {'木':'木質飾品、綠色盆栽、檀香類香氛','火':'紅色配件、蠟燭、暖色調飾品','土':'黃水晶、陶瓷器物、玄關擺飾','金':'金屬飾品、白水晶、金屬鈴鐺','水':'流水擺飾、黑曜石、藍色織品'};
  const WX_HABIT = {'木':'早睡早起、多接觸綠意與戶外環境','火':'保持規律運動、多參與社交活動','土':'飲食定時定量、加強與家人互動','金':'保持環境整潔、維持規律作息','水':'充足睡眠、多補水、練習靜心'};
  const WX_TRAIT = {
    '木':{ic:'🌱',t:'成長導向',d:'重視自我提升，學習力強'},
    '火':{ic:'🔥',t:'熱情直率',d:'行動力強，感染力十足'},
    '土':{ic:'⛰️',t:'穩重可靠',d:'重承諾，值得信賴託付'},
    '金':{ic:'⚔️',t:'果斷理性',d:'邏輯清晰，執行力強'},
    '水':{ic:'💧',t:'靈活善變',d:'思路敏捷，善於應變'},
  };
  const SHISHEN_CAT_TRAIT = {
    guanSha:{ic:'🛡️',t:'責任感強',d:'重紀律規範，值得託付重任'},
    caiXing:{ic:'💎',t:'務實精明',d:'重視實際成果與資源效益'},
    yinXing:{ic:'📖',t:'學習力佳',d:'求知慾強，貴人運旺'},
    shiShang:{ic:'🎨',t:'創意豐沛',d:'表達力強，點子源源不絕'},
    biJie:{ic:'🤝',t:'人脈廣闊',d:'善於合作，重視夥伴情誼'},
  };
  const SHISHEN_CAT_TYPE = {
    guanSha:{title:'嚴謹領導者',desc:'重紀律與責任，具管理統御潛質，適合體制內外的領導角色。'},
    caiXing:{title:'務實經營者',desc:'重視實際成果與資源運用，理財與經營意識強。'},
    yinXing:{title:'智慧學習者',desc:'重視知識與內在修養，貴人運佳，適合學術與專業累積型發展。'},
    shiShang:{title:'創意表達者',desc:'才華洋溢、表達力強，適合創作、教學或需展現個人特色的領域。'},
    biJie:{title:'果敢行動者',desc:'行動力強、重視人脈與合作，適合團隊協作或自主創業。'},
    balanced:{title:'溫潤平衡者',desc:'五行與十神力量分布均衡，性格圓融，具備多元發展的彈性。'},
  };
  const WX_INDUSTRY_DETAIL = {
    '木':[{ic:'📚',name:'教育培訓',desc:'成長型特質適合傳道授業、知識累積'},{ic:'🎨',name:'設計創作',desc:'木主生發，適合創意與美感相關領域'},{ic:'🌱',name:'心理諮商',desc:'善於陪伴他人成長，助人特質明顯'}],
    '火':[{ic:'📣',name:'行銷傳播',desc:'火主表現，適合站上第一線發聲'},{ic:'🍽️',name:'餐飲美食',desc:'熱情具感染力，適合服務型產業'},{ic:'🎤',name:'演說培訓',desc:'表達力強，適合需要舞台的工作'}],
    '土':[{ic:'🏠',name:'不動產與工程',desc:'土主穩重，適合長期經營的產業'},{ic:'🧭',name:'顧問管理',desc:'務實可靠，適合規劃統籌型工作'},{ic:'🌾',name:'食品農牧',desc:'腳踏實地，適合根基型產業'}],
    '金':[{ic:'💰',name:'金融投資',desc:'金主決斷，適合數字與規則導向工作'},{ic:'⚙️',name:'科技資訊',desc:'邏輯清晰，適合技術與系統性工作'},{ic:'📐',name:'法務會計',desc:'重紀律與精確，適合專業執照型工作'}],
    '水':[{ic:'🌊',name:'物流貿易',desc:'水主流動，適合跨地域、國際型工作'},{ic:'✈️',name:'旅遊觀光',desc:'善變通喜探索，適合多變化的產業'},{ic:'🧠',name:'策略規劃',desc:'智慧靈活，適合需要謀略布局的工作'}],
  };
  const YEAR_DOMAIN_TEXT = {
    career:{ 比肩:'人脈拓展，適合團隊合作案件', 劫財:'合夥或跳槽宜多評估風險', 食神:'才華發揮舞台增加，適合展現創意', 傷官:'表現慾強，注意職場溝通分寸', 正財:'工作務實有成，收入穩定成長', 偏財:'機會增多，宜留意投機性決定', 正官:'責任加重，有升遷或轉正機會', 七殺:'壓力與挑戰並存，行動力旺盛', 正印:'貴人相助，適合進修轉型', 偏印:'獨立鑽研運佳，宜主動對外連結', 日主:'同干年，職涯宜求穩不宜躁進' },
    wealth:{ 比肩:'財運普通，避免與人共同投資', 劫財:'破財訊號，理財決策務必謹慎', 食神:'偏財與副業收入機會浮現', 傷官:'收入來源多元但支出也增加', 正財:'正財穩定，適合規劃長期理財', 偏財:'投資機會增加，仍需嚴守風險控管', 正官:'財務紀律佳，適合穩健儲蓄', 七殺:'財務壓力較大，宜控管開銷', 正印:'貴人資源挹注，理財觀念提升', 偏印:'偏財機會浮動，不宜孤注一擲', 日主:'財運持平，宜守成不宜冒進' },
    love:{ 比肩:'單身者有機會結識新對象', 劫財:'感情中金錢議題需坦誠溝通', 食神:'感情氛圍甜蜜，適合經營生活情趣', 傷官:'表達直接，但需留意言語衝突', 正財:'穩定交往關係更進一步', 偏財:'異性緣提升，已有伴侶宜守分際', 正官:'適合穩定發展、論及婚嫁', 七殺:'關係中易有摩擦，宜多包容', 正印:'渴望被理解與陪伴，重視精神交流', 偏印:'情感內斂，宜主動表達心意', 日主:'感情運持平，維持現狀為宜' },
    health:{ 比肩:'留意心血管與睡眠品質', 劫財:'注意過度消耗體力，宜適度休息', 食神:'消化系統保養，飲食宜均衡', 傷官:'留意呼吸系統與情緒壓力', 正財:'留意肩頸與久坐相關問題', 偏財:'作息不規律風險增加，宜調整', 正官:'留意肝膽與內分泌系統', 七殺:'壓力大易緊繃，注意腸胃與免疫', 正印:'整體平穩，維持規律運動即可', 偏印:'留意神經系統與睡眠品質', 日主:'健康持平，維持既有保養習慣' },
  };
  const SHISHEN_POSITIVITY = {正財:1,偏財:0.5,食神:1,正印:1,正官:0.5,比肩:0,劫財:-1,傷官:-0.3,七殺:-0.7,偏印:0.2,日主:0};

  function posterStars(n){
    const full = Math.max(1, Math.min(5, Math.round(n)));
    return '★'.repeat(full) + `<span class="dim">${'★'.repeat(5-full)}</span>`;
  }

  // 依十神五類（官殺／財星／印星／食傷／比劫）中數量最高者，判定命格主導類型
  function dominantShishenCategory(stats){
    const arr = [['guanSha',stats.guanSha],['caiXing',stats.caiXing],['yinXing',stats.yinXing],['shiShang',stats.shiShang],['biJie',stats.biJie]];
    arr.sort((a,b)=>b[1]-a[1]);
    if(arr[0][1]<=1) return 'balanced'; // 五類皆不突出，視為平衡型
    return arr[0][0];
  }

  function renderPoster(ctx){
    const {p, bazi, wuxing, lunar, astro} = ctx;
    const panel = document.getElementById('panel-poster');
    const stats = computeReportStats(ctx);
    const dayGan = bazi.pillars.day.gan, dayZhi = bazi.pillars.day.zhi;
    const dayGanWx = stats.dayGanWx;
    const dom = stats.dom;
    const total = Object.values(wuxing).reduce((a,b)=>a+b,0) || 1;
    const zodiac = ZHI_ZODIAC[bazi.pillars.year.zhi] || '';
    // v10.5修正（缺失①⑤）：nowYear改用台灣時區的「今天」（todayInfo()），
    // 不再受使用者裝置本地時區影響；xuSui改用正確的虛歲算法（依農曆新年是否已過判斷），
    // 取代原本「西曆1/1直接跳號」與本站文件所述定義不一致的簡化算法
    // （見todayInfo()／getPreciseAgeInfo()說明）。
    const __todayForPoster = todayInfo();
    const nowYear = __todayForPoster.y;
    const xuSui = getPreciseAgeInfo(p).xuSui;
    const sunSign = astro.Sun ? astro.Sun.sign : '（時辰未知，無法精算太陽星座）';
    const catType = dominantShishenCategory(stats);
    const typeInfo = SHISHEN_CAT_TYPE[catType];

    // ---- 六大人格特質：日主五行 + 命格主導十神類 + 命盤最旺五行，去重取前6項 ----
    const traitPool = [];
    traitPool.push(WX_TRAIT[dayGanWx]);
    if(catType!=='balanced') traitPool.push(SHISHEN_CAT_TRAIT[catType]);
    dom.entries.forEach(([wx])=>{ if(WX_TRAIT[wx]) traitPool.push(WX_TRAIT[wx]); });
    Object.keys(SHISHEN_CAT_TRAIT).forEach(k=>{ if(k!==catType) traitPool.push(SHISHEN_CAT_TRAIT[k]); });
    const seenTrait = new Set();
    const traits = [];
    traitPool.forEach(tr=>{ if(tr && !seenTrait.has(tr.t) && traits.length<6){ seenTrait.add(tr.t); traits.push(tr); } });

    // ---- 人生關鍵字：直接取自上方六大人格特質，再加上格局標籤，全部皆為真實命盤推導結果 ----
    const keywords = [...traits.map(t=>t.t), `${dayGanWx}命日主`, `${stats.strengthLabel}格局`];

    // ---- 一句話財運模式：依五類十神何者最旺決定 ----
    const moneyModeMap = {
      guanSha:'財富來自責任與穩健的長期累積',
      caiXing:'財富來自你對資源的精準掌握',
      yinXing:'財富來自知識累積與貴人的加持',
      shiShang:'財富來自創意與才華的變現',
      biJie:'財富來自人脈連結與合作的力量',
      balanced:'財富來自穩紮穩打、按部就班的累積',
    };

    // ---- 01 五行圖：以真實五行分數比例繪製環形圖 ----
    const wxOrder = ['木','火','土','金','水'];
    let acc = 0;
    const gradientStops = wxOrder.map(wx=>{
      const pct = (wuxing[wx]||0)/total*100;
      const start = acc; acc += pct;
      return `${POSTER_WX_COLOR[wx]} ${start.toFixed(1)}% ${acc.toFixed(1)}%`;
    }).join(', ');
    const ringLegend = wxOrder.map(wx=>{
      const pct = ((wuxing[wx]||0)/total*100).toFixed(0);
      return `<div class="rl-row"><span class="rl-dot" style="background:${POSTER_WX_COLOR[wx]};"></span>${wx} <b>${pct}%</b>${wx===dom.strongest[0]?'（最旺）':''}${wx===dom.weakest[0]?'（最弱）':''}</div>`;
    }).join('');
    const boostWx = dom.weakest[0];
    const boostAdvice = `五行「${boostWx}」力量相對最弱，日常可透過方位、顏色、生活習慣等方式適度補強（詳見「補運建議」），有助於整體五行趨於平衡、運勢更加穩定。`;

    // ---- 02 日主格局與十神特質 ----
    const shishenCatLabel = {guanSha:'官殺（正官／七殺）',caiXing:'財星（正財／偏財）',yinXing:'印星（正印／偏印）',shiShang:'食傷（食神／傷官）',biJie:'比劫（比肩／劫財）',balanced:'五類十神力量分布平均'};

    // ---- 03 過去3個月重大變化：取真實流月十神逐月生成 ----
    const monthIcon = {guanSha:'💼',caiXing:'💰',yinXing:'📖',shiShang:'🎨',biJie:'🤝'};
    function catOfShishen(sh){
      if(sh==='正官'||sh==='七殺') return 'guanSha';
      if(sh==='正財'||sh==='偏財') return 'caiXing';
      if(sh==='正印'||sh==='偏印') return 'yinXing';
      if(sh==='食神'||sh==='傷官') return 'shiShang';
      if(sh==='比肩'||sh==='劫財') return 'biJie';
      return null;
    }
    const past3 = [];
    for(let i=2;i>=0;i--){
      // v10.5修正（缺失⑤）：月份也改用台灣時區的今天，與nowYear基準一致，避免年/月分別取自不同時區來源。
      const d = new Date(Date.UTC(nowYear, __todayForPoster.m-1-i, 1));
      const y = d.getUTCFullYear(), m = d.getUTCMonth()+1;
      let mShishen = '日主', mGz = '';
      try{
        const full = B.computeFourPillars({year:y, month:m, day:15, hour:12, minute:0, tzOffset:8, longitude:p.longitude, useTrueSolarTime:p.useTrueSolarTime});
        mGz = full.pillars.month.gan + full.pillars.month.zhi;
        mShishen = full.pillars.month.gan===dayGan ? '日主' : B.getShishen(dayGan, full.pillars.month.gan);
      }catch(e){ /* 超出曆算範圍時略過該月 */ }
      const cat = catOfShishen(mShishen);
      past3.push({ y, m, gz:mGz, shishen:mShishen, icon:cat?monthIcon[cat]:'✨', text: stats.fortuneDesc[mShishen] || '運勢平穩，依既定步調行事即可。' });
    }
    const past3Range = past3.length ? `${past3[0].y}年${past3[0].m}月～${past3[past3.length-1].y}年${past3[past3.length-1].m}月` : '';

    // ---- 04 未來大運課題：取真實目前大運 ----
    // v10.5修正（缺失④）：改用精確實歲，取代「西曆年直接相減」的粗略算法（見getPreciseAgeInfo說明）。
    const nowAgeForPoster = getPreciseAgeInfo(p).preciseAge;
    const curDayun = (ctx.dayun.dayunList||[]).find(d=>nowAgeForPoster>=parseFloat(d.startAge) && nowAgeForPoster<parseFloat(d.endAge)) || ctx.dayun.dayunList[ctx.dayun.dayunList.length-1];
    let dayunTheme = '穩健發展、按部就班';
    let dayunAdvice = '此階段適合累積實力、穩紮穩打。';
    if(curDayun){
      const dyShishen = curDayun.gan===dayGan ? '日主' : B.getShishen(dayGan, curDayun.gan);
      const dyDesc = { 比肩:'人脈拓展、團隊協作', 劫財:'合作審慎、財務把關', 食神:'才華發揮、生活品味提升', 傷官:'創意展現、表達力發揮', 正財:'資源累積、穩健理財', 偏財:'機會增加、審慎評估', 正官:'責任承擔、地位提升', 七殺:'挑戰突破、行動力旺盛', 正印:'學習進修、貴人扶持', 偏印:'專業鑽研、獨立思考', 日主:'本命大運、宜求穩紮根' };
      dayunTheme = dyDesc[dyShishen] || dayunTheme;
      dayunAdvice = `此運十神屬「${dyShishen}」，${stats.fortuneDesc[dyShishen] || '整體運勢平穩，宜按部就班。'}`;
    }

    // ---- 05 未來3年流年起伏：取真實逐年真實干支演算 ----
    const natalZhiForFlow = {year:bazi.pillars.year.zhi, month:bazi.pillars.month.zhi, day:dayZhi};
    if(!p.unknownHour && bazi.pillars.hour) natalZhiForFlow.hour = bazi.pillars.hour.zhi;
    const peachZhiForFlow = getPeachZhi(dayZhi);
    const spouseStarsForFlow = p.gender==='M' ? ['正財','偏財'] : ['正官','七殺'];
    const yearCards = [];
    for(let i=0;i<3;i++){
      const y = nowYear + i;
      let yGZ, flowSh, tags=[];
      try{
        yGZ = ganZhiOfYear(y, p.longitude, p.useTrueSolarTime);
        flowSh = yGZ.gan===dayGan ? '日主' : B.getShishen(dayGan, yGZ.gan);
        tags = flowTags(natalZhiForFlow, dayZhi, dayGan, yGZ.gan, yGZ.zhi, flowSh, spouseStarsForFlow, peachZhiForFlow, '年');
      }catch(e){ continue; }
      const posScore = SHISHEN_POSITIVITY[flowSh] ?? 0;
      const hasCaution = tags.some(t=>CAUTION_TAGS.includes(t));
      const hasGood = tags.some(t=>GOOD_TAGS.includes(t));
      let stars = Math.round(3 + posScore*1.3);
      if(hasCaution) stars -= 1; if(hasGood) stars += 1;
      stars = Math.max(1, Math.min(5, stars));
      yearCards.push({
        y, gan:yGZ.gan, zhi:yGZ.zhi, shishen:flowSh, stars,
        career: YEAR_DOMAIN_TEXT.career[flowSh] || '運勢平穩，依既定步調行事即可。',
        wealth: YEAR_DOMAIN_TEXT.wealth[flowSh] || '財運持平，宜穩健為主。',
        love: YEAR_DOMAIN_TEXT.love[flowSh] || '感情運持平，維持現狀即可。',
        health: YEAR_DOMAIN_TEXT.health[flowSh] || '健康狀況平穩，維持既有習慣即可。',
      });
    }

    // ---- 06 人生各領域綜合分析：直接複用「綜合運勢報告」頁籤真實計算結果，換算星等（全文完整呈現，不截斷） ----
    // v5.6更新：原固定門檻（>=5給5星、>=3給4星…）會讓多數人的六個領域分數集中在3~4星，鑑別度不足；
    // 改採「同一人六個領域分數的相對百分位」換算星等，確保同一張命盤內至少能看出領域間的相對強弱。
    const domainScoreMap = [
      {key:'家庭運', icon:'⌂', score:stats.yinXing, text:stats.family},
      {key:'事業運', icon:'☆', score:Math.max(stats.guanSha,stats.shiShang), text:stats.career},
      {key:'財運', icon:'💰', score:stats.caiXing, text:stats.wealth},
      {key:'健康運', icon:'♥', score:stats.hasQiSha?1:3, text:stats.hazard},
      {key:'人際關係', icon:'🤝', score:stats.biJie, text:stats.interpersonal},
      {key:'情感運', icon:'♡', score:stats.caiXing+stats.guanSha, text:stats.marriage},
    ];
    const domainScoresRaw = domainScoreMap.map(d=>d.score);
    const domainScoreMin = Math.min(...domainScoresRaw), domainScoreMax = Math.max(...domainScoresRaw);
    function scoreToStars(n){
      if(domainScoreMax===domainScoreMin) return 3; // 六領域分數皆相同時，給中性3星，避免除以0
      const ratio = (n - domainScoreMin) / (domainScoreMax - domainScoreMin); // 0~1，屬於「此人命盤內」的相對百分位，並非跨全站使用者常模
      return Math.max(1, Math.min(5, Math.round(1 + ratio * 4)));
    }

    // ---- 07 適合產業：取五行分數最高兩者之對應產業 ----
    const topWx1 = dom.entries[0][0], topWx2 = dom.entries[1][0];
    const industries = [...(WX_INDUSTRY_DETAIL[topWx1]||[]), ...(WX_INDUSTRY_DETAIL[topWx2]||[])];

    // ---- 08 補運建議：取五行最弱者（補弱原則）對應之方位／顏色／物品／習慣 ----
    const wkWx = dom.weakest[0];

    // ---- 標題區關鍵字 chip 與命格類型已於上方算好，開始組 HTML ----
    let html = `<div class="poster-wrap"><div class="poster-inner">
      <div class="poster-actions"><button type="button" id="posterPrintBtn">🖨️ 列印／另存PDF</button><button type="button" id="posterImageBtn">🖼️ 存成圖片</button><button type="button" id="posterQuickCardBtn">⚡ 快速分享小卡（免網路）</button></div>
      <div class="poster-header">
        <div class="poster-title">
          <div class="sub">DESTINY ANALYSIS · 專屬命盤解析</div>
          <h1>${escapeHtml(p.surname)}${escapeHtml(p.givenName)} 的人生策略地圖</h1>
          <div class="tagline">溫柔堅定・智慧通透・創造美好</div>
        </div>
        <div class="poster-badge"><b>${typeInfo.title}</b>命格類型</div>
      </div>

      <div class="poster-userbox">
        <div class="ub-item">性別　<b>${p.gender==='M'?'男':'女'}</b></div>
        <div class="ub-item">國曆　<b>${p.y}/${p.m}/${p.d}</b></div>
        <div class="ub-item">農曆　<b>${lunar.lunarYear}年${lunar.isLeap?'閏':''}${lunar.monthName}${lunar.dayName}</b></div>
        <div class="ub-item">生肖　<b>${zodiac}</b></div>
        <div class="ub-item">星座　<b>${sunSign}</b></div>
        <div class="ub-item">目前虛歲　<b>${xuSui}歲</b></div>
        <div class="ub-item">日主　<b>${dayGan}${dayZhi}（${dayGanWx}）</b></div>
      </div>

      <div class="poster-keywords">${keywords.map(k=>`<span class="poster-kw">${k}</span>`).join('')}</div>

      <div class="poster-quote">
        <b>命理師解讀：</b>妳的日主為「${dayGan}${dayZhi}」，五行屬${dayGanWx}，${stats.strengthLabel}格局；命格傾向「${typeInfo.title}」——${typeInfo.desc}
      </div>

      <div class="poster-section">
        <div class="poster-section-head"><div class="poster-num">01</div><h2>五行能量比例與旺衰分析</h2></div>
        <div class="poster-ring-wrap">
          <div style="width:150px;height:150px;border-radius:50%;flex:none;background:conic-gradient(${gradientStops});box-shadow:0 6px 18px rgba(51,68,122,0.18);"></div>
          <div class="poster-ring-legend">
            ${ringLegend}
            <div class="poster-verdict"><b>旺衰總評：</b>日主${stats.strengthLabel}。${boostAdvice}</div>
          </div>
        </div>
      </div>

      <div class="poster-section">
        <div class="poster-section-head"><div class="poster-num">02</div><h2>日主格局與十神人格特質</h2></div>
        <div class="poster-grid">
          <div class="poster-card"><h3>日主格局</h3><p class="big">${dayGanWx}・${stats.strengthLabel}</p><p>日主${dayGan}${dayZhi}，五行屬${dayGanWx}，整體格局${stats.strengthLabel}，${stats.strengthLabel==='偏弱'?'宜借助印星、比劫之力適度扶身':(stats.strengthLabel==='偏強'?'宜透過財官食傷適度洩秀':'五行力量分布均衡，發展彈性較大')}。</p></div>
          <div class="poster-card"><h3>命格類型</h3><p class="big">${typeInfo.title}</p><p>${typeInfo.desc}</p></div>
          <div class="poster-card"><h3>十神組合重點</h3><p class="big">${shishenCatLabel[catType]}</p><p>命盤中此類十神力量最為突出，是解讀妳行事風格與資源運用方式的關鍵線索。</p></div>
        </div>
        <div class="poster-iconlist" style="margin-top:14px;">
          ${traits.map(t=>`<div class="poster-iconitem"><div class="ic">${t.ic}</div><div><h4>${t.t}</h4><p>${t.d}</p></div></div>`).join('')}
        </div>
      </div>

      <div class="poster-section">
        <div class="poster-section-head"><div class="poster-num">03</div><h2>過去3個月重大變化（${past3Range}）</h2></div>
        <div class="poster-iconlist">
          ${past3.map(mo=>`<div class="poster-iconitem"><div class="ic">${mo.icon}</div><div><h4>${mo.y}年${mo.m}月　流月${mo.gz}・${mo.shishen}</h4><p>${mo.text}</p></div></div>`).join('')}
        </div>
      </div>

      <div class="poster-section">
        <div class="poster-section-head"><div class="poster-num">04</div><h2>未來大運課題${curDayun?`（${curDayun.startAge}~${curDayun.endAge}歲大運）`:''}</h2></div>
        <div class="poster-card">
          <h3>${curDayun?curDayun.gan+curDayun.zhi+'大運':'大運資料不足'}　<span style="color:var(--pk-pink);font-weight:400;">${dayunTheme}</span></h3>
          <p>${dayunAdvice}</p>
        </div>
      </div>

      <div class="poster-section">
        <div class="poster-section-head"><div class="poster-num">05</div><h2>未來3年流年起伏</h2></div>
        <div class="poster-year-grid">
          ${yearCards.map(yc=>`<div class="poster-year-card">
            <h3>${yc.y} ${yc.gan}${yc.zhi}年</h3>
            <div class="yc-sub">流年十神：${yc.shishen}</div>
            <div class="poster-stars">${posterStars(yc.stars)}</div>
            <ul>
              <li>事業：${yc.career}</li>
              <li>財運：${yc.wealth}</li>
              <li>感情：${yc.love}</li>
              <li>健康：${yc.health}</li>
            </ul>
          </div>`).join('')}
        </div>
      </div>

      <div class="poster-section">
        <div class="poster-section-head"><div class="poster-num">06</div><h2>人生各領域綜合分析</h2></div>
        <div class="poster-domain-grid">
          ${domainScoreMap.map(d=>`<div class="poster-domain-card">
            <div class="dc-head">
              <div class="dc-ic">${d.icon}</div>
              <h4>${d.key}</h4>
              <div class="poster-stars">${posterStars(scoreToStars(d.score))}</div>
            </div>
            <p>${d.text}</p>
          </div>`).join('')}
        </div>
      </div>

      <div class="poster-section">
        <div class="poster-section-head"><div class="poster-num">07</div><h2>適合產業與職涯方向</h2></div>
        <div class="poster-iconlist">
          ${industries.map(ind=>`<div class="poster-iconitem"><div class="ic">${ind.ic}</div><div><h4>${ind.name}</h4><p>${ind.desc}</p></div></div>`).join('')}
        </div>
      </div>

      <div class="poster-section">
        <div class="poster-section-head"><div class="poster-num">08</div><h2>補運建議</h2></div>
        <div class="poster-luck-grid">
          <div class="poster-luck-item"><div class="lk-label">吉利方位</div><div class="lk-val">${WX_DIRECTION[wkWx]}（補強五行「${wkWx}」）</div></div>
          <div class="poster-luck-item"><div class="lk-label">幸運顏色</div><div class="lk-val">${WX_COLOR_NAME[wkWx]}</div></div>
          <div class="poster-luck-item"><div class="lk-label">生活習慣</div><div class="lk-val">${WX_HABIT[wkWx]}</div></div>
          <div class="poster-luck-item"><div class="lk-label">開運物品</div><div class="lk-val">${WX_ITEM[wkWx]}</div></div>
        </div>
      </div>

      <div class="poster-footer">
        <div class="fq">「${moneyModeMap[catType]}」</div>
        <div class="fs">妳的命盤，由妳書寫；妳的未來，由妳創造。</div>
      </div>

      <div class="poster-disclaimer">
        <b>資料來源說明：</b>本頁所有數據（五行比例、十神組合、大運、流年干支、過去3個月流月干支等）皆直接取自命盤主流程之真實天文演算結果（真實24節氣、真太陽時），並與「八字命盤」「流年運勢」「流月流日精算」「綜合運勢報告」等頁籤共用同一套排盤引擎，非另行編造或套用固定範本。惟「補運建議」中的方位／顏色／物品對應，採用命理科普中常見的「五行補弱」簡化原則（以命盤中最弱五行對應方位色系），專業八字命理實務上判斷「喜用神」還需納入月令、格局、大運等更多因素綜合分析，此處僅供生活化參考；各領域星等評分為依命盤十神數量換算，並以「你自己命盤內六個領域的相對強弱百分位」轉換為星等（而非跨使用者的常模比較），用於凸顯你命盤內部各領域的相對強弱，並非精確機率預測。人生際遇仍取決於個人選擇與行動，重大決策請審慎評估並諮詢對應領域專業人士。
      </div>

      <div class="poster-disclaimer" style="text-align:center;margin-top:8px;">
        
      </div>
    </div></div>`;

    panel.innerHTML = '';
    panel.appendChild(el(html));

    const printBtn = document.getElementById('posterPrintBtn');
    if(printBtn) printBtn.addEventListener('click', ()=>{
      const panelEl = document.getElementById('panel-poster');
      panelEl.classList.add('poster-print-active');
      const cleanup = ()=>{ panelEl.classList.remove('poster-print-active'); window.removeEventListener('afterprint', cleanup); };
      window.addEventListener('afterprint', cleanup);
      window.print();
      setTimeout(cleanup, 3000); // 保險：部分瀏覽器不觸發 afterprint 時的退回機制
    });

    // v5.6新增：「存成圖片」——動態載入html2canvas，將海報區塊轉存為PNG圖片下載，
    // 比純網頁列印更適合手機使用者直接儲存、分享至社群或Line。
    const imageBtn = document.getElementById('posterImageBtn');
    if(imageBtn) imageBtn.addEventListener('click', async ()=>{
      imageBtn.disabled = true; const origText = imageBtn.textContent; imageBtn.textContent = '產生圖片中…';
      try{
        if(typeof window.html2canvas === 'undefined'){
          await new Promise((resolve, reject)=>{
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
            s.onload = resolve; s.onerror = ()=>reject(new Error('html2canvas載入失敗'));
            document.head.appendChild(s);
          });
        }
        const target = document.querySelector('#panel-poster .poster-inner');
        const canvas = await window.html2canvas(target, {backgroundColor:'#ffffff', scale:2, useCORS:true});
        const link = document.createElement('a');
        link.download = `${(p.surname||'')}${(p.givenName||'')}_命盤解析報告.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      }catch(err){
        console.error(err);
        showFriendlyError('存成圖片失敗，可能是網路無法連線至圖片產生元件（html2canvas），請改用「列印／另存PDF」功能，或檢查網路連線後重試。');
      }finally{
        imageBtn.disabled = false; imageBtn.textContent = origText;
      }
    });

    // v9.7新增：「快速分享小卡」——純原生Canvas 2D API繪製，不依賴外部CDN（html2canvas），
    // 即使離線或網路無法連線至CDN時仍可產生圖片；內容為精簡摘要版（非完整報告），
    // 尺寸採手機直式（1080×1620，3:4.5比例）方便直接分享至限動／Line。
    const quickCardBtn = document.getElementById('posterQuickCardBtn');
    if(quickCardBtn) quickCardBtn.addEventListener('click', ()=>{
      try{
        const ys = computeYongshenEngine(bazi);
        const shenshaList = computeShensha(bazi);
        const ziwei = ctx.ziwei;
        const mingPalace = ziwei ? ziwei.palaces.find(pz=>pz.palaceName==='命宮') : null;
        const mingStars = mingPalace && mingPalace.stars.length ? mingPalace.stars.join('・') : '（無主星）';

        const W = 1080, H = 1620;
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const gctx = canvas.getContext('2d');

        // 背景漸層（呼應網站暗色系配色）
        const bg = gctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#1a1f38'); bg.addColorStop(1, '#0d1022');
        gctx.fillStyle = bg; gctx.fillRect(0, 0, W, H);

        // 頂部裝飾線與標題
        gctx.strokeStyle = '#c9a86a'; gctx.lineWidth = 3;
        gctx.strokeRect(40, 40, W-80, H-80);
        gctx.textAlign = 'center';
        gctx.fillStyle = '#c9a86a';
        gctx.font = '600 40px "Noto Serif TC", serif';
        gctx.fillText('五象 FiveLens', W/2, 130);
        gctx.font = '28px "Noto Sans TC", sans-serif';
        gctx.fillStyle = '#9aa3c2';
        gctx.fillText('命盤摘要小卡', W/2, 175);

        // 姓名／日主
        const displayName = (p.surname||'') + (p.givenName||'') || '命盤主人';
        gctx.fillStyle = '#f5f1e8';
        gctx.font = '600 52px "Noto Serif TC", serif';
        gctx.fillText(displayName, W/2, 280);

        const zodiac = ZHI_ZODIAC[bazi.pillars.year.zhi] || '';
        gctx.font = '32px "Noto Sans TC", sans-serif';
        gctx.fillStyle = '#c9a86a';
        gctx.fillText(`${bazi.pillars.day.gan}${bazi.pillars.day.zhi}日主・生肖${zodiac}`, W/2, 335);

        // 分隔線
        gctx.strokeStyle = 'rgba(201,168,106,0.35)'; gctx.lineWidth = 1;
        gctx.beginPath(); gctx.moveTo(120, 380); gctx.lineTo(W-120, 380); gctx.stroke();

        // 卡片內容區塊（左對齊標籤＋數值）
        const rows = [
          ['太陽星座', astro.Sun ? astro.Sun.sign : '（時辰未知）'],
          ['紫微命宮主星', mingStars],
          ['扶抑旺衰', `${ys.strengthLabel}（支持力${(ys.ratio*100).toFixed(0)}%）`],
          ['建議用神方向', ys.fuyiYongShen.join('、')],
          ['命盤神煞', shenshaList.length ? shenshaList.map(s=>s.name).join('、') : '（本站六種常見神煞皆未查到）'],
        ];
        let y0 = 460;
        rows.forEach(([label, value])=>{
          gctx.textAlign = 'left';
          gctx.fillStyle = '#7fac9a';
          gctx.font = '26px "Noto Sans TC", sans-serif';
          gctx.fillText(label, 130, y0);
          gctx.fillStyle = '#f5f1e8';
          gctx.font = '600 32px "Noto Sans TC", sans-serif';
          const maxWidth = W - 260;
          wrapCanvasText(gctx, value, 130, y0+44, maxWidth, 38);
          y0 += 150;
        });

        // 底部提醒與版本標示
        gctx.textAlign = 'center';
        gctx.fillStyle = '#6b7290';
        gctx.font = '22px "Noto Sans TC", sans-serif';
        wrapCanvasText(gctx, '本卡片僅摘要命盤部分資訊，完整分析請見「命盤解析報告」，內容僅供娛樂與自我探索參考。', W/2, H-140, W-200, 30, true);
        gctx.fillStyle = '#c9a86a';
        gctx.font = '500 24px "Noto Sans TC", sans-serif';
        gctx.fillText('五象 FiveLens v10.11 · 天文命理演算', W/2, H-60);

        const link = document.createElement('a');
        link.download = `${(p.surname||'')}${(p.givenName||'')}_五象 FiveLens分享小卡.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      }catch(err){
        console.error(err);
        showFriendlyError('產生分享小卡時發生錯誤，可改用上方「存成圖片」或「列印／另存PDF」功能。');
      }
    });
  }

  // v9.7新增：Canvas文字自動換行輔助函式（分享小卡專用），centered=true時置中對齊
  function wrapCanvasText(gctx, text, x, y, maxWidth, lineHeight, centered){
    const words = String(text).split('');
    let line = '';
    const lines = [];
    words.forEach(ch=>{
      const test = line + ch;
      if(gctx.measureText(test).width > maxWidth && line.length>0){
        lines.push(line);
        line = ch;
      }else{
        line = test;
      }
    });
    if(line) lines.push(line);
    const prevAlign = gctx.textAlign;
    if(centered) gctx.textAlign = 'center';
    lines.forEach((ln, i)=>{ gctx.fillText(ln, x, y + i*lineHeight); });
    gctx.textAlign = prevAlign;
  }

})();
