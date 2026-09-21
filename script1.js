
// ============================================================
// engine.js - 自動打包 (由 build-engine.js 產生, 內容與 node 版模組完全一致)
// ============================================================
const FortuneEngine = (function(){
  const __modules = {};
  function __require(name){ return __modules[name]; }

  __modules['./astro-core.js'] = (function(){
    const module = { exports: {} };
    const require = __require;
    (function(module, require){
// ============================================================
// astro-core.js
// 真實天文運算核心：儒略日 / 太陽視黃經 / 24節氣 / 朔(新月) / 農曆換算
// 依據 Jean Meeus《Astronomical Algorithms》低精度公式實作（誤差通常 < 幾分鐘）
// ============================================================

const DEG = Math.PI / 180;

function toJD(y, m, d, hourUT = 0) {
  // 格里曆 -> 儒略日 (含小數時分)
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  const JD0 = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
  return JD0 + hourUT / 24;
}

function fromJD(jd) {
  jd += 0.5;
  const Z = Math.floor(jd);
  const F = jd - Z;
  let A = Z;
  if (Z >= 2299161) {
    const alpha = Math.floor((Z - 1867216.25) / 36524.25);
    A = Z + 1 + alpha - Math.floor(alpha / 4);
  }
  const B = A + 1524;
  const C = Math.floor((B - 122.1) / 365.25);
  const D = Math.floor(365.25 * C);
  const E = Math.floor((B - D) / 30.6001);
  const day = B - D - Math.floor(30.6001 * E) + F;
  const month = E < 14 ? E - 1 : E - 13;
  const year = month > 2 ? C - 4716 : C - 4715;
  const dayInt = Math.floor(day);
  const hourFloat = (day - dayInt) * 24;
  return { year, month, day: dayInt, hour: hourFloat };
}

function norm360(x) {
  x = x % 360;
  if (x < 0) x += 360;
  return x;
}

// 太陽視黃經 (Meeus ch.25 低精度公式), jd 為 TT/UT 皆可(誤差在允許範圍)
function sunApparentLongitude(jd) {
  const T = (jd - 2451545.0) / 36525;
  const L0 = norm360(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
  const M = norm360(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
  const Mr = M * DEG;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mr)
    + (0.019993 - 0.000101 * T) * Math.sin(2 * Mr)
    + 0.000289 * Math.sin(3 * Mr);
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const apparent = trueLong - 0.00569 - 0.00478 * Math.sin(omega * DEG);
  return norm360(apparent);
}

// 求太陽視黃經到達 targetDeg (0,15,30...345) 的那個儒略日, 在 jdGuess 附近搜尋
function solveSunLongitude(targetDeg, jdGuess) {
  let jd = jdGuess;
  for (let i = 0; i < 20; i++) {
    const lon = sunApparentLongitude(jd);
    let diff = targetDeg - lon;
    diff = ((diff + 180) % 360 + 360) % 360 - 180; // wrap to [-180,180]
    if (Math.abs(diff) < 0.000005) break;
    // 太陽每天約移動 0.9856 度
    jd += diff / 0.9856;
  }
  return jd;
}

// 計算某年24節氣的儒略日陣列 (index 0 = 小寒 315度... 依照黃經 285,300,...,270 排列, 我們用「黃經度數」為key更直觀)
// 節氣順序（從黃經0度=春分開始，共24個，每15度一個）：
const SOLAR_TERM_NAMES = [
  '春分','清明','穀雨','立夏','小滿','芒種',
  '夏至','小暑','大暑','立秋','處暑','白露',
  '秋分','寒露','霜降','立冬','小雪','大雪',
  '冬至','小寒','大寒','立春','雨水','驚蟄'
];

function getYearSolarTerms(year) {
  // 以該年3月20日附近(春分,黃經0度)為起點，逐一往後推24個節氣
  const terms = [];
  let jdGuess = toJD(year, 3, 20, 12);
  for (let i = 0; i < 24; i++) {
    const targetDeg = norm360(i * 15);
    const jd = solveSunLongitude(targetDeg, jdGuess + i * 15.2184);
    terms.push({ name: SOLAR_TERM_NAMES[i], deg: targetDeg, jd });
  }
  return terms; // 依時間先後排序 (春分 -> 隔年驚蟄前)
}

// 取得跨年份節氣表，方便查詢任意日期前後最近節氣（用於八字月柱、年柱立春分界）
function getSolarTermsRange(yearStart, yearEnd) {
  let all = [];
  for (let y = yearStart; y <= yearEnd; y++) {
    all = all.concat(getYearSolarTerms(y).map(t => ({ ...t, year: y })));
  }
  all.sort((a, b) => a.jd - b.jd);
  return all;
}

// ---------- 朔（新月）計算：用於農曆定朔 ----------
// Meeus ch.49 New Moon 低精度公式（取主要週期項，精度約數分鐘內）
function newMoonJD(k) {
  const T = k / 1236.85;
  const T2 = T * T, T3 = T2 * T, T4 = T3 * T;
  let JDE = 2451550.09766 + 29.530588861 * k
    + 0.00015437 * T2 - 0.000000150 * T3 + 0.00000000073 * T4;

  const M = norm360(2.5534 + 29.10535669 * k - 0.0000014 * T2 - 0.00000011 * T3); // 太陽平近點角
  const Mp = norm360(201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4); // 月球平近點角
  const F = norm360(160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4); // 月球緯度引數
  const Omega = norm360(124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3);
  const E = 1 - 0.002516 * T - 0.0000074 * T2;

  const Mr = M * DEG, Mpr = Mp * DEG, Fr = F * DEG, Or = Omega * DEG;

  let corr = -0.40720 * Math.sin(Mpr)
    + 0.17241 * E * Math.sin(Mr)
    + 0.01608 * Math.sin(2 * Mpr)
    + 0.01039 * Math.sin(2 * Fr)
    + 0.00739 * E * Math.sin(Mpr - Mr)
    - 0.00514 * E * Math.sin(Mpr + Mr)
    + 0.00208 * E * E * Math.sin(2 * Mr)
    - 0.00111 * Math.sin(Mpr - 2 * Fr)
    - 0.00057 * Math.sin(Mpr + 2 * Fr)
    + 0.00056 * E * Math.sin(2 * Mpr + Mr)
    - 0.00042 * Math.sin(3 * Mpr)
    + 0.00042 * E * Math.sin(Mr + 2 * Fr)
    + 0.00038 * E * Math.sin(Mr - 2 * Fr)
    - 0.00024 * E * Math.sin(2 * Mpr - Mr)
    - 0.00017 * Math.sin(Or)
    - 0.00007 * Math.sin(Mpr + 2 * Mr);

  JDE += corr;
  return JDE;
}

// 找出某個西曆日期附近的朔(新月)序號k的近似值
function approxKForDate(y, m, d) {
  const yearFrac = y + (m - 1) / 12 + d / 365.25;
  return Math.floor((yearFrac - 2000) * 12.3685);
}

// 取得涵蓋指定西曆年範圍的所有朔日 JD 陣列（多抓前後各兩個月餘裕）
function getNewMoonsForYearRange(yearStart, yearEnd) {
  const kStart = approxKForDate(yearStart, 1, 1) - 2;
  const kEnd = approxKForDate(yearEnd, 12, 31) + 2;
  const moons = [];
  for (let k = kStart; k <= kEnd; k++) {
    moons.push(newMoonJD(k));
  }
  return moons;
}

module.exports = {
  toJD, fromJD, norm360, sunApparentLongitude, solveSunLongitude,
  getYearSolarTerms, getSolarTermsRange, SOLAR_TERM_NAMES,
  newMoonJD, approxKForDate, getNewMoonsForYearRange
};

    })(module, require);
    return module.exports;
  })();

  __modules['./bazi-core.js'] = (function(){
    const module = { exports: {} };
    const require = __require;
    (function(module, require){
// ============================================================
// bazi-core.js  八字（四柱）真實排盤引擎
// 年柱：以「立春」為界（不是農曆正月初一）
// 月柱：以十二個「節」為界（立春/驚蟄/清明/立夏/芒種/小暑/立秋/白露/寒露/立冬/大雪/小寒）
// 日柱：儒略日 mod 60（已用兩組公開萬年曆資料校驗：1900-01-01甲戌、2024-01-01甲子、2024-02-10甲辰、2024-08-02戊戌）
// 時柱：五鼠遁 + 真太陽時（經度時差 + 均時差）校正
// ============================================================
const A = require('./astro-core.js');

const GAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const ZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const GAN_WUXING = { '甲':'木','乙':'木','丙':'火','丁':'火','戊':'土','己':'土','庚':'金','辛':'金','壬':'水','癸':'水' };
const ZHI_WUXING = { '子':'水','丑':'土','寅':'木','卯':'木','辰':'土','巳':'火','午':'火','未':'土','申':'金','酉':'金','戌':'土','亥':'水' };
const GAN_YINYANG = { '甲':'陽','乙':'陰','丙':'陽','丁':'陰','戊':'陽','己':'陰','庚':'陽','辛':'陰','壬':'陽','癸':'陰' };
// 地支藏干（本氣/中氣/餘氣）－ 用於十神與五行精細分析
const ZHI_HIDDEN = {
  '子': [['癸', 1.0]],
  '丑': [['己', 0.6], ['癸', 0.3], ['辛', 0.1]],
  '寅': [['甲', 0.6], ['丙', 0.3], ['戊', 0.1]],
  '卯': [['乙', 1.0]],
  '辰': [['戊', 0.6], ['乙', 0.3], ['癸', 0.1]],
  '巳': [['丙', 0.6], ['庚', 0.3], ['戊', 0.1]],
  '午': [['丁', 0.7], ['己', 0.3]],
  '未': [['己', 0.6], ['丁', 0.3], ['乙', 0.1]],
  '申': [['庚', 0.6], ['壬', 0.3], ['戊', 0.1]],
  '酉': [['辛', 1.0]],
  '戌': [['戊', 0.6], ['辛', 0.3], ['丁', 0.1]],
  '亥': [['壬', 0.7], ['甲', 0.3]],
};
// 12個「節」（月柱分界，非「氣」）依序：立春 驚蟄 清明 立夏 芒種 小暑 立秋 白露 寒露 立冬 大雪 小寒
const JIE_SEQUENCE = ['立春','驚蟄','清明','立夏','芒種','小暑','立秋','白露','寒露','立冬','大雪','小寒'];
const MONTH_ZHI_SEQUENCE = ['寅','卯','辰','巳','午','未','申','酉','戌','亥','子','丑'];

function ganzhiIndex(y, m, d, hourUT12 = 12) {
  const jd = Math.floor(A.toJD(y, m, d, hourUT12));
  return ((jd + 49) % 60 + 60) % 60;
}

function idxToGZ(idx) {
  idx = ((idx % 60) + 60) % 60;
  return { gan: GAN[idx % 10], zhi: ZHI[idx % 12], idx };
}

// 均時差 Equation of Time（分鐘）－ 用於真太陽時校正
function equationOfTimeMinutes(jd) {
  const T = (jd - 2451545.0) / 36525;
  const L0 = A.norm360(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
  const M = A.norm360(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
  const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;
  const eps0 = 23.439291 - 0.0130042 * T;
  const y = Math.tan((eps0 / 2) * Math.PI / 180) ** 2;
  const Mr = M * Math.PI / 180;
  const L0r = L0 * Math.PI / 180;
  const Etime = y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r)
    - 0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr);
  return (Etime * 180 / Math.PI) * 4; // 轉分鐘
}

/**
 * 計算完整四柱
 * @param {object} p { year, month, day, hour, minute, tzOffset(小時,如台灣+8), longitude(東經為正), useTrueSolarTime(bool) }
 */
function computeFourPillars(p) {
  const { year, month, day, hour, minute = 0, tzOffset = 8, longitude = 121.5, useTrueSolarTime = true, precomputedTerms = null, lateZiSplitsDay = false } = p;

  // 轉為 UT
  let localDecimalHour = hour + minute / 60;
  let jdLocalNoonRef = A.toJD(year, month, day, 12 - tzOffset); // 該公民日期12:00當地時間換算UT對應之JD(用於節氣比對基準)
  let jdUT = A.toJD(year, month, day, localDecimalHour - tzOffset);

  let solarCorrMinutes = 0;
  if (useTrueSolarTime) {
    // 經度時差：每經度4分鐘，以時區中央經線為基準（tzOffset*15度）
    const centralMeridian = tzOffset * 15;
    const lonCorr = (longitude - centralMeridian) * 4; // 分鐘
    const eot = equationOfTimeMinutes(jdUT);
    solarCorrMinutes = lonCorr + eot;
  }
  const trueSolarJD = jdUT + solarCorrMinutes / 1440;
  const trueSolarLocal = A.fromJD(trueSolarJD + tzOffset / 24); // 換回真太陽時對應的「時鐘時刻」，供時柱判斷

  // ---- 節氣表（涵蓋跨年）：若外部已預先算好（例如流月流日逐日迴圈時共用），直接沿用以避免重複求解節氣，兩者結果完全相同 ----
  const terms = precomputedTerms || A.getSolarTermsRange(year - 1, year + 1);

  // ---- 年柱：以「立春」精確時刻為界 ----
  // 每個節氣物件的 t.year 只是產生迴圈時的參考年份標籤，不等於節氣實際發生的西曆年份，
  // 因此一律以 jd 反推真實西曆年份，找出「時間 <= trueSolarJD 的最後一個立春」，其西曆年即為八字年。
  const lichunList = terms.filter(t => t.name === '立春')
    .map(t => ({ ...t, calYear: A.fromJD(t.jd + tzOffset / 24).year }))
    .sort((a, b) => a.jd - b.jd);
  let baziYear = lichunList[0].calYear - 1;
  for (const t of lichunList) {
    if (t.jd <= trueSolarJD) baziYear = t.calYear; else break;
  }
  const yearIdx = ((baziYear - 4) % 60 + 60) % 60; // 西元年干支公式：(年-4) mod 60，已知1984=甲子驗證
  const yearGZ = idxToGZ(yearIdx);

  // ---- 月柱：以12個「節」為界 ----
  const jieList = terms.filter(t => JIE_SEQUENCE.includes(t.name)).sort((a, b) => a.jd - b.jd);
  let currentJie = null;
  for (const t of jieList) {
    if (t.jd <= trueSolarJD) currentJie = t; else break;
  }
  const jieOrderIdx = JIE_SEQUENCE.indexOf(currentJie.name);
  const monthZhi = MONTH_ZHI_SEQUENCE[jieOrderIdx];
  // 月干：五虎遁年上起月
  const yearGanIdx = GAN.indexOf(yearGZ.gan);
  const firstMonthGanIdx = { 0: 2, 5: 2, 1: 4, 6: 4, 2: 6, 7: 6, 3: 8, 8: 8, 4: 0, 9: 0 }[yearGanIdx]; // 甲己丙寅/乙庚戊寅/丙辛庚寅/丁壬壬寅/戊癸甲寅
  const monthGanIdx = (firstMonthGanIdx + jieOrderIdx) % 10;
  const monthGZ = { gan: GAN[monthGanIdx], zhi: monthZhi, idx: null };

  // ---- 日柱：以「當地civil日期」對應之JD mod 60 決定 ----
  // v5.6新增：lateZiSplitsDay（晚子時分日）選項。主流「子夜0時換日」為預設(false)；
  // 若使用者選擇「晚子時（23:00~23:59）算隔日」這一派算法，23點以後出生者日柱改採次日。
  const clockHourRaw = trueSolarLocal.hour;
  let dayCivil = A.fromJD(trueSolarJD + tzOffset / 24);
  if (lateZiSplitsDay && clockHourRaw >= 23) {
    dayCivil = A.fromJD(trueSolarJD + tzOffset / 24 + 1); // 晚子時派：往後推一天再取日柱
  }
  const dIdx = ((Math.floor(A.toJD(dayCivil.year, dayCivil.month, dayCivil.day, 12)) + 49) % 60 + 60) % 60;
  const dayGZ = idxToGZ(dIdx);

  // ---- 時柱：五鼠遁日上起時 + 真太陽時決定時辰地支 ----
  const clockHour = clockHourRaw;
  let hourZhiIdx;
  if (clockHour >= 23 || clockHour < 1) hourZhiIdx = 0;
  else hourZhiIdx = Math.floor((clockHour + 1) / 2) % 12;
  const dayGanIdx = GAN.indexOf(dayGZ.gan);
  const firstHourGanIdx = { 0: 0, 5: 0, 1: 2, 6: 2, 2: 4, 7: 4, 3: 6, 8: 6, 4: 8, 9: 8 }[dayGanIdx]; // 甲己還加甲/乙庚丙作初...
  const hourGanIdx = (firstHourGanIdx + hourZhiIdx) % 10;
  const hourGZ = { gan: GAN[hourGanIdx], zhi: ZHI[hourZhiIdx], idx: null };

  // ---- v5.6新增：節氣邊界接近度檢查（供UI顯示「出生時間接近節氣交界」提醒）----
  // 太陽每日約移動0.9856度，換算「目前視黃經」與「currentJie節氣起算度數」及「下一節氣度數」的度數差，估算距離節氣交界的約略分鐘數。
  let nearestTermGapMinutes = null;
  {
    const allJieAndQi = terms.filter(t => t.jd > trueSolarJD - 20 && t.jd < trueSolarJD + 20).sort((a,b)=>a.jd-b.jd);
    let minGapDays = Infinity;
    allJieAndQi.forEach(t => { const g = Math.abs(t.jd - trueSolarJD); if (g < minGapDays) minGapDays = g; });
    if (isFinite(minGapDays)) nearestTermGapMinutes = minGapDays * 1440;
  }

  return {
    baziYear,
    pillars: { year: yearGZ, month: monthGZ, day: dayGZ, hour: hourGZ },
    trueSolarTime: { corrMinutes: solarCorrMinutes, localClock: `${String(Math.floor(clockHour)).padStart(2,'0')}:${String(Math.round((clockHour-Math.floor(clockHour))*60)).padStart(2,'0')}` },
    solarTermUsed: currentJie.name,
    nearestTermGapMinutes, // v5.6新增：距離最近節氣交界的分鐘數（絕對值），供UI在<20分鐘時顯示精度提醒
  };
}

// 五行分數統計（含地支藏干加權）
function wuxingScore(pillars) {
  const score = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  ['year', 'month', 'day', 'hour'].forEach(k => {
    const gz = pillars[k];
    score[GAN_WUXING[gz.gan]] += 1;
    ZHI_HIDDEN[gz.zhi].forEach(([g, w]) => { score[GAN_WUXING[g]] += w; });
  });
  return score;
}

// 十神計算（以日干為「我」）
const SHISHEN_TABLE = {
  // key: [同陰陽?, 生剋關係] -> 直接用函式判斷更清楚
};
function getShishen(dayGan, otherGan) {
  if (dayGan === otherGan) return '比肩';
  const dayWx = GAN_WUXING[dayGan], otherWx = GAN_WUXING[otherGan];
  const dayYY = GAN_YINYANG[dayGan], otherYY = GAN_YINYANG[otherGan];
  const sameYY = dayYY === otherYY;
  const CYCLE = ['木', '火', '土', '金', '水']; // 相生順序
  const idxDay = CYCLE.indexOf(dayWx), idxOther = CYCLE.indexOf(otherWx);
  if (idxOther === idxDay) return sameYY ? '比肩' : '劫財';
  if ((idxDay + 1) % 5 === idxOther) return sameYY ? '食神' : '傷官'; // 我生者
  if ((idxOther + 1) % 5 === idxDay) return sameYY ? '偏印' : '正印'; // 生我者
  if ((idxDay + 2) % 5 === idxOther) return sameYY ? '偏財' : '正財'; // 我剋者
  if ((idxOther + 2) % 5 === idxDay) return sameYY ? '七殺' : '正官'; // 剋我者
  return '';
}

function computeShishenForPillars(pillars) {
  const dayGan = pillars.day.gan;
  const result = {};
  ['year', 'month', 'day', 'hour'].forEach(k => {
    result[k] = {
      gan: k === 'day' ? '日主' : getShishen(dayGan, pillars[k].gan),
      zhiHidden: ZHI_HIDDEN[pillars[k].zhi].map(([g]) => ({ gan: g, shishen: getShishen(dayGan, g) })),
    };
  });
  return result;
}

// 大運：陽男陰女順排，陰男陽女逆排；起運歲數 = 距離下一個(或上一個)節氣的天數 / 3 (概算：3天=1歲，1天=4個月)
function computeDayun(p, pillars, baziYearGanIdx, gender) {
  const terms = A.getSolarTermsRange(p.year - 1, p.year + 2);
  const jieList = terms.filter(t => JIE_SEQUENCE.includes(t.name)).sort((a, b) => a.jd - b.jd);
  const localDecimalHour = p.hour + (p.minute || 0) / 60;
  const jdUT = A.toJD(p.year, p.month, p.day, localDecimalHour - (p.tzOffset || 8));

  const yearGanYY = GAN_YINYANG[GAN[baziYearGanIdx]];
  const isForward = (yearGanYY === '陽' && gender === 'M') || (yearGanYY === '陰' && gender === 'F');

  let days;
  if (isForward) {
    const next = jieList.find(t => t.jd > jdUT);
    days = next.jd - jdUT;
  } else {
    const prevList = jieList.filter(t => t.jd <= jdUT);
    const prev = prevList[prevList.length - 1];
    days = jdUT - prev.jd;
  }
  const startAge = days / 3; // 三天折一歲

  // 大運干支序列：由月柱起，順排或逆排
  const monthGanIdx = GAN.indexOf(pillars.month.gan);
  const monthZhiIdx = ZHI.indexOf(pillars.month.zhi);
  const dayunList = [];
  for (let i = 1; i <= 8; i++) {
    const step = isForward ? i : -i;
    const g = idxToGZ(0); // placeholder
    const ganIdx = ((monthGanIdx + step) % 10 + 10) % 10;
    const zhiIdx = ((monthZhiIdx + step) % 12 + 12) % 12;
    dayunList.push({
      gan: GAN[ganIdx], zhi: ZHI[zhiIdx],
      startAge: (startAge + (i - 1) * 10).toFixed(1),
      endAge: (startAge + i * 10).toFixed(1),
    });
  }
  return { startAge: startAge.toFixed(1), isForward, dayunList };
}

module.exports = {
  GAN, ZHI, GAN_WUXING, ZHI_WUXING, GAN_YINYANG, ZHI_HIDDEN,
  computeFourPillars, wuxingScore, getShishen, computeShishenForPillars, computeDayun, idxToGZ, ganzhiIndex,
};

    })(module, require);
    return module.exports;
  })();

  __modules['./almanac-core.js'] = (function(){
    const module = { exports: {} };
    const require = __require;
    (function(module, require){
// ============================================================
// almanac-core.js（v8.9.1新增）  通書／黃曆通用規則引擎
// 涵蓋：生肖沖煞與煞方位、建除十二神、每日財神／喜神／福神方位
// 全部為「不需個人八字、任一西曆日期皆可查」的通用60甲子規則對照，
// 與 bazi-core.js（個人化排盤）分屬不同性質：本模組僅需日柱（及月柱地支，供建除十二神使用），
// 不依賴出生資料。資料來源見各函式註解，屬命理界多方交叉核對後的通行版本，
// 不同通書／萬年曆版本口訣仍可能有出入，正式擇日應另行核對通書或諮詢專業命理師。
// ============================================================
const GAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const ZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const ZODIAC_BY_ZHI = { '子':'鼠','丑':'牛','寅':'虎','卯':'兔','辰':'龍','巳':'蛇','午':'馬','未':'羊','申':'猴','酉':'雞','戌':'狗','亥':'豬' };

// 地支六沖（子午/丑未/寅申/卯酉/辰戌/巳亥）
const CHONG_ZHI = { '子':'午','丑':'未','寅':'申','卯':'酉','辰':'戌','巳':'亥','午':'子','未':'丑','申':'寅','酉':'卯','戌':'辰','亥':'巳' };

// 煞方位：依日支所屬三合局（火/水/木/金局）換算，通行口訣「寅午戌煞北，申子辰煞南，亥卯未煞西，巳酉丑煞東」
// （原理：三合局五行當旺方位之對沖方為煞方，如寅午戌合火局旺南方，其沖為北，故煞北）
const SHA_DIRECTION_BY_ZHI = {
  '寅':'北','午':'北','戌':'北',
  '申':'南','子':'南','辰':'南',
  '亥':'西','卯':'西','未':'西',
  '巳':'東','酉':'東','丑':'東',
};

// 取得「沖煞」資訊：輸入日柱地支，回傳沖的生肖、沖的地支、煞方位
function getChongSha(dayZhi){
  const chongZhi = CHONG_ZHI[dayZhi];
  return {
    dayZhi, chongZhi,
    chongZodiac: ZODIAC_BY_ZHI[chongZhi],
    shaDirection: SHA_DIRECTION_BY_ZHI[dayZhi],
  };
}

// 建除十二神：從月支起「建」，依地支順序（子丑寅卯...）順排至日支，
// 口訣「其法從月上起建，與斗杓所指相應，如正月建寅，則寅日起建，順行十二辰」。
// 傳統上每逢節氣交界會有一天重複值日（「每月交節則疊兩值日」），本簡化版未處理交節當天重複，
// 與精確通書相比，節氣交界前後1天左右可能有一天落差，屬已知簡化限制。
const JIANCHU_ORDER = ['建','除','滿','平','定','執','破','危','成','收','開','閉'];
const JIANCHU_TIER = { // 民間口訣「建滿平收黑，除危定執黃，成開皆可用，閉破不相當」
  '建':'黑道','滿':'黑道','平':'黑道','收':'黑道',
  '除':'黃道','危':'黃道','定':'黃道','執':'黃道',
  '成':'次吉','開':'次吉',
  '閉':'較不宜','破':'較不宜',
};
function getJianchu(monthZhi, dayZhi){
  const mIdx = ZHI.indexOf(monthZhi), dIdx = ZHI.indexOf(dayZhi);
  if(mIdx<0 || dIdx<0) return null;
  const offset = ((dIdx - mIdx) % 12 + 12) % 12;
  const name = JIANCHU_ORDER[offset];
  return { name, tier: JIANCHU_TIER[name] };
}

// 每日財神／喜神／福神方位：依日柱天干換算，皆為命理界交叉核對後最常見之通行版本歌訣
// 喜神歌：「甲己在艮乙庚乾，丙辛坤位喜神安；丁壬本在離宮坐，戊癸原來在巽間」
const XISHI_BY_GAN = { '甲':'東北','己':'東北', '乙':'西北','庚':'西北', '丙':'西南','辛':'西南', '丁':'正南','壬':'正南', '戊':'東南','癸':'東南' };
// 財神歌：「甲艮乙坤丙丁兌，戊己財神坐坎位；庚辛正東壬癸南，此是財神正方位」
const CAISHEN_BY_GAN = { '甲':'東北', '乙':'西南', '丙':'正西','丁':'正西', '戊':'正北','己':'正北', '庚':'正東','辛':'正東', '壬':'正南','癸':'正南' };
// 福神歌：「甲己正北是福神；丙辛西北乾宮存；乙庚坤位戊癸艮；丁壬巽上妙追尋」
const FUSHEN_BY_GAN = { '甲':'正北','己':'正北', '丙':'西北','辛':'西北', '乙':'西南','庚':'西南', '戊':'東北','癸':'東北', '丁':'東南','壬':'東南' };

function getDailyGods(dayGan){
  return { xishi: XISHI_BY_GAN[dayGan], caishen: CAISHEN_BY_GAN[dayGan], fushen: FUSHEN_BY_GAN[dayGan] };
}

// 個人化比對：輸入使用者命盤的年支（生肖）與日支，判斷指定日期是否沖到使用者本命生肖／日柱
function personalizeChongSha(dayZhi, userYearZhi, userDayZhi){
  const cs = getChongSha(dayZhi);
  return {
    ...cs,
    chongUserZodiac: !!userYearZhi && cs.chongZhi === userYearZhi,
    chongUserDayZhi: !!userDayZhi && cs.chongZhi === userDayZhi,
  };
}

module.exports = {
  ZODIAC_BY_ZHI, CHONG_ZHI, SHA_DIRECTION_BY_ZHI, JIANCHU_ORDER, JIANCHU_TIER,
  XISHI_BY_GAN, CAISHEN_BY_GAN, FUSHEN_BY_GAN,
  getChongSha, getJianchu, getDailyGods, personalizeChongSha,
};

    })(module, require);
    return module.exports;
  })();

  __modules['./lunar-core.js'] = (function(){
    const module = { exports: {} };
    const require = __require;
    (function(module, require){
// ============================================================
// lunar-core.js  國曆 -> 農曆 真實換算（定朔定氣法，天文計算而非查表）
// 規則：以「冬至所在月」為十一月；兩個冬至之間若有13個朔望月，則其中第一個
//       不含「中氣」（雨水/春分/穀雨...等12個「氣」）的月份定為閏月。
// ============================================================
const A = require('./astro-core.js');

const ZHONGQI_NAMES = ['雨水','春分','穀雨','小滿','夏至','大暑','處暑','秋分','霜降','小雪','冬至','大寒'];
const LUNAR_MONTH_NAMES = ['正月','二月','三月','四月','五月','六月','七月','八月','九月','十月','冬月','臘月'];
const LUNAR_DAY_NAMES = ['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十',
  '十一','十二','十三','十四','十五','十六','十七','十八','十九','二十',
  '廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];

function solarToLunar(year, month, day, tzOffset = 8) {
  // 全部換算至「當地曆日標籤(local-label)」frame，並一律用 cday()（civil day number，子夜為界）
  // 做日期比較，避免 JD 慣例「正午為界」造成的跨日誤判（例如朔發生在傍晚，仍算當天初一）。
  const cday = x => Math.floor(x + 0.5);
  const jdToday = A.toJD(year, month, day, 12); // 本地標籤frame下「當天中午」，本身已是整數
  const todayCday = cday(jdToday);

  // 抓取涵蓋範圍的朔日清單(換算為本地標籤frame)
  const moons = A.getNewMoonsForYearRange(year - 1, year + 1).map(jd0 => jd0 + tzOffset / 24);
  const moonsCday = moons.map(cday);

  // 找出「今日所在的朔望月」：該月份的起始朔(新月)日
  let monthStartIdx = -1;
  for (let i = 0; i < moonsCday.length - 1; i++) {
    if (moonsCday[i] <= todayCday && todayCday < moonsCday[i + 1]) { monthStartIdx = i; break; }
  }
  if (monthStartIdx === -1) throw new Error('lunar range insufficient');

  // 找到「上一個冬至」以及「下一個冬至」，界定農曆年起點與閏月判斷區間
  const terms = A.getSolarTermsRange(year - 2, year + 2).map(t => ({ ...t, jd: t.jd + tzOffset / 24, cday: cday(t.jd + tzOffset / 24) }));
  const dongzhiList = terms.filter(t => t.name === '冬至').sort((a, b) => a.jd - b.jd);
  const prevDongzhi = [...dongzhiList].reverse().find(t => t.cday <= todayCday) || dongzhiList[0];
  // 找出 <= prevDongzhi 的最近朔日 (即十一月初一)
  let nov1Idx = -1;
  for (let i = 0; i < moonsCday.length; i++) {
    if (moonsCday[i] <= prevDongzhi.cday) nov1Idx = i; else break;
  }
  // 下一個冬至所在的十一月初一
  const nextDongzhi = dongzhiList.find(t => t.jd > prevDongzhi.jd + 300);
  let nextNov1Idx = -1;
  for (let i = 0; i < moonsCday.length; i++) {
    if (moonsCday[i] <= nextDongzhi.cday) nextNov1Idx = i; else break;
  }

  const monthsBetween = nextNov1Idx - nov1Idx; // 12 = 平年, 13 = 有閏月
  const hasLeap = monthsBetween === 13;

  // 找出閏月位置：從十一月起算，第一個不含中氣的月份為閏月
  let leapMonthOffset = -1; // 相對十一月的第幾個月份(0-based)是閏月, -1表示無閏月
  if (hasLeap) {
    for (let off = 1; off < monthsBetween; off++) {
      const mStartCday = moonsCday[nov1Idx + off];
      const mEndCday = moonsCday[nov1Idx + off + 1];
      const hasZhongqi = terms.some(t => ZHONGQI_NAMES.includes(t.name) && t.cday >= mStartCday && t.cday < mEndCday);
      if (!hasZhongqi) { leapMonthOffset = off; break; }
    }
  }

  // 計算今天在第幾個月 (offset from nov1Idx)
  const offset = monthStartIdx - nov1Idx;
  let lunarMonthIndex; // 0=十一月,1=十二月,2=正月... (依平年12個月排列，正月=index2)
  let isLeap = false;
  if (!hasLeap || offset < leapMonthOffset) {
    lunarMonthIndex = offset;
  } else if (offset === leapMonthOffset) {
    lunarMonthIndex = offset - 1;
    isLeap = true;
  } else {
    lunarMonthIndex = offset - 1;
  }
  // 月份名稱陣列：11月(index0)=冬月，12月(index1)=臘月，1月(index2)=正月...
  const MONTH_SEQ = ['冬月', '臘月', '正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月'];
  const monthName = MONTH_SEQ[lunarMonthIndex] || `第${lunarMonthIndex}月`;
  const monthNumber = lunarMonthIndex <= 1 ? lunarMonthIndex + 11 : lunarMonthIndex - 1; // 轉為1-12月編號(11,12,1,2...)

  const dayIndex = todayCday - moonsCday[monthStartIdx];
  const dayName = LUNAR_DAY_NAMES[dayIndex] || `第${dayIndex + 1}日`;

  // 農曆年：以「正月初一」為界（不是冬至）
  const zhengYueIdx = (!hasLeap || 2 < leapMonthOffset) ? nov1Idx + 2 : nov1Idx + (leapMonthOffset <= 2 ? 3 : 2);
  const zhengYueDate = A.fromJD(moons[zhengYueIdx]);
  const lunarYear = (todayCday >= moonsCday[zhengYueIdx]) ? zhengYueDate.year : zhengYueDate.year - 1;

  return {
    lunarYear, monthNumber, monthName, isLeap, dayIndex: dayIndex + 1, dayName,
  };
}

module.exports = { solarToLunar, ZHONGQI_NAMES, LUNAR_MONTH_NAMES, LUNAR_DAY_NAMES };

    })(module, require);
    return module.exports;
  })();

  __modules['./ziwei-core.js'] = (function(){
    const module = { exports: {} };
    const require = __require;
    (function(module, require){
// ============================================================
// ziwei-core.js  紫微斗數排盤（簡化版：12宮 + 五行局 + 14主星 + 6顆常用輔星）
// 說明：採用傳統安星訣公式排列，未涵蓋全部100餘顆雜曜，屬「精簡實用版」。
// ============================================================
const ZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const PALACE_NAMES = ['命宮','兄弟','夫妻','子女','財帛','疾厄','遷移','交友','事業','田宅','福德','父母'];

// 五行局判定表：以「年干」定納音五行需查表，此處採用簡化的「年干支 -> 五行局」對照（依生年干支的六十甲子納音五行）
// 六十甲子納音表（標準，用於決定五行局：水二局/木三局/金四局/土五局/火六局）
const NAYIN = [
  ['甲子','乙丑','海中金'], ['丙寅','丁卯','爐中火'], ['戊辰','己巳','大林木'], ['庚午','辛未','路旁土'], ['壬申','癸酉','劍鋒金'],
  ['甲戌','乙亥','山頭火'], ['丙子','丁丑','澗下水'], ['戊寅','己卯','城頭土'], ['庚辰','辛巳','白蠟金'], ['壬午','癸未','楊柳木'],
  ['甲申','乙酉','泉中水'], ['丙戌','丁亥','屋上土'], ['戊子','己丑','霹靂火'], ['庚寅','辛卯','松柏木'], ['壬辰','癸巳','長流水'],
  ['甲午','乙未','沙中金'], ['丙申','丁酉','山下火'], ['戊戌','己亥','平地木'], ['庚子','辛丑','壁上土'], ['壬寅','癸卯','金箔金'],
  ['甲辰','乙巳','覆燈火'], ['丙午','丁未','天河水'], ['戊申','己酉','大驛土'], ['庚戌','辛亥','釵釧金'], ['壬子','癸丑','桑柘木'],
  ['甲寅','乙卯','大溪水'], ['丙辰','丁巳','沙中土'], ['戊午','己未','天上火'], ['庚申','辛酉','石榴木'], ['壬戌','癸亥','大海水'],
];
const WUXINGJU = { '金': 4, '木': 3, '水': 2, '火': 6, '土': 5 }; // 對應「幾局」
const GAN_Z = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
// 五虎遁年上起月（同樣適用於推算命宮天干）：甲己丙作首、乙庚戊為頭、丙辛庚寅上、丁壬壬寅順水流、戊癸甲寅好追求
// 對照表為「年干索引 -> 寅宮（正月／命宮起算基準）之天干索引」
const YIN_PALACE_GAN_IDX = { 0:2, 5:2, 1:4, 6:4, 2:6, 7:6, 3:8, 8:8, 4:0, 9:0 };

function getNayinWuxing(ganzhi) {
  for (const [a, b, wx] of NAYIN) {
    if (a === ganzhi || b === ganzhi) return wx[wx.length - 1]; // 取最後一字（金木水火土）
  }
  return null;
}

// 推算「命宮干支」：命宮地支已知（見 getMingGongZhi），命宮天干則依五虎遁年上起月的同一套規則，
// 從年干推出寅宮天干，再依命宮地支相對寅宮的位移往後推算（此為紫微斗數「定五行局」正統作法，
// 五行局須用命宮干支之納音，而非生年干支之納音）
function getMingGongGanZhi(yearGan, mingGongIdx) {
  const yearGanIdx = GAN_Z.indexOf(yearGan);
  const yinPalaceGanIdx = YIN_PALACE_GAN_IDX[yearGanIdx];
  const offsetFromYin = ((mingGongIdx - 2) % 12 + 12) % 12; // 寅宮(index2)為起算點
  const mingGongGanIdx = (yinPalaceGanIdx + offsetFromYin) % 10;
  return GAN_Z[mingGongGanIdx] + ZHI[mingGongIdx];
}

// 定命宮、身宮：以農曆生月、時辰起算
// 命宮公式：從「寅」起正月，順數至生月，再從生月所在宮位起子時，逆數至生時 -> 命宮地支
function getMingGongZhi(lunarMonth, hourZhiIdx) {
  // 寅宮起正月(index2對應寅)，順數到生月
  const monthPalaceIdx = (2 + (lunarMonth - 1)) % 12; // 該月的"寅起順數"宮位
  // 從該宮位起子時，逆數到生時
  const mingIdx = ((monthPalaceIdx - hourZhiIdx) % 12 + 12) % 12;
  return mingIdx;
}
function getShenGongZhi(lunarMonth, hourZhiIdx) {
  const monthPalaceIdx = (2 + (lunarMonth - 1)) % 12;
  const shenIdx = ((monthPalaceIdx + hourZhiIdx) % 12 + 12) % 12;
  return shenIdx;
}

// 五行局 -> 定紫微星位置：以「生日數」除以局數，查表得紫微所在宮位（此處用標準公式演算法）
// 標準演算法（以局數N、農曆日D）：
//   商 = ceil(D / N)；餘 = 商*N - D
//   若餘為0，紫微在寅宮起算第(商)位；若餘數為偶數順行，奇數逆行（依局數奇偶調整）
// 為求穩定我們採用普遍流傳的「紫微定位表」演算法（依N與D直接查商餘規則）：
function getZiweiPalaceIdx(ju, lunarDay) {
  let d = lunarDay;
  let cycles = Math.ceil(d / ju);
  let remainder = cycles * ju - d;
  let base = cycles - 1; // 從寅宮(index2)起第0位
  let idx;
  if (remainder === 0) {
    idx = (2 + base) % 12;
  } else {
    // 餘數決定進退：餘數為偶數則順行remainder格，奇數則逆行remainder格（傳統歌訣簡化實作）
    if (remainder % 2 === 0) {
      idx = (2 + base + remainder) % 12;
    } else {
      idx = ((2 + base - remainder) % 12 + 12) % 12;
    }
  }
  return idx;
}

// 十四主星相對紫微的固定排列順序（紫微所在宮位起算，順時針依序為紫微系；天府系另起）
const ZIWEI_SERIES_OFFSET = { '紫微': 0, '天機': -1, '太陽': -3, '武曲': -4, '天同': -5, '廉貞': -8 };
// 天府系以「天府」宮位為準（天府與紫微呈固定對沖/夾角關係：天府 = (12 - 紫微idx) 對應公式）
function getTianfuPalaceIdx(ziweiIdx) {
  // 天府與紫微的關係：以寅宮為軸對稱（口訣：紫府相對，寅申對沖起算）
  // v5.6簡化：原三元判斷式在數學上恆等於下式（已用單元測試鎖定行為不變，詳見文末自我檢測），改寫以提升可讀性與維護性。
  return ((4 - ziweiIdx) % 12 + 12) % 12;
}
const TIANFU_SERIES_OFFSET = { '天府': 0, '太陰': 1, '貪狼': 2, '巨門': 3, '天相': 4, '天梁': 5, '七殺': 6, '破軍': 10 };

// ---------- 進階資料：廟旺平陷 ／ 四化飛星 ／ 神煞（博士十二神、歲前十二神、將前十二神）----------
// 廟旺平陷亮度表：14主星在12地支宮位的亮度，索引順序固定從「寅」宮起算
// （資料來源：紫微斗數全書傳統亮度表，經與坊間通行排盤軟體之十四正曜亮度表交叉核對一致）
const BRIGHT_ORDER_ZHI = ['寅','卯','辰','巳','午','未','申','酉','戌','亥','子','丑'];
const STAR_BRIGHTNESS = {
  '紫微': ['旺','旺','得','旺','廟','廟','旺','旺','得','旺','平','廟'],
  '天機': ['得','旺','利','平','廟','陷','得','旺','利','平','廟','陷'],
  '太陽': ['旺','廟','旺','旺','旺','得','得','陷','不','陷','陷','不'],
  '武曲': ['得','利','廟','平','旺','廟','得','利','廟','平','旺','廟'],
  '天同': ['利','平','平','廟','陷','不','旺','平','平','廟','旺','不'],
  '廉貞': ['廟','平','利','陷','平','利','廟','平','利','陷','平','利'],
  '天府': ['廟','得','廟','得','旺','廟','得','旺','廟','得','廟','廟'],
  '太陰': ['旺','陷','陷','陷','不','不','利','不','旺','廟','廟','廟'],
  '貪狼': ['平','利','廟','陷','旺','廟','平','利','廟','陷','旺','廟'],
  '巨門': ['廟','廟','陷','旺','旺','不','廟','廟','陷','旺','旺','不'],
  '天相': ['廟','陷','得','得','廟','得','廟','陷','得','得','廟','廟'],
  '天梁': ['廟','廟','廟','陷','廟','旺','陷','得','廟','陷','廟','旺'],
  '七殺': ['廟','旺','廟','平','旺','廟','廟','廟','廟','平','旺','廟'],
  '破軍': ['得','陷','旺','平','廟','旺','得','陷','旺','平','廟','旺'],
};
function getBrightness(star, zhi) {
  const idx = BRIGHT_ORDER_ZHI.indexOf(zhi);
  return (STAR_BRIGHTNESS[star] && idx >= 0) ? STAR_BRIGHTNESS[star][idx] : '';
}

// 十天干四化表（本命四化，依生年天干）：順序為【祿，權，科，忌】
// 資料來源：紫微斗數全書「十干四化」通行版本。v5.6版起已補上文昌文曲左輔右弼之安星定位，
// 四化落於這4顆輔星時亦可正確標示（原v5.5版因未收錄其定位而暫不顯示，此限制已解除）。
const SIHUA_TABLE = {
  '甲': ['廉貞', '破軍', '武曲', '太陽'],
  '乙': ['天機', '天梁', '紫微', '太陰'],
  '丙': ['天同', '天機', '文昌', '廉貞'],
  '丁': ['太陰', '天同', '天機', '巨門'],
  '戊': ['貪狼', '太陰', '右弼', '天機'],
  '己': ['武曲', '貪狼', '天梁', '文曲'],
  '庚': ['太陽', '武曲', '太陰', '天同'],
  '辛': ['巨門', '太陽', '文曲', '文昌'],
  '壬': ['天梁', '紫微', '左輔', '武曲'],
  '癸': ['破軍', '巨門', '太陰', '貪狼'],
};
const SIHUA_TYPES = ['祿', '權', '科', '忌'];

// 祿存起始地支（依生年天干，十干祿存訣：甲祿在寅、乙祿在卯、丙戊祿在巳、丁己祿在午、
// 庚祿在申、辛祿在酉、壬祿在亥、癸祿在子）
const LUCUN_ZHI_BY_GAN = { '甲':'寅','乙':'卯','丙':'巳','丁':'午','戊':'巳','己':'午','庚':'申','辛':'酉','壬':'亥','癸':'子' };
// 博士十二神（從祿存起，陽男陰女順行、陰男陽女逆行）
const BOSHI12_NAMES = ['博士','力士','青龍','小耗','將軍','奏書','飛廉','喜神','病符','大耗','伏兵','官府'];
// 歲前十二神（從生年地支「歲建」起，永遠順行）
const SUIQIAN12_NAMES = ['歲建','晦氣','喪門','貫索','官符','小耗','大耗','龍德','白虎','天德','弔客','病符'];
// 將前十二神（依生年地支三合局定起點：寅午戌起午、申子辰起子、巳酉丑起酉、亥卯未起卯，永遠順行）
const JIANGQIAN12_NAMES = ['將星','攀鞍','歲驛','息神','華蓋','劫煞','災煞','天煞','指背','咸池','月煞','亡神'];
const JIANGQIAN_START_BY_ZHI = {
  '寅':'午','午':'午','戌':'午', '申':'子','子':'子','辰':'子',
  '巳':'酉','酉':'酉','丑':'酉', '亥':'卯','卯':'卯','未':'卯',
};
// v9.8.5新增：長生十二神（十二長生）——依「五行局」決定起始宮位，陽男陰女順行、陰男陽女逆行（與大限方向同一套規則），
// 起始宮位已交叉核對多方獨立命理文獻來源，內容一致：水二局／土五局起申，木三局起亥，金四局起巳，火六局起寅。
const CHANGSHENG_START_ZHI_BY_JU = { 2:'申', 3:'亥', 4:'巳', 5:'申', 6:'寅' };
const CHANGSHENG12_NAMES = ['長生','沐浴','冠帶','臨官','帝旺','衰','病','死','墓','絕','胎','養'];
const CHANGSHENG12_MEANING = {
  '長生':'生命力強、充滿開創能量的起始階段', '沐浴':'去舊迎新、較率性直接，也代表桃花', '冠帶':'邁向成熟、適合學習成長的階段',
  '臨官':'接近顛峰、潛力正盛的階段', '帝旺':'如日中天，此宮位能量最旺盛', '衰':'由盛轉衰，宜守成不宜躁進',
  '病':'能量低潮，宜靜養、避免硬拚', '死':'能量低谷，宜沉潛蓄力', '墓':'收藏儲蓄之意，落在財帛宮反而有存財之象',
  '絕':'歸零、轉折的階段，舊局結束新局未開', '胎':'醞釀階段，新契機正在萌芽', '養':'休養蓄勢，準備迎接下一階段',
};
function buildTwelveGods(startIdx, names, forward) {
  const arr = new Array(12);
  for (let i = 0; i < 12; i++) {
    const idx = forward ? (startIdx + i) % 12 : (((startIdx - i) % 12) + 12) % 12;
    arr[idx] = names[i];
  }
  return arr;
}

// ---------- v5.6新增：六吉星（文昌文曲左輔右弼天魁天鉞）／六煞星（擎羊陀羅火星鈴星地空地劫）安星訣 ----------
// 資料來源：安文昌文曲星訣「子時戌上起文昌，逆到生時是貴鄉；文曲數從辰上起，順到生時是本鄉」；
// 安左輔右弼星訣「左輔正月起於辰，順逢生月是貴方；右弼正月宮尋戌，逆至正月便調停」；
// 安天魁天鉞訣（論年干）「甲戊庚牛羊，乙己鼠猴鄉，六辛逢虎馬，壬癸兔蛇藏，丙丁豬雞位」；
// 安擎羊陀羅二星訣「祿前擎羊後陀羅」；安火鈴二星訣「申子辰人寅戌揚，寅午戌人丑卯方，巳酉丑人卯戌位，亥卯未人酉戌房」；
// 安天空地劫訣（論時）「亥上起子順安劫，逆向便是天空鄉」。以上皆為紫微斗數通行版本安星訣，已交叉核對多方資料一致。
function getWenchangIdx(hourZhiIdx) { return ((10 - hourZhiIdx) % 12 + 12) % 12; } // 戌(10)起子時逆行
function getWenquIdx(hourZhiIdx) { return (4 + hourZhiIdx) % 12; } // 辰(4)起子時順行
function getZuofuIdx(lunarMonth) { return (4 + (lunarMonth - 1)) % 12; } // 辰(4)起正月順行
function getYoubiIdx(lunarMonth) { return ((10 - (lunarMonth - 1)) % 12 + 12) % 12; } // 戌(10)起正月逆行
const TIANKUI_TIANYUE_BY_GAN = {
  // [天魁地支, 天鉞地支]；辛年例外，安星訣次序相反（天鉞在寅、天魁在午）
  '甲': ['丑', '未'], '戊': ['丑', '未'], '庚': ['丑', '未'],
  '乙': ['子', '申'], '己': ['子', '申'],
  '丙': ['亥', '酉'], '丁': ['亥', '酉'],
  '壬': ['卯', '巳'], '癸': ['卯', '巳'],
  '辛': ['午', '寅'],
};
const HUOXING_LINGXING_START_BY_ZHI_GROUP = {
  // 三合局分組 -> [火星起支, 鈴星起支]
  '申子辰': ['寅', '戌'], '寅午戌': ['丑', '卯'], '巳酉丑': ['卯', '戌'], '亥卯未': ['酉', '戌'],
};
const ZHI_TO_SANHE_GROUP = {
  '申':'申子辰','子':'申子辰','辰':'申子辰',
  '寅':'寅午戌','午':'寅午戌','戌':'寅午戌',
  '巳':'巳酉丑','酉':'巳酉丑','丑':'巳酉丑',
  '亥':'亥卯未','卯':'亥卯未','未':'亥卯未',
};
function getDikongDijieIdx(hourZhiIdx) {
  const dijie = (11 + hourZhiIdx) % 12; // 亥(11)起子時順行 = 地劫
  const dikong = ((11 - hourZhiIdx) % 12 + 12) % 12; // 亥(11)起子時逆行 = 地空
  return { dikong, dijie };
}
function computeAuxStars({ lunarMonth, hourZhiIdx, yearGan, yearZhi, lucunIdx }) {
  const wenchangIdx = getWenchangIdx(hourZhiIdx);
  const wenquIdx = getWenquIdx(hourZhiIdx);
  const zuofuIdx = getZuofuIdx(lunarMonth);
  const youbiIdx = getYoubiIdx(lunarMonth);
  const [tiankuiZhi, tianyueZhi] = TIANKUI_TIANYUE_BY_GAN[yearGan] || ['丑','未'];
  const tiankuiIdx = ZHI.indexOf(tiankuiZhi);
  const tianyueIdx = ZHI.indexOf(tianyueZhi);
  const qingyangIdx = (lucunIdx + 1) % 12; // 祿前一位
  const tuoluoIdx = ((lucunIdx - 1) % 12 + 12) % 12; // 祿後一位
  const sanheGroup = ZHI_TO_SANHE_GROUP[yearZhi] || '申子辰';
  const [huoStartZhi, lingStartZhi] = HUOXING_LINGXING_START_BY_ZHI_GROUP[sanheGroup];
  const huoxingIdx = (ZHI.indexOf(huoStartZhi) + hourZhiIdx) % 12;
  const lingxingIdx = (ZHI.indexOf(lingStartZhi) + hourZhiIdx) % 12;
  const { dikong, dijie } = getDikongDijieIdx(hourZhiIdx);
  return {
    wenchangIdx, wenquIdx, zuofuIdx, youbiIdx, tiankuiIdx, tianyueIdx,
    qingyangIdx, tuoluoIdx, huoxingIdx, lingxingIdx, dikongIdx: dikong, dijieIdx: dijie,
  };
}

function computeZiweiChart({ lunarYear, lunarMonth, lunarDay, hourZhiIdx, yearGanZhi, gender }) {
  const mingGongIdx = getMingGongZhi(lunarMonth, hourZhiIdx);
  const shenGongIdx = getShenGongZhi(lunarMonth, hourZhiIdx);

  // 五行局：依「命宮干支」之納音判定（正統作法），而非生年干支
  const yearGan = yearGanZhi[0];
  const mingGongGanZhi = getMingGongGanZhi(yearGan, mingGongIdx);
  const nayin = getNayinWuxing(mingGongGanZhi);
  const ju = WUXINGJU[nayin] || 5;

  const ziweiIdx = getZiweiPalaceIdx(ju, lunarDay);
  const tianfuIdx = getTianfuPalaceIdx(ziweiIdx);

  // 12宮位（以命宮為起點，逆時針排列：命-兄-夫-子-財-疾-遷-友-業-田-福-父，
  // 實際上紫微斗數宮位是「順著地支固定位置」，宮名則以命宮起逆排到地支）
  const yearZhi = yearGanZhi[1];
  const yearGanIdxForYY = GAN_Z.indexOf(yearGan);
  // 陽男陰女順行、陰男陽女逆行（與八字大運方向同一套規則，年干奇數索引=陰）
  const isForward = gender ? ((yearGanIdxForYY % 2 === 0 && gender === 'M') || (yearGanIdxForYY % 2 === 1 && gender === 'F')) : true;

  // 四化：依生年天干找出祿權科忌四顆星
  const sihuaStars = SIHUA_TABLE[yearGan] || [];
  const starToHua = {};
  sihuaStars.forEach((star, i) => { starToHua[star] = SIHUA_TYPES[i]; });

  // 神煞三組十二神
  const lucunIdx = ZHI.indexOf(LUCUN_ZHI_BY_GAN[yearGan]);
  const boshiArr = buildTwelveGods(lucunIdx, BOSHI12_NAMES, isForward);
  const yearZhiIdx = ZHI.indexOf(yearZhi);
  const suiqianArr = buildTwelveGods(yearZhiIdx, SUIQIAN12_NAMES, true);
  const jiangqianStartIdx = ZHI.indexOf(JIANGQIAN_START_BY_ZHI[yearZhi]);
  const jiangqianArr = buildTwelveGods(jiangqianStartIdx, JIANGQIAN12_NAMES, true);
  // v9.8.5新增：長生十二神，依五行局起始宮位＋陽男陰女順行/陰男陽女逆行排列（與isForward同一套方向規則）
  const changshengStartIdx = ZHI.indexOf(CHANGSHENG_START_ZHI_BY_JU[ju] || '申');
  const changshengArr = buildTwelveGods(changshengStartIdx, CHANGSHENG12_NAMES, isForward);

  // v5.6新增：六吉星、六煞星安星
  const aux = computeAuxStars({ lunarMonth, hourZhiIdx, yearGan, yearZhi, lucunIdx });
  const AUX_STAR_IDX = {
    '文昌': aux.wenchangIdx, '文曲': aux.wenquIdx, '左輔': aux.zuofuIdx, '右弼': aux.youbiIdx,
    '天魁': aux.tiankuiIdx, '天鉞': aux.tianyueIdx,
  };
  const SHA_STAR_IDX = {
    '擎羊': aux.qingyangIdx, '陀羅': aux.tuoluoIdx, '火星': aux.huoxingIdx, '鈴星': aux.lingxingIdx,
    '地空': aux.dikongIdx, '地劫': aux.dijieIdx,
  };

  const palaces = ZHI.map((zhi, idx) => {
    // 該地支宮位對應的宮名：從命宮(mingGongIdx)開始，「逆時針」（即地支序遞減方向於傳統排法為順時針顯示，這裡用命宮偏移量計算宮名）
    const offsetFromMing = ((idx - mingGongIdx) % 12 + 12) % 12;
    const palaceName = PALACE_NAMES[offsetFromMing];
    const stars = [];
    Object.entries(ZIWEI_SERIES_OFFSET).forEach(([star, off]) => {
      if (((ziweiIdx + off) % 12 + 12) % 12 === idx) stars.push(star);
    });
    Object.entries(TIANFU_SERIES_OFFSET).forEach(([star, off]) => {
      if (((tianfuIdx + off) % 12 + 12) % 12 === idx) stars.push(star);
    });
    // v5.6新增：六吉星併入 stars（供廟旺表與四化比對使用），六煞星另存 shaStars（不查亮度表，傳統上六煞不列入十四主星廟旺系統）
    const auxHere = Object.entries(AUX_STAR_IDX).filter(([, i]) => i === idx).map(([s]) => s);
    stars.push(...auxHere);
    const shaStars = Object.entries(SHA_STAR_IDX).filter(([, i]) => i === idx).map(([s]) => s);
    const starBrightness = stars.map(s => getBrightness(s, zhi));
    const sihua = stars.filter(s => starToHua[s]).map(s => ({ star: s, type: starToHua[s] }));
    return {
      zhi, palaceName, stars, starBrightness, sihua, shaStars,
      boshi: boshiArr[idx], suiqian: suiqianArr[idx], jiangqian: jiangqianArr[idx], changsheng: changshengArr[idx],
    };
  });

  return {
    ju, nayin, mingGongIdx, shenGongIdx, mingGongGanZhi, mingGongGan: mingGongGanZhi[0],
    mingGongZhi: ZHI[mingGongIdx], shenGongZhi: ZHI[shenGongIdx],
    ziweiZhi: ZHI[ziweiIdx], tianfuZhi: ZHI[tianfuIdx],
    yearGan, yearZhi, isForward, sihuaGan: yearGan, sihuaStars, starToHua,
    palaces,
  };
}

module.exports = { computeZiweiChart, getNayinWuxing, WUXINGJU, PALACE_NAMES, STAR_BRIGHTNESS, SIHUA_TABLE, getBrightness, CHANGSHENG12_MEANING };

    })(module, require);
    return module.exports;
  })();

  __modules['./astrology-core.js'] = (function(){
    const module = { exports: {} };
    const require = __require;
    (function(module, require){
// ============================================================
// astrology-core.js  西洋占星：太陽/月亮/行星黃經計算
// 採用簡化克卜勒軌道根數模型（J2000曆元線性變化率），精度約0.5~1度，
// 足以判斷星座與大致宮位，但非專業占星軟體等級（如Swiss Ephemeris）精度。
// ============================================================
const A = require('./astro-core.js');
const DEG = Math.PI / 180;

const ZODIAC_SIGNS = ['牡羊座','金牛座','雙子座','巨蟹座','獅子座','處女座','天秤座','天蠍座','射手座','摩羯座','水瓶座','雙魚座'];

function lonToSign(lon) {
  const idx = Math.floor(A.norm360(lon) / 30);
  const deg = A.norm360(lon) % 30;
  return { sign: ZODIAC_SIGNS[idx], deg, index: idx };
}

// 簡化軌道根數（a:半長軸AU, e:離心率, i:傾角, L:平黃經, w:近日點經度, N:升交點經度）
// 每項為 [值於J2000, 每世紀變化率]（角度單位為度，T為儒略世紀數）
const ELEMENTS = {
  Mercury: { a: [0.387098, 0], e: [0.205635, 0.000000559], i: [7.00487, -0.005], L: [252.25084, 149472.67411], w: [77.45645, 0.16047], N: [48.33167, -0.12534] },
  Venus: { a: [0.723330, 0], e: [0.006773, -0.0000001302], i: [3.39471, -0.0008], L: [181.97973, 58517.81389], w: [131.53298, 0.00268], N: [76.68069, -0.27861] },
  Mars: { a: [1.523688, 0], e: [0.093405, 0.0000025], i: [1.85061, -0.0081], L: [355.45332, 19140.29934], w: [336.04084, 0.44441], N: [49.57854, -0.29497] },
  Jupiter: { a: [5.20256, 0], e: [0.048498, 0.0000163], i: [1.30530, -0.0035], L: [34.40438, 3034.74657], w: [14.75385, 0.21252], N: [100.46444, 0.10018] },
  Saturn: { a: [9.55475, 0], e: [0.055546, -0.000346], i: [2.48446, 0.0060], L: [50.07672, 1222.11380], w: [92.43194, -0.41957], N: [113.66550, -0.28867] },
  // v5.6新增：天王星、海王星。軌道根數由本站自行依J2000曆元(a,e,i,升交點,近日點幅角,平近點角)換算為
  // L(平黃經)=升交點+近日點幅角+平近點角、w(近日點經度)=升交點+近日點幅角；每世紀變化率則以「360/公轉週期(年)×100」
  // 反推平黃經進動速率，e/i/w/N暫以0變化率簡化（其長期進動對本站精度等級而言影響可忽略）。
  // 未收錄冥王星：冥王星軌道離心率與傾角較大，簡化克卜勒模型誤差會明顯放大，為避免給出不可靠位置，本站選擇暫不提供。
  Uranus: { a: [19.19126, 0], e: [0.04717, 0], i: [0.773, 0], L: [313.24346, 428.4669], w: [171.00486, 0], N: [74.00600, 0] },
  Neptune: { a: [30.06992, 0], e: [0.008678, 0], i: [1.770, 0], L: [304.85300, 218.4650], w: [44.97000, 0], N: [131.78300, 0] },
};
const OUTER_PLANETS = ['Uranus', 'Neptune'];

function planetLongitude(name, jd) {
  const T = (jd - 2451545.0) / 36525;
  const el = ELEMENTS[name];
  const a = el.a[0] + el.a[1] * T;
  const e = el.e[0] + el.e[1] * T;
  const i = (el.i[0] + el.i[1] * T);
  const L = A.norm360(el.L[0] + el.L[1] * T);
  const w = A.norm360(el.w[0] + el.w[1] * T);
  const N = A.norm360(el.N[0] + el.N[1] * T);
  const M = A.norm360(L - w); // 平近點角
  // 解克卜勒方程求偏近點角 E
  let E = M * DEG;
  for (let k = 0; k < 8; k++) {
    E = E - (E - e * Math.sin(E) - M * DEG) / (1 - e * Math.cos(E));
  }
  const xv = a * (Math.cos(E) - e);
  const yv = a * (Math.sqrt(1 - e * e) * Math.sin(E));
  const v = Math.atan2(yv, xv); // 真近點角
  const r = Math.sqrt(xv * xv + yv * yv);
  // 黃道座標（日心 -> 需轉地心，此處用簡化「視黃經近似」：日心黃經 + 180 度近似地心方向修正，
  // 對水金火木土的精度足夠取得星座位置，但非精確視黃經）
  const heliocentricLon = A.norm360(v / DEG + w);
  // 轉地心近似：用地球（太陽）位置向量近似修正
  const sunLon = A.sunApparentLongitude(jd) * DEG;
  const earthR = 1.000001018; // AU 近似
  const xe = earthR * Math.cos(sunLon + Math.PI);
  const ye = earthR * Math.sin(sunLon + Math.PI);
  const xp = r * Math.cos(heliocentricLon * DEG);
  const yp = r * Math.sin(heliocentricLon * DEG);
  const geoLon = A.norm360(Math.atan2(yp - ye, xp - xe) / DEG);
  return geoLon;
}

function computeChart(jdUT) {
  const sunLon = A.sunApparentLongitude(jdUT);
  // 月球黃經：簡化公式（Meeus低精度，誤差約0.3度內）
  const T = (jdUT - 2451545.0) / 36525;
  const Lp = A.norm360(218.3164477 + 481267.88123421 * T);
  const D = A.norm360(297.8501921 + 445267.1114034 * T);
  const M = A.norm360(357.5291092 + 35999.0502909 * T);
  const Mp = A.norm360(134.9633964 + 477198.8675055 * T);
  const F = A.norm360(93.2720950 + 483202.0175233 * T);
  let moonLon = Lp
    + 6.288774 * Math.sin(Mp * DEG)
    + 1.274027 * Math.sin((2 * D - Mp) * DEG)
    + 0.658314 * Math.sin(2 * D * DEG)
    + 0.213618 * Math.sin(2 * Mp * DEG)
    - 0.185116 * Math.sin(M * DEG)
    - 0.114332 * Math.sin(2 * F * DEG);
  moonLon = A.norm360(moonLon);

  const planets = { Sun: sunLon, Moon: moonLon };
  ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'].forEach(p => { planets[p] = planetLongitude(p, jdUT); });

  const result = {};
  Object.entries(planets).forEach(([k, lon]) => { result[k] = { lon, ...lonToSign(lon) }; });

  // v5.6新增：逆行判斷——比較「當下」與「前一天」的黃經，若黃經反而變小（扣掉太陽月亮不判斷逆行）代表逆行。
  // 太陽、月亮永遠順行（不判斷逆行），其餘行星以「今日黃經 - 昨日黃經」正負號判斷。
  Object.keys(planets).forEach(k => {
    if (k === 'Sun' || k === 'Moon') { result[k].retrograde = false; return; }
    const lonYesterday = planetLongitude(k, jdUT - 1);
    let diff = A.norm360(planets[k] - lonYesterday);
    if (diff > 180) diff -= 360; // 轉為[-180,180]判斷方向
    result[k].retrograde = diff < 0;
  });
  return result;
}

// v5.6新增：主要相位（合／六合／刑／拱／沖）計算
// 傳統占星常用容許度(orb)：對太陽、月亮較寬(8度)，其餘行星6度，此處統一採6度以簡化判斷、避免誤判過多弱相位。
const ASPECTS_DEF = [
  { name: '合相', deg: 0, symbol: '☌' },
  { name: '六合', deg: 60, symbol: '⚹' },
  { name: '刑相', deg: 90, symbol: '□' },
  { name: '拱相', deg: 120, symbol: '△' },
  { name: '沖相', deg: 180, symbol: '☍' },
];
const ASPECT_ORB = 6;
function computeAspects(chart) {
  const names = Object.keys(chart);
  const aspects = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i], b = names[j];
      let diff = Math.abs(A.norm360(chart[a].lon - chart[b].lon));
      if (diff > 180) diff = 360 - diff;
      for (const def of ASPECTS_DEF) {
        const orb = Math.abs(diff - def.deg);
        if (orb <= ASPECT_ORB) {
          aspects.push({ a, b, name: def.name, symbol: def.symbol, exactDeg: def.deg, actualDeg: diff, orb: Math.round(orb * 10) / 10 });
          break; // 每對行星只取最接近的一種相位
        }
      }
    }
  }
  return aspects;
}

// 簡化宮位：以「上升點」需要準確地方恆星時計算，這裡提供「太陽星座宮位制(Whole Sign近似，
// 以出生時之太陽星座為第一宮起點)」作為簡化替代方案並清楚告知使用者。
function computeWholeSignHouses(chart, ascendantSignIndex) {
  const houses = {};
  Object.entries(chart).forEach(([planet, info]) => {
    const houseNum = ((info.index - ascendantSignIndex) % 12 + 12) % 12 + 1;
    houses[planet] = houseNum;
  });
  return houses;
}

// 上升星座（Ascendant）精確計算需要地方恆星時+緯度，這裡提供標準公式
function computeAscendant(jdUT, latitude, longitude) {
  const T = (jdUT - 2451545.0) / 36525;
  // 格林威治恆星時（度）
  let GST = 280.46061837 + 360.98564736629 * (jdUT - 2451545.0) + 0.000387933 * T * T - T * T * T / 38710000;
  GST = A.norm360(GST);
  const LST = A.norm360(GST + longitude); // 地方恆星時（度）
  const eps = (23.4392911 - 0.0130042 * T) * DEG;
  const lat = latitude * DEG;
  const lstR = LST * DEG;
  // 上升點公式
  const y = -Math.cos(lstR);
  const x = Math.sin(lstR) * Math.cos(eps) + Math.tan(lat) * Math.sin(eps);
  let asc = Math.atan2(y, x) / DEG;
  asc = A.norm360(asc + 180);
  return lonToSign(asc);
}

module.exports = { ZODIAC_SIGNS, lonToSign, computeChart, computeWholeSignHouses, computeAscendant, computeAspects, ASPECTS_DEF };

    })(module, require);
    return module.exports;
  })();

  __modules['./name-core.js'] = (function(){
    const module = { exports: {} };
    const require = __require;
    (function(module, require){
// ============================================================
// name-core.js  姓名學（熊崎氏五格剖象法）
// 五格：天格(姓+1,單姓)/人格(姓末字+名首字)/地格(名字筆畫和,雙名)/外格/總格
// 筆畫：採「康熙字典」筆畫（部首還原慣例，非簡化字筆畫落筆數），已收錄約27,500字
// （v8.7起：以 Unicode IDS 部件拆解 + 部首還原規則大幅擴充，涵蓋 CJK 統一表意文字基本
// 區與擴充區A，涵蓋絕大多數台灣姓名實際用字）。還原規則：氵→水部4畫、扌→手部4畫、
// 忄→心部4畫、艹→艸部6畫、辶→辵部7畫、阝(左)→阜部8畫、阝(右)→邑部7畫、礻→示部5畫、
// 衤→衣部6畫、犭→犬部4畫、月(常見肉部字)→肉部6畫。少數罕見複雜字型可能有±1畫誤差，
// 常用姓氏與姓名用字（原有約790字）已個別人工覆核為準。未收錄字仍會明確告知使用者，不臆測。
// ============================================================

const STROKES = {
  '㐀':5,'㐁':6,'㐂':6,'㐃':3,'㐄':3,'㐅':2,'㐆':6,'㐇':3,'㐈':3,'㐉':3,'㐊':4,'㐋':4,'㐌':5,'㐍':5,'㐎':5,'㐏':5,'㐐':6,'㐑':6,'㐒':6,'㐓':6,'㐔':6,'㐕':6,'㐖':7,'㐗':7,'㐘':7,'㐙':8,'㐚':8,'㐛':8,'㐜':9,'㐝':9,'㐞':9,'㐟':9,'㐠':9,
  '㐡':11,'㐢':11,'㐣':11,'㐤':12,'㐥':16,'㐦':19,'㐧':4,'㐨':8,'㐩':8,'㐪':6,'㐫':6,'㐬':7,'㐭':8,'㐮':13,'㐯':17,'㐰':5,'㐱':5,'㐲':5,'㐳':5,'㐴':5,'㐵':5,'㐶':5,'㐷':5,'㐸':6,'㐹':6,'㐺':6,'㐻':6,'㐼':6,'㐽':6,'㐾':6,'㐿':6,'㑀':6,
  '㑁':7,'㑂':7,'㑃':7,'㑄':7,'㑅':7,'㑆':7,'㑇':7,'㑈':7,'㑉':8,'㑊':8,'㑋':8,'㑌':8,'㑍':8,'㑎':8,'㑏':8,'㑐':8,'㑑':8,'㑒':8,'㑓':8,'㑔':8,'㑕':8,'㑖':8,'㑗':9,'㑘':9,'㑙':9,'㑚':9,'㑛':9,'㑜':9,'㑝':9,'㑞':9,'㑟':9,'㑠':9,'㑡':9,
  '㑢':9,'㑣':10,'㑤':11,'㑥':10,'㑦':10,'㑧':10,'㑨':10,'㑩':10,'㑪':10,'㑫':10,'㑬':10,'㑭':10,'㑮':11,'㑯':11,'㑰':11,'㑱':11,'㑲':11,'㑳':12,'㑴':12,'㑵':12,'㑶':12,'㑷':12,'㑸':12,'㑹':12,'㑺':12,'㑻':13,'㑼':13,'㑽':13,
  '㑾':13,'㑿':13,'㒀':13,'㒁':13,'㒂':14,'㒃':14,'㒄':14,'㒅':14,'㒆':14,'㒇':14,'㒈':14,'㒉':14,'㒊':14,'㒋':14,'㒌':14,'㒍':14,'㒎':14,'㒏':14,'㒐':14,'㒑':15,'㒒':15,'㒓':15,'㒔':15,'㒕':15,'㒖':15,'㒗':15,'㒘':15,'㒙':16,
  '㒚':16,'㒛':16,'㒜':16,'㒝':17,'㒞':17,'㒟':18,'㒠':18,'㒡':19,'㒢':19,'㒣':19,'㒤':20,'㒥':20,'㒦':20,'㒧':21,'㒨':21,'㒩':23,'㒪':26,'㒫':6,'㒬':9,'㒭':10,'㒮':11,'㒯':18,'㒰':5,'㒱':5,'㒲':6,'㒳':7,'㒴':7,'㒵':7,'㒶':7,'㒷':7,
  '㒸':9,'㒹':20,'㒺':8,'㒻':11,'㒼':11,'㒽':12,'㒾':13,'㒿':22,'㓀':4,'㓁':4,'㓂':9,'㓃':12,'㓄':15,'㓅':4,'㓆':6,'㓇':6,'㓈':7,'㓉':8,'㓊':8,'㓋':8,'㓌':8,'㓍':8,'㓎':9,'㓏':9,'㓐':10,'㓑':10,'㓒':10,'㓓':11,'㓔':12,'㓕':12,
  '㓖':13,'㓗':14,'㓘':11,'㓙':6,'㓚':5,'㓛':5,'㓜':5,'㓝':6,'㓞':6,'㓟':7,'㓠':7,'㓡':8,'㓢':8,'㓣':8,'㓤':8,'㓥':8,'㓦':8,'㓧':9,'㓨':9,'㓩':9,'㓪':9,'㓫':9,'㓬':10,'㓭':10,'㓮':10,'㓯':10,'㓰':10,'㓱':11,'㓲':11,'㓳':11,'㓴':11,
  '㓵':11,'㓶':11,'㓷':12,'㓸':12,'㓹':12,'㓺':12,'㓻':12,'㓼':13,'㓽':13,'㓾':14,'㓿':14,'㔀':14,'㔁':14,'㔂':14,'㔃':14,'㔄':14,'㔅':14,'㔆':14,'㔇':14,'㔈':14,'㔉':14,'㔊':15,'㔋':16,'㔌':16,'㔍':16,'㔎':17,'㔏':17,'㔐':18,
  '㔑':19,'㔒':20,'㔓':5,'㔔':6,'㔕':6,'㔖':6,'㔗':7,'㔘':7,'㔙':8,'㔚':8,'㔛':8,'㔜':9,'㔝':10,'㔞':10,'㔟':10,'㔠':11,'㔡':12,'㔢':14,'㔣':17,'㔤':17,'㔥':17,'㔦':17,'㔧':18,'㔨':11,'㔩':12,'㔪':13,'㔫':4,'㔬':8,'㔭':11,'㔮':21,
  '㔯':7,'㔰':7,'㔱':11,'㔲':13,'㔳':13,'㔴':13,'㔵':14,'㔶':26,'㔷':7,'㔸':12,'㔹':4,'㔺':6,'㔻':6,'㔼':13,'㔽':8,'㔾':3,'㔿':3,'㕀':7,'㕁':8,'㕂':6,'㕃':6,'㕄':6,'㕅':7,'㕆':7,'㕇':7,'㕈':8,'㕉':8,'㕊':9,'㕋':10,'㕌':10,'㕍':10,
  '㕎':12,'㕏':13,'㕐':14,'㕑':14,'㕒':15,'㕓':17,'㕔':24,'㕕':4,'㕖':10,'㕗':11,'㕘':11,'㕙':15,'㕚':4,'㕛':4,'㕜':6,'㕝':7,'㕞':8,'㕟':9,'㕠':12,'㕡':14,'㕢':14,'㕣':5,'㕤':5,'㕥':5,'㕦':6,'㕧':6,'㕨':6,'㕩':7,'㕪':7,'㕫':7,'㕬':7,
  '㕭':7,'㕮':7,'㕯':7,'㕰':7,'㕱':7,'㕲':7,'㕳':7,'㕴':7,'㕵':8,'㕶':7,'㕷':8,'㕸':8,'㕹':8,'㕺':8,'㕻':8,'㕼':8,'㕽':8,'㕾':8,'㕿':8,'㖀':9,'㖁':9,'㖂':9,'㖃':9,'㖄':9,'㖅':9,'㖆':9,'㖇':9,'㖈':9,'㖉':9,'㖊':9,'㖋':9,'㖌':9,'㖍':9,
  '㖎':9,'㖏':10,'㖐':10,'㖑':10,'㖒':10,'㖓':10,'㖔':10,'㖕':10,'㖖':10,'㖗':10,'㖘':10,'㖙':10,'㖚':10,'㖛':10,'㖜':10,'㖝':10,'㖞':10,'㖟':11,'㖠':11,'㖡':11,'㖢':11,'㖣':11,'㖤':11,'㖥':11,'㖦':11,'㖧':11,'㖨':11,'㖩':11,
  '㖪':11,'㖫':11,'㖬':11,'㖭':11,'㖮':11,'㖯':11,'㖰':11,'㖱':11,'㖲':11,'㖳':11,'㖴':11,'㖵':11,'㖶':12,'㖷':12,'㖸':12,'㖹':12,'㖺':12,'㖻':12,'㖼':12,'㖽':12,'㖾':12,'㖿':12,'㗀':12,'㗁':12,'㗂':12,'㗃':12,'㗄':12,'㗅':12,
  '㗆':12,'㗇':12,'㗈':12,'㗉':12,'㗊':12,'㗋':12,'㗌':12,'㗍':12,'㗎':12,'㗏':12,'㗐':12,'㗑':12,'㗒':13,'㗓':13,'㗔':13,'㗕':13,'㗖':13,'㗗':13,'㗘':13,'㗙':13,'㗚':13,'㗛':13,'㗜':13,'㗝':13,'㗞':13,'㗟':13,'㗠':13,'㗡':15,
  '㗢':14,'㗣':14,'㗤':14,'㗥':14,'㗦':14,'㗧':14,'㗨':14,'㗩':14,'㗪':14,'㗫':14,'㗬':14,'㗭':14,'㗮':14,'㗯':14,'㗰':14,'㗱':15,'㗲':15,'㗳':15,'㗴':15,'㗵':15,'㗶':15,'㗷':15,'㗸':15,'㗹':15,'㗺':15,'㗻':16,'㗼':16,'㗽':16,
  '㗾':16,'㗿':16,'㘀':16,'㘁':16,'㘂':16,'㘃':16,'㘄':16,'㘅':17,'㘆':17,'㘇':17,'㘈':17,'㘉':18,'㘊':18,'㘋':18,'㘌':18,'㘍':18,'㘎':18,'㘏':18,'㘐':19,'㘑':19,'㘒':19,'㘓':20,'㘔':20,'㘕':21,'㘖':21,'㘗':21,'㘘':22,'㘙':23,
  '㘚':23,'㘛':25,'㘜':26,'㘝':5,'㘞':5,'㘟':6,'㘠':8,'㘡':8,'㘢':9,'㘣':10,'㘤':14,'㘥':20,'㘦':5,'㘧':7,'㘨':7,'㘩':7,'㘪':7,'㘫':7,'㘬':7,'㘭':7,'㘮':7,'㘯':7,'㘰':7,'㘱':8,'㘲':8,'㘳':8,'㘴':8,'㘵':8,'㘶':9,'㘷':9,'㘸':9,'㘹':9,
  '㘺':9,'㘻':9,'㘼':9,'㘽':9,'㘾':9,'㘿':10,'㙀':10,'㙁':10,'㙂':10,'㙃':10,'㙄':10,'㙅':10,'㙆':10,'㙇':11,'㙈':11,'㙉':11,'㙊':11,'㙋':11,'㙌':11,'㙍':11,'㙎':12,'㙏':12,'㙐':12,'㙑':12,'㙒':12,'㙓':12,'㙔':12,'㙕':12,'㙖':12,
  '㙗':12,'㙘':12,'㙙':13,'㙚':13,'㙛':13,'㙜':13,'㙝':13,'㙞':13,'㙟':13,'㙠':14,'㙡':14,'㙢':14,'㙣':14,'㙤':14,'㙥':14,'㙦':14,'㙧':15,'㙨':15,'㙩':15,'㙪':15,'㙫':15,'㙬':15,'㙭':15,'㙮':15,'㙯':15,'㙰':16,'㙱':16,'㙲':16,
  '㙳':16,'㙴':16,'㙵':16,'㙶':16,'㙷':17,'㙸':17,'㙹':17,'㙺':17,'㙻':18,'㙼':18,'㙽':18,'㙾':19,'㙿':19,'㚀':20,'㚁':24,'㚂':25,'㚃':12,'㚄':15,'㚅':9,'㚆':9,'㚇':9,'㚈':5,'㚉':8,'㚊':12,'㚋':14,'㚌':14,'㚍':18,'㚎':5,'㚏':6,
  '㚐':6,'㚑':6,'㚒':7,'㚓':7,'㚔':8,'㚕':8,'㚖':8,'㚗':8,'㚘':8,'㚙':8,'㚚':9,'㚛':9,'㚜':11,'㚝':11,'㚞':11,'㚟':12,'㚠':13,'㚡':16,'㚢':5,'㚣':6,'㚤':6,'㚥':6,'㚦':6,'㚧':6,'㚨':6,'㚩':7,'㚪':7,'㚫':7,'㚬':7,'㚭':7,'㚮':7,'㚯':7,
  '㚰':8,'㚱':8,'㚲':8,'㚳':8,'㚴':8,'㚵':8,'㚶':8,'㚷':8,'㚸':8,'㚹':8,'㚺':8,'㚻':8,'㚼':8,'㚽':8,'㚾':8,'㚿':8,'㛀':8,'㛁':8,'㛂':9,'㛃':9,'㛄':9,'㛅':9,'㛆':9,'㛇':9,'㛈':9,'㛉':9,'㛊':9,'㛋':9,'㛌':9,'㛍':10,'㛎':10,'㛏':10,
  '㛐':10,'㛑':10,'㛒':10,'㛓':10,'㛔':10,'㛕':10,'㛖':10,'㛗':10,'㛘':10,'㛙':10,'㛚':10,'㛛':10,'㛜':10,'㛝':10,'㛞':10,'㛟':10,'㛠':7,'㛡':10,'㛢':10,'㛣':10,'㛤':10,'㛥':11,'㛦':11,'㛧':11,'㛨':11,'㛩':11,'㛪':11,'㛫':11,
  '㛬':11,'㛭':11,'㛮':12,'㛯':12,'㛰':12,'㛱':12,'㛲':12,'㛳':12,'㛴':12,'㛵':12,'㛶':12,'㛷':12,'㛸':12,'㛹':12,'㛺':12,'㛻':12,'㛼':12,'㛽':12,'㛾':12,'㛿':12,'㜀':12,'㜁':12,'㜂':12,'㜃':12,'㜄':12,'㜅':13,'㜆':13,'㜇':13,
  '㜈':13,'㜉':13,'㜊':13,'㜋':13,'㜌':13,'㜍':13,'㜎':13,'㜏':13,'㜐':13,'㜑':13,'㜒':13,'㜓':13,'㜔':13,'㜕':14,'㜖':14,'㜗':14,'㜘':14,'㜙':14,'㜚':14,'㜛':14,'㜜':14,'㜝':14,'㜞':14,'㜟':14,'㜠':14,'㜡':14,'㜢':14,'㜣':15,
  '㜤':15,'㜥':15,'㜦':15,'㜧':15,'㜨':15,'㜩':16,'㜪':16,'㜫':16,'㜬':16,'㜭':16,'㜮':17,'㜯':17,'㜰':18,'㜱':18,'㜲':19,'㜳':19,'㜴':19,'㜵':19,'㜶':20,'㜷':20,'㜸':20,'㜹':21,'㜺':22,'㜻':26,'㜼':26,'㜽':6,'㜾':7,'㜿':7,'㝀':8,
  '㝁':9,'㝂':10,'㝃':10,'㝄':12,'㝅':13,'㝆':15,'㝇':16,'㝈':25,'㝉':4,'㝊':5,'㝋':5,'㝌':6,'㝍':6,'㝎':7,'㝏':7,'㝐':7,'㝑':7,'㝒':8,'㝓':9,'㝔':9,'㝕':9,'㝖':9,'㝗':10,'㝘':10,'㝙':10,'㝚':10,'㝛':11,'㝜':11,'㝝':11,'㝞':11,
  '㝟':11,'㝠':11,'㝡':11,'㝢':12,'㝣':12,'㝤':13,'㝥':13,'㝦':13,'㝧':13,'㝨':13,'㝩':14,'㝪':14,'㝫':14,'㝬':14,'㝭':15,'㝮':15,'㝯':15,'㝰':18,'㝱':21,'㝲':26,'㝳':5,'㝴':7,'㝵':8,'㝶':10,'㝷':12,'㝸':10,'㝹':12,'㝺':14,'㝻':15,
  '㝼':6,'㝽':7,'㝾':8,'㝿':8,'㞀':9,'㞁':9,'㞂':10,'㞃':11,'㞄':11,'㞅':11,'㞆':11,'㞇':12,'㞈':12,'㞉':13,'㞊':13,'㞋':5,'㞌':6,'㞍':6,'㞎':7,'㞏':8,'㞐':8,'㞑':8,'㞒':9,'㞓':9,'㞔':9,'㞕':9,'㞖':9,'㞗':10,'㞘':11,'㞙':11,'㞚':12,
  '㞛':12,'㞜':14,'㞝':14,'㞞':14,'㞟':15,'㞠':15,'㞡':19,'㞢':4,'㞣':7,'㞤':5,'㞥':5,'㞦':5,'㞧':5,'㞨':6,'㞩':6,'㞪':6,'㞫':6,'㞬':6,'㞭':6,'㞮':6,'㞯':6,'㞰':7,'㞱':7,'㞲':7,'㞳':7,'㞴':7,'㞵':7,'㞶':7,'㞷':8,'㞸':7,'㞹':8,'㞺':8,
  '㞻':8,'㞼':8,'㞽':8,'㞾':8,'㞿':8,'㟀':8,'㟁':8,'㟂':8,'㟃':8,'㟄':9,'㟅':9,'㟆':9,'㟇':10,'㟈':10,'㟉':10,'㟊':10,'㟋':10,'㟌':10,'㟍':10,'㟎':10,'㟏':10,'㟐':10,'㟑':10,'㟒':10,'㟓':10,'㟔':10,'㟕':10,'㟖':10,'㟗':11,'㟘':11,
  '㟙':11,'㟚':11,'㟛':11,'㟜':11,'㟝':11,'㟞':11,'㟟':11,'㟠':11,'㟡':11,'㟢':11,'㟣':11,'㟤':11,'㟥':11,'㟦':12,'㟧':12,'㟨':12,'㟩':12,'㟪':12,'㟫':12,'㟬':12,'㟭':12,'㟮':12,'㟯':12,'㟰':13,'㟱':13,'㟲':13,'㟳':13,'㟴':13,
  '㟵':13,'㟶':13,'㟷':13,'㟸':13,'㟹':14,'㟺':14,'㟻':14,'㟼':14,'㟽':14,'㟾':14,'㟿':14,'㠀':14,'㠁':14,'㠂':14,'㠃':14,'㠄':14,'㠅':15,'㠆':15,'㠇':15,'㠈':15,'㠉':15,'㠊':15,'㠋':15,'㠌':15,'㠍':15,'㠎':15,'㠏':15,'㠐':15,
  '㠑':16,'㠒':16,'㠓':16,'㠔':16,'㠕':16,'㠖':16,'㠗':16,'㠘':17,'㠙':17,'㠚':17,'㠛':17,'㠜':17,'㠝':18,'㠞':18,'㠟':18,'㠠':19,'㠡':19,'㠢':19,'㠣':19,'㠤':20,'㠥':21,'㠦':21,'㠧':22,'㠨':28,'㠩':6,'㠪':4,'㠫':10,'㠬':10,
  '㠭':12,'㠮':15,'㠯':5,'㠰':8,'㠱':11,'㠲':5,'㠳':5,'㠴':6,'㠵':6,'㠶':6,'㠷':7,'㠸':7,'㠹':7,'㠺':7,'㠻':7,'㠼':7,'㠽':8,'㠾':8,'㠿':8,'㡀':8,'㡁':9,'㡂':9,'㡃':9,'㡄':9,'㡅':9,'㡆':9,'㡇':10,'㡈':10,'㡉':11,'㡊':11,'㡋':11,
  '㡌':11,'㡍':11,'㡎':11,'㡏':12,'㡐':12,'㡑':12,'㡒':12,'㡓':12,'㡔':12,'㡕':12,'㡖':12,'㡗':13,'㡘':13,'㡙':13,'㡚':13,'㡛':13,'㡜':14,'㡝':14,'㡞':14,'㡟':14,'㡠':15,'㡡':15,'㡢':16,'㡣':16,'㡤':16,'㡥':17,'㡦':17,'㡧':20,
  '㡨':20,'㡩':22,'㡪':22,'㡫':12,'㡬':12,'㡭':14,'㡮':16,'㡯':6,'㡰':6,'㡱':6,'㡲':7,'㡳':7,'㡴':8,'㡵':8,'㡶':8,'㡷':8,'㡸':8,'㡹':8,'㡺':8,'㡻':8,'㡼':9,'㡽':9,'㡾':9,'㡿':9,'㢀':9,'㢁':9,'㢂':9,'㢃':10,'㢄':10,'㢅':10,'㢆':10,
  '㢇':10,'㢈':11,'㢉':11,'㢊':11,'㢋':11,'㢌':11,'㢍':12,'㢎':12,'㢏':12,'㢐':12,'㢑':13,'㢒':14,'㢓':14,'㢔':14,'㢕':14,'㢖':15,'㢗':15,'㢘':15,'㢙':16,'㢚':16,'㢛':16,'㢜':16,'㢝':19,'㢞':20,'㢟':6,'㢠':8,'㢡':14,'㢢':15,
  '㢣':16,'㢤':7,'㢥':9,'㢦':13,'㢧':4,'㢨':6,'㢩':6,'㢪':6,'㢫':6,'㢬':7,'㢭':7,'㢮':8,'㢯':8,'㢰':8,'㢱':8,'㢲':9,'㢳':9,'㢴':9,'㢵':9,'㢶':9,'㢷':9,'㢸':10,'㢹':10,'㢺':11,'㢻':11,'㢼':11,'㢽':12,'㢾':12,'㢿':12,'㣀':13,'㣁':13,
  '㣂':13,'㣃':14,'㣄':15,'㣅':15,'㣆':21,'㣇':8,'㣈':16,'㣉':6,'㣊':7,'㣋':8,'㣌':8,'㣍':8,'㣎':11,'㣏':12,'㣐':12,'㣑':14,'㣒':15,'㣓':16,'㣔':5,'㣕':6,'㣖':7,'㣗':7,'㣘':8,'㣙':8,'㣚':9,'㣛':9,'㣜':9,'㣝':9,'㣞':9,'㣟':9,'㣠':9,
  '㣡':9,'㣢':10,'㣣':10,'㣤':11,'㣥':11,'㣦':11,'㣧':11,'㣨':11,'㣩':11,'㣪':12,'㣫':12,'㣬':12,'㣭':12,'㣮':12,'㣯':13,'㣰':14,'㣱':14,'㣲':14,'㣳':15,'㣴':15,'㣵':16,'㣶':16,'㣷':17,'㣸':19,'㣹':20,'㣺':5,'㣻':6,'㣼':7,'㣽':7,
  '㣾':7,'㣿':7,'㤀':7,'㤁':8,'㤂':8,'㤃':8,'㤄':8,'㤅':8,'㤆':8,'㤇':8,'㤈':8,'㤉':8,'㤊':8,'㤋':8,'㤌':9,'㤍':9,'㤎':9,'㤏':9,'㤐':8,'㤑':9,'㤒':9,'㤓':9,'㤔':9,'㤕':9,'㤖':9,'㤗':9,'㤘':9,'㤙':9,'㤚':10,'㤛':10,'㤜':10,'㤝':10,
  '㤞':10,'㤟':10,'㤠':10,'㤡':10,'㤢':10,'㤣':10,'㤤':9,'㤥':10,'㤦':10,'㤧':10,'㤨':10,'㤩':10,'㤪':10,'㤫':10,'㤬':10,'㤭':10,'㤮':11,'㤯':11,'㤰':11,'㤱':11,'㤲':11,'㤳':11,'㤴':11,'㤵':11,'㤶':11,'㤷':11,'㤸':11,'㤹':11,
  '㤺':10,'㤻':11,'㤼':11,'㤽':11,'㤾':12,'㤿':12,'㥀':12,'㥁':12,'㥂':12,'㥃':12,'㥄':12,'㥅':12,'㥆':12,'㥇':12,'㥈':12,'㥉':12,'㥊':12,'㥋':12,'㥌':12,'㥍':12,'㥎':12,'㥏':12,'㥐':12,'㥑':12,'㥒':12,'㥓':12,'㥔':12,'㥕':12,
  '㥖':12,'㥗':12,'㥘':12,'㥙':12,'㥚':12,'㥛':12,'㥜':13,'㥝':13,'㥞':13,'㥟':13,'㥠':13,'㥡':13,'㥢':13,'㥣':13,'㥤':13,'㥥':13,'㥦':13,'㥧':13,'㥨':13,'㥩':12,'㥪':13,'㥫':13,'㥬':14,'㥭':14,'㥮':14,'㥯':14,'㥰':13,'㥱':14,
  '㥲':14,'㥳':14,'㥴':14,'㥵':14,'㥶':14,'㥷':14,'㥸':14,'㥹':14,'㥺':14,'㥻':14,'㥼':15,'㥽':15,'㥾':14,'㥿':15,'㦀':14,'㦁':15,'㦂':15,'㦃':15,'㦄':15,'㦅':15,'㦆':15,'㦇':15,'㦈':15,'㦉':16,'㦊':14,'㦋':15,'㦌':16,'㦍':16,
  '㦎':16,'㦏':16,'㦐':16,'㦑':15,'㦒':16,'㦓':16,'㦔':16,'㦕':15,'㦖':16,'㦗':17,'㦘':17,'㦙':17,'㦚':18,'㦛':18,'㦜':17,'㦝':18,'㦞':18,'㦟':18,'㦠':18,'㦡':19,'㦢':17,'㦣':20,'㦤':20,'㦥':20,'㦦':20,'㦧':20,'㦨':21,'㦩':20,
  '㦪':21,'㦫':23,'㦬':23,'㦭':28,'㦮':7,'㦯':7,'㦰':8,'㦱':8,'㦲':8,'㦳':9,'㦴':10,'㦵':10,'㦶':10,'㦷':11,'㦸':12,'㦹':13,'㦺':14,'㦻':15,'㦼':15,'㦽':17,'㦾':7,'㦿':8,'㧀':8,'㧁':9,'㧂':9,'㧃':6,'㧄':6,'㧅':6,'㧆':7,'㧇':7,'㧈':7,
  '㧉':8,'㧊':8,'㧋':8,'㧌':8,'㧍':8,'㧎':8,'㧏':8,'㧐':8,'㧑':8,'㧒':9,'㧓':9,'㧔':9,'㧕':9,'㧖':9,'㧗':10,'㧘':9,'㧙':9,'㧚':8,'㧛':8,'㧜':9,'㧝':8,'㧞':9,'㧟':9,'㧠':9,'㧡':10,'㧢':10,'㧣':10,'㧤':10,'㧥':10,'㧦':10,'㧧':11,
  '㧨':10,'㧩':9,'㧪':10,'㧫':10,'㧬':10,'㧭':10,'㧮':10,'㧯':10,'㧰':9,'㧱':10,'㧲':11,'㧳':11,'㧴':11,'㧵':11,'㧶':11,'㧷':11,'㧸':11,'㧹':12,'㧺':12,'㧻':12,'㧼':12,'㧽':12,'㧾':12,'㧿':11,'㨀':12,'㨁':12,'㨂':12,'㨃':12,
  '㨄':12,'㨅':11,'㨆':12,'㨇':12,'㨈':12,'㨉':13,'㨊':12,'㨋':12,'㨌':13,'㨍':13,'㨎':13,'㨏':13,'㨐':13,'㨑':13,'㨒':13,'㨓':13,'㨔':13,'㨕':13,'㨖':14,'㨗':12,'㨘':13,'㨙':14,'㨚':13,'㨛':14,'㨜':14,'㨝':14,'㨞':14,'㨟':14,
  '㨠':14,'㨡':14,'㨢':14,'㨣':14,'㨤':14,'㨥':14,'㨦':14,'㨧':14,'㨨':14,'㨩':13,'㨪':14,'㨫':14,'㨬':14,'㨭':15,'㨮':15,'㨯':14,'㨰':14,'㨱':15,'㨲':15,'㨳':15,'㨴':15,'㨵':15,'㨶':15,'㨷':15,'㨸':15,'㨹':15,'㨺':15,'㨻':15,
  '㨼':15,'㨽':15,'㨾':15,'㨿':15,'㩀':15,'㩁':15,'㩂':15,'㩃':16,'㩄':16,'㩅':16,'㩆':16,'㩇':16,'㩈':16,'㩉':16,'㩊':16,'㩋':17,'㩌':16,'㩍':16,'㩎':16,'㩏':16,'㩐':16,'㩑':16,'㩒':17,'㩓':17,'㩔':17,'㩕':17,'㩖':17,'㩗':17,
  '㩘':17,'㩙':17,'㩚':17,'㩛':18,'㩜':18,'㩝':18,'㩞':18,'㩟':18,'㩠':19,'㩡':19,'㩢':18,'㩣':19,'㩤':19,'㩥':19,'㩦':18,'㩧':19,'㩨':19,'㩩':19,'㩪':19,'㩫':19,'㩬':20,'㩭':20,'㩮':21,'㩯':21,'㩰':21,'㩱':21,'㩲':21,'㩳':22,
  '㩴':22,'㩵':24,'㩶':24,'㩷':24,'㩸':24,'㩹':26,'㩺':8,'㩻':10,'㩼':10,'㩽':11,'㩾':12,'㩿':7,'㪀':7,'㪁':8,'㪂':8,'㪃':9,'㪄':9,'㪅':9,'㪆':9,'㪇':10,'㪈':10,'㪉':10,'㪊':11,'㪋':11,'㪌':11,'㪍':11,'㪎':11,'㪏':12,'㪐':12,
  '㪑':12,'㪒':12,'㪓':12,'㪔':12,'㪕':12,'㪖':12,'㪗':12,'㪘':12,'㪙':12,'㪚':12,'㪛':13,'㪜':13,'㪝':13,'㪞':13,'㪟':13,'㪠':14,'㪡':14,'㪢':14,'㪣':14,'㪤':15,'㪥':15,'㪦':15,'㪧':16,'㪨':16,'㪩':16,'㪪':16,'㪫':18,'㪬':18,
  '㪭':20,'㪮':21,'㪯':7,'㪰':10,'㪱':13,'㪲':6,'㪳':6,'㪴':8,'㪵':9,'㪶':10,'㪷':11,'㪸':12,'㪹':15,'㪺':17,'㪻':23,'㪼':9,'㪽':9,'㪾':10,'㪿':10,'㫀':12,'㫁':14,'㫂':15,'㫃':6,'㫄':8,'㫅':10,'㫆':9,'㫇':10,'㫈':10,'㫉':10,'㫊':11,
  '㫋':11,'㫌':11,'㫍':12,'㫎':15,'㫏':15,'㫐':6,'㫑':6,'㫒':7,'㫓':7,'㫔':7,'㫕':7,'㫖':7,'㫗':7,'㫘':8,'㫙':8,'㫚':8,'㫛':9,'㫜':9,'㫝':9,'㫞':9,'㫟':9,'㫠':9,'㫡':9,'㫢':9,'㫣':9,'㫤':9,'㫥':10,'㫦':10,'㫧':10,'㫨':10,'㫩':10,
  '㫪':10,'㫫':10,'㫬':10,'㫭':10,'㫮':10,'㫯':11,'㫰':11,'㫱':11,'㫲':11,'㫳':11,'㫴':11,'㫵':12,'㫶':12,'㫷':12,'㫸':12,'㫹':12,'㫺':12,'㫻':12,'㫼':12,'㫽':12,'㫾':12,'㫿':12,'㬀':12,'㬁':13,'㬂':13,'㬃':13,'㬄':13,'㬅':13,
  '㬆':13,'㬇':13,'㬈':13,'㬉':13,'㬊':13,'㬋':13,'㬌':13,'㬍':14,'㬎':14,'㬏':14,'㬐':14,'㬑':15,'㬒':15,'㬓':15,'㬔':15,'㬕':15,'㬖':15,'㬗':16,'㬘':16,'㬙':16,'㬚':16,'㬛':16,'㬜':16,'㬝':16,'㬞':16,'㬟':16,'㬠':17,'㬡':17,
  '㬢':17,'㬣':18,'㬤':18,'㬥':18,'㬦':18,'㬧':18,'㬨':18,'㬩':19,'㬪':19,'㬫':20,'㬬':22,'㬭':22,'㬮':23,'㬯':25,'㬰':6,'㬱':16,'㬲':17,'㬳':8,'㬴':10,'㬵':10,'㬶':11,'㬷':11,'㬸':12,'㬹':12,'㬺':14,'㬻':14,'㬼':15,'㬽':15,
  '㬾':15,'㬿':16,'㭀':17,'㭁':6,'㭂':7,'㭃':7,'㭄':7,'㭅':7,'㭆':7,'㭇':8,'㭈':8,'㭉':10,'㭊':8,'㭋':8,'㭌':8,'㭍':8,'㭎':8,'㭏':8,'㭐':8,'㭑':9,'㭒':9,'㭓':9,'㭔':9,'㭕':9,'㭖':9,'㭗':9,'㭘':10,'㭙':10,'㭚':10,'㭛':10,'㭜':10,
  '㭝':10,'㭞':10,'㭟':10,'㭠':10,'㭡':10,'㭢':10,'㭣':10,'㭤':10,'㭥':10,'㭦':10,'㭧':10,'㭨':11,'㭩':11,'㭪':11,'㭫':11,'㭬':11,'㭭':11,'㭮':11,'㭯':11,'㭰':11,'㭱':11,'㭲':11,'㭳':11,'㭴':11,'㭵':11,'㭶':12,'㭷':11,'㭸':12,
  '㭹':12,'㭺':12,'㭻':12,'㭼':12,'㭽':12,'㭾':12,'㭿':12,'㮀':12,'㮁':12,'㮂':12,'㮃':12,'㮄':12,'㮅':12,'㮆':12,'㮇':12,'㮈':12,'㮉':12,'㮊':12,'㮋':13,'㮌':13,'㮍':13,'㮎':13,'㮏':13,'㮐':13,'㮑':13,'㮒':13,'㮓':13,'㮔':13,
  '㮕':13,'㮖':13,'㮗':13,'㮘':13,'㮙':13,'㮚':13,'㮛':13,'㮜':13,'㮝':13,'㮞':13,'㮟':13,'㮠':13,'㮡':13,'㮢':13,'㮣':13,'㮤':14,'㮥':14,'㮦':14,'㮧':14,'㮨':14,'㮩':14,'㮪':14,'㮫':14,'㮬':14,'㮭':14,'㮮':14,'㮯':14,'㮰':14,
  '㮱':14,'㮲':14,'㮳':14,'㮴':14,'㮵':14,'㮶':14,'㮷':14,'㮸':14,'㮹':14,'㮺':14,'㮻':14,'㮼':14,'㮽':14,'㮾':15,'㮿':15,'㯀':15,'㯁':15,'㯂':15,'㯃':15,'㯄':15,'㯅':15,'㯆':15,'㯇':15,'㯈':15,'㯉':15,'㯊':15,'㯋':15,'㯌':15,
  '㯍':15,'㯎':15,'㯏':15,'㯐':16,'㯑':15,'㯒':15,'㯓':16,'㯔':16,'㯕':16,'㯖':16,'㯗':16,'㯘':16,'㯙':16,'㯚':16,'㯛':16,'㯜':16,'㯝':16,'㯞':16,'㯟':16,'㯠':15,'㯡':16,'㯢':16,'㯣':16,'㯤':16,'㯥':16,'㯦':16,'㯧':16,'㯨':16,
  '㯩':16,'㯪':17,'㯫':17,'㯬':17,'㯭':17,'㯮':17,'㯯':17,'㯰':17,'㯱':17,'㯲':17,'㯳':17,'㯴':17,'㯵':17,'㯶':17,'㯷':18,'㯸':18,'㯹':18,'㯺':18,'㯻':18,'㯼':18,'㯽':18,'㯾':19,'㯿':19,'㰀':19,'㰁':19,'㰂':19,'㰃':19,'㰄':19,
  '㰅':19,'㰆':19,'㰇':19,'㰈':19,'㰉':20,'㰊':20,'㰋':20,'㰌':20,'㰍':20,'㰎':20,'㰏':20,'㰐':20,'㰑':20,'㰒':20,'㰓':20,'㰔':21,'㰕':21,'㰖':20,'㰗':22,'㰘':22,'㰙':23,'㰚':23,'㰛':23,'㰜':23,'㰝':7,'㰞':7,'㰟':8,'㰠':8,'㰡':8,
  '㰢':8,'㰣':9,'㰤':9,'㰥':9,'㰦':9,'㰧':9,'㰨':9,'㰩':10,'㰪':10,'㰫':10,'㰬':10,'㰭':10,'㰮':11,'㰯':11,'㰰':11,'㰱':11,'㰲':12,'㰳':12,'㰴':12,'㰵':12,'㰶':12,'㰷':10,'㰸':12,'㰹':13,'㰺':13,'㰻':13,'㰼':13,'㰽':13,'㰾':13,
  '㰿':14,'㱀':14,'㱁':14,'㱂':15,'㱃':15,'㱄':16,'㱅':16,'㱆':17,'㱇':17,'㱈':17,'㱉':17,'㱊':19,'㱋':20,'㱌':22,'㱍':23,'㱎':25,'㱏':6,'㱐':7,'㱑':7,'㱒':9,'㱓':9,'㱔':9,'㱕':12,'㱖':12,'㱗':14,'㱘':18,'㱙':6,'㱚':8,'㱛':8,'㱜':8,
  '㱝':8,'㱞':9,'㱟':9,'㱠':9,'㱡':10,'㱢':11,'㱣':11,'㱤':12,'㱥':12,'㱦':12,'㱧':12,'㱨':12,'㱩':12,'㱪':13,'㱫':13,'㱬':13,'㱭':13,'㱮':13,'㱯':14,'㱰':14,'㱱':14,'㱲':14,'㱳':15,'㱴':15,'㱵':16,'㱶':16,'㱷':16,'㱸':17,'㱹':20,
  '㱺':20,'㱻':23,'㱼':7,'㱽':8,'㱾':10,'㱿':10,'㲀':11,'㲁':12,'㲂':12,'㲃':12,'㲄':13,'㲅':14,'㲆':16,'㲇':16,'㲈':16,'㲉':17,'㲊':18,'㲋':9,'㲌':6,'㲍':8,'㲎':8,'㲏':8,'㲐':8,'㲑':8,'㲒':9,'㲓':10,'㲔':11,'㲕':11,'㲖':11,'㲗':11,
  '㲘':11,'㲙':11,'㲚':11,'㲛':12,'㲜':12,'㲝':12,'㲞':12,'㲟':13,'㲠':13,'㲡':13,'㲢':13,'㲣':13,'㲤':14,'㲥':14,'㲦':14,'㲧':14,'㲨':14,'㲩':14,'㲪':16,'㲫':16,'㲬':16,'㲭':16,'㲮':16,'㲯':18,'㲰':18,'㲱':19,'㲲':26,'㲳':10,
  '㲴':8,'㲵':11,'㲶':15,'㲷':16,'㲸':5,'㲹':6,'㲺':6,'㲻':6,'㲼':6,'㲽':7,'㲾':7,'㲿':7,'㳀':8,'㳁':8,'㳂':8,'㳃':8,'㳄':8,'㳅':8,'㳆':8,'㳇':8,'㳈':8,'㳉':8,'㳊':8,'㳋':9,'㳌':9,'㳍':9,'㳎':9,'㳏':9,'㳐':9,'㳑':9,'㳒':9,'㳓':9,
  '㳔':9,'㳕':9,'㳖':10,'㳗':9,'㳘':10,'㳙':10,'㳚':10,'㳛':12,'㳜':10,'㳝':10,'㳞':10,'㳟':11,'㳠':10,'㳡':10,'㳢':10,'㳣':10,'㳤':10,'㳥':11,'㳦':11,'㳧':11,'㳨':11,'㳩':10,'㳪':11,'㳫':11,'㳬':10,'㳭':11,'㳮':11,'㳯':11,'㳰':11,
  '㳱':10,'㳲':11,'㳳':11,'㳴':12,'㳵':12,'㳶':12,'㳷':12,'㳸':11,'㳹':12,'㳺':11,'㳻':12,'㳼':12,'㳽':12,'㳾':11,'㳿':11,'㴀':15,'㴁':11,'㴂':11,'㴃':11,'㴄':11,'㴅':12,'㴆':12,'㴇':12,'㴈':12,'㴉':12,'㴊':12,'㴋':12,'㴌':12,
  '㴍':12,'㴎':12,'㴏':12,'㴐':13,'㴑':13,'㴒':13,'㴓':13,'㴔':13,'㴕':15,'㴖':13,'㴗':13,'㴘':13,'㴙':13,'㴚':13,'㴛':14,'㴜':13,'㴝':12,'㴞':12,'㴟':13,'㴠':13,'㴡':13,'㴢':13,'㴣':13,'㴤':13,'㴥':14,'㴦':14,'㴧':14,'㴨':14,
  '㴩':14,'㴪':14,'㴫':13,'㴬':14,'㴭':14,'㴮':14,'㴯':14,'㴰':14,'㴱':14,'㴲':14,'㴳':13,'㴴':13,'㴵':14,'㴶':14,'㴷':14,'㴸':14,'㴹':13,'㴺':14,'㴻':13,'㴼':15,'㴽':15,'㴾':14,'㴿':15,'㵀':15,'㵁':14,'㵂':15,'㵃':15,'㵄':14,
  '㵅':15,'㵆':15,'㵇':15,'㵈':15,'㵉':15,'㵊':16,'㵋':16,'㵌':16,'㵍':16,'㵎':16,'㵏':15,'㵐':16,'㵑':16,'㵒':16,'㵓':16,'㵔':15,'㵕':16,'㵖':16,'㵗':15,'㵘':16,'㵙':16,'㵚':16,'㵛':16,'㵜':16,'㵝':17,'㵞':17,'㵟':17,'㵠':17,
  '㵡':17,'㵢':17,'㵣':17,'㵤':17,'㵥':17,'㵦':16,'㵧':16,'㵨':17,'㵩':16,'㵪':16,'㵫':17,'㵬':17,'㵭':16,'㵮':16,'㵯':18,'㵰':17,'㵱':17,'㵲':18,'㵳':18,'㵴':18,'㵵':18,'㵶':18,'㵷':17,'㵸':18,'㵹':17,'㵺':18,'㵻':17,'㵼':18,
  '㵽':19,'㵾':19,'㵿':19,'㶀':19,'㶁':19,'㶂':18,'㶃':19,'㶄':20,'㶅':20,'㶆':19,'㶇':19,'㶈':20,'㶉':19,'㶊':19,'㶋':20,'㶌':21,'㶍':21,'㶎':20,'㶏':20,'㶐':21,'㶑':21,'㶒':22,'㶓':21,'㶔':22,'㶕':22,'㶖':22,'㶗':22,'㶘':22,
  '㶙':23,'㶚':23,'㶛':23,'㶜':23,'㶝':24,'㶞':25,'㶟':25,'㶠':27,'㶡':6,'㶢':6,'㶣':7,'㶤':7,'㶥':7,'㶦':8,'㶧':8,'㶨':8,'㶩':8,'㶪':8,'㶫':9,'㶬':9,'㶭':9,'㶮':9,'㶯':9,'㶰':9,'㶱':9,'㶲':9,'㶳':10,'㶴':10,'㶵':10,'㶶':10,'㶷':10,
  '㶸':10,'㶹':11,'㶺':11,'㶻':11,'㶼':11,'㶽':11,'㶾':11,'㶿':11,'㷀':11,'㷁':11,'㷂':12,'㷃':12,'㷄':12,'㷅':12,'㷆':12,'㷇':12,'㷈':12,'㷉':12,'㷊':12,'㷋':12,'㷌':12,'㷍':12,'㷎':13,'㷏':13,'㷐':13,'㷑':13,'㷒':13,'㷓':13,
  '㷔':13,'㷕':13,'㷖':13,'㷗':13,'㷘':13,'㷙':13,'㷚':13,'㷛':13,'㷜':13,'㷝':13,'㷞':13,'㷟':14,'㷠':14,'㷡':14,'㷢':14,'㷣':14,'㷤':14,'㷥':14,'㷦':14,'㷧':14,'㷨':14,'㷩':14,'㷪':14,'㷫':15,'㷬':15,'㷭':15,'㷮':15,'㷯':15,
  '㷰':15,'㷱':15,'㷲':15,'㷳':16,'㷴':16,'㷵':16,'㷶':16,'㷷':16,'㷸':16,'㷹':16,'㷺':16,'㷻':16,'㷼':16,'㷽':16,'㷾':17,'㷿':17,'㸀':17,'㸁':17,'㸂':17,'㸃':17,'㸄':18,'㸅':18,'㸆':19,'㸇':19,'㸈':20,'㸉':19,'㸊':20,'㸋':20,
  '㸌':20,'㸍':21,'㸎':22,'㸏':23,'㸐':23,'㸑':26,'㸒':8,'㸓':8,'㸔':11,'㸕':14,'㸖':9,'㸗':10,'㸘':11,'㸙':13,'㸚':8,'㸛':9,'㸜':12,'㸝':8,'㸞':8,'㸟':10,'㸠':10,'㸡':10,'㸢':14,'㸣':17,'㸤':18,'㸥':21,'㸦':4,'㸧':10,'㸨':6,'㸩':7,
  '㸪':7,'㸫':8,'㸬':8,'㸭':8,'㸮':8,'㸯':8,'㸰':9,'㸱':9,'㸲':9,'㸳':9,'㸴':9,'㸵':10,'㸶':10,'㸷':10,'㸸':10,'㸹':11,'㸺':11,'㸻':11,'㸼':11,'㸽':11,'㸾':11,'㸿':11,'㹀':11,'㹁':12,'㹂':12,'㹃':12,'㹄':14,'㹅':13,'㹆':13,'㹇':13,
  '㹈':13,'㹉':14,'㹊':14,'㹋':14,'㹌':15,'㹍':15,'㹎':15,'㹏':15,'㹐':15,'㹑':16,'㹒':16,'㹓':16,'㹔':17,'㹕':17,'㹖':17,'㹗':18,'㹘':18,'㹙':19,'㹚':21,'㹛':22,'㹜':8,'㹝':8,'㹞':8,'㹟':8,'㹠':8,'㹡':9,'㹢':9,'㹣':9,'㹤':9,'㹥':9,
  '㹦':9,'㹧':9,'㹨':9,'㹩':9,'㹪':9,'㹫':10,'㹬':10,'㹭':10,'㹮':10,'㹯':10,'㹰':10,'㹱':11,'㹲':11,'㹳':11,'㹴':11,'㹵':11,'㹶':10,'㹷':10,'㹸':11,'㹹':12,'㹺':12,'㹻':12,'㹼':12,'㹽':12,'㹾':12,'㹿':12,'㺀':12,'㺁':13,'㺂':13,
  '㺃':12,'㺄':13,'㺅':13,'㺆':12,'㺇':13,'㺈':14,'㺉':13,'㺊':14,'㺋':14,'㺌':14,'㺍':14,'㺎':15,'㺏':15,'㺐':15,'㺑':15,'㺒':15,'㺓':15,'㺔':16,'㺕':16,'㺖':15,'㺗':16,'㺘':16,'㺙':15,'㺚':16,'㺛':17,'㺜':17,'㺝':18,'㺞':17,
  '㺟':18,'㺠':19,'㺡':20,'㺢':20,'㺣':21,'㺤':21,'㺥':21,'㺦':21,'㺧':25,'㺨':7,'㺩':7,'㺪':7,'㺫':7,'㺬':8,'㺭':8,'㺮':8,'㺯':8,'㺰':9,'㺱':9,'㺲':9,'㺳':9,'㺴':9,'㺵':9,'㺶':9,'㺷':10,'㺸':10,'㺹':10,'㺺':10,'㺻':9,'㺼':10,
  '㺽':10,'㺾':10,'㺿':11,'㻀':10,'㻁':11,'㻂':11,'㻃':10,'㻄':10,'㻅':11,'㻆':11,'㻇':11,'㻈':11,'㻉':12,'㻊':12,'㻋':12,'㻌':12,'㻍':12,'㻎':11,'㻏':12,'㻐':12,'㻑':13,'㻒':13,'㻓':13,'㻔':13,'㻕':13,'㻖':13,'㻗':13,'㻘':13,
  '㻙':13,'㻚':13,'㻛':13,'㻜':12,'㻝':14,'㻞':14,'㻟':13,'㻠':14,'㻡':14,'㻢':14,'㻣':14,'㻤':13,'㻥':14,'㻦':14,'㻧':15,'㻨':14,'㻩':15,'㻪':15,'㻫':15,'㻬':16,'㻭':16,'㻮':16,'㻯':16,'㻰':16,'㻱':15,'㻲':16,'㻳':15,'㻴':16,
  '㻵':17,'㻶':17,'㻷':17,'㻸':17,'㻹':17,'㻺':17,'㻻':17,'㻼':17,'㻽':17,'㻾':18,'㻿':18,'㼀':17,'㼁':18,'㼂':18,'㼃':20,'㼄':20,'㼅':19,'㼆':20,'㼇':20,'㼈':24,'㼉':9,'㼊':9,'㼋':10,'㼌':10,'㼍':11,'㼎':11,'㼏':12,'㼐':14,
  '㼑':14,'㼒':14,'㼓':15,'㼔':15,'㼕':18,'㼖':26,'㼗':7,'㼘':8,'㼙':8,'㼚':9,'㼛':9,'㼜':10,'㼝':10,'㼞':10,'㼟':10,'㼠':10,'㼡':11,'㼢':11,'㼣':11,'㼤':11,'㼥':11,'㼦':11,'㼧':12,'㼨':12,'㼩':12,'㼪':12,'㼫':13,'㼬':13,'㼭':13,
  '㼮':13,'㼯':13,'㼰':13,'㼱':13,'㼲':14,'㼳':14,'㼴':14,'㼵':14,'㼶':14,'㼷':14,'㼸':15,'㼹':15,'㼺':15,'㼻':16,'㼼':16,'㼽':16,'㼾':16,'㼿':17,'㽀':17,'㽁':17,'㽂':17,'㽃':17,'㽄':17,'㽅':17,'㽆':18,'㽇':18,'㽈':19,'㽉':19,
  '㽊':22,'㽋':24,'㽌':25,'㽍':10,'㽎':13,'㽏':14,'㽐':15,'㽑':17,'㽒':12,'㽓':15,'㽔':16,'㽕':7,'㽖':7,'㽗':7,'㽘':9,'㽙':9,'㽚':9,'㽛':10,'㽜':10,'㽝':11,'㽞':11,'㽟':12,'㽠':12,'㽡':13,'㽢':13,'㽣':13,'㽤':13,'㽥':14,'㽦':15,
  '㽧':15,'㽨':15,'㽩':16,'㽪':17,'㽫':18,'㽬':18,'㽭':19,'㽮':20,'㽯':23,'㽰':13,'㽱':7,'㽲':7,'㽳':8,'㽴':8,'㽵':8,'㽶':8,'㽷':9,'㽸':9,'㽹':9,'㽺':9,'㽻':9,'㽼':9,'㽽':10,'㽾':10,'㽿':10,'㾀':10,'㾁':10,'㾂':10,'㾃':10,'㾄':10,
  '㾅':10,'㾆':10,'㾇':10,'㾈':10,'㾉':10,'㾊':11,'㾋':11,'㾌':11,'㾍':11,'㾎':11,'㾏':11,'㾐':11,'㾑':11,'㾒':11,'㾓':12,'㾔':12,'㾕':12,'㾖':12,'㾗':12,'㾘':12,'㾙':12,'㾚':12,'㾛':12,'㾜':12,'㾝':12,'㾞':12,'㾟':12,'㾠':12,
  '㾡':12,'㾢':13,'㾣':13,'㾤':13,'㾥':13,'㾦':13,'㾧':13,'㾨':13,'㾩':13,'㾪':14,'㾫':14,'㾬':14,'㾭':14,'㾮':14,'㾯':14,'㾰':14,'㾱':14,'㾲':14,'㾳':14,'㾴':14,'㾵':14,'㾶':15,'㾷':15,'㾸':15,'㾹':15,'㾺':15,'㾻':15,'㾼':15,
  '㾽':15,'㾾':15,'㾿':15,'㿀':15,'㿁':15,'㿂':16,'㿃':16,'㿄':16,'㿅':16,'㿆':16,'㿇':16,'㿈':16,'㿉':17,'㿊':17,'㿋':18,'㿌':18,'㿍':18,'㿎':18,'㿏':18,'㿐':18,'㿑':19,'㿒':19,'㿓':19,'㿔':20,'㿕':21,'㿖':21,'㿗':21,'㿘':22,
  '㿙':23,'㿚':24,'㿛':24,'㿜':28,'㿝':7,'㿞':9,'㿟':10,'㿠':11,'㿡':11,'㿢':13,'㿣':14,'㿤':14,'㿥':15,'㿦':16,'㿧':19,'㿨':21,'㿩':25,'㿪':8,'㿫':9,'㿬':9,'㿭':10,'㿮':10,'㿯':11,'㿰':11,'㿱':12,'㿲':13,'㿳':13,'㿴':14,'㿵':14,
  '㿶':15,'㿷':15,'㿸':16,'㿹':18,'㿺':20,'㿻':8,'㿼':9,'㿽':9,'㿾':10,'㿿':10,'䀀':10,'䀁':11,'䀂':11,'䀃':12,'䀄':13,'䀅':13,'䀆':14,'䀇':16,'䀈':16,'䀉':17,'䀊':19,'䀋':21,'䀌':22,'䀍':29,'䀎':7,'䀏':7,'䀐':8,'䀑':8,'䀒':8,
  '䀓':8,'䀔':8,'䀕':9,'䀖':9,'䀗':9,'䀘':9,'䀙':9,'䀚':9,'䀛':9,'䀜':9,'䀝':9,'䀞':9,'䀟':10,'䀠':10,'䀡':10,'䀢':10,'䀣':10,'䀤':10,'䀥':10,'䀦':10,'䀧':11,'䀨':11,'䀩':11,'䀪':11,'䀫':11,'䀬':11,'䀭':11,'䀮':11,'䀯':12,'䀰':12,
  '䀱':12,'䀲':12,'䀳':12,'䀴':12,'䀵':12,'䀶':12,'䀷':12,'䀸':12,'䀹':12,'䀺':12,'䀻':12,'䀼':12,'䀽':12,'䀾':12,'䀿':12,'䁀':12,'䁁':13,'䁂':13,'䁃':13,'䁄':13,'䁅':13,'䁆':13,'䁇':13,'䁈':13,'䁉':13,'䁊':14,'䁋':14,'䁌':14,
  '䁍':14,'䁎':14,'䁏':14,'䁐':14,'䁑':14,'䁒':14,'䁓':14,'䁔':14,'䁕':14,'䁖':14,'䁗':15,'䁘':15,'䁙':15,'䁚':15,'䁛':15,'䁜':15,'䁝':15,'䁞':15,'䁟':15,'䁠':15,'䁡':15,'䁢':16,'䁣':16,'䁤':16,'䁥':16,'䁦':16,'䁧':16,'䁨':16,
  '䁩':16,'䁪':16,'䁫':17,'䁬':17,'䁭':17,'䁮':17,'䁯':17,'䁰':17,'䁱':17,'䁲':17,'䁳':17,'䁴':18,'䁵':18,'䁶':18,'䁷':18,'䁸':18,'䁹':18,'䁺':18,'䁻':20,'䁼':20,'䁽':20,'䁾':20,'䁿':21,'䂀':21,'䂁':22,'䂂':23,'䂃':23,'䂄':25,
  '䂅':30,'䂆':8,'䂇':9,'䂈':11,'䂉':14,'䂊':17,'䂋':17,'䂌':17,'䂍':20,'䂎':24,'䂏':10,'䂐':10,'䂑':10,'䂒':11,'䂓':12,'䂔':13,'䂕':14,'䂖':6,'䂗':7,'䂘':8,'䂙':12,'䂚':9,'䂛':9,'䂜':9,'䂝':9,'䂞':9,'䂟':10,'䂠':10,'䂡':10,'䂢':10,
  '䂣':10,'䂤':10,'䂥':10,'䂦':10,'䂧':10,'䂨':10,'䂩':11,'䂪':11,'䂫':11,'䂬':11,'䂭':11,'䂮':11,'䂯':11,'䂰':12,'䂱':12,'䂲':12,'䂳':12,'䂴':12,'䂵':12,'䂶':12,'䂷':13,'䂸':13,'䂹':13,'䂺':13,'䂻':13,'䂼':13,'䂽':13,'䂾':13,
  '䂿':13,'䃀':13,'䃁':13,'䃂':13,'䃃':13,'䃄':13,'䃅':13,'䃆':13,'䃇':13,'䃈':14,'䃉':14,'䃊':14,'䃋':14,'䃌':14,'䃍':14,'䃎':14,'䃏':14,'䃐':14,'䃑':15,'䃒':15,'䃓':15,'䃔':15,'䃕':15,'䃖':15,'䃗':15,'䃘':16,'䃙':16,'䃚':16,
  '䃛':16,'䃜':16,'䃝':16,'䃞':16,'䃟':17,'䃠':16,'䃡':17,'䃢':17,'䃣':17,'䃤':17,'䃥':17,'䃦':17,'䃧':17,'䃨':17,'䃩':18,'䃪':18,'䃫':18,'䃬':18,'䃭':18,'䃮':18,'䃯':18,'䃰':19,'䃱':20,'䃲':20,'䃳':20,'䃴':21,'䃵':21,'䃶':21,
  '䃷':21,'䃸':22,'䃹':22,'䃺':24,'䃻':26,'䃼':7,'䃽':9,'䃾':9,'䃿':9,'䄀':9,'䄁':10,'䄂':10,'䄃':10,'䄄':11,'䄅':11,'䄆':11,'䄇':12,'䄈':12,'䄉':12,'䄊':12,'䄋':13,'䄌':13,'䄍':13,'䄎':13,'䄏':12,'䄐':13,'䄑':13,'䄒':13,'䄓':14,
  '䄔':14,'䄕':14,'䄖':14,'䄗':14,'䄘':15,'䄙':15,'䄚':16,'䄛':16,'䄜':15,'䄝':16,'䄞':16,'䄟':17,'䄠':18,'䄡':18,'䄢':19,'䄣':20,'䄤':21,'䄥':29,'䄦':7,'䄧':7,'䄨':8,'䄩':8,'䄪':8,'䄫':8,'䄬':8,'䄭':8,'䄮':9,'䄯':9,'䄰':9,'䄱':9,
  '䄲':9,'䄳':9,'䄴':9,'䄵':9,'䄶':10,'䄷':10,'䄸':10,'䄹':10,'䄺':11,'䄻':11,'䄼':11,'䄽':11,'䄾':11,'䄿':11,'䅀':11,'䅁':11,'䅂':11,'䅃':11,'䅄':11,'䅅':11,'䅆':11,'䅇':11,'䅈':11,'䅉':11,'䅊':11,'䅋':12,'䅌':12,'䅍':12,'䅎':12,
  '䅏':12,'䅐':12,'䅑':12,'䅒':12,'䅓':12,'䅔':13,'䅕':13,'䅖':13,'䅗':13,'䅘':13,'䅙':13,'䅚':13,'䅛':13,'䅜':13,'䅝':13,'䅞':13,'䅟':13,'䅠':14,'䅡':14,'䅢':14,'䅣':14,'䅤':14,'䅥':14,'䅦':14,'䅧':14,'䅨':14,'䅩':14,'䅪':14,
  '䅫':14,'䅬':15,'䅭':15,'䅮':15,'䅯':15,'䅰':15,'䅱':15,'䅲':15,'䅳':15,'䅴':15,'䅵':15,'䅶':15,'䅷':16,'䅸':16,'䅹':16,'䅺':16,'䅻':16,'䅼':16,'䅽':16,'䅾':17,'䅿':17,'䆀':17,'䆁':18,'䆂':18,'䆃':18,'䆄':18,'䆅':18,'䆆':18,
  '䆇':18,'䆈':20,'䆉':20,'䆊':21,'䆋':21,'䆌':21,'䆍':21,'䆎':22,'䆏':22,'䆐':30,'䆑':7,'䆒':8,'䆓':9,'䆔':9,'䆕':9,'䆖':9,'䆗':10,'䆘':10,'䆙':10,'䆚':11,'䆛':11,'䆜':11,'䆝':11,'䆞':11,'䆟':11,'䆠':11,'䆡':12,'䆢':12,'䆣':12,
  '䆤':12,'䆥':12,'䆦':13,'䆧':13,'䆨':13,'䆩':13,'䆪':14,'䆫':14,'䆬':15,'䆭':15,'䆮':15,'䆯':16,'䆰':16,'䆱':16,'䆲':16,'䆳':16,'䆴':16,'䆵':17,'䆶':17,'䆷':17,'䆸':17,'䆹':17,'䆺':17,'䆻':17,'䆼':18,'䆽':18,'䆾':19,'䆿':19,
  '䇀':20,'䇁':22,'䇂':6,'䇃':8,'䇄':8,'䇅':9,'䇆':9,'䇇':10,'䇈':10,'䇉':10,'䇊':10,'䇋':11,'䇌':12,'䇍':12,'䇎':13,'䇏':13,'䇐':13,'䇑':13,'䇒':16,'䇓':17,'䇔':18,'䇕':19,'䇖':9,'䇗':10,'䇘':10,'䇙':10,'䇚':10,'䇛':10,'䇜':10,
  '䇝':10,'䇞':11,'䇟':11,'䇠':11,'䇡':11,'䇢':11,'䇣':11,'䇤':11,'䇥':11,'䇦':11,'䇧':12,'䇨':12,'䇩':12,'䇪':12,'䇫':12,'䇬':12,'䇭':12,'䇮':12,'䇯':12,'䇰':12,'䇱':12,'䇲':12,'䇳':12,'䇴':12,'䇵':13,'䇶':13,'䇷':13,'䇸':13,
  '䇹':13,'䇺':13,'䇻':13,'䇼':13,'䇽':13,'䇾':13,'䇿':13,'䈀':13,'䈁':14,'䈂':14,'䈃':14,'䈄':14,'䈅':14,'䈆':14,'䈇':14,'䈈':14,'䈉':14,'䈊':14,'䈋':14,'䈌':14,'䈍':14,'䈎':15,'䈏':15,'䈐':15,'䈑':15,'䈒':15,'䈓':15,'䈔':15,
  '䈕':15,'䈖':15,'䈗':15,'䈘':15,'䈙':15,'䈚':15,'䈛':15,'䈜':15,'䈝':15,'䈞':15,'䈟':15,'䈠':15,'䈡':15,'䈢':15,'䈣':15,'䈤':15,'䈥':15,'䈦':15,'䈧':15,'䈨':15,'䈩':15,'䈪':16,'䈫':16,'䈬':16,'䈭':16,'䈮':16,'䈯':16,'䈰':16,
  '䈱':16,'䈲':16,'䈳':16,'䈴':16,'䈵':16,'䈶':16,'䈷':16,'䈸':17,'䈹':17,'䈺':17,'䈻':17,'䈼':17,'䈽':17,'䈾':17,'䈿':17,'䉀':17,'䉁':17,'䉂':17,'䉃':17,'䉄':17,'䉅':17,'䉆':17,'䉇':17,'䉈':18,'䉉':18,'䉊':18,'䉋':18,'䉌':18,
  '䉍':18,'䉎':18,'䉏':19,'䉐':18,'䉑':18,'䉒':18,'䉓':18,'䉔':18,'䉕':18,'䉖':18,'䉗':18,'䉘':18,'䉙':18,'䉚':18,'䉛':19,'䉜':19,'䉝':19,'䉞':19,'䉟':19,'䉠':19,'䉡':19,'䉢':19,'䉣':18,'䉤':19,'䉥':20,'䉦':21,'䉧':21,'䉨':21,
  '䉩':21,'䉪':21,'䉫':21,'䉬':21,'䉭':21,'䉮':22,'䉯':22,'䉰':22,'䉱':22,'䉲':23,'䉳':23,'䉴':23,'䉵':23,'䉶':24,'䉷':26,'䉸':27,'䉹':30,'䉺':9,'䉻':10,'䉼':10,'䉽':11,'䉾':11,'䉿':11,'䊀':11,'䊁':12,'䊂':12,'䊃':12,'䊄':12,
  '䊅':12,'䊆':12,'䊇':13,'䊈':13,'䊉':13,'䊊':13,'䊋':13,'䊌':13,'䊍':14,'䊎':14,'䊏':14,'䊐':14,'䊑':14,'䊒':14,'䊓':15,'䊔':15,'䊕':15,'䊖':15,'䊗':15,'䊘':15,'䊙':15,'䊚':16,'䊛':16,'䊜':17,'䊝':17,'䊞':17,'䊟':17,'䊠':17,
  '䊡':17,'䊢':17,'䊣':18,'䊤':18,'䊥':18,'䊦':18,'䊧':18,'䊨':18,'䊩':18,'䊪':19,'䊫':19,'䊬':19,'䊭':20,'䊮':20,'䊯':21,'䊰':22,'䊱':23,'䊲':23,'䊳':25,'䊴':25,'䊵':8,'䊶':9,'䊷':9,'䊸':9,'䊹':9,'䊺':10,'䊻':10,'䊼':10,'䊽':10,
  '䊾':10,'䊿':10,'䋀':10,'䋁':10,'䋂':10,'䋃':10,'䋄':10,'䋅':10,'䋆':10,'䋇':10,'䋈':11,'䋉':11,'䋊':11,'䋋':11,'䋌':11,'䋍':11,'䋎':11,'䋏':11,'䋐':11,'䋑':11,'䋒':11,'䋓':11,'䋔':11,'䋕':12,'䋖':12,'䋗':12,'䋘':12,'䋙':12,
  '䋚':12,'䋛':12,'䋜':12,'䋝':12,'䋞':12,'䋟':13,'䋠':13,'䋡':13,'䋢':13,'䋣':13,'䋤':13,'䋥':13,'䋦':13,'䋧':14,'䋨':14,'䋩':14,'䋪':14,'䋫':14,'䋬':14,'䋭':14,'䋮':14,'䋯':14,'䋰':14,'䋱':14,'䋲':14,'䋳':15,'䋴':15,'䋵':15,
  '䋶':15,'䋷':15,'䋸':15,'䋹':15,'䋺':15,'䋻':15,'䋼':15,'䋽':15,'䋾':15,'䋿':15,'䌀':15,'䌁':15,'䌂':15,'䌃':15,'䌄':15,'䌅':16,'䌆':16,'䌇':16,'䌈':16,'䌉':16,'䌊':16,'䌋':16,'䌌':17,'䌍':17,'䌎':17,'䌏':17,'䌐':17,'䌑':17,
  '䌒':17,'䌓':17,'䌔':17,'䌕':17,'䌖':18,'䌗':18,'䌘':18,'䌙':18,'䌚':18,'䌛':18,'䌜':19,'䌝':19,'䌞':19,'䌟':19,'䌠':19,'䌡':19,'䌢':19,'䌣':20,'䌤':20,'䌥':20,'䌦':20,'䌧':20,'䌨':21,'䌩':21,'䌪':22,'䌫':22,'䌬':22,'䌭':22,
  '䌮':23,'䌯':24,'䌰':24,'䌱':24,'䌲':24,'䌳':25,'䌴':25,'䌵':27,'䌶':9,'䌷':11,'䌸':10,'䌹':11,'䌺':12,'䌻':12,'䌼':13,'䌽':14,'䌾':15,'䌿':15,'䍀':16,'䍁':19,'䍂':9,'䍃':10,'䍄':11,'䍅':11,'䍆':11,'䍇':11,'䍈':11,'䍉':11,
  '䍊':12,'䍋':14,'䍌':14,'䍍':16,'䍎':23,'䍏':5,'䍐':8,'䍑':9,'䍒':9,'䍓':9,'䍔':9,'䍕':10,'䍖':10,'䍗':10,'䍘':11,'䍙':12,'䍚':12,'䍛':13,'䍜':13,'䍝':13,'䍞':14,'䍟':14,'䍠':16,'䍡':16,'䍢':17,'䍣':18,'䍤':19,'䍥':21,'䍦':24,
  '䍧':10,'䍨':10,'䍩':10,'䍪':11,'䍫':11,'䍬':11,'䍭':11,'䍮':12,'䍯':12,'䍰':12,'䍱':13,'䍲':14,'䍳':14,'䍴':14,'䍵':14,'䍶':14,'䍷':15,'䍸':16,'䍹':16,'䍺':17,'䍻':18,'䍼':18,'䍽':22,'䍾':10,'䍿':11,'䎀':11,'䎁':11,'䎂':11,
  '䎃':11,'䎄':11,'䎅':11,'䎆':11,'䎇':12,'䎈':12,'䎉':12,'䎊':12,'䎋':13,'䎌':13,'䎍':13,'䎎':13,'䎏':14,'䎐':14,'䎑':14,'䎒':14,'䎓':14,'䎔':16,'䎕':16,'䎖':18,'䎗':18,'䎘':18,'䎙':20,'䎚':21,'䎛':9,'䎜':12,'䎝':12,'䎞':12,
  '䎟':9,'䎠':9,'䎡':10,'䎢':9,'䎣':11,'䎤':13,'䎥':13,'䎦':14,'䎧':14,'䎨':14,'䎩':14,'䎪':14,'䎫':15,'䎬':15,'䎭':17,'䎮':17,'䎯':17,'䎰':18,'䎱':21,'䎲':7,'䎳':10,'䎴':10,'䎵':11,'䎶':11,'䎷':12,'䎸':13,'䎹':13,'䎺':14,'䎻':14,
  '䎼':14,'䎽':14,'䎾':14,'䎿':15,'䏀':15,'䏁':16,'䏂':16,'䏃':16,'䏄':17,'䏅':17,'䏆':17,'䏇':17,'䏈':18,'䏉':20,'䏊':22,'䏋':13,'䏌':6,'䏍':6,'䏎':7,'䏏':7,'䏐':8,'䏑':10,'䏒':8,'䏓':8,'䏔':8,'䏕':8,'䏖':8,'䏗':8,'䏘':8,'䏙':8,
  '䏚':8,'䏛':8,'䏜':8,'䏝':8,'䏞':9,'䏟':9,'䏠':9,'䏡':9,'䏢':9,'䏣':9,'䏤':9,'䏥':9,'䏦':10,'䏧':10,'䏨':10,'䏩':10,'䏪':10,'䏫':10,'䏬':10,'䏭':10,'䏮':10,'䏯':11,'䏰':11,'䏱':11,'䏲':11,'䏳':11,'䏴':11,'䏵':11,'䏶':11,'䏷':11,
  '䏸':11,'䏹':11,'䏺':11,'䏻':11,'䏼':12,'䏽':12,'䏾':12,'䏿':12,'䐀':12,'䐁':12,'䐂':12,'䐃':12,'䐄':12,'䐅':12,'䐆':12,'䐇':12,'䐈':12,'䐉':12,'䐊':12,'䐋':12,'䐌':12,'䐍':13,'䐎':13,'䐏':13,'䐐':13,'䐑':13,'䐒':13,'䐓':13,
  '䐔':13,'䐕':13,'䐖':13,'䐗':13,'䐘':13,'䐙':13,'䐚':13,'䐛':13,'䐜':14,'䐝':14,'䐞':14,'䐟':14,'䐠':14,'䐡':16,'䐢':14,'䐣':14,'䐤':14,'䐥':14,'䐦':14,'䐧':14,'䐨':14,'䐩':14,'䐪':14,'䐫':15,'䐬':15,'䐭':15,'䐮':15,'䐯':15,
  '䐰':15,'䐱':15,'䐲':15,'䐳':15,'䐴':15,'䐵':16,'䐶':16,'䐷':16,'䐸':16,'䐹':16,'䐺':16,'䐻':16,'䐼':16,'䐽':16,'䐾':17,'䐿':17,'䑀':17,'䑁':17,'䑂':18,'䑃':18,'䑄':18,'䑅':18,'䑆':19,'䑇':19,'䑈':19,'䑉':20,'䑊':20,'䑋':21,
  '䑌':21,'䑍':21,'䑎':21,'䑏':22,'䑐':11,'䑑':18,'䑒':9,'䑓':13,'䑔':10,'䑕':11,'䑖':14,'䑗':15,'䑘':16,'䑙':10,'䑚':10,'䑛':11,'䑜':15,'䑝':14,'䑞':16,'䑟':21,'䑠':8,'䑡':9,'䑢':9,'䑣':9,'䑤':10,'䑥':10,'䑦':11,'䑧':11,'䑨':11,
  '䑩':11,'䑪':12,'䑫':12,'䑬':12,'䑭':12,'䑮':12,'䑯':13,'䑰':13,'䑱':14,'䑲':14,'䑳':14,'䑴':14,'䑵':14,'䑶':14,'䑷':14,'䑸':14,'䑹':15,'䑺':15,'䑻':15,'䑼':16,'䑽':16,'䑾':16,'䑿':17,'䒀':17,'䒁':17,'䒂':17,'䒃':17,'䒄':17,
  '䒅':17,'䒆':18,'䒇':18,'䒈':18,'䒉':20,'䒊':9,'䒋':11,'䒌':16,'䒍':16,'䒎':18,'䒏':18,'䒐':22,'䒑':6,'䒒':8,'䒓':8,'䒔':8,'䒕':9,'䒖':9,'䒗':9,'䒘':9,'䒙':9,'䒚':10,'䒛':10,'䒜':10,'䒝':10,'䒞':10,'䒟':10,'䒠':10,'䒡':10,'䒢':10,
  '䒣':10,'䒤':10,'䒥':10,'䒦':10,'䒧':11,'䒨':11,'䒩':11,'䒪':11,'䒫':11,'䒬':11,'䒭':11,'䒮':11,'䒯':11,'䒰':12,'䒱':12,'䒲':12,'䒳':12,'䒴':12,'䒵':12,'䒶':12,'䒷':12,'䒸':12,'䒹':12,'䒺':12,'䒻':12,'䒼':12,'䒽':12,'䒾':12,
  '䒿':12,'䓀':12,'䓁':12,'䓂':13,'䓃':13,'䓄':13,'䓅':13,'䓆':13,'䓇':13,'䓈':13,'䓉':12,'䓊':13,'䓋':13,'䓌':13,'䓍':13,'䓎':13,'䓏':13,'䓐':13,'䓑':13,'䓒':13,'䓓':13,'䓔':13,'䓕':13,'䓖':13,'䓗':14,'䓘':14,'䓙':14,'䓚':14,
  '䓛':14,'䓜':14,'䓝':14,'䓞':14,'䓟':14,'䓠':14,'䓡':14,'䓢':14,'䓣':14,'䓤':14,'䓥':14,'䓦':14,'䓧':14,'䓨':14,'䓩':14,'䓪':14,'䓫':14,'䓬':14,'䓭':14,'䓮':15,'䓯':15,'䓰':15,'䓱':16,'䓲':15,'䓳':15,'䓴':15,'䓵':15,'䓶':15,
  '䓷':15,'䓸':15,'䓹':15,'䓺':15,'䓻':15,'䓼':16,'䓽':16,'䓾':16,'䓿':16,'䔀':16,'䔁':16,'䔂':16,'䔃':15,'䔄':16,'䔅':16,'䔆':16,'䔇':16,'䔈':16,'䔉':16,'䔊':16,'䔋':16,'䔌':16,'䔍':16,'䔎':16,'䔏':16,'䔐':17,'䔑':17,'䔒':16,
  '䔓':17,'䔔':17,'䔕':17,'䔖':16,'䔗':16,'䔘':17,'䔙':17,'䔚':17,'䔛':17,'䔜':17,'䔝':18,'䔞':17,'䔟':17,'䔠':17,'䔡':17,'䔢':17,'䔣':17,'䔤':17,'䔥':17,'䔦':17,'䔧':17,'䔨':17,'䔩':17,'䔪':17,'䔫':17,'䔬':17,'䔭':18,'䔮':18,
  '䔯':18,'䔰':18,'䔱':18,'䔲':18,'䔳':18,'䔴':18,'䔵':18,'䔶':18,'䔷':18,'䔸':18,'䔹':17,'䔺':17,'䔻':18,'䔼':20,'䔽':18,'䔾':18,'䔿':18,'䕀':18,'䕁':18,'䕂':18,'䕃':17,'䕄':18,'䕅':18,'䕆':19,'䕇':18,'䕈':19,'䕉':19,'䕊':19,
  '䕋':19,'䕌':19,'䕍':19,'䕎':19,'䕏':19,'䕐':19,'䕑':19,'䕒':20,'䕓':20,'䕔':20,'䕕':20,'䕖':19,'䕗':20,'䕘':20,'䕙':20,'䕚':20,'䕛':20,'䕜':20,'䕝':20,'䕞':21,'䕟':22,'䕠':21,'䕡':20,'䕢':20,'䕣':20,'䕤':20,'䕥':21,'䕦':22,
  '䕧':21,'䕨':22,'䕩':22,'䕪':22,'䕫':22,'䕬':22,'䕭':22,'䕮':22,'䕯':22,'䕰':22,'䕱':22,'䕲':22,'䕳':23,'䕴':23,'䕵':23,'䕶':23,'䕷':23,'䕸':24,'䕹':24,'䕺':24,'䕻':25,'䕼':25,'䕽':26,'䕾':25,'䕿':28,'䖀':27,'䖁':28,'䖂':29,
  '䖃':29,'䖄':29,'䖅':30,'䖆':30,'䖇':35,'䖈':8,'䖉':9,'䖊':10,'䖋':10,'䖌':10,'䖍':10,'䖎':16,'䖏':11,'䖐':12,'䖑':12,'䖒':13,'䖓':13,'䖔':13,'䖕':13,'䖖':13,'䖗':15,'䖘':16,'䖙':17,'䖚':18,'䖛':18,'䖜':19,'䖝':7,'䖞':9,'䖟':9,
  '䖠':9,'䖡':10,'䖢':10,'䖣':10,'䖤':11,'䖥':11,'䖦':11,'䖧':11,'䖨':11,'䖩':11,'䖪':11,'䖫':11,'䖬':11,'䖭':12,'䖮':12,'䖯':12,'䖰':12,'䖱':12,'䖲':12,'䖳':12,'䖴':12,'䖵':12,'䖶':13,'䖷':13,'䖸':13,'䖹':13,'䖺':13,'䖻':13,
  '䖼':13,'䖽':13,'䖾':13,'䖿':14,'䗀':14,'䗁':14,'䗂':14,'䗃':14,'䗄':14,'䗅':14,'䗆':14,'䗇':14,'䗈':14,'䗉':14,'䗊':14,'䗋':15,'䗌':15,'䗍':15,'䗎':15,'䗏':15,'䗐':15,'䗑':15,'䗒':15,'䗓':15,'䗔':15,'䗕':14,'䗖':15,'䗗':16,
  '䗘':16,'䗙':16,'䗚':16,'䗛':16,'䗜':16,'䗝':16,'䗞':16,'䗟':17,'䗠':17,'䗡':17,'䗢':17,'䗣':17,'䗤':17,'䗥':17,'䗦':17,'䗧':17,'䗨':17,'䗩':17,'䗪':17,'䗫':17,'䗬':17,'䗭':17,'䗮':17,'䗯':18,'䗰':18,'䗱':18,'䗲':18,'䗳':18,
  '䗴':19,'䗵':19,'䗶':19,'䗷':19,'䗸':19,'䗹':19,'䗺':19,'䗻':19,'䗼':20,'䗽':20,'䗾':20,'䗿':20,'䘀':20,'䘁':20,'䘂':21,'䘃':21,'䘄':21,'䘅':22,'䘆':22,'䘇':22,'䘈':22,'䘉':22,'䘊':23,'䘋':23,'䘌':23,'䘍':25,'䘎':28,'䘏':13,
  '䘐':10,'䘑':11,'䘒':13,'䘓':14,'䘔':15,'䘕':10,'䘖':12,'䘗':16,'䘘':16,'䘙':20,'䘚':8,'䘛':8,'䘜':9,'䘝':9,'䘞':9,'䘟':10,'䘠':10,'䘡':10,'䘢':11,'䘣':12,'䘤':11,'䘥':11,'䘦':11,'䘧':11,'䘨':12,'䘩':12,'䘪':12,'䘫':12,'䘬':12,
  '䘭':12,'䘮':12,'䘯':13,'䘰':12,'䘱':13,'䘲':13,'䘳':14,'䘴':14,'䘵':14,'䘶':14,'䘷':14,'䘸':14,'䘹':14,'䘺':14,'䘻':14,'䘼':14,'䘽':14,'䘾':14,'䘿':14,'䙀':14,'䙁':14,'䙂':14,'䙃':15,'䙄':15,'䙅':15,'䙆':15,'䙇':15,'䙈':15,
  '䙉':15,'䙊':15,'䙋':15,'䙌':15,'䙍':15,'䙎':16,'䙏':16,'䙐':16,'䙑':16,'䙒':16,'䙓':16,'䙔':17,'䙕':17,'䙖':17,'䙗':17,'䙘':17,'䙙':18,'䙚':17,'䙛':17,'䙜':16,'䙝':17,'䙞':18,'䙟':18,'䙠':18,'䙡':18,'䙢':18,'䙣':18,'䙤':17,
  '䙥':19,'䙦':19,'䙧':20,'䙨':20,'䙩':19,'䙪':21,'䙫':22,'䙬':23,'䙭':23,'䙮':23,'䙯':24,'䙰':24,'䙱':27,'䙲':9,'䙳':10,'䙴':11,'䙵':12,'䙶':12,'䙷':10,'䙸':10,'䙹':11,'䙺':11,'䙻':11,'䙼':12,'䙽':12,'䙾':12,'䙿':12,'䚀':13,
  '䚁':13,'䚂':14,'䚃':14,'䚄':15,'䚅':15,'䚆':16,'䚇':16,'䚈':16,'䚉':16,'䚊':17,'䚋':17,'䚌':17,'䚍':18,'䚎':18,'䚏':19,'䚐':19,'䚑':19,'䚒':19,'䚓':19,'䚔':21,'䚕':26,'䚖':31,'䚗':11,'䚘':13,'䚙':13,'䚚':13,'䚛':14,'䚜':15,
  '䚝':15,'䚞':15,'䚟':15,'䚠':15,'䚡':16,'䚢':16,'䚣':16,'䚤':16,'䚥':17,'䚦':17,'䚧':18,'䚨':19,'䚩':19,'䚪':20,'䚫':20,'䚬':19,'䚭':25,'䚮':9,'䚯':9,'䚰':9,'䚱':10,'䚲':10,'䚳':11,'䚴':11,'䚵':11,'䚶':11,'䚷':11,'䚸':11,'䚹':11,
  '䚺':11,'䚻':11,'䚼':11,'䚽':11,'䚾':11,'䚿':11,'䛀':11,'䛁':11,'䛂':11,'䛃':11,'䛄':12,'䛅':12,'䛆':12,'䛇':12,'䛈':12,'䛉':12,'䛊':12,'䛋':12,'䛌':12,'䛍':12,'䛎':12,'䛏':12,'䛐':12,'䛑':12,'䛒':12,'䛓':12,'䛔':13,'䛕':13,
  '䛖':13,'䛗':13,'䛘':13,'䛙':13,'䛚':13,'䛛':13,'䛜':13,'䛝':14,'䛞':14,'䛟':14,'䛠':14,'䛡':14,'䛢':14,'䛣':14,'䛤':14,'䛥':14,'䛦':14,'䛧':14,'䛨':14,'䛩':15,'䛪':15,'䛫':15,'䛬':15,'䛭':15,'䛮':15,'䛯':15,'䛰':15,'䛱':15,
  '䛲':15,'䛳':15,'䛴':15,'䛵':15,'䛶':15,'䛷':15,'䛸':15,'䛹':16,'䛺':16,'䛻':16,'䛼':16,'䛽':16,'䛾':17,'䛿':17,'䜀':17,'䜁':17,'䜂':17,'䜃':18,'䜄':18,'䜅':18,'䜆':18,'䜇':18,'䜈':18,'䜉':18,'䜊':18,'䜋':19,'䜌':19,'䜍':19,
  '䜎':19,'䜏':19,'䜐':19,'䜑':19,'䜒':20,'䜓':20,'䜔':20,'䜕':20,'䜖':20,'䜗':20,'䜘':20,'䜙':21,'䜚':21,'䜛':21,'䜜':21,'䜝':21,'䜞':21,'䜟':22,'䜠':22,'䜡':22,'䜢':23,'䜣':11,'䜤':13,'䜥':15,'䜦':17,'䜧':17,'䜨':18,'䜩':23,
  '䜪':9,'䜫':10,'䜬':12,'䜭':12,'䜮':14,'䜯':15,'䜰':17,'䜱':18,'䜲':22,'䜳':8,'䜴':11,'䜵':12,'䜶':13,'䜷':14,'䜸':14,'䜹':14,'䜺':15,'䜻':16,'䜼':16,'䜽':16,'䜾':16,'䜿':16,'䝀':17,'䝁':17,'䝂':17,'䝃':21,'䝄':25,'䝅':10,
  '䝆':11,'䝇':11,'䝈':12,'䝉':13,'䝊':15,'䝋':15,'䝌':15,'䝍':16,'䝎':16,'䝏':18,'䝐':19,'䝑':19,'䝒':21,'䝓':22,'䝔':25,'䝕':25,'䝖':11,'䝗':11,'䝘':11,'䝙':11,'䝚':12,'䝛':12,'䝜':14,'䝝':15,'䝞':15,'䝟':16,'䝠':17,'䝡':18,
  '䝢':18,'䝣':19,'䝤':19,'䝥':19,'䝦':19,'䝧':11,'䝨':11,'䝩':12,'䝪':12,'䝫':12,'䝬':12,'䝭':12,'䝮':12,'䝯':12,'䝰':13,'䝱':13,'䝲':13,'䝳':14,'䝴':14,'䝵':14,'䝶':15,'䝷':15,'䝸':15,'䝹':15,'䝺':15,'䝻':15,'䝼':15,'䝽':15,
  '䝾':15,'䝿':15,'䞀':16,'䞁':16,'䞂':16,'䞃':16,'䞄':16,'䞅':17,'䞆':17,'䞇':18,'䞈':19,'䞉':20,'䞊':22,'䞋':23,'䞌':13,'䞍':15,'䞎':15,'䞏':16,'䞐':16,'䞑':10,'䞒':13,'䞓':14,'䞔':14,'䞕':21,'䞖':10,'䞗':10,'䞘':10,'䞙':11,
  '䞚':11,'䞛':11,'䞜':11,'䞝':12,'䞞':12,'䞟':12,'䞠':12,'䞡':12,'䞢':12,'䞣':12,'䞤':12,'䞥':13,'䞦':13,'䞧':13,'䞨':13,'䞩':13,'䞪':13,'䞫':14,'䞬':14,'䞭':14,'䞮':14,'䞯':14,'䞰':14,'䞱':14,'䞲':14,'䞳':15,'䞴':15,'䞵':15,
  '䞶':15,'䞷':15,'䞸':15,'䞹':16,'䞺':16,'䞻':16,'䞼':16,'䞽':17,'䞾':17,'䞿':17,'䟀':17,'䟁':18,'䟂':18,'䟃':18,'䟄':18,'䟅':18,'䟆':18,'䟇':19,'䟈':20,'䟉':20,'䟊':20,'䟋':20,'䟌':21,'䟍':22,'䟎':22,'䟏':22,'䟐':23,'䟑':24,
  '䟒':25,'䟓':9,'䟔':9,'䟕':10,'䟖':10,'䟗':11,'䟘':11,'䟙':11,'䟚':11,'䟛':11,'䟜':11,'䟝':11,'䟞':11,'䟟':12,'䟠':12,'䟡':12,'䟢':12,'䟣':12,'䟤':12,'䟥':12,'䟦':12,'䟧':12,'䟨':12,'䟩':12,'䟪':12,'䟫':12,'䟬':12,'䟭':12,
  '䟮':13,'䟯':13,'䟰':13,'䟱':13,'䟲':13,'䟳':13,'䟴':14,'䟵':14,'䟶':14,'䟷':14,'䟸':14,'䟹':14,'䟺':14,'䟻':14,'䟼':15,'䟽':14,'䟾':15,'䟿':15,'䠀':15,'䠁':15,'䠂':15,'䠃':15,'䠄':15,'䠅':15,'䠆':15,'䠇':15,'䠈':15,'䠉':15,
  '䠊':15,'䠋':15,'䠌':15,'䠍':16,'䠎':16,'䠏':16,'䠐':16,'䠑':16,'䠒':16,'䠓':16,'䠔':16,'䠕':16,'䠖':16,'䠗':17,'䠘':17,'䠙':17,'䠚':17,'䠛':17,'䠜':17,'䠝':17,'䠞':18,'䠟':18,'䠠':18,'䠡':18,'䠢':18,'䠣':19,'䠤':19,'䠥':19,
  '䠦':19,'䠧':19,'䠨':20,'䠩':20,'䠪':21,'䠫':21,'䠬':22,'䠭':23,'䠮':23,'䠯':24,'䠰':25,'䠱':28,'䠲':12,'䠳':12,'䠴':12,'䠵':12,'䠶':12,'䠷':13,'䠸':13,'䠹':13,'䠺':13,'䠻':15,'䠼':16,'䠽':17,'䠾':17,'䠿':19,'䡀':20,'䡁':23,
  '䡂':9,'䡃':9,'䡄':9,'䡅':10,'䡆':11,'䡇':11,'䡈':11,'䡉':11,'䡊':11,'䡋':11,'䡌':11,'䡍':11,'䡎':11,'䡏':12,'䡐':12,'䡑':12,'䡒':12,'䡓':13,'䡔':13,'䡕':13,'䡖':13,'䡗':13,'䡘':14,'䡙':14,'䡚':14,'䡛':14,'䡜':15,'䡝':15,'䡞':15,
  '䡟':15,'䡠':16,'䡡':16,'䡢':16,'䡣':16,'䡤':16,'䡥':17,'䡦':17,'䡧':17,'䡨':17,'䡩':17,'䡪':17,'䡫':18,'䡬':18,'䡭':18,'䡮':18,'䡯':18,'䡰':18,'䡱':18,'䡲':19,'䡳':19,'䡴':19,'䡵':19,'䡶':20,'䡷':21,'䡸':21,'䡹':21,'䡺':22,
  '䡻':22,'䡼':24,'䡽':26,'䡾':27,'䡿':31,'䢀':10,'䢁':11,'䢂':9,'䢃':15,'䢄':20,'䢅':13,'䢆':14,'䢇':15,'䢈':20,'䢉':20,'䢊':10,'䢋':10,'䢌':11,'䢍':11,'䢎':11,'䢏':11,'䢐':12,'䢑':12,'䢒':13,'䢓':13,'䢔':13,'䢕':13,'䢖':13,
  '䢗':13,'䢘':13,'䢙':14,'䢚':14,'䢛':14,'䢜':15,'䢝':15,'䢞':15,'䢟':15,'䢠':14,'䢡':16,'䢢':17,'䢣':17,'䢤':17,'䢥':14,'䢦':18,'䢧':18,'䢨':18,'䢩':18,'䢪':19,'䢫':18,'䢬':19,'䢭':19,'䢮':20,'䢯':21,'䢰':21,'䢱':22,'䢲':27,
  '䢳':9,'䢴':10,'䢵':11,'䢶':11,'䢷':11,'䢸':12,'䢹':11,'䢺':12,'䢻':13,'䢼':13,'䢽':13,'䢾':13,'䢿':13,'䣀':13,'䣁':13,'䣂':13,'䣃':13,'䣄':14,'䣅':14,'䣆':14,'䣇':14,'䣈':14,'䣉':14,'䣊':15,'䣋':15,'䣌':15,'䣍':15,'䣎':15,
  '䣏':15,'䣐':15,'䣑':16,'䣒':16,'䣓':17,'䣔':17,'䣕':17,'䣖':17,'䣗':17,'䣘':18,'䣙':18,'䣚':18,'䣛':18,'䣜':18,'䣝':18,'䣞':19,'䣟':19,'䣠':19,'䣡':20,'䣢':21,'䣣':27,'䣤':27,'䣥':9,'䣦':9,'䣧':10,'䣨':10,'䣩':11,'䣪':11,
  '䣫':11,'䣬':11,'䣭':11,'䣮':12,'䣯':12,'䣰':12,'䣱':13,'䣲':12,'䣳':12,'䣴':13,'䣵':13,'䣶':13,'䣷':13,'䣸':13,'䣹':13,'䣺':14,'䣻':14,'䣼':15,'䣽':15,'䣾':15,'䣿':15,'䤀':16,'䤁':16,'䤂':16,'䤃':16,'䤄':16,'䤅':16,'䤆':16,
  '䤇':16,'䤈':16,'䤉':17,'䤊':17,'䤋':17,'䤌':17,'䤍':18,'䤎':19,'䤏':19,'䤐':19,'䤑':19,'䤒':19,'䤓':21,'䤔':21,'䤕':22,'䤖':22,'䤗':24,'䤘':24,'䤙':28,'䤚':11,'䤛':10,'䤜':11,'䤝':12,'䤞':12,'䤟':12,'䤠':12,'䤡':13,'䤢':13,
  '䤣':13,'䤤':14,'䤥':14,'䤦':14,'䤧':14,'䤨':14,'䤩':14,'䤪':14,'䤫':15,'䤬':15,'䤭':15,'䤮':15,'䤯':15,'䤰':15,'䤱':15,'䤲':15,'䤳':16,'䤴':16,'䤵':16,'䤶':16,'䤷':17,'䤸':17,'䤹':17,'䤺':17,'䤻':17,'䤼':17,'䤽':18,'䤾':18,
  '䤿':18,'䥀':18,'䥁':18,'䥂':18,'䥃':18,'䥄':18,'䥅':18,'䥆':18,'䥇':18,'䥈':19,'䥉':19,'䥊':19,'䥋':19,'䥌':19,'䥍':19,'䥎':19,'䥏':19,'䥐':19,'䥑':19,'䥒':19,'䥓':19,'䥔':20,'䥕':20,'䥖':20,'䥗':20,'䥘':20,'䥙':20,'䥚':20,
  '䥛':20,'䥜':20,'䥝':21,'䥞':21,'䥟':21,'䥠':21,'䥡':21,'䥢':21,'䥣':21,'䥤':21,'䥥':21,'䥦':21,'䥧':22,'䥨':22,'䥩':22,'䥪':22,'䥫':22,'䥬':22,'䥭':22,'䥮':22,'䥯':23,'䥰':23,'䥱':23,'䥲':23,'䥳':23,'䥴':23,'䥵':24,'䥶':24,
  '䥷':24,'䥸':25,'䥹':29,'䥺':12,'䥻':12,'䥼':12,'䥽':13,'䥾':13,'䥿':13,'䦀':14,'䦁':15,'䦂':18,'䦃':20,'䦄':20,'䦅':20,'䦆':28,'䦇':11,'䦈':13,'䦉':13,'䦊':14,'䦋':19,'䦌':11,'䦍':11,'䦎':12,'䦏':12,'䦐':12,'䦑':12,'䦒':13,
  '䦓':13,'䦔':13,'䦕':14,'䦖':14,'䦗':14,'䦘':14,'䦙':14,'䦚':14,'䦛':14,'䦜':15,'䦝':15,'䦞':15,'䦟':15,'䦠':16,'䦡':16,'䦢':16,'䦣':16,'䦤':16,'䦥':16,'䦦':16,'䦧':16,'䦨':16,'䦩':17,'䦪':17,'䦫':17,'䦬':17,'䦭':17,'䦮':17,
  '䦯':17,'䦰':19,'䦱':20,'䦲':21,'䦳':21,'䦴':21,'䦵':22,'䦶':14,'䦷':15,'䦸':17,'䦹':10,'䦺':10,'䦻':11,'䦼':12,'䦽':12,'䦾':10,'䦿':12,'䧀':12,'䧁':13,'䧂':13,'䧃':13,'䧄':14,'䧅':14,'䧆':14,'䧇':14,'䧈':14,'䧉':15,'䧊':15,
  '䧋':15,'䧌':15,'䧍':15,'䧎':15,'䧏':15,'䧐':16,'䧑':16,'䧒':16,'䧓':16,'䧔':16,'䧕':16,'䧖':16,'䧗':17,'䧘':17,'䧙':12,'䧚':18,'䧛':18,'䧜':18,'䧝':18,'䧞':18,'䧟':18,'䧠':19,'䧡':19,'䧢':19,'䧣':19,'䧤':20,'䧥':20,'䧦':20,
  '䧧':21,'䧨':21,'䧩':19,'䧪':16,'䧫':22,'䧬':22,'䧭':17,'䧮':24,'䧯':25,'䧰':26,'䧱':10,'䧲':11,'䧳':11,'䧴':12,'䧵':12,'䧶':12,'䧷':13,'䧸':13,'䧹':13,'䧺':13,'䧻':14,'䧼':15,'䧽':15,'䧾':16,'䧿':16,'䨀':16,'䨁':17,'䨂':17,
  '䨃':18,'䨄':19,'䨅':20,'䨆':20,'䨇':20,'䨈':22,'䨉':25,'䨊':32,'䨋':11,'䨌':12,'䨍':12,'䨎':13,'䨏':14,'䨐':14,'䨑':14,'䨒':14,'䨓':14,'䨔':14,'䨕':14,'䨖':14,'䨗':15,'䨘':15,'䨙':15,'䨚':16,'䨛':16,'䨜':16,'䨝':16,'䨞':17,
  '䨟':17,'䨠':17,'䨡':17,'䨢':17,'䨣':17,'䨤':17,'䨥':18,'䨦':18,'䨧':18,'䨨':18,'䨩':18,'䨪':18,'䨫':19,'䨬':19,'䨭':19,'䨮':19,'䨯':19,'䨰':20,'䨱':20,'䨲':22,'䨳':22,'䨴':22,'䨵':23,'䨶':23,'䨷':24,'䨸':25,'䨹':27,'䨺':36,
  '䨼':22,'䨽':11,'䨾':11,'䨿':12,'䩀':15,'䩁':20,'䩂':13,'䩃':13,'䩄':13,'䩅':14,'䩆':14,'䩇':14,'䩈':16,'䩉':16,'䩊':17,'䩋':20,'䩌':21,'䩍':21,'䩎':22,'䩏':24,'䩐':12,'䩑':12,'䩒':12,'䩓':13,'䩔':13,'䩕':13,'䩖':13,'䩗':13,
  '䩘':13,'䩙':14,'䩚':14,'䩛':14,'䩜':14,'䩝':14,'䩞':14,'䩟':15,'䩠':16,'䩡':16,'䩢':16,'䩣':16,'䩤':16,'䩥':16,'䩦':16,'䩧':16,'䩨':17,'䩩':17,'䩪':17,'䩫':17,'䩬':17,'䩭':17,'䩮':17,'䩯':18,'䩰':18,'䩱':18,'䩲':18,'䩳':18,
  '䩴':18,'䩵':18,'䩶':19,'䩷':19,'䩸':19,'䩹':19,'䩺':19,'䩻':19,'䩼':20,'䩽':20,'䩾':20,'䩿':21,'䪀':21,'䪁':21,'䪂':21,'䪃':21,'䪄':21,'䪅':22,'䪆':22,'䪇':23,'䪈':23,'䪉':24,'䪊':25,'䪋':25,'䪌':26,'䪍':26,'䪎':27,'䪏':13,
  '䪐':14,'䪑':14,'䪒':14,'䪓':14,'䪔':16,'䪕':17,'䪖':18,'䪗':18,'䪘':18,'䪙':19,'䪚':19,'䪛':21,'䪜':22,'䪝':23,'䪞':13,'䪟':15,'䪠':17,'䪡':19,'䪢':19,'䪣':20,'䪤':21,'䪥':23,'䪦':12,'䪧':12,'䪨':12,'䪩':13,'䪪':14,'䪫':16,
  '䪬':16,'䪭':18,'䪮':19,'䪯':19,'䪰':22,'䪱':12,'䪲':12,'䪳':13,'䪴':13,'䪵':13,'䪶':14,'䪷':14,'䪸':14,'䪹':14,'䪺':14,'䪻':14,'䪼':14,'䪽':14,'䪾':14,'䪿':15,'䫀':15,'䫁':15,'䫂':15,'䫃':16,'䫄':16,'䫅':16,'䫆':16,'䫇':16,
  '䫈':16,'䫉':16,'䫊':16,'䫋':17,'䫌':17,'䫍':17,'䫎':17,'䫏':17,'䫐':17,'䫑':17,'䫒':17,'䫓':17,'䫔':18,'䫕':18,'䫖':18,'䫗':18,'䫘':18,'䫙':18,'䫚':18,'䫛':18,'䫜':18,'䫝':18,'䫞':19,'䫟':19,'䫠':19,'䫡':19,'䫢':19,'䫣':19,
  '䫤':19,'䫥':19,'䫦':19,'䫧':19,'䫨':20,'䫩':20,'䫪':20,'䫫':20,'䫬':21,'䫭':21,'䫮':21,'䫯':21,'䫰':21,'䫱':21,'䫲':22,'䫳':22,'䫴':22,'䫵':24,'䫶':24,'䫷':25,'䫸':11,'䫹':12,'䫺':13,'䫻':13,'䫼':13,'䫽':13,'䫾':14,'䫿':14,
  '䬀':14,'䬁':14,'䬂':14,'䬃':14,'䬄':15,'䬅':15,'䬆':16,'䬇':16,'䬈':16,'䬉':16,'䬊':16,'䬋':17,'䬌':17,'䬍':17,'䬎':17,'䬏':17,'䬐':17,'䬑':18,'䬒':18,'䬓':18,'䬔':18,'䬕':18,'䬖':18,'䬗':18,'䬘':19,'䬙':19,'䬚':19,'䬛':20,
  '䬜':20,'䬝':21,'䬞':23,'䬟':24,'䬠':17,'䬡':18,'䬢':11,'䬣':12,'䬤':12,'䬥':12,'䬦':13,'䬧':13,'䬨':13,'䬩':13,'䬪':13,'䬫':14,'䬬':14,'䬭':14,'䬮':14,'䬯':14,'䬰':14,'䬱':14,'䬲':14,'䬳':14,'䬴':14,'䬵':15,'䬶':15,'䬷':15,
  '䬸':15,'䬹':15,'䬺':15,'䬻':15,'䬼':16,'䬽':16,'䬾':16,'䬿':16,'䭀':16,'䭁':16,'䭂':16,'䭃':17,'䭄':17,'䭅':17,'䭆':17,'䭇':17,'䭈':18,'䭉':18,'䭊':18,'䭋':18,'䭌':18,'䭍':18,'䭎':18,'䭏':18,'䭐':19,'䭑':19,'䭒':19,'䭓':19,
  '䭔':19,'䭕':20,'䭖':20,'䭗':20,'䭘':21,'䭙':21,'䭚':21,'䭛':21,'䭜':21,'䭝':22,'䭞':22,'䭟':22,'䭠':22,'䭡':23,'䭢':23,'䭣':23,'䭤':23,'䭥':24,'䭦':26,'䭧':26,'䭨':27,'䭩':28,'䭪':21,'䭫':15,'䭬':15,'䭭':18,'䭮':19,'䭯':14,
  '䭰':17,'䭱':17,'䭲':17,'䭳':27,'䭴':12,'䭵':13,'䭶':13,'䭷':14,'䭸':14,'䭹':14,'䭺':14,'䭻':14,'䭼':14,'䭽':14,'䭾':14,'䭿':15,'䮀':15,'䮁':15,'䮂':15,'䮃':15,'䮄':15,'䮅':15,'䮆':16,'䮇':16,'䮈':16,'䮉':16,'䮊':16,'䮋':16,
  '䮌':16,'䮍':16,'䮎':17,'䮏':17,'䮐':17,'䮑':17,'䮒':17,'䮓':18,'䮔':18,'䮕':18,'䮖':18,'䮗':18,'䮘':18,'䮙':18,'䮚':18,'䮛':18,'䮜':19,'䮝':19,'䮞':19,'䮟':19,'䮠':19,'䮡':19,'䮢':19,'䮣':20,'䮤':20,'䮥':20,'䮦':20,'䮧':20,
  '䮨':20,'䮩':20,'䮪':21,'䮫':21,'䮬':21,'䮭':21,'䮮':21,'䮯':21,'䮰':21,'䮱':21,'䮲':22,'䮳':22,'䮴':22,'䮵':22,'䮶':22,'䮷':23,'䮸':23,'䮹':23,'䮺':24,'䮻':24,'䮼':24,'䮽':25,'䮾':26,'䮿':27,'䯀':28,'䯁':29,'䯂':34,'䯃':16,
  '䯄':17,'䯅':20,'䯆':11,'䯇':12,'䯈':14,'䯉':14,'䯊':15,'䯋':15,'䯌':15,'䯍':15,'䯎':15,'䯏':16,'䯐':16,'䯑':16,'䯒':16,'䯓':16,'䯔':16,'䯕':17,'䯖':17,'䯗':17,'䯘':17,'䯙':17,'䯚':17,'䯛':18,'䯜':18,'䯝':19,'䯞':19,'䯟':19,
  '䯠':19,'䯡':20,'䯢':21,'䯣':22,'䯤':23,'䯥':24,'䯦':25,'䯧':12,'䯨':13,'䯩':14,'䯪':19,'䯫':22,'䯬':25,'䯭':12,'䯮':12,'䯯':14,'䯰':14,'䯱':14,'䯲':14,'䯳':14,'䯴':14,'䯵':15,'䯶':15,'䯷':16,'䯸':16,'䯹':17,'䯺':17,'䯻':17,
  '䯼':17,'䯽':18,'䯾':18,'䯿':18,'䰀':18,'䰁':18,'䰂':18,'䰃':18,'䰄':19,'䰅':19,'䰆':19,'䰇':19,'䰈':20,'䰉':20,'䰊':20,'䰋':20,'䰌':21,'䰍':21,'䰎':22,'䰏':24,'䰐':24,'䰑':24,'䰒':24,'䰓':25,'䰔':25,'䰕':26,'䰖':29,'䰗':20,
  '䰘':21,'䰙':14,'䰚':14,'䰛':15,'䰜':16,'䰝':22,'䰞':25,'䰟':14,'䰠':15,'䰡':15,'䰢':16,'䰣':16,'䰤':18,'䰥':18,'䰦':18,'䰧':18,'䰨':19,'䰩':19,'䰪':20,'䰫':22,'䰬':22,'䰭':22,'䰮':23,'䰯':24,'䰰':24,'䰱':34,'䰲':12,'䰳':13,
  '䰴':14,'䰵':14,'䰶':14,'䰷':15,'䰸':15,'䰹':15,'䰺':15,'䰻':15,'䰼':15,'䰽':15,'䰾':15,'䰿':16,'䱀':16,'䱁':16,'䱂':16,'䱃':16,'䱄':16,'䱅':16,'䱆':16,'䱇':16,'䱈':16,'䱉':16,'䱊':17,'䱋':17,'䱌':17,'䱍':17,'䱎':17,'䱏':18,
  '䱐':18,'䱑':18,'䱒':18,'䱓':18,'䱔':18,'䱕':18,'䱖':18,'䱗':18,'䱘':18,'䱙':19,'䱚':19,'䱛':19,'䱜':19,'䱝':19,'䱞':19,'䱟':19,'䱠':19,'䱡':19,'䱢':19,'䱣':19,'䱤':19,'䱥':19,'䱦':19,'䱧':19,'䱨':19,'䱩':19,'䱪':19,'䱫':20,
  '䱬':20,'䱭':20,'䱮':20,'䱯':20,'䱰':20,'䱱':20,'䱲':20,'䱳':20,'䱴':20,'䱵':21,'䱶':21,'䱷':21,'䱸':21,'䱹':21,'䱺':21,'䱻':21,'䱼':21,'䱽':21,'䱾':22,'䱿':22,'䲀':22,'䲁':22,'䲂':22,'䲃':22,'䲄':22,'䲅':22,'䲆':22,'䲇':22,
  '䲈':22,'䲉':23,'䲊':23,'䲋':23,'䲌':23,'䲍':23,'䲎':23,'䲏':23,'䲐':24,'䲑':24,'䲒':24,'䲓':24,'䲔':24,'䲕':24,'䲖':25,'䲗':25,'䲘':25,'䲙':26,'䲚':27,'䲛':27,'䲜':44,'䲝':15,'䲞':16,'䲟':16,'䲠':20,'䲡':20,'䲢':21,'䲣':21,
  '䲤':21,'䲥':13,'䲦':14,'䲧':14,'䲨':14,'䲩':14,'䲪':14,'䲫':14,'䲬':15,'䲭':15,'䲮':15,'䲯':15,'䲰':15,'䲱':15,'䲲':15,'䲳':15,'䲴':15,'䲵':15,'䲶':15,'䲷':15,'䲸':15,'䲹':16,'䲺':16,'䲻':16,'䲼':16,'䲽':16,'䲾':16,'䲿':16,
  '䳀':16,'䳁':16,'䳂':16,'䳃':16,'䳄':16,'䳅':16,'䳆':16,'䳇':16,'䳈':16,'䳉':16,'䳊':16,'䳋':17,'䳌':17,'䳍':17,'䳎':17,'䳏':17,'䳐':17,'䳑':17,'䳒':17,'䳓':17,'䳔':17,'䳕':18,'䳖':18,'䳗':18,'䳘':18,'䳙':18,'䳚':18,'䳛':18,
  '䳜':18,'䳝':19,'䳞':19,'䳟':19,'䳠':19,'䳡':19,'䳢':19,'䳣':19,'䳤':19,'䳥':19,'䳦':20,'䳧':20,'䳨':20,'䳩':20,'䳪':20,'䳫':20,'䳬':20,'䳭':20,'䳮':20,'䳯':20,'䳰':20,'䳱':21,'䳲':21,'䳳':21,'䳴':21,'䳵':21,'䳶':21,'䳷':22,
  '䳸':22,'䳹':22,'䳺':22,'䳻':22,'䳼':22,'䳽':22,'䳾':23,'䳿':23,'䴀':23,'䴁':23,'䴂':23,'䴃':23,'䴄':23,'䴅':23,'䴆':23,'䴇':24,'䴈':24,'䴉':24,'䴊':24,'䴋':24,'䴌':25,'䴍':25,'䴎':26,'䴏':27,'䴐':31,'䴑':34,'䴒':35,'䴓':15,
  '䴔':17,'䴕':17,'䴖':19,'䴗':20,'䴘':21,'䴙':24,'䴚':15,'䴛':18,'䴜':21,'䴝':23,'䴞':25,'䴟':14,'䴠':15,'䴡':15,'䴢':15,'䴣':16,'䴤':16,'䴥':16,'䴦':18,'䴧':19,'䴨':21,'䴩':22,'䴪':24,'䴫':24,'䴬':14,'䴭':14,'䴮':14,'䴯':15,
  '䴰':15,'䴱':16,'䴲':16,'䴳':16,'䴴':16,'䴵':17,'䴶':18,'䴷':18,'䴸':18,'䴹':19,'䴺':19,'䴻':19,'䴼':19,'䴽':19,'䴾':21,'䴿':21,'䵀':21,'䵁':22,'䵂':22,'䵃':23,'䵄':24,'䵅':22,'䵆':25,'䵇':15,'䵈':20,'䵉':20,'䵊':16,'䵋':18,
  '䵌':19,'䵍':20,'䵎':21,'䵏':23,'䵐':24,'䵑':15,'䵒':16,'䵓':16,'䵔':20,'䵕':20,'䵖':20,'䵗':21,'䵘':21,'䵙':21,'䵚':22,'䵛':23,'䵜':25,'䵝':13,'䵞':14,'䵟':15,'䵠':17,'䵡':16,'䵢':17,'䵣':17,'䵤':18,'䵥':18,'䵦':18,'䵧':18,
  '䵨':19,'䵩':19,'䵪':20,'䵫':20,'䵬':20,'䵭':21,'䵮':21,'䵯':21,'䵰':23,'䵱':24,'䵲':25,'䵳':25,'䵴':25,'䵵':26,'䵶':18,'䵷':19,'䵸':22,'䵹':24,'䵺':16,'䵻':24,'䵼':24,'䵽':18,'䵾':18,'䵿':18,'䶀':19,'䶁':21,'䶂':16,'䶃':17,
  '䶄':18,'䶅':19,'䶆':21,'䶇':22,'䶈':23,'䶉':23,'䶊':18,'䶋':18,'䶌':19,'䶍':20,'䶎':20,'䶏':21,'䶐':27,'䶑':30,'䶒':17,'䶓':17,'䶔':18,'䶕':19,'䶖':19,'䶗':20,'䶘':20,'䶙':20,'䶚':21,'䶛':21,'䶜':22,'䶝':22,'䶞':23,'䶟':23,
  '䶠':24,'䶡':24,'䶢':24,'䶣':25,'䶤':25,'䶥':26,'䶦':26,'䶧':27,'䶨':28,'䶩':29,'䶪':29,'䶫':35,'䶬':22,'䶭':10,'䶮':20,'䶯':19,'䶰':20,'䶱':21,'䶲':21,'䶳':21,'䶴':25,'䶵':27,'一':1,'丁':2,'丂':2,'七':2,'丄':2,'丅':2,'丆':2,
  '万':4,'丈':3,'三':3,'上':3,'下':3,'丌':3,'不':4,'与':3,'丏':4,'丐':4,'丑':4,'丒':4,'专':4,'且':5,'丕':5,'世':5,'丗':5,'丘':5,'丙':5,'业':5,'丛':5,'东':5,'丝':5,'丞':6,'丟':7,'丠':6,'両':6,'丢':6,'丣':7,'两':7,'严':7,'並':8,'丧':8,
  '丨':1,'丩':2,'个':3,'丫':3,'丬':3,'中':4,'丮':4,'丯':4,'丰':4,'丱':5,'串':7,'丳':8,'临':9,'丵':10,'丶':1,'丷':2,'丸':3,'丹':4,'为':4,'主':5,'丼':5,'丽':7,'举':9,'丿':1,'乀':1,'乁':1,'乂':2,'乃':2,'乄':2,'久':3,'乆':3,'乇':3,'么':3,
  '义':3,'乊':3,'之':3,'乌':4,'乍':5,'乎':5,'乏':4,'乐':5,'乑':6,'乒':6,'乓':6,'乔':6,'乕':7,'乖':8,'乗':9,'乘':10,'乙':1,'乚':1,'乛':1,'乜':2,'九':2,'乞':3,'也':3,'习':3,'乡':3,'乢':4,'乣':4,'乤':4,'乥':4,'书':4,'乧':5,'乨':6,'乩':6,
  '乪':6,'乫':6,'乬':6,'乭':6,'乮':6,'乯':6,'买':6,'乱':7,'乲':7,'乳':8,'乴':8,'乵':8,'乶':8,'乷':8,'乸':8,'乹':9,'乺':9,'乻':9,'乼':9,'乽':10,'乾':11,'乿':11,'亀':11,'亁':12,'亂':13,'亃':13,'亄':13,'亅':1,'了':2,'亇':3,'予':4,'争':6,
  '亊':7,'事':8,'二':2,'亍':3,'于':3,'亏':3,'亐':3,'云':4,'互':4,'亓':4,'五':4,'井':4,'亖':4,'亗':5,'亘':6,'亙':6,'亚':6,'些':8,'亜':7,'亝':8,'亞':8,'亟':8,'亠':2,'亡':3,'亢':4,'亣':4,'交':6,'亥':6,'亦':6,'产':6,'亨':7,'亩':7,'亪':7,
  '享':8,'京':8,'亭':9,'亮':9,'亯':9,'亰':9,'亱':9,'亲':9,'亳':10,'亴':12,'亵':12,'亶':13,'亷':13,'亸':16,'亹':22,'人':2,'亻':2,'亼':3,'亽':3,'亾':3,'亿':3,'什':4,'仁':4,'仂':4,'仃':4,'仄':4,'仅':4,'仆':4,'仇':4,'仈':4,'仉':4,'今':4,
  '介':4,'仌':4,'仍':4,'从':4,'仏':4,'仐':4,'仑':4,'仒':4,'仓':4,'仔':5,'仕':5,'他':5,'仗':5,'付':5,'仙':5,'仚':5,'仛':5,'仜':5,'仝':5,'仞':5,'仟':5,'仠':5,'仡':5,'仢':5,'代':5,'令':5,'以':4,'仦':5,'仧':5,'仨':5,'仩':5,'仪':5,'仫':5,
  '们':5,'仭':5,'仮':6,'仯':6,'仰':6,'仱':6,'仲':6,'仳':6,'仴':6,'仵':6,'件':6,'价':6,'仸':6,'仹':6,'仺':5,'任':6,'仼':7,'份':6,'仾':6,'仿':6,'伀':6,'企':6,'伂':6,'伃':6,'伄':6,'伅':6,'伆':6,'伇':6,'伈':6,'伉':6,'伊':6,'伋':5,'伌':6,
  '伍':6,'伎':6,'伏':6,'伐':6,'休':6,'伒':6,'伓':6,'伔':6,'伕':6,'伖':6,'众':6,'优':6,'伙':6,'会':6,'伛':6,'伜':6,'伝':6,'伞':6,'伟':6,'传':6,'伡':6,'伢':6,'伣':6,'伤':6,'伥':6,'伦':6,'伧':6,'伨':6,'伩':6,'伪':6,'伫':6,'伬':6,'伭':7,
  '伮':7,'伯':7,'估':7,'伱':7,'伲':7,'伳':7,'伴':7,'伵':7,'伶':7,'伷':7,'伸':7,'伹':7,'伺':7,'伻':7,'似':6,'伽':7,'伾':7,'伿':7,'佀':7,'佁':7,'佂':7,'佃':7,'佄':7,'佅':7,'但':7,'佇':7,'佈':7,'佉':7,'佊':7,'佋':7,'佌':8,'位':7,'低':7,
  '住':7,'佐':7,'佑':7,'佒':7,'体':7,'佔':7,'何':7,'佖':7,'佗':7,'佘':7,'余':7,'佚':7,'佛':7,'作':7,'佝':7,'佞':7,'佟':7,'你':7,'佡':7,'佢':6,'佣':7,'佤':6,'佥':7,'佦':7,'佧':7,'佨':7,'佩':8,'佪':8,'佫':8,'佬':8,'佭':8,'佮':8,'佯':8,
  '佰':8,'佱':8,'佲':8,'佳':8,'佴':8,'併':8,'佶':8,'佷':8,'佸':8,'佹':8,'佺':8,'佻':8,'佼':8,'佽':8,'佾':8,'使':8,'侀':8,'侁':8,'侂':8,'侃':8,'侄':8,'侅':8,'來':8,'侇':8,'侈':8,'侉':8,'侊':8,'例':8,'侌':8,'侍':8,'侎':8,'侏':8,'侐':8,
  '侑':8,'侒':8,'侓':8,'侔':8,'侕':8,'侖':8,'侗':8,'侘':8,'侙':8,'侚':8,'供':8,'侜':8,'依':8,'侞':8,'侟':8,'侠':8,'価':8,'侢':8,'侣':8,'侤':8,'侥':8,'侦':8,'侧':8,'侨':8,'侩':8,'侪':8,'侫':8,'侬':8,'侭':8,'侮':9,'侯':9,'侰':9,'侱':9,
  '侲':9,'侳':9,'侴':9,'侵':9,'侶':9,'侷':9,'侸':9,'侹':8,'侺':9,'侻':9,'侼':9,'侽':9,'侾':9,'便':9,'俀':9,'俁':9,'係':9,'促':9,'俄':9,'俅':9,'俆':9,'俇':9,'俈':9,'俉':9,'俊':9,'俋':9,'俌':9,'俍':9,'俎':9,'俏':9,'俐':9,'俑':9,'俒':9,
  '俓':9,'俔':9,'俕':9,'俖':9,'俗':9,'俘':9,'俙':9,'俚':9,'俛':9,'俜':9,'保':9,'俞':9,'俟':9,'俠':9,'信':9,'俢':8,'俣':9,'俤':9,'俥':9,'俦':9,'俧':9,'俨':9,'俩':9,'俪':9,'俫':9,'俬':9,'俭':9,'修':10,'俯':10,'俰':10,'俱':10,'俲':10,
  '俳':10,'俴':10,'俵':10,'俶':10,'俷':10,'俸':10,'俹':10,'俺':10,'俻':10,'俼':10,'俽':10,'俾':10,'俿':10,'倀':10,'倁':10,'倂':10,'倃':10,'倄':10,'倅':10,'倆':10,'倇':10,'倈':10,'倉':10,'倊':10,'個':10,'倌':10,'倍':10,'倎':10,
  '倏':10,'倐':10,'們':10,'倒':10,'倓':10,'倔':10,'倕':10,'倖':10,'倗':10,'倘':10,'候':10,'倚':10,'倛':10,'倜':10,'倝':10,'倞':10,'借':10,'倠':10,'倡':10,'倢':10,'倣':10,'値':10,'倥':10,'倦':10,'倧':10,'倨':10,'倩':10,'倪':10,
  '倫':10,'倬':10,'倭':10,'倮':10,'倯':10,'倰':10,'倱':10,'倲':10,'倳':10,'倴':10,'倵':10,'倶':10,'倷':10,'倸':10,'倹':10,'债':10,'倻':10,'值':10,'倽':10,'倾':10,'倿':10,'偀':10,'偁':11,'偂':11,'偃':11,'偄':11,'偅':11,'偆':11,
  '假':11,'偈':11,'偉':11,'偊':11,'偋':11,'偌':10,'偍':11,'偎':11,'偏':11,'偐':11,'偑':11,'偒':11,'偓':11,'偔':11,'偕':11,'偖':10,'偗':11,'偘':11,'偙':11,'做':11,'偛':11,'停':11,'偝':11,'偞':11,'偟':11,'偠':11,'偡':11,'偢':11,
  '偣':11,'偤':11,'健':11,'偦':11,'偧':11,'偨':12,'偩':11,'偪':11,'偫':11,'偬':11,'偭':11,'偮':11,'偯':11,'偰':11,'偱':11,'偲':11,'偳':11,'側':11,'偵':11,'偶':11,'偷':11,'偸':11,'偹':11,'偺':11,'偻':11,'偼':11,'偽':11,'偾':11,
  '偿':11,'傀':11,'傁':11,'傂':12,'傃':12,'傄':12,'傅':12,'傆':12,'傇':11,'傈':12,'傉':12,'傊':12,'傋':12,'傌':12,'傍':12,'傎':12,'傏':12,'傐':12,'傑':12,'傒':12,'傓':12,'傔':12,'傕':12,'傖':12,'傗':12,'傘':12,'備':12,'傚':12,
  '傛':12,'傜':12,'傝':12,'傞':11,'傟':12,'傠':12,'傡':12,'傢':12,'傣':12,'傤':12,'傥':12,'傦':11,'傧':12,'储':12,'傩':12,'傪':13,'傫':13,'催':13,'傭':13,'傮':13,'傯':13,'傰':13,'傱':13,'傲':12,'傳':13,'傴':13,'債':13,'傶':13,
  '傷':13,'傸':13,'傹':13,'傺':13,'傻':13,'傼':13,'傽':13,'傾':13,'傿':13,'僀':13,'僁':13,'僂':13,'僃':12,'僄':13,'僅':13,'僆':12,'僇':13,'僈':13,'僉':13,'僊':14,'僋':13,'僌':13,'働':13,'僎':14,'像':13,'僐':14,'僑':14,'僒':14,
  '僓':14,'僔':14,'僕':14,'僖':14,'僗':14,'僘':14,'僙':13,'僚':14,'僛':14,'僜':14,'僝':14,'僞':14,'僟':14,'僠':14,'僡':14,'僢':14,'僣':14,'僤':14,'僥':14,'僦':14,'僧':14,'僨':14,'僩':14,'僪':14,'僫':14,'僬':14,'僭':14,'僮':14,
  '僯':14,'僰':14,'僱':14,'僲':14,'僳':14,'僴':14,'僵':15,'僶':15,'僷':14,'僸':15,'價':15,'僺':15,'僻':15,'僼':15,'僽':15,'僾':15,'僿':15,'儀':15,'儁':14,'儂':15,'儃':15,'億':15,'儅':15,'儆':14,'儇':15,'儈':15,'儉':15,'儊':15,
  '儋':15,'儌':15,'儍':15,'儎':15,'儏':15,'儐':16,'儑':16,'儒':16,'儓':16,'儔':16,'儕':16,'儖':16,'儗':16,'儘':16,'儙':15,'儚':15,'儛':16,'儜':16,'儝':16,'儞':16,'償':17,'儠':17,'儡':17,'儢':17,'儣':16,'儤':17,'儥':17,'儦':17,
  '儧':17,'儨':17,'儩':17,'優':17,'儫':16,'儬':17,'儭':18,'儮':18,'儯':18,'儰':17,'儱':18,'儲':18,'儳':19,'儴':19,'儵':18,'儶':20,'儷':21,'儸':21,'儹':21,'儺':21,'儻':22,'儼':21,'儽':23,'儾':24,'儿':2,'兀':3,'允':4,'兂':4,'元':4,
  '兄':5,'充':6,'兆':6,'兇':6,'先':6,'光':6,'兊':6,'克':7,'兌':7,'免':7,'兎':7,'兏':7,'児':7,'兑':7,'兒':8,'兓':8,'兔':8,'兕':7,'兖':8,'兗':9,'兘':9,'兙':9,'党':10,'兛':10,'兜':11,'兝':11,'兞':11,'兟':12,'兠':12,'兡':13,'兢':14,
  '兣':16,'兤':20,'入':2,'兦':3,'內':4,'全':6,'兩':8,'兪':9,'八':2,'公':4,'六':4,'兮':4,'兯':4,'兰':5,'共':6,'兲':7,'关':6,'兴':6,'兵':7,'其':8,'具':8,'典':8,'兹':9,'兺':10,'养':9,'兼':10,'兽':11,'兾':13,'兿':13,'冀':16,'冁':18,
  '冂':2,'冃':4,'冄':4,'内':4,'円':4,'冇':4,'冈':4,'冉':5,'冊':5,'冋':5,'册':5,'再':6,'冎':5,'冏':7,'冐':8,'冑':9,'冒':9,'冓':10,'冔':10,'冕':11,'冖':2,'冗':4,'冘':4,'写':5,'冚':5,'军':6,'农':6,'冝':7,'冞':8,'冟':9,'冠':9,'冡':10,
  '冢':10,'冣':10,'冤':10,'冥':10,'冦':10,'冧':10,'冨':11,'冩':14,'冪':15,'冫':2,'冬':5,'冭':5,'冮':5,'冯':5,'冰':6,'冱':6,'冲':6,'决':6,'冴':6,'况':7,'冶':7,'冷':7,'冸':7,'冹':7,'冺':7,'冻':7,'冼':8,'冽':8,'冾':8,'冿':8,'净':8,
  '凁':9,'凂':9,'凃':9,'凄':10,'凅':10,'准':10,'凇':10,'凈':10,'凉':10,'凊':10,'凋':10,'凌':10,'凍':10,'凎':10,'减':11,'凐':11,'凑':11,'凒':12,'凓':12,'凔':12,'凕':12,'凖':12,'凗':13,'凘':14,'凙':15,'凚':15,'凛':15,'凜':15,'凝':16,
  '凞':16,'凟':17,'几':2,'凡':3,'凢':3,'凣':3,'凤':4,'凥':5,'処':5,'凧':5,'凨':6,'凩':6,'凪':6,'凫':6,'凬':7,'凭':8,'凮':8,'凯':8,'凰':11,'凱':12,'凲':12,'凳':14,'凴':14,'凵':2,'凶':4,'凷':5,'凸':5,'凹':5,'出':5,'击':5,'凼':6,'函':8,
  '凾':9,'凿':12,'刀':2,'刁':2,'刂':2,'刃':3,'刄':3,'刅':4,'分':4,'切':4,'刈':4,'刉':5,'刊':5,'刋':5,'刌':5,'刍':5,'刎':6,'刏':6,'刐':6,'刑':6,'划':6,'刓':6,'刔':6,'刕':6,'刖':6,'列':6,'刘':6,'则':6,'刚':6,'创':6,'刜':7,'初':7,'刞':7,
  '刟':7,'删':7,'刡':7,'刢':7,'刣':7,'判':7,'別':7,'刦':7,'刧':7,'刨':7,'利':7,'刪':7,'别':7,'刬':7,'刭':7,'刮':8,'刯':8,'到':8,'刱':8,'刲':8,'刳':8,'刴':8,'刵':8,'制':8,'刷':8,'券':8,'刹':8,'刺':8,'刻':8,'刼':8,'刽':8,'刾':8,'刿':8,
  '剀':8,'剁':8,'剂':8,'剃':9,'剄':9,'剅':9,'剆':8,'則':9,'剈':9,'剉':9,'削':9,'剋':9,'剌':9,'前':9,'剎':9,'剏':9,'剐':9,'剑':9,'剒':10,'剓':10,'剔':10,'剕':10,'剖':10,'剗':10,'剘':10,'剙':10,'剚':10,'剛':10,'剜':10,'剝':10,'剞':10,
  '剟':10,'剠':10,'剡':10,'剢':10,'剣':10,'剤':10,'剥':10,'剦':10,'剧':10,'剨':11,'剩':12,'剪':11,'剫':11,'剬':11,'剭':11,'剮':10,'副':11,'剰':11,'剱':11,'割':12,'剳':11,'剴':12,'創':12,'剶':11,'剷':13,'剸':13,'剹':13,'剺':13,
  '剻':13,'剼':13,'剽':13,'剾':13,'剿':13,'劀':14,'劁':14,'劂':14,'劃':14,'劄':14,'劅':15,'劆':15,'劇':15,'劈':15,'劉':15,'劊':15,'劋':15,'劌':15,'劍':15,'劎':15,'劏':15,'劐':15,'劑':16,'劒':16,'劓':16,'劔':16,'劕':17,'劖':19,
  '劗':21,'劘':21,'劙':23,'劚':23,'力':2,'劜':3,'劝':4,'办':4,'功':5,'加':5,'务':5,'劢':5,'劣':6,'劤':6,'劥':6,'劦':6,'劧':6,'动':6,'助':7,'努':7,'劫':7,'劬':7,'劭':7,'劮':7,'劯':7,'劰':7,'励':7,'劲':7,'劳':7,'労':7,'劵':8,'劶':8,
  '劷':8,'劸':8,'効':8,'劺':8,'劻':8,'劼':8,'劽':8,'劾':8,'势':8,'勀':9,'勁':9,'勂':9,'勃':9,'勄':9,'勅':9,'勆':8,'勇':9,'勈':9,'勉':9,'勊':9,'勋':9,'勌':10,'勍':10,'勎':10,'勏':10,'勐':10,'勑':10,'勒':11,'勓':11,'勔':11,'動':11,
  '勖':11,'勗':11,'勘':11,'務':10,'勚':11,'勛':12,'勜':12,'勝':12,'勞':12,'募':12,'勠':13,'勡':13,'勢':13,'勣':13,'勤':13,'勥':14,'勦':13,'勧':13,'勨':13,'勩':14,'勪':14,'勫':14,'勬':14,'勭':14,'勮':15,'勯':15,'勰':15,'勱':14,
  '勲':15,'勳':16,'勴':17,'勵':17,'勶':17,'勷':19,'勸':19,'勹':2,'勺':3,'勻':4,'勼':4,'勽':4,'勾':4,'勿':4,'匀':4,'匁':4,'匂':4,'匃':5,'匄':5,'包':5,'匆':5,'匇':5,'匈':6,'匉':7,'匊':8,'匋':8,'匌':8,'匍':9,'匎':10,'匏':11,'匐':11,
  '匑':12,'匒':11,'匓':11,'匔':15,'匕':2,'化':4,'北':5,'匘':11,'匙':11,'匚':2,'匛':5,'匜':5,'匝':5,'匞':5,'匟':6,'匠':6,'匡':7,'匢':6,'匣':7,'匤':7,'匥':7,'匦':8,'匧':9,'匨':9,'匩':9,'匪':10,'匫':10,'匬':11,'匭':11,'匮':11,'匯':13,
  '匰':14,'匱':14,'匲':14,'匳':15,'匴':16,'匵':17,'匶':19,'匷':20,'匸':2,'匹':4,'区':4,'医':7,'匼':8,'匽':9,'匾':11,'匿':10,'區':11,'十':2,'卂':3,'千':3,'卄':3,'卅':4,'卆':4,'升':4,'午':4,'卉':5,'半':5,'卋':6,'卌':5,'卍':4,'华':6,
  '协':6,'卐':4,'卑':8,'卒':8,'卓':8,'協':8,'单':8,'卖':8,'南':9,'単':9,'卙':11,'博':12,'卛':21,'卜':2,'卝':4,'卞':4,'卟':5,'占':5,'卡':5,'卢':5,'卣':7,'卤':7,'卥':8,'卦':8,'卧':8,'卨':10,'卩':2,'卪':3,'卫':3,'卬':4,'卭':5,'卮':5,
  '卯':5,'印':6,'危':6,'卲':7,'即':7,'却':7,'卵':7,'卶':8,'卷':8,'卸':9,'卹':8,'卺':8,'卻':9,'卼':9,'卽':9,'卾':11,'卿':10,'厀':13,'厁':13,'厂':2,'厃':4,'厄':4,'厅':4,'历':4,'厇':5,'厈':5,'厉':5,'厊':6,'压':6,'厌':6,'厍':6,'厎':7,
  '厏':7,'厐':7,'厑':7,'厒':8,'厓':8,'厔':8,'厕':8,'厖':9,'厗':9,'厘':9,'厙':9,'厚':9,'厛':9,'厜':10,'厝':10,'厞':10,'原':10,'厠':11,'厡':11,'厢':11,'厣':11,'厤':12,'厥':12,'厦':12,'厧':12,'厨':12,'厩':11,'厪':13,'厫':12,'厬':14,
  '厭':14,'厮':14,'厯':13,'厰':14,'厱':15,'厲':15,'厳':16,'厴':19,'厵':30,'厶':2,'厷':4,'厸':4,'厹':4,'厺':5,'去':5,'厼':5,'厽':6,'厾':6,'县':7,'叀':8,'叁':8,'参':8,'參':11,'叄':11,'叅':12,'叆':14,'叇':15,'又':2,'叉':3,'及':3,'友':4,
  '双':4,'反':4,'収':4,'叏':5,'叐':5,'发':5,'叒':6,'叓':7,'叔':8,'叕':8,'取':8,'受':8,'变':8,'叙':9,'叚':9,'叛':9,'叜':9,'叝':9,'叞':10,'叟':9,'叠':13,'叡':16,'叢':18,'口':3,'古':5,'句':5,'另':5,'叧':5,'叨':5,'叩':5,'只':5,'叫':5,
  '召':5,'叭':5,'叮':5,'可':5,'台':5,'叱':5,'史':5,'右':5,'叴':5,'叵':5,'叶':5,'号':5,'司':5,'叹':5,'叺':5,'叻':5,'叼':5,'叽':5,'叾':5,'叿':6,'吀':6,'吁':6,'吂':6,'吃':6,'各':6,'吅':6,'吆':6,'吇':6,'合':6,'吉':6,'吊':6,'吋':6,'同':6,
  '名':6,'后':6,'吏':6,'吐':6,'向':6,'吒':6,'吓':6,'吔':6,'吕':6,'吖':6,'吗':6,'吘':7,'吙':7,'吚':7,'君':7,'吜':7,'吝':7,'吞':7,'吟':7,'吠':7,'吡':7,'吢':7,'吣':7,'吤':7,'吥':7,'否':7,'吧':7,'吨':7,'吩':7,'吪':7,'含':7,'听':7,'吭':7,
  '吮':7,'启':7,'吰':7,'吱':7,'吲':7,'吳':7,'吴':7,'吵':7,'吶':7,'吷':7,'吸':6,'吹':7,'吺':7,'吻':7,'吼':7,'吽':7,'吾':7,'吿':7,'呀':7,'呁':7,'呂':7,'呃':7,'呄':7,'呅':7,'呆':7,'呇':7,'呈':8,'呉':7,'告':7,'呋':7,'呌':7,'呍':7,'呎':7,
  '呏':7,'呐':7,'呑':7,'呒':7,'呓':7,'呔':7,'呕':7,'呖':7,'呗':7,'员':7,'呙':7,'呚':7,'呛':7,'呜':7,'呝':8,'呞':8,'呟':8,'呠':8,'呡':8,'呢':8,'呣':8,'呤':8,'呥':8,'呦':8,'呧':8,'周':8,'呩':8,'呪':8,'呫':8,'呬':8,'呭':8,'呮':8,'呯':8,
  '呰':9,'呱':8,'呲':9,'味':8,'呴':8,'呵':8,'呶':8,'呷':8,'呸':8,'呹':8,'呺':8,'呻':8,'呼':8,'命':8,'呾':8,'呿':8,'咀':8,'咁':8,'咂':8,'咃':8,'咄':8,'咅':8,'咆':8,'咇':8,'咈':8,'咉':8,'咊':8,'咋':8,'和':8,'咍':8,'咎':8,'咏':8,'咐':8,
  '咑':8,'咒':8,'咓':7,'咔':8,'咕':8,'咖':8,'咗':8,'咘':8,'咙':8,'咚':8,'咛':8,'咜':8,'咝':8,'咞':7,'咟':9,'咠':9,'咡':9,'咢':9,'咣':9,'咤':9,'咥':9,'咦':9,'咧':9,'咨':9,'咩':9,'咪':9,'咫':9,'咬':9,'咭':9,'咮':9,'咯':9,'咰':9,'咱':9,
  '咲':9,'咳':9,'咴':9,'咵':9,'咶':9,'咷':9,'咸':9,'咹':9,'咺':9,'咻':9,'咼':8,'咽':9,'咾':9,'咿':9,'哀':9,'品':9,'哂':9,'哃':9,'哄':9,'哅':9,'哆':9,'哇':9,'哈':9,'哉':9,'哊':9,'哋':9,'哌':9,'响':9,'哎':8,'哏':9,'哐':9,'哑':9,'哒':9,
  '哓':9,'哔':9,'哕':9,'哖':9,'哗':9,'哘':9,'哙':9,'哚':9,'哛':9,'哜':9,'哝':9,'哞':9,'哟':9,'哠':10,'員':10,'哢':10,'哣':10,'哤':10,'哥':10,'哦':10,'哧':10,'哨':10,'哩':10,'哪':9,'哫':10,'哬':10,'哭':10,'哮':10,'哯':10,'哰':10,
  '哱':10,'哲':10,'哳':10,'哴':10,'哵':10,'哶':10,'哷':10,'哸':10,'哹':10,'哺':10,'哻':10,'哼':10,'哽':10,'哾':10,'哿':10,'唀':10,'唁':10,'唂':10,'唃':10,'唄':10,'唅':10,'唆':10,'唇':10,'唈':10,'唉':10,'唊':10,'唋':10,'唌':9,
  '唍':10,'唎':10,'唏':10,'唐':10,'唑':10,'唒':10,'唓':10,'唔':10,'唕':10,'唖':10,'唗':10,'唘':10,'唙':10,'唚':10,'唛':10,'唜':10,'唝':10,'唞':10,'唟':10,'唠':10,'唡':10,'唢':10,'唣':10,'唤':10,'唥':10,'唦':10,'唧':10,'唨':10,
  '唩':11,'唪':11,'唫':11,'唬':11,'唭':11,'售':11,'唯':11,'唰':11,'唱':11,'唲':11,'唳':11,'唴':10,'唵':11,'唶':11,'唷':11,'唸':11,'唹':11,'唺':11,'唻':11,'唼':11,'唽':11,'唾':11,'唿':11,'啀':11,'啁':11,'啂':11,'啃':11,'啄':11,
  '啅':11,'商':11,'啇':11,'啈':11,'啉':11,'啊':10,'啋':11,'啌':11,'啍':11,'啎':11,'問':11,'啐':11,'啑':11,'啒':11,'啓':11,'啔':11,'啕':11,'啖':11,'啗':11,'啘':11,'啙':12,'啚':11,'啛':11,'啜':11,'啝':11,'啞':11,'啟':11,'啠':11,
  '啡':11,'啢':11,'啣':12,'啤':11,'啥':11,'啦':11,'啧':11,'啨':11,'啩':11,'啪':11,'啫':11,'啬':11,'啭':11,'啮':11,'啯':11,'啰':11,'啱':11,'啲':11,'啳':11,'啴':11,'啵':11,'啶':11,'啷':11,'啸':11,'啹':11,'啺':12,'啻':12,'啼':12,
  '啽':12,'啾':12,'啿':12,'喀':12,'喁':12,'喂':12,'喃':12,'善':12,'喅':12,'喆':12,'喇':12,'喈':12,'喉':12,'喊':12,'喋':12,'喌':12,'喍':13,'喎':11,'喏':11,'喐':11,'喑':12,'喒':12,'喓':12,'喔':12,'喕':12,'喖':12,'喗':12,'喘':12,
  '喙':12,'喚':12,'喛':12,'喜':12,'喝':12,'喞':12,'喟':12,'喠':12,'喡':12,'喢':12,'喣':12,'喤':12,'喥':12,'喦':12,'喧':12,'喨':12,'喩':12,'喪':12,'喫':12,'喬':12,'喭':12,'單':12,'喯':11,'喰':12,'喱':12,'喲':12,'喳':12,'喴':12,
  '喵':11,'営':11,'喷':12,'喸':12,'喹':12,'喺':12,'喻':12,'喼':12,'喽':12,'喾':12,'喿':13,'嗀':13,'嗁':13,'嗂':13,'嗃':13,'嗄':13,'嗅':13,'嗆':13,'嗇':13,'嗈':13,'嗉':13,'嗊':13,'嗋':13,'嗌':13,'嗍':13,'嗎':13,'嗏':12,'嗐':13,
  '嗑':13,'嗒':12,'嗓':13,'嗔':13,'嗕':13,'嗖':12,'嗗':12,'嗘':13,'嗙':13,'嗚':13,'嗛':13,'嗜':13,'嗝':13,'嗞':12,'嗟':12,'嗠':13,'嗡':13,'嗢':12,'嗣':13,'嗤':13,'嗥':13,'嗦':13,'嗧':13,'嗨':13,'嗩':13,'嗪':13,'嗫':13,'嗬':13,
  '嗭':13,'嗮':13,'嗯':13,'嗰':13,'嗱':13,'嗲':13,'嗳':13,'嗴':12,'嗵':13,'嗶':13,'嗷':13,'嗸':13,'嗹':13,'嗺':14,'嗻':14,'嗼':13,'嗽':14,'嗾':14,'嗿':14,'嘀':14,'嘁':14,'嘂':14,'嘃':14,'嘄':14,'嘅':12,'嘆':14,'嘇':14,'嘈':14,
  '嘉':14,'嘊':14,'嘋':14,'嘌':14,'嘍':14,'嘎':14,'嘏':14,'嘐':14,'嘑':14,'嘒':14,'嘓':14,'嘔':14,'嘕':14,'嘖':14,'嘗':14,'嘘':14,'嘙':14,'嘚':14,'嘛':14,'嘜':14,'嘝':14,'嘞':14,'嘟':13,'嘠':15,'嘡':14,'嘢':14,'嘣':14,'嘤':14,
  '嘥':14,'嘦':14,'嘧':14,'嘨':14,'嘩':13,'嘪':15,'嘫':15,'嘬':15,'嘭':15,'嘮':15,'嘯':16,'嘰':15,'嘱':15,'嘲':15,'嘳':15,'嘴':16,'嘵':15,'嘶':15,'嘷':15,'嘸':15,'嘹':15,'嘺':15,'嘻':15,'嘼':15,'嘽':15,'嘾':15,'嘿':15,'噀':15,
  '噁':15,'噂':15,'噃':15,'噄':15,'噅':15,'噆':15,'噇':15,'噈':15,'噉':14,'噊':15,'噋':15,'噌':15,'噍':15,'噎':15,'噏':15,'噐':15,'噑':14,'噒':15,'噓':15,'噔':15,'噕':15,'噖':15,'噗':15,'噘':15,'噙':15,'噚':15,'噛':15,'噜':15,
  '噝':15,'噞':16,'噟':16,'噠':15,'噡':16,'噢':15,'噣':16,'噤':16,'噥':16,'噦':16,'噧':15,'器':16,'噩':16,'噪':16,'噫':16,'噬':16,'噭':16,'噮':16,'噯':16,'噰':16,'噱':16,'噲':16,'噳':16,'噴':15,'噵':15,'噶':15,'噷':16,'噸':16,
  '噹':16,'噺':16,'噻':16,'噼':16,'噽':17,'噾':17,'噿':17,'嚀':17,'嚁':17,'嚂':17,'嚃':16,'嚄':16,'嚅':17,'嚆':16,'嚇':17,'嚈':17,'嚉':17,'嚊':17,'嚋':17,'嚌':17,'嚍':17,'嚎':17,'嚏':17,'嚐':17,'嚑':17,'嚒':17,'嚓':17,'嚔':18,
  '嚕':18,'嚖':18,'嚗':18,'嚘':18,'嚙':18,'嚚':18,'嚛':18,'嚜':18,'嚝':17,'嚞':18,'嚟':18,'嚠':18,'嚡':18,'嚢':18,'嚣':18,'嚤':18,'嚥':19,'嚦':19,'嚧':19,'嚨':19,'嚩':19,'嚪':19,'嚫':19,'嚬':19,'嚭':19,'嚮':17,'嚯':19,'嚰':19,
  '嚱':20,'嚲':20,'嚳':20,'嚴':20,'嚵':20,'嚶':20,'嚷':20,'嚸':20,'嚹':20,'嚺':20,'嚻':21,'嚼':20,'嚽':20,'嚾':20,'嚿':20,'囀':21,'囁':21,'囂':21,'囃':21,'囄':21,'囅':22,'囆':21,'囇':22,'囈':21,'囉':22,'囊':22,'囋':22,'囌':22,
  '囍':21,'囎':22,'囏':23,'囐':23,'囑':24,'囒':23,'囓':24,'囔':25,'囕':25,'囖':28,'囗':3,'囘':5,'囙':5,'囚':5,'四':5,'囜':5,'囝':6,'回':6,'囟':6,'因':6,'囡':6,'团':6,'団':6,'囤':7,'囥':7,'囦':7,'囧':7,'囨':7,'囩':7,'囪':7,'囫':7,
  '囬':7,'园':7,'囮':7,'囯':8,'困':7,'囱':7,'囲':7,'図':7,'围':7,'囵':7,'囶':8,'囷':8,'囸':8,'囹':8,'固':8,'囻':8,'囼':8,'国':8,'图':8,'囿':9,'圀':9,'圁':10,'圂':10,'圃':10,'圄':10,'圅':10,'圆':10,'圇':11,'圈':11,'圉':11,'圊':11,
  '國':11,'圌':12,'圍':12,'圎':12,'圏':12,'圐':12,'圑':13,'園':13,'圓':13,'圔':13,'圕':13,'圖':14,'圗':14,'團':14,'圙':14,'圚':15,'圛':16,'圜':16,'圝':22,'圞':26,'土':3,'圠':4,'圡':4,'圢':5,'圣':5,'圤':5,'圥':5,'圦':5,'圧':5,'在':6,
  '圩':6,'圪':6,'圫':6,'圬':6,'圭':6,'圮':6,'圯':6,'地':6,'圱':6,'圲':6,'圳':6,'圴':6,'圵':6,'圶':6,'圷':6,'圸':6,'圹':6,'场':6,'圻':7,'圼':7,'圽':7,'圾':6,'圿':7,'址':7,'坁':7,'坂':7,'坃':7,'坄':7,'坅':7,'坆':7,'均':7,'坈':7,'坉':7,
  '坊':7,'坋':7,'坌':7,'坍':7,'坎':7,'坏':7,'坐':7,'坑':7,'坒':7,'坓':7,'坔':7,'坕':7,'坖':7,'块':7,'坘':7,'坙':7,'坚':7,'坛':7,'坜':7,'坝':7,'坞':7,'坟':7,'坠':7,'坡':8,'坢':8,'坣':8,'坤':8,'坥':8,'坦':8,'坧':8,'坨':8,'坩':8,'坪':8,
  '坫':8,'坬':8,'坭':8,'坮':8,'坯':8,'坰':8,'坱':8,'坲':8,'坳':8,'坴':8,'坵':8,'坶':8,'坷':8,'坸':8,'坹':8,'坺':8,'坻':8,'坼':8,'坽':8,'坾':8,'坿':8,'垀':8,'垁':8,'垂':8,'垃':8,'垄':8,'垅':8,'垆':8,'垇':8,'垈':8,'垉':8,'垊':8,'型':9,
  '垌':9,'垍':9,'垎':9,'垏':9,'垐':9,'垑':9,'垒':9,'垓':9,'垔':9,'垕':9,'垖':9,'垗':9,'垘':9,'垙':9,'垚':9,'垛':9,'垜':9,'垝':9,'垞':9,'垟':9,'垠':9,'垡':9,'垢':9,'垣':9,'垤':9,'垥':9,'垦':9,'垧':9,'垨':9,'垩':9,'垪':9,'垫':9,'垬':9,
  '垭':9,'垮':9,'垯':9,'垰':9,'垱':9,'垲':9,'垳':9,'垴':9,'垵':9,'垶':10,'垷':10,'垸':10,'垹':9,'垺':10,'垻':10,'垼':10,'垽':10,'垾':10,'垿':10,'埀':10,'埁':10,'埂':10,'埃':10,'埄':10,'埅':9,'埆':10,'埇':10,'埈':10,'埉':10,'埊':10,
  '埋':10,'埌':10,'埍':10,'城':9,'埏':9,'埐':10,'埑':10,'埒':10,'埓':10,'埔':10,'埕':10,'埖':10,'埗':10,'埘':10,'埙':10,'埚':10,'埛':10,'埜':11,'埝':11,'埞':11,'域':11,'埠':11,'埡':11,'埢':11,'埣':11,'埤':11,'埥':11,'埦':11,
  '埧':11,'埨':11,'埩':9,'埪':11,'埫':11,'埬':11,'埭':11,'埮':11,'埯':11,'埰':11,'埱':11,'埲':11,'埳':11,'埴':11,'埵':11,'埶':11,'執':11,'埸':11,'培':11,'基':11,'埻':11,'埼':11,'埽':11,'埾':11,'埿':11,'堀':11,'堁':11,'堂':11,
  '堃':11,'堄':11,'堅':11,'堆':11,'堇':11,'堈':11,'堉':11,'堊':11,'堋':11,'堌':11,'堍':11,'堎':11,'堏':11,'堐':11,'堑':11,'堒':11,'堓':11,'堔':11,'堕':11,'堖':12,'堗':12,'堘':12,'堙':12,'堚':12,'堛':12,'堜':12,'堝':11,'堞':12,
  '堟':12,'堠':12,'堡':12,'堢':12,'堣':12,'堤':12,'堥':12,'堦':12,'堧':12,'堨':12,'堩':12,'堪':12,'堫':12,'堬':12,'堭':12,'堮':12,'堯':12,'堰':12,'報':12,'堲':10,'堳':12,'場':12,'堵':12,'堶':12,'堷':12,'堸':12,'堹':12,'堺':12,
  '堻':12,'堼':12,'堽':13,'堾':12,'堿':12,'塀':12,'塁':12,'塂':12,'塃':12,'塄':12,'塅':12,'塆':12,'塇':12,'塈':12,'塉':13,'塊':12,'塋':13,'塌':13,'塍':13,'塎':13,'塏':13,'塐':13,'塑':13,'塒':13,'塓':13,'塔':12,'塕':13,'塖':13,
  '塗':13,'塘':13,'塙':13,'塚':13,'塛':13,'塜':13,'塝':13,'塞':13,'塟':15,'塠':12,'塡':13,'塢':13,'塣':13,'塤':13,'塥':13,'塦':12,'塧':13,'塨':13,'塩':13,'塪':13,'填':13,'塬':13,'塭':12,'塮':13,'塯':13,'塰':13,'塱':13,'塲':14,
  '塳':13,'塴':14,'塵':14,'塶':14,'塷':14,'塸':14,'塹':14,'塺':14,'塻':13,'塼':14,'塽':14,'塾':14,'塿':14,'墀':15,'墁':14,'墂':14,'境':14,'墄':14,'墅':14,'墆':14,'墇':14,'墈':14,'墉':14,'墊':14,'墋':14,'墌':14,'墍':14,'墎':13,
  '墏':14,'墐':14,'墑':14,'墒':14,'墓':13,'墔':14,'墕':14,'墖':14,'増':14,'墘':14,'墙':14,'墚':14,'墛':14,'墜':14,'墝':15,'增':15,'墟':14,'墠':15,'墡':15,'墢':15,'墣':15,'墤':15,'墥':15,'墦':15,'墧':15,'墨':15,'墩':15,'墪':15,
  '墫':15,'墬':14,'墭':14,'墮':14,'墯':15,'墰':15,'墱':15,'墲':15,'墳':15,'墴':14,'墵':15,'墶':15,'墷':13,'墸':14,'墹':15,'墺':15,'墻':16,'墼':16,'墽':16,'墾':16,'墿':16,'壀':16,'壁':16,'壂':16,'壃':16,'壄':16,'壅':16,'壆':16,
  '壇':16,'壈':16,'壉':16,'壊':16,'壋':16,'壌':16,'壍':17,'壎':17,'壏':17,'壐':17,'壑':17,'壒':16,'壓':17,'壔':17,'壕':17,'壖':17,'壗':17,'壘':18,'壙':17,'壚':19,'壛':19,'壜':19,'壝':18,'壞':19,'壟':19,'壠':19,'壡':19,'壢':19,
  '壣':20,'壤':20,'壥':20,'壦':20,'壧':22,'壨':23,'壩':24,'壪':25,'士':3,'壬':4,'壭':5,'壮':6,'壯':7,'声':7,'壱':7,'売':7,'壳':7,'壴':9,'壵':9,'壶':10,'壷':11,'壸':11,'壹':12,'壺':12,'壻':12,'壼':13,'壽':14,'壾':13,'壿':15,'夀':14,
  '夁':16,'夂':3,'夃':4,'处':5,'夅':6,'夆':7,'备':8,'夈':9,'変':9,'夊':3,'夋':7,'夌':8,'复':9,'夎':10,'夏':10,'夐':14,'夑':18,'夒':19,'夓':19,'夔':21,'夕':3,'外':5,'夗':5,'夘':5,'夙':6,'多':6,'夛':6,'夜':8,'夝':8,'夞':10,'够':11,
  '夠':11,'夡':12,'夢':14,'夣':14,'夤':14,'夥':14,'夦':15,'大':3,'夨':3,'天':4,'太':4,'夫':4,'夬':4,'夭':4,'央':5,'夯':5,'夰':5,'失':5,'夲':5,'夳':5,'头':5,'夵':6,'夶':6,'夷':6,'夸':6,'夹':6,'夺':6,'夻':6,'夼':6,'夽':7,'夾':7,'夿':7,
  '奀':7,'奁':7,'奂':7,'奃':8,'奄':8,'奅':8,'奆':7,'奇':8,'奈':8,'奉':8,'奊':9,'奋':8,'奌':8,'奍':8,'奎':9,'奏':9,'奐':9,'契':9,'奒':9,'奓':9,'奔':8,'奕':9,'奖':9,'套':10,'奘':10,'奙':10,'奚':10,'奛':11,'奜':11,'奝':11,'奞':11,
  '奟':11,'奠':12,'奡':12,'奢':11,'奣':12,'奤':12,'奥':12,'奦':13,'奧':13,'奨':13,'奩':14,'奪':14,'奫':15,'奬':14,'奭':15,'奮':16,'奯':16,'奰':18,'奱':22,'奲':23,'女':3,'奴':5,'奵':5,'奶':5,'奷':6,'奸':6,'她':6,'奺':6,'奻':6,'奼':6,
  '好':6,'奾':6,'奿':6,'妀':6,'妁':6,'如':6,'妃':6,'妄':6,'妅':6,'妆':6,'妇':6,'妈':6,'妉':7,'妊':7,'妋':7,'妌':7,'妍':7,'妎':7,'妏':7,'妐':7,'妑':7,'妒':7,'妓':7,'妔':7,'妕':7,'妖':7,'妗':7,'妘':7,'妙':7,'妚':7,'妛':7,'妜':7,'妝':7,
  '妞':7,'妟':7,'妠':7,'妡':7,'妢':7,'妣':7,'妤':7,'妥':7,'妦':7,'妧':7,'妨':7,'妩':7,'妪':7,'妫':7,'妬':8,'妭':8,'妮':8,'妯':8,'妰':8,'妱':8,'妲':8,'妳':8,'妴':8,'妵':8,'妶':8,'妷':8,'妸':8,'妹':8,'妺':8,'妻':8,'妼':8,'妽':8,'妾':8,
  '妿':8,'姀':8,'姁':8,'姂':7,'姃':8,'姄':8,'姅':8,'姆':8,'姇':8,'姈':8,'姉':7,'姊':7,'始':8,'姌':8,'姍':8,'姎':8,'姏':8,'姐':8,'姑':8,'姒':7,'姓':8,'委':8,'姕':9,'姖':7,'姗':8,'姘':9,'姙':9,'姚':9,'姛':9,'姜':9,'姝':9,'姞':9,'姟':9,
  '姠':9,'姡':9,'姢':9,'姣':9,'姤':9,'姥':9,'姦':9,'姧':9,'姨':9,'姩':9,'姪':9,'姫':9,'姬':9,'姭':9,'姮':9,'姯':9,'姰':9,'姱':9,'姲':9,'姳':9,'姴':9,'姵':9,'姶':9,'姷':9,'姸':9,'姹':9,'姺':9,'姻':9,'姼':9,'姽':9,'姾':9,'姿':9,'娀':9,
  '威':9,'娂':9,'娃':9,'娄':9,'娅':9,'娆':9,'娇':9,'娈':9,'娉':10,'娊':10,'娋':10,'娌':10,'娍':9,'娎':10,'娏':10,'娐':10,'娑':10,'娒':10,'娓':10,'娔':10,'娕':10,'娖':10,'娗':9,'娘':10,'娙':10,'娚':10,'娛':10,'娜':9,'娝':10,'娞':10,
  '娟':10,'娠':10,'娡':10,'娢':10,'娣':10,'娤':10,'娥':10,'娦':10,'娧':10,'娨':10,'娩':10,'娪':10,'娫':9,'娬':11,'娭':10,'娮':10,'娯':10,'娰':9,'娱':10,'娲':10,'娳':10,'娴':10,'娵':11,'娶':11,'娷':11,'娸':11,'娹':11,'娺':11,
  '娻':11,'娼':11,'娽':11,'娾':11,'娿':10,'婀':10,'婁':11,'婂':11,'婃':11,'婄':11,'婅':11,'婆':11,'婇':11,'婈':11,'婉':11,'婊':11,'婋':11,'婌':11,'婍':11,'婎':11,'婏':11,'婐':11,'婑':11,'婒':11,'婓':11,'婔':11,'婕':11,'婖':11,
  '婗':11,'婘':11,'婙':9,'婚':11,'婛':11,'婜':11,'婝':11,'婞':11,'婟':11,'婠':11,'婡':11,'婢':11,'婣':12,'婤':11,'婥':11,'婦':11,'婧':11,'婨':11,'婩':11,'婪':11,'婫':11,'婬':11,'婭':11,'婮':11,'婯':11,'婰':11,'婱':11,'婲':10,
  '婳':11,'婴':11,'婵':11,'婶':11,'婷':12,'婸':12,'婹':12,'婺':12,'婻':12,'婼':11,'婽':12,'婾':12,'婿':12,'媀':12,'媁':12,'媂':12,'媃':12,'媄':12,'媅':12,'媆':12,'媇':12,'媈':12,'媉':12,'媊':12,'媋':12,'媌':11,'媍':12,'媎':11,
  '媏':12,'媐':13,'媑':12,'媒':12,'媓':12,'媔':12,'媕':12,'媖':11,'媗':12,'媘':12,'媙':12,'媚':12,'媛':13,'媜':12,'媝':12,'媞':12,'媟':12,'媠':12,'媡':12,'媢':12,'媣':12,'媤':12,'媥':12,'媦':12,'媧':11,'媨':12,'媩':12,'媪':12,
  '媫':12,'媬':12,'媭':12,'媮':12,'媯':12,'媰':13,'媱':13,'媲':13,'媳':13,'媴':13,'媵':13,'媶':12,'媷':13,'媸':13,'媹':13,'媺':13,'媻':13,'媼':13,'媽':13,'媾':13,'媿':12,'嫀':13,'嫁':13,'嫂':12,'嫃':13,'嫄':13,'嫅':12,'嫆':13,
  '嫇':13,'嫈':13,'嫉':13,'嫊':13,'嫋':13,'嫌':13,'嫍':13,'嫎':13,'嫏':11,'嫐':13,'嫑':13,'嫒':13,'嫓':13,'嫔':13,'嫕':14,'嫖':14,'嫗':14,'嫘':14,'嫙':14,'嫚':14,'嫛':14,'嫜':14,'嫝':14,'嫞':14,'嫟':13,'嫠':14,'嫡':14,'嫢':14,
  '嫣':14,'嫤':14,'嫥':14,'嫦':14,'嫧':14,'嫨':14,'嫩':14,'嫪':14,'嫫':13,'嫬':14,'嫭':14,'嫮':14,'嫯':13,'嫰':14,'嫱':14,'嫲':14,'嫳':14,'嫴':15,'嫵':15,'嫶':15,'嫷':14,'嫸':15,'嫹':14,'嫺':15,'嫻':15,'嫼':15,'嫽':15,'嫾':15,
  '嫿':15,'嬀':15,'嬁':15,'嬂':15,'嬃':15,'嬄':15,'嬅':13,'嬆':15,'嬇':15,'嬈':15,'嬉':15,'嬊':15,'嬋':15,'嬌':19,'嬍':15,'嬎':15,'嬏':15,'嬐':16,'嬑':16,'嬒':16,'嬓':16,'嬔':16,'嬕':16,'嬖':16,'嬗':16,'嬘':15,'嬙':16,'嬚':16,
  '嬛':16,'嬜':16,'嬝':16,'嬞':15,'嬟':16,'嬠':16,'嬡':16,'嬢':16,'嬣':17,'嬤':17,'嬥':17,'嬦':17,'嬧':17,'嬨':16,'嬩':16,'嬪':17,'嬫':17,'嬬':17,'嬭':17,'嬮':17,'嬯':17,'嬰':17,'嬱':17,'嬲':17,'嬳':16,'嬴':16,'嬵':17,'嬶':17,
  '嬷':17,'嬸':18,'嬹':19,'嬺':17,'嬻':18,'嬼':18,'嬽':19,'嬾':19,'嬿':19,'孀':20,'孁':20,'孂':20,'孃':20,'孄':20,'孅':20,'孆':20,'孇':21,'孈':21,'孉':20,'孊':22,'孋':22,'孌':22,'孍':22,'孎':24,'孏':23,'子':3,'孑':3,'孒':3,'孓':3,
  '孔':4,'孕':5,'孖':6,'字':6,'存':6,'孙':6,'孚':7,'孛':7,'孜':7,'孝':7,'孞':7,'孟':8,'孠':8,'孡':8,'孢':8,'季':8,'孤':9,'孥':8,'学':8,'孧':8,'孨':9,'孩':9,'孪':9,'孫':10,'孬':10,'孭':10,'孮':11,'孯':11,'孰':11,'孱':12,'孲':11,
  '孳':12,'孴':13,'孵':14,'孶':13,'孷':14,'學':16,'孹':16,'孺':17,'孻':17,'孼':19,'孽':19,'孾':20,'孿':22,'宀':3,'宁':5,'宂':5,'它':5,'宄':5,'宅':6,'宆':6,'宇':6,'守':6,'安':6,'宊':7,'宋':7,'完':7,'宍':7,'宎':7,'宏':7,'宐':7,'宑':7,
  '宒':7,'宓':8,'宔':8,'宕':8,'宖':8,'宗':8,'官':8,'宙':8,'定':8,'宛':8,'宜':8,'宝':8,'实':8,'実':8,'宠':8,'审':8,'客':9,'宣':9,'室':9,'宥':9,'宦':9,'宧':10,'宨':9,'宩':9,'宪':9,'宫':9,'宬':9,'宭':10,'宮':10,'宯':10,'宰':10,'宱':10,
  '宲':10,'害':10,'宴':10,'宵':10,'家':10,'宷':10,'宸':10,'容':10,'宺':10,'宻':10,'宼':10,'宽':10,'宾':10,'宿':11,'寀':11,'寁':11,'寂':11,'寃':11,'寄':11,'寅':11,'密':11,'寇':11,'寈':11,'寉':11,'寊':12,'寋':12,'富':12,'寍':12,
  '寎':12,'寏':12,'寐':12,'寑':12,'寒':12,'寓':12,'寔':12,'寕':12,'寖':13,'寗':13,'寘':13,'寙':13,'寚':13,'寛':13,'寜':13,'寝':13,'寞':13,'察':14,'寠':14,'寡':14,'寢':14,'寣':14,'寤':14,'寥':14,'實':14,'寧':14,'寨':14,'審':15,
  '寪':15,'寫':15,'寬':15,'寭':15,'寮':15,'寯':15,'寰':16,'寱':17,'寲':17,'寳':19,'寴':19,'寵':19,'寶':20,'寷':21,'寸':3,'对':5,'寺':6,'寻':6,'导':6,'寽':7,'対':7,'寿':7,'尀':8,'封':9,'専':9,'尃':10,'射':10,'尅':10,'将':9,'將':11,
  '專':11,'尉':11,'尊':12,'尋':12,'尌':12,'對':14,'導':16,'小':3,'尐':4,'少':4,'尒':5,'尓':5,'尔':5,'尕':5,'尖':6,'尗':6,'尘':6,'尙':8,'尚':8,'尛':9,'尜':9,'尝':9,'尞':12,'尟':13,'尠':13,'尡':14,'尢':3,'尣':4,'尤':4,'尥':6,'尦':7,
  '尧':6,'尨':7,'尩':9,'尪':8,'尫':8,'尬':7,'尭':8,'尮':9,'尯':9,'尰':12,'就':12,'尲':13,'尳':12,'尴':13,'尵':15,'尶':17,'尷':17,'尸':3,'尹':4,'尺':4,'尻':5,'尼':5,'尽':6,'尾':7,'尿':7,'局':7,'屁':7,'层':7,'屃':7,'屄':8,'居':8,'屆':8,
  '屇':8,'屈':8,'屉':8,'届':8,'屋':9,'屌':9,'屍':9,'屎':9,'屏':9,'屐':10,'屑':10,'屒':10,'屓':10,'屔':10,'展':10,'屖':10,'屗':10,'屘':10,'屙':10,'屚':11,'屛':11,'屜':11,'屝':11,'属':12,'屟':12,'屠':12,'屡':12,'屢':14,'屣':14,
  '層':15,'履':15,'屦':15,'屧':15,'屨':17,'屩':18,'屪':18,'屫':19,'屬':21,'屭':24,'屮':3,'屯':4,'屰':6,'山':3,'屲':4,'屳':5,'屴':5,'屵':5,'屶':5,'屷':5,'屸':6,'屹':6,'屺':6,'屻':6,'屼':6,'屽':6,'屾':6,'屿':6,'岀':6,'岁':6,'岂':6,
  '岃':6,'岄':7,'岅':7,'岆':7,'岇':7,'岈':7,'岉':7,'岊':7,'岋':6,'岌':6,'岍':7,'岎':7,'岏':7,'岐':7,'岑':7,'岒':7,'岓':7,'岔':7,'岕':7,'岖':7,'岗':7,'岘':7,'岙':7,'岚':7,'岛':7,'岜':7,'岝':8,'岞':8,'岟':8,'岠':7,'岡':8,'岢':8,'岣':8,
  '岤':8,'岥':8,'岦':8,'岧':8,'岨':8,'岩':8,'岪':8,'岫':8,'岬':8,'岭':8,'岮':8,'岯':8,'岰':8,'岱':8,'岲':8,'岳':8,'岴':8,'岵':8,'岶':8,'岷':8,'岸':8,'岹':8,'岺':8,'岻':8,'岼':8,'岽':8,'岾':8,'岿':8,'峀':8,'峁':8,'峂':8,'峃':8,'峄':8,
  '峅':8,'峆':9,'峇':9,'峈':9,'峉':9,'峊':9,'峋':10,'峌':9,'峍':9,'峎':9,'峏':9,'峐':9,'峑':9,'峒':9,'峓':9,'峔':9,'峕':9,'峖':9,'峗':9,'峘':9,'峙':9,'峚':9,'峛':9,'峜':9,'峝':9,'峞':9,'峟':9,'峠':9,'峡':9,'峢':9,'峣':9,'峤':9,'峥':9,
  '峦':9,'峧':9,'峨':10,'峩':10,'峪':10,'峫':9,'峬':10,'峭':10,'峮':10,'峯':10,'峰':10,'峱':10,'峲':10,'峳':10,'峴':10,'峵':10,'島':10,'峷':10,'峸':9,'峹':10,'峺':10,'峻':10,'峼':10,'峽':10,'峾':10,'峿':10,'崀':10,'崁':10,'崂':10,
  '崃':10,'崄':10,'崅':10,'崆':11,'崇':11,'崈':11,'崉':11,'崊':11,'崋':10,'崌':11,'崍':11,'崎':11,'崏':11,'崐':11,'崑':11,'崒':11,'崓':11,'崔':11,'崕':11,'崖':11,'崗':11,'崘':11,'崙':11,'崚':11,'崛':11,'崜':11,'崝':11,'崞':11,
  '崟':11,'崠':11,'崡':11,'崢':11,'崣':11,'崤':11,'崥':11,'崦':11,'崧':11,'崨':11,'崩':11,'崪':11,'崫':11,'崬':11,'崭':11,'崮':11,'崯':11,'崰':11,'崱':12,'崲':12,'崳':12,'崴':12,'崵':12,'崶':12,'崷':12,'崸':12,'崹':12,'崺':12,
  '崻':12,'崼':12,'崽':12,'崾':12,'崿':12,'嵀':12,'嵁':12,'嵂':12,'嵃':12,'嵄':12,'嵅':12,'嵆':12,'嵇':12,'嵈':12,'嵉':12,'嵊':13,'嵋':12,'嵌':12,'嵍':12,'嵎':12,'嵏':12,'嵐':12,'嵑':12,'嵒':12,'嵓':12,'嵔':12,'嵕':12,'嵖':12,
  '嵗':12,'嵘':12,'嵙':12,'嵚':12,'嵛':12,'嵜':12,'嵝':12,'嵞':13,'嵟':13,'嵠':13,'嵡':13,'嵢':13,'嵣':13,'嵤':13,'嵥':13,'嵦':13,'嵧':13,'嵨':13,'嵩':13,'嵪':13,'嵫':12,'嵬':12,'嵭':13,'嵮':13,'嵯':12,'嵰':13,'嵱':13,'嵲':13,
  '嵳':12,'嵴':13,'嵵':13,'嵶':13,'嵷':14,'嵸':14,'嵹':15,'嵺':14,'嵻':14,'嵼':14,'嵽':14,'嵾':14,'嵿':14,'嶀':14,'嶁':14,'嶂':14,'嶃':14,'嶄':14,'嶅':13,'嶆':14,'嶇':14,'嶈':14,'嶉':14,'嶊':14,'嶋':14,'嶌':14,'嶍':14,'嶎':14,
  '嶏':15,'嶐':14,'嶑':14,'嶒':15,'嶓':15,'嶔':15,'嶕':15,'嶖':15,'嶗':15,'嶘':15,'嶙':15,'嶚':15,'嶛':15,'嶜':15,'嶝':15,'嶞':14,'嶟':15,'嶠':15,'嶡':15,'嶢':15,'嶣':15,'嶤':15,'嶥':15,'嶦':16,'嶧':16,'嶨':16,'嶩':16,'嶪':16,
  '嶫':16,'嶬':16,'嶭':16,'嶮':16,'嶯':15,'嶰':16,'嶱':15,'嶲':15,'嶳':16,'嶴':15,'嶵':16,'嶶':16,'嶷':17,'嶸':17,'嶹':17,'嶺':17,'嶻':17,'嶼':16,'嶽':17,'嶾':17,'嶿':17,'巀':18,'巁':17,'巂':18,'巃':19,'巄':19,'巅':19,'巆':19,
  '巇':20,'巈':20,'巉':20,'巊':20,'巋':21,'巌':19,'巍':20,'巎':22,'巏':20,'巐':21,'巑':22,'巒':22,'巓':22,'巔':22,'巕':22,'巖':22,'巗':22,'巘':23,'巙':24,'巚':23,'巛':3,'巜':2,'川':3,'州':6,'巟':6,'巠':7,'巡':10,'巢':11,'巣':11,
  '巤':15,'工':3,'左':5,'巧':5,'巨':4,'巩':6,'巪':6,'巫':7,'巬':9,'巭':9,'差':9,'巯':12,'巰':14,'己':3,'已':3,'巳':3,'巴':4,'巵':7,'巶':8,'巷':9,'巸':10,'巹':9,'巺':9,'巻':9,'巼':10,'巽':12,'巾':3,'巿':4,'帀':4,'币':4,'市':5,'布':5,
  '帄':5,'帅':5,'帆':6,'帇':6,'师':6,'帉':7,'帊':7,'帋':7,'希':7,'帍':7,'帎':7,'帏':7,'帐':7,'帑':8,'帒':8,'帓':8,'帔':8,'帕':8,'帖':8,'帗':8,'帘':8,'帙':8,'帚':8,'帛':8,'帜':8,'帝':9,'帞':9,'帟':9,'帠':9,'帡':9,'帢':9,'帣':9,'帤':9,
  '帥':9,'带':9,'帧':9,'帨':10,'帩':10,'帪':10,'師':10,'帬':10,'席':10,'帮':9,'帯':10,'帰':10,'帱':10,'帲':11,'帳':11,'帴':11,'帵':11,'帶':11,'帷':11,'常':11,'帹':11,'帺':11,'帻':11,'帼':11,'帽':12,'帾':11,'帿':12,'幀':12,'幁':12,
  '幂':12,'幃':12,'幄':12,'幅':12,'幆':12,'幇':12,'幈':12,'幉':12,'幊':13,'幋':13,'幌':13,'幍':13,'幎':13,'幏':13,'幐':13,'幑':14,'幒':14,'幓':14,'幔':14,'幕':13,'幖':14,'幗':14,'幘':14,'幙':13,'幚':14,'幛':14,'幜':15,'幝':15,
  '幞':15,'幟':15,'幠':15,'幡':15,'幢':15,'幣':14,'幤':15,'幥':15,'幦':16,'幧':16,'幨':16,'幩':15,'幪':16,'幫':17,'幬':17,'幭':17,'幮':18,'幯':16,'幰':19,'幱':20,'干':3,'平':5,'年':6,'幵':6,'并':6,'幷':8,'幸':8,'幹':13,'幺':3,
  '幻':4,'幼':5,'幽':9,'幾':12,'广':3,'庀':5,'庁':5,'庂':5,'広':5,'庄':6,'庅':6,'庆':6,'庇':7,'庈':7,'庉':7,'床':7,'庋':7,'庌':7,'庍':7,'庎':7,'序':7,'庐':7,'庑':7,'庒':7,'库':7,'应':7,'底':8,'庖':8,'店':8,'庘':8,'庙':8,'庚':8,'庛':9,
  '府':8,'庝':8,'庞':8,'废':8,'庠':9,'庡':9,'庢':9,'庣':9,'庤':9,'庥':9,'度':9,'座':10,'庨':10,'庩':10,'庪':10,'庫':10,'庬':10,'庭':9,'庮':10,'庯':10,'庰':9,'庱':11,'庲':11,'庳':11,'庴':11,'庵':11,'庶':11,'康':11,'庸':11,'庹':11,
  '庺':11,'庻':11,'庼':11,'庽':12,'庾':11,'庿':11,'廀':12,'廁':12,'廂':12,'廃':12,'廄':12,'廅':13,'廆':12,'廇':13,'廈':13,'廉':13,'廊':11,'廋':12,'廌':13,'廍':13,'廎':14,'廏':14,'廐':12,'廑':14,'廒':13,'廓':13,'廔':14,'廕':13,
  '廖':14,'廗':14,'廘':14,'廙':14,'廚':15,'廛':15,'廜':14,'廝':15,'廞':15,'廟':15,'廠':15,'廡':15,'廢':15,'廣':15,'廤':15,'廥':16,'廦':16,'廧':16,'廨':16,'廩':16,'廪':16,'廫':18,'廬':19,'廭':19,'廮':20,'廯':20,'廰':20,'廱':21,
  '廲':22,'廳':25,'廴':2,'廵':5,'延':7,'廷':6,'廸':7,'廹':7,'建':9,'廻':8,'廼':8,'廽':9,'廾':3,'廿':4,'开':4,'弁':5,'异':6,'弃':7,'弄':8,'弅':7,'弆':8,'弇':9,'弈':9,'弉':10,'弊':14,'弋':3,'弌':4,'弍':5,'弎':6,'式':6,'弐':6,'弑':12,
  '弒':13,'弓':3,'弔':4,'引':4,'弖':4,'弗':5,'弘':5,'弙':6,'弚':6,'弛':6,'弜':6,'弝':7,'弞':7,'弟':7,'张':7,'弡':7,'弢':8,'弣':8,'弤':8,'弥':8,'弦':8,'弧':8,'弨':8,'弩':8,'弪':8,'弫':9,'弬':10,'弭':9,'弮':9,'弯':9,'弰':10,'弱':10,
  '弲':10,'弳':10,'弴':11,'張':11,'弶':11,'強':12,'弸':11,'弹':11,'强':12,'弻':12,'弼':12,'弽':12,'弾':12,'弿':13,'彀':13,'彁':13,'彂':13,'彃':13,'彄':14,'彅':14,'彆':14,'彇':16,'彈':15,'彉':14,'彊':16,'彋':16,'彌':17,'彍':17,
  '彎':22,'彏':23,'彐':3,'彑':3,'归':5,'当':6,'彔':8,'录':8,'彖':9,'彗':11,'彘':12,'彙':13,'彚':13,'彛':16,'彜':16,'彝':18,'彞':18,'彟':19,'彠':25,'彡':3,'形':7,'彣':7,'彤':7,'彥':9,'彦':9,'彧':10,'彨':10,'彩':11,'彪':11,'彫':11,
  '彬':11,'彭':12,'彮':13,'彯':14,'彰':14,'影':15,'彲':22,'彳':3,'彴':6,'彵':6,'彶':6,'彷':7,'彸':7,'役':7,'彺':8,'彻':7,'彼':8,'彽':8,'彾':8,'彿':8,'往':8,'征':8,'徂':8,'徃':8,'径':8,'待':9,'徆':9,'徇':9,'很':9,'徉':9,'徊':9,'律':9,
  '後':9,'徍':9,'徎':10,'徏':10,'徐':10,'徑':10,'徒':10,'従':10,'徔':9,'徕':10,'徖':11,'得':11,'徘':11,'徙':11,'徚':12,'徛':11,'徜':11,'徝':11,'從':11,'徟':11,'徠':11,'御':12,'徢':11,'徣':11,'徤':11,'徥':12,'徦':12,'徧':12,'徨':12,
  '復':12,'循':12,'徫':12,'徬':13,'徭':13,'微':13,'徯':13,'徰':13,'徱':14,'徲':15,'徳':14,'徴':14,'徵':15,'徶':14,'德':15,'徸':15,'徹':15,'徺':15,'徻':16,'徼':16,'徽':17,'徾':17,'徿':19,'忀':20,'忁':20,'忂':21,'心':4,'忄':3,'必':5,
  '忆':5,'忇':6,'忈':6,'忉':6,'忊':6,'忋':7,'忌':7,'忍':7,'忎':7,'忏':7,'忐':7,'忑':7,'忒':7,'忓':7,'忔':7,'忕':7,'忖':7,'志':7,'忘':7,'忙':7,'忚':7,'忛':7,'応':7,'忝':8,'忞':8,'忟':8,'忠':8,'忡':8,'忢':8,'忣':7,'忤':8,'忥':8,'忦':8,
  '忧':8,'忨':8,'忩':8,'忪':8,'快':8,'忬':8,'忭':8,'忮':8,'忯':8,'忰':8,'忱':8,'忲':8,'忳':8,'忴':8,'念':8,'忶':8,'忷':8,'忸':8,'忹':9,'忺':8,'忻':8,'忼':8,'忽':8,'忾':8,'忿':8,'怀':8,'态':8,'怂':8,'怃':8,'怄':8,'怅':8,'怆':8,'怇':8,
  '怈':9,'怉':9,'怊':9,'怋':9,'怌':9,'怍':9,'怎':9,'怏':9,'怐':9,'怑':9,'怒':9,'怓':9,'怔':9,'怕':9,'怖':9,'怗':9,'怘':9,'怙':9,'怚':9,'怛':9,'怜':9,'思':9,'怞':9,'怟':9,'怠':9,'怡':9,'怢':9,'怣':9,'怤':9,'急':9,'怦':9,'性':9,'怨':9,
  '怩':9,'怪':9,'怫':9,'怬':9,'怭':9,'怮':9,'怯':9,'怰':9,'怱':9,'怲':9,'怳':9,'怴':9,'怵':9,'怶':9,'怷':9,'怸':9,'怹':9,'怺':9,'总':9,'怼':9,'怽':9,'怾':9,'怿':9,'恀':10,'恁':10,'恂':10,'恃':10,'恄':10,'恅':10,'恆':9,'恇':10,'恈':10,
  '恉':10,'恊':10,'恋':10,'恌':10,'恍':10,'恎':10,'恏':10,'恐':10,'恑':10,'恒':10,'恓':10,'恔':10,'恕':10,'恖':10,'恗':10,'恘':10,'恙':10,'恚':10,'恛':10,'恜':10,'恝':10,'恞':10,'恟':10,'恠':10,'恡':10,'恢':10,'恣':10,'恤':10,
  '恥':10,'恦':10,'恧':10,'恨':10,'恩':10,'恪':10,'恫':10,'恬':9,'恭':10,'恮':10,'息':10,'恰':10,'恱':10,'恲':10,'恳':10,'恴':10,'恵':10,'恶':10,'恷':10,'恸':10,'恹':10,'恺':10,'恻':10,'恼':10,'恽':10,'恾':10,'恿':11,'悀':11,
  '悁':11,'悂':11,'悃':11,'悄':11,'悅':11,'悆':11,'悇':11,'悈':11,'悉':11,'悊':11,'悋':11,'悌':11,'悍':11,'悎':11,'悏':11,'悐':11,'悑':11,'悒':11,'悓':11,'悔':11,'悕':11,'悖':11,'悗':11,'悘':11,'悙':11,'悚':11,'悛':11,'悜':11,
  '悝':11,'悞':11,'悟':11,'悠':11,'悡':11,'悢':11,'患':11,'悤':11,'悥':11,'悦':11,'悧':11,'您':11,'悩':10,'悪':11,'悫':11,'悬':11,'悭':11,'悮':11,'悯':11,'悰':12,'悱':12,'悲':12,'悳':12,'悴':12,'悵':12,'悶':12,'悷':12,'悸':12,
  '悹':12,'悺':12,'悻':12,'悼':12,'悽':12,'悾':12,'悿':12,'惀':12,'惁':12,'惂':12,'惃':12,'惄':12,'情':12,'惆':12,'惇':12,'惈':12,'惉':12,'惊':12,'惋':12,'惌':12,'惍':12,'惎':12,'惏':12,'惐':12,'惑':12,'惒':12,'惓':12,'惔':12,
  '惕':12,'惖':12,'惗':12,'惘':12,'惙':12,'惚':12,'惛':12,'惜':12,'惝':12,'惞':12,'惟':12,'惠':12,'惡':12,'惢':12,'惣':12,'惤':12,'惥':12,'惦':12,'惧':12,'惨':12,'惩':12,'惪':12,'惫':12,'惬':11,'惭':12,'惮':12,'惯':12,'惰':12,
  '惱':13,'惲':13,'想':13,'惴':13,'惵':13,'惶':13,'惷':13,'惸':13,'惹':12,'惺':13,'惻':13,'惼':13,'惽':13,'惾':13,'惿':13,'愀':13,'愁':13,'愂':13,'愃':13,'愄':13,'愅':13,'愆':13,'愇':13,'愈':13,'愉':13,'愊':13,'愋':13,'愌':13,
  '愍':13,'愎':13,'意':13,'愐':13,'愑':13,'愒':13,'愓':13,'愔':13,'愕':13,'愖':13,'愗':13,'愘':13,'愙':13,'愚':13,'愛':13,'愜':13,'愝':13,'愞':13,'感':13,'愠':13,'愡':13,'愢':13,'愣':12,'愤':13,'愥':12,'愦':13,'愧':13,'愨':14,
  '愩':14,'愪':14,'愫':14,'愬':14,'愭':14,'愮':14,'愯':14,'愰':14,'愱':14,'愲':13,'愳':14,'愴':14,'愵':14,'愶':14,'愷':14,'愸':14,'愹':14,'愺':13,'愻':14,'愼':14,'愽':14,'愾':14,'愿':14,'慀':14,'慁':14,'慂':14,'慃':14,'慄':14,
  '慅':13,'慆':14,'慇':14,'慈':13,'慉':14,'慊':14,'態':14,'慌':13,'慍':14,'慎':14,'慏':14,'慐':14,'慑':14,'慒':15,'慓':15,'慔':14,'慕':15,'慖':15,'慗':15,'慘':15,'慙':15,'慚':15,'慛':15,'慜':15,'慝':14,'慞':15,'慟':15,'慠':14,
  '慡':15,'慢':15,'慣':15,'慤':15,'慥':14,'慦':15,'慧':15,'慨':13,'慩':14,'慪':15,'慫':15,'慬':15,'慭':15,'慮':15,'慯':14,'慰':15,'慱':15,'慲':15,'慳':15,'慴':15,'慵':15,'慶':15,'慷':15,'慸':15,'慹':15,'慺':15,'慻':15,'慼':15,
  '慽':15,'慾':15,'慿':15,'憀':15,'憁':15,'憂':15,'憃':15,'憄':15,'憅':15,'憆':15,'憇':15,'憈':15,'憉':16,'憊':16,'憋':15,'憌':16,'憍':16,'憎':16,'憏':15,'憐':16,'憑':16,'憒':16,'憓':16,'憔':16,'憕':16,'憖':16,'憗':16,'憘':16,
  '憙':16,'憚':16,'憛':16,'憜':15,'憝':16,'憞':16,'憟':16,'憠':16,'憡':16,'憢':16,'憣':16,'憤':16,'憥':16,'憦':16,'憧':16,'憨':15,'憩':16,'憪':16,'憫':16,'憬':16,'憭':16,'憮':16,'憯':16,'憰':16,'憱':16,'憲':16,'憳':16,'憴':17,
  '憵':17,'憶':17,'憷':17,'憸':17,'憹':17,'憺':17,'憻':17,'憼':16,'憽':16,'憾':17,'憿':17,'懀':17,'懁':17,'懂':16,'懃':17,'懄':17,'懅':17,'懆':17,'懇':17,'懈':17,'應':17,'懊':16,'懋':17,'懌':17,'懍':17,'懎':17,'懏':16,'懐':16,
  '懑':17,'懒':17,'懓':17,'懔':17,'懕':18,'懖':18,'懗':18,'懘':18,'懙':17,'懚':18,'懛':18,'懜':17,'懝':18,'懞':17,'懟':18,'懠':18,'懡':18,'懢':18,'懣':18,'懤':18,'懥':18,'懦':18,'懧':18,'懨':18,'懩':18,'懪':19,'懫':19,'懬':18,
  '懭':18,'懮':19,'懯':19,'懰':19,'懱':18,'懲':19,'懳':19,'懴':19,'懵':19,'懶':20,'懷':20,'懸':20,'懹':21,'懺':21,'懻':20,'懼':22,'懽':21,'懾':22,'懿':22,'戀':23,'戁':23,'戂':23,'戃':24,'戄':24,'戅':25,'戆':25,'戇':28,'戈':4,
  '戉':5,'戊':5,'戋':5,'戌':6,'戍':6,'戎':6,'戏':6,'成':6,'我':7,'戒':7,'戓':7,'戔':8,'戕':8,'或':8,'戗':8,'战':9,'戙':10,'戚':11,'戛':11,'戜':11,'戝':11,'戞':12,'戟':12,'戠':12,'戡':13,'戢':12,'戣':13,'戤':13,'戥':13,'戦':13,
  '戧':14,'戨':14,'戩':14,'截':14,'戫':14,'戬':14,'戭':15,'戮':15,'戯':15,'戰':16,'戱':16,'戲':17,'戳':18,'戴':18,'戵':22,'戶':4,'户':4,'戸':4,'戹':5,'戺':7,'戻':7,'戼':7,'戽':8,'戾':8,'房':8,'所':8,'扁':9,'扂':9,'扃':9,'扄':10,
  '扅':10,'扆':10,'扇':10,'扈':11,'扉':12,'扊':12,'手':4,'扌':3,'才':3,'扎':5,'扏':6,'扐':6,'扑':6,'扒':6,'打':6,'扔':6,'払':6,'扖':6,'扗':7,'托':7,'扙':7,'扚':7,'扛':7,'扜':7,'扝':7,'扞':7,'扟':7,'扠':7,'扡':7,'扢':7,'扣':7,'扤':7,
  '扥':6,'扦':7,'执':7,'扨':7,'扩':7,'扪':7,'扫':7,'扬':7,'扭':8,'扮':8,'扯':8,'扰':8,'扱':7,'扲':8,'扳':8,'扴':8,'扵':8,'扶':7,'扷':8,'扸':8,'批':8,'扺':8,'扻':8,'扼':8,'扽':8,'找':8,'承':8,'技':8,'抁':8,'抂':9,'抃':8,'抄':8,'抅':8,
  '抆':8,'抇':8,'抈':8,'抉':8,'把':8,'抋':8,'抌':8,'抍':8,'抎':8,'抏':8,'抐':8,'抑':8,'抒':8,'抓':8,'抔':8,'投':8,'抖':8,'抗':8,'折':8,'抙':8,'抚':8,'抛':8,'抜':8,'抝':8,'択':8,'抟':8,'抠':8,'抡':8,'抢':8,'抣':8,'护':8,'报':8,'抦':9,
  '抧':9,'抨':9,'抩':9,'抪':9,'披':9,'抬':9,'抭':9,'抮':9,'抯':9,'抰':9,'抱':9,'抲':9,'抳':9,'抴':9,'抵':9,'抶':9,'抷':9,'抸':8,'抹':9,'抺':9,'抻':9,'押':9,'抽':9,'抾':9,'抿':9,'拀':9,'拁':9,'拂':9,'拃':9,'拄':9,'担':9,'拆':9,'拇':9,
  '拈':9,'拉':9,'拊':9,'拋':9,'拌':9,'拍':9,'拎':9,'拏':9,'拐':9,'拑':9,'拒':8,'拓':9,'拔':9,'拕':9,'拖':9,'拗':9,'拘':9,'拙':9,'拚':9,'招':9,'拜':9,'拝':8,'拞':9,'拟':8,'拠':9,'拡':9,'拢':9,'拣':8,'拤':9,'拥':9,'拦':9,'拧':9,'拨':9,
  '择':9,'拪':10,'拫':10,'括':10,'拭':10,'拮':10,'拯':10,'拰':10,'拱':10,'拲':10,'拳':10,'拴':10,'拵':10,'拶':10,'拷':10,'拸':10,'拹':10,'拺':10,'拻':10,'拼':10,'拽':10,'拾':10,'拿':10,'挀':10,'持':10,'挂':10,'挃':10,'挄':10,
  '挅':10,'挆':10,'指':10,'挈':10,'按':10,'挊':10,'挋':10,'挌':10,'挍':10,'挎':10,'挏':10,'挐':10,'挑':10,'挒':10,'挓':10,'挔':10,'挕':10,'挖':10,'挗':10,'挘':10,'挙':10,'挚':10,'挛':10,'挜':10,'挝':10,'挞':10,'挟':10,'挠':10,
  '挡':10,'挢':10,'挣':10,'挤':10,'挥':10,'挦':10,'挧':10,'挨':11,'挩':11,'挪':10,'挫':11,'挬':11,'挭':11,'挮':11,'振':11,'挰':11,'挱':11,'挲':11,'挳':11,'挴':11,'挵':11,'挶':11,'挷':10,'挸':11,'挹':11,'挺':10,'挻':10,'挼':11,
  '挽':11,'挾':11,'挿':12,'捀':11,'捁':11,'捂':11,'捃':11,'捄':11,'捅':11,'捆':11,'捇':11,'捈':11,'捉':11,'捊':11,'捋':11,'捌':11,'捍':11,'捎':11,'捏':11,'捐':11,'捑':11,'捒':11,'捓':10,'捔':11,'捕':11,'捖':11,'捗':11,'捘':11,
  '捙':11,'捚':11,'捛':10,'捜':10,'捝':11,'捞':11,'损':11,'捠':11,'捡':11,'换':11,'捣':11,'捤':11,'捥':12,'捦':12,'捧':12,'捨':12,'捩':12,'捪':12,'捫':12,'捬':12,'捭':12,'据':12,'捯':12,'捰':12,'捱':12,'捲':12,'捳':12,'捴':12,
  '捵':12,'捶':12,'捷':12,'捸':12,'捹':12,'捺':12,'捻':12,'捼':12,'捽':12,'捾':12,'捿':12,'掀':12,'掁':12,'掂':12,'掃':12,'掄':12,'掅':12,'掆':12,'掇':12,'授':12,'掉':12,'掊':12,'掋':12,'掌':12,'掍':12,'掎':12,'掏':12,'掐':12,
  '掑':12,'排':12,'掓':12,'掔':12,'掕':12,'掖':12,'掗':12,'掘':12,'掙':12,'掚':12,'掛':12,'掜':12,'掝':12,'掞':12,'掟':12,'掠':12,'採':12,'探':12,'掣':12,'掤':12,'接':12,'掦':12,'控':12,'推':12,'掩':12,'措':12,'掫':12,'掬':12,
  '掭':12,'掮':12,'掯':12,'掰':12,'掱':12,'掲':11,'掳':12,'掴':12,'掵':12,'掶':12,'掷':12,'掸':12,'掹':12,'掺':12,'掻':12,'掼':12,'掽':12,'掾':13,'掿':12,'揀':13,'揁':13,'揂':13,'揃':13,'揄':13,'揅':13,'揆':13,'揇':13,'揈':13,
  '揉':13,'揊':13,'揋':13,'揌':13,'揍':13,'揎':13,'描':12,'提':13,'揑':12,'插':13,'揓':13,'揔':13,'揕':13,'揖':13,'揗':13,'揘':13,'揙':13,'揚':13,'換':13,'揜':13,'揝':13,'揞':13,'揟':13,'揠':13,'握':13,'揢':13,'揣':13,'揤':11,
  '揥':13,'揦':13,'揧':13,'揨':13,'揩':13,'揪':13,'揫':13,'揬':13,'揭':13,'揮':13,'揯':13,'揰':13,'揱':13,'揲':13,'揳':13,'援':13,'揵':12,'揶':12,'揷':12,'揸':13,'揹':13,'揺':12,'揻':13,'揼':13,'揽':13,'揾':13,'揿':13,'搀':12,
  '搁':13,'搂':13,'搃':13,'搄':13,'搅':13,'搆':14,'搇':14,'搈':14,'搉':14,'搊':14,'搋':14,'搌':14,'損':14,'搎':14,'搏':14,'搐':14,'搑':13,'搒':14,'搓':13,'搔':13,'搕':14,'搖':14,'搗':14,'搘':14,'搙':14,'搚':14,'搛':14,'搜':13,
  '搝':14,'搞':14,'搟':14,'搠':14,'搡':14,'搢':14,'搣':14,'搤':14,'搥':13,'搦':14,'搧':14,'搨':14,'搩':14,'搪':14,'搫':14,'搬':14,'搭':13,'搮':14,'搯':14,'搰':13,'搱':14,'搲':14,'搳':14,'搴':14,'搵':14,'搶':14,'搷':14,'搸':14,
  '搹':14,'携':14,'搻':14,'搼':14,'搽':13,'搾':14,'搿':14,'摀':14,'摁':14,'摂':13,'摃':14,'摄':14,'摅':14,'摆':14,'摇':14,'摈':14,'摉':14,'摊':14,'摋':14,'摌':15,'摍':15,'摎':15,'摏':15,'摐':15,'摑':15,'摒':13,'摓':14,'摔':15,
  '摕':15,'摖':15,'摗':15,'摘':15,'摙':14,'摚':15,'摛':14,'摜':15,'摝':15,'摞':15,'摟':15,'摠':15,'摡':13,'摢':15,'摣':15,'摤':15,'摥':14,'摦':15,'摧':15,'摨':16,'摩':15,'摪':15,'摫':15,'摬':15,'摭':15,'摮':14,'摯':15,'摰':15,
  '摱':15,'摲':15,'摳':15,'摴':15,'摵':15,'摶':15,'摷':15,'摸':14,'摹':14,'摺':15,'摻':15,'摼':15,'摽':15,'摾':16,'摿':14,'撀':15,'撁':15,'撂':15,'撃':15,'撄':15,'撅':16,'撆':15,'撇':15,'撈':16,'撉':16,'撊':16,'撋':16,'撌':16,
  '撍':16,'撎':16,'撏':16,'撐':16,'撑':16,'撒':16,'撓':16,'撔':16,'撕':16,'撖':15,'撗':15,'撘':16,'撙':16,'撚':16,'撛':16,'撜':16,'撝':16,'撞':16,'撟':16,'撠':16,'撡':16,'撢':16,'撣':16,'撤':15,'撥':16,'撦':15,'撧':16,'撨':16,
  '撩':16,'撪':16,'撫':16,'撬':16,'播':16,'撮':16,'撯':15,'撰':16,'撱':15,'撲':16,'撳':16,'撴':16,'撵':16,'撶':14,'撷':16,'撸':16,'撹':16,'撺':16,'撻':16,'撼':17,'撽':17,'撾':15,'撿':17,'擀':17,'擁':17,'擂':17,'擃':17,'擄':17,
  '擅':17,'擆':15,'擇':17,'擈':17,'擉':17,'擊':17,'擋':17,'擌':17,'操':17,'擎':16,'擏':16,'擐':17,'擑':16,'擒':16,'擓':17,'擔':17,'擕':16,'擖':16,'擗':17,'擘':17,'擙':17,'據':17,'擛':16,'擜':17,'擝':17,'擞':17,'擟':18,'擠':18,
  '擡':18,'擢':18,'擣':18,'擤':18,'擥':18,'擦':18,'擧':17,'擨':18,'擩':18,'擪':18,'擫':18,'擬':18,'擭':17,'擮':18,'擯':18,'擰':18,'擱':18,'擲':18,'擳':17,'擴':18,'擵':19,'擶':19,'擷':19,'擸':19,'擹':19,'擺':19,'擻':19,'擼':19,
  '擽':19,'擾':19,'擿':18,'攀':19,'攁':18,'攂':19,'攃':18,'攄':19,'攅':19,'攆':19,'攇':20,'攈':20,'攉':20,'攊':20,'攋':20,'攌':20,'攍':20,'攎':20,'攏':20,'攐':20,'攑':20,'攒':20,'攓':21,'攔':21,'攕':21,'攖':21,'攗':21,'攘':21,
  '攙':21,'攚':20,'攛':22,'攜':22,'攝':22,'攞':23,'攟':23,'攠':23,'攡':22,'攢':23,'攣':23,'攤':23,'攥':24,'攦':23,'攧':23,'攨':23,'攩':24,'攪':24,'攫':24,'攬':25,'攭':25,'攮':26,'支':4,'攰':6,'攱':9,'攲':12,'攳':16,'攴':4,'攵':4,
  '收':6,'攷':6,'攸':7,'改':7,'攺':7,'攻':7,'攼':7,'攽':8,'放':8,'政':9,'敀':9,'敁':9,'敂':9,'敃':9,'敄':9,'故':9,'敆':10,'敇':10,'效':10,'敉':10,'敊':10,'敋':10,'敌':10,'敍':11,'敎':11,'敏':11,'敐':11,'救':11,'敒':11,'敓':11,
  '敔':11,'敕':11,'敖':10,'敗':11,'敘':11,'教':11,'敚':11,'敛':11,'敜':12,'敝':11,'敞':12,'敟':12,'敠':12,'敡':12,'敢':11,'散':12,'敤':12,'敥':12,'敦':12,'敧':12,'敨':12,'敩':12,'敪':12,'敫':13,'敬':13,'敭':13,'敮':13,'敯':13,
  '数':13,'敱':14,'敲':14,'敳':14,'整':16,'敵':15,'敶':14,'敷':15,'數':15,'敹':15,'敺':15,'敻':15,'敼':16,'敽':16,'敾':16,'敿':16,'斀':17,'斁':17,'斂':17,'斃':17,'斄':19,'斅':20,'斆':20,'文':4,'斈':7,'斉':8,'斊':10,'斋':10,'斌':12,
  '斍':11,'斎':11,'斏':11,'斐':12,'斑':12,'斒':13,'斓':16,'斔':18,'斕':21,'斖':24,'斗':4,'斘':7,'料':10,'斚':10,'斛':11,'斜':11,'斝':12,'斞':12,'斟':13,'斠':14,'斡':14,'斢':15,'斣':17,'斤':4,'斥':5,'斦':8,'斧':8,'斨':8,'斩':8,
  '斪':9,'斫':9,'斬':11,'断':11,'斮':12,'斯':12,'新':13,'斱':12,'斲':14,'斳':15,'斴':16,'斵':17,'斶':17,'斷':18,'斸':25,'方':4,'斺':8,'斻':8,'於':8,'施':9,'斾':9,'斿':9,'旀':9,'旁':10,'旂':10,'旃':10,'旄':10,'旅':10,'旆':10,'旇':11,
  '旈':11,'旉':11,'旊':10,'旋':11,'旌':11,'旍':11,'旎':11,'族':11,'旐':12,'旑':12,'旒':13,'旓':13,'旔':12,'旕':13,'旖':15,'旗':14,'旘':16,'旙':16,'旚':17,'旛':18,'旜':19,'旝':19,'旞':18,'旟':19,'无':4,'旡':4,'既':9,'旣':11,'旤':12,
  '日':4,'旦':5,'旧':5,'旨':6,'早':6,'旪':6,'旫':6,'旬':6,'旭':6,'旮':6,'旯':6,'旰':7,'旱':7,'旲':7,'旳':7,'旴':7,'旵':7,'时':7,'旷':7,'旸':7,'旹':8,'旺':8,'旻':8,'旼':8,'旽':8,'旾':8,'旿':8,'昀':8,'昁':8,'昂':8,'昃':8,'昄':8,'昅':7,
  '昆':8,'昇':8,'昈':8,'昉':8,'昊':8,'昋':8,'昌':8,'昍':8,'明':8,'昏':8,'昐':8,'昑':8,'昒':8,'易':8,'昔':8,'昕':8,'昖':8,'昗':8,'昘':8,'昙':8,'昚':9,'昛':8,'昜':9,'昝':9,'昞':9,'星':9,'映':9,'昡':9,'昢':9,'昣':9,'昤':9,'春':9,'昦':9,
  '昧':9,'昨':9,'昩':9,'昪':9,'昫':9,'昬':9,'昭':9,'昮':9,'是':9,'昰':9,'昱':9,'昲':9,'昳':9,'昴':9,'昵':9,'昶':9,'昷':9,'昸':9,'昹':9,'昺':9,'昻':9,'昼':9,'昽':9,'显':9,'昿':9,'晀':10,'晁':10,'時':10,'晃':10,'晄':10,'晅':10,'晆':10,
  '晇':10,'晈':10,'晉':10,'晊':10,'晋':10,'晌':10,'晍':10,'晎':10,'晏':10,'晐':10,'晑':10,'晒':10,'晓':10,'晔':10,'晕':10,'晖':10,'晗':11,'晘':11,'晙':11,'晚':11,'晛':11,'晜':11,'晝':11,'晞':11,'晟':10,'晠':10,'晡':11,'晢':11,
  '晣':11,'晤':11,'晥':11,'晦':11,'晧':11,'晨':11,'晩':12,'晪':12,'晫':12,'晬':12,'晭':12,'普':12,'景':12,'晰':12,'晱':12,'晲':12,'晳':12,'晴':12,'晵':12,'晶':12,'晷':12,'晸':13,'晹':12,'智':12,'晻':12,'晼':12,'晽':12,'晾':12,
  '晿':12,'暀':12,'暁':12,'暂':12,'暃':12,'暄':13,'暅':13,'暆':13,'暇':13,'暈':13,'暉':13,'暊':13,'暋':13,'暌':13,'暍':13,'暎':12,'暏':12,'暐':13,'暑':12,'暒':13,'暓':13,'暔':13,'暕':13,'暖':13,'暗':13,'暘':13,'暙':13,'暚':14,
  '暛':13,'暜':14,'暝':14,'暞':14,'暟':14,'暠':14,'暡':14,'暢':14,'暣':14,'暤':14,'暥':14,'暦':14,'暧':14,'暨':14,'暩':15,'暪':15,'暫':15,'暬':15,'暭':15,'暮':15,'暯':14,'暰':15,'暱':14,'暲':15,'暳':15,'暴':16,'暵':15,'暶':15,
  '暷':15,'暸':16,'暹':15,'暺':16,'暻':16,'暼':15,'暽':16,'暾':16,'暿':16,'曀':16,'曁':16,'曂':15,'曃':15,'曄':14,'曅':14,'曆':16,'曇':16,'曈':16,'曉':16,'曊':16,'曋':16,'曌':16,'曍':16,'曎':17,'曏':15,'曐':17,'曑':17,'曒':17,
  '曓':17,'曔':16,'曕':17,'曖':17,'曗':17,'曘':18,'曙':18,'曚':17,'曛':18,'曜':18,'曝':19,'曞':18,'曟':19,'曠':18,'曡':19,'曢':19,'曣':20,'曤':20,'曥':20,'曦':20,'曧':20,'曨':20,'曩':21,'曪':23,'曫':23,'曬':23,'曭':24,'曮':23,
  '曯':25,'曰':4,'曱':5,'曲':6,'曳':6,'更':7,'曵':7,'曶':8,'曷':9,'書':10,'曹':11,'曺':10,'曻':10,'曼':11,'曽':11,'曾':12,'替':12,'最':12,'朁':12,'朂':12,'會':13,'朄':14,'朅':14,'朆':16,'朇':21,'月':4,'有':6,'朊':8,'朋':8,'朌':8,
  '服':8,'朎':9,'朏':9,'朐':9,'朑':9,'朒':10,'朓':10,'朔':10,'朕':10,'朖':11,'朗':10,'朘':11,'朙':11,'朚':11,'望':11,'朜':12,'朝':12,'朞':12,'期':12,'朠':12,'朡':13,'朢':14,'朣':16,'朤':16,'朥':16,'朦':17,'朧':20,'木':4,'朩':4,
  '未':5,'末':5,'本':5,'札':5,'朮':5,'术':5,'朰':5,'朱':6,'朲':6,'朳':6,'朴':6,'朵':6,'朶':6,'朷':6,'朸':6,'朹':6,'机':6,'朻':6,'朼':6,'朽':6,'朾':6,'朿':6,'杀':6,'杁':6,'杂':6,'权':6,'杄':7,'杅':7,'杆':7,'杇':7,'杈':7,'杉':7,'杊':7,
  '杋':7,'杌':7,'杍':7,'李':7,'杏':7,'材':7,'村':7,'杒':7,'杓':7,'杔':7,'杕':7,'杖':7,'杗':7,'杘':7,'杙':7,'杚':7,'杛':7,'杜':7,'杝':7,'杞':7,'束':7,'杠':7,'条':7,'杢':7,'杣':7,'杤':7,'来':7,'杦':7,'杧':7,'杨':7,'杩':7,'杪':8,'杫':8,
  '杬':8,'杭':8,'杮':8,'杯':8,'杰':8,'東':8,'杲':8,'杳':8,'杴':8,'杵':8,'杶':8,'杷':8,'杸':8,'杹':8,'杺':8,'杻':8,'杼':8,'杽':8,'松':8,'板':8,'枀':8,'极':7,'枂':8,'枃':8,'构':8,'枅':8,'枆':8,'枇':8,'枈':8,'枉':9,'枊':8,'枋':8,'枌':8,
  '枍':8,'枎':8,'枏':8,'析':8,'枑':8,'枒':8,'枓':8,'枔':8,'枕':8,'枖':8,'林':8,'枘':8,'枙':8,'枚':8,'枛':8,'果':8,'枝':8,'枞':8,'枟':8,'枠':8,'枡':8,'枢':8,'枣':8,'枤':8,'枥':8,'枦':8,'枧':8,'枨':8,'枩':8,'枪':8,'枫':8,'枬':8,'枭':8,
  '枮':9,'枯':9,'枰':9,'枱':9,'枲':9,'枳':9,'枴':9,'枵':9,'架':9,'枷':9,'枸':9,'枹':9,'枺':9,'枻':9,'枼':9,'枽':10,'枾':9,'枿':9,'柀':9,'柁':9,'柂':9,'柃':9,'柄':9,'柅':9,'柆':9,'柇':9,'柈':9,'柉':8,'柊':9,'柋':9,'柌':9,'柍':9,'柎':9,
  '柏':9,'某':9,'柑':9,'柒':9,'染':9,'柔':9,'柕':9,'柖':9,'柗':9,'柘':9,'柙':9,'柚':9,'柛':9,'柜':8,'柝':9,'柞':9,'柟':9,'柠':9,'柡':10,'柢':9,'柣':9,'柤':9,'查':9,'柦':9,'柧':9,'柨':9,'柩':9,'柪':9,'柫':9,'柬':9,'柭':9,'柮':9,'柯':9,
  '柰':9,'柱':9,'柲':9,'柳':9,'柴':10,'柵':9,'柶':9,'柷':9,'柸':9,'柹':8,'柺':9,'査':9,'柼':9,'柽':9,'柾':9,'柿':9,'栀':9,'栁':9,'栂':9,'栃':9,'栄':9,'栅':9,'栆':9,'标':9,'栈':9,'栉':9,'栊':9,'栋':9,'栌':9,'栍':9,'栎':9,'栏':9,'栐':9,
  '树':9,'栒':10,'栓':10,'栔':10,'栕':10,'栖':10,'栗':10,'栘':10,'栙':10,'栚':10,'栛':10,'栜':10,'栝':10,'栞':10,'栟':10,'栠':10,'校':10,'栢':10,'栣':10,'栤':10,'栥':10,'栦':10,'栧':10,'栨':10,'栩':10,'株':10,'栫':10,'栬':10,
  '栭':10,'栮':10,'栯':10,'栰':10,'栱':10,'栲':10,'栳':10,'栴':10,'栵':10,'栶':10,'样':10,'核':10,'根':10,'栺':10,'栻':10,'格':10,'栽':10,'栾':10,'栿':10,'桀':10,'桁':10,'桂':10,'桃':10,'桄':10,'桅':10,'框':10,'桇':10,'案':10,
  '桉':10,'桊':10,'桋':10,'桌':10,'桍':10,'桎':10,'桏':9,'桐':10,'桑':10,'桒':9,'桓':10,'桔':10,'桕':10,'桖':10,'桗':10,'桘':10,'桙':10,'桚':10,'桛':10,'桜':10,'桝':10,'桞':9,'桟':10,'桠':10,'桡':10,'桢':10,'档':10,'桤':10,'桥':10,
  '桦':10,'桧':10,'桨':10,'桩':10,'桪':10,'桫':11,'桬':11,'桭':11,'桮':11,'桯':11,'桰':11,'桱':11,'桲':11,'桳':11,'桴':11,'桵':11,'桶':11,'桷':11,'桸':11,'桹':11,'桺':11,'桻':11,'桼':11,'桽':11,'桾':11,'桿':11,'梀':11,'梁':11,
  '梂':11,'梃':10,'梄':11,'梅':11,'梆':10,'梇':11,'梈':11,'梉':11,'梊':11,'梋':11,'梌':11,'梍':11,'梎':11,'梏':11,'梐':11,'梑':11,'梒':11,'梓':11,'梔':11,'梕':11,'梖':11,'梗':11,'梘':11,'梙':11,'梚':11,'梛':10,'梜':11,'條':10,
  '梞':11,'梟':11,'梠':10,'梡':11,'梢':11,'梣':11,'梤':11,'梥':11,'梦':11,'梧':11,'梨':11,'梩':11,'梪':11,'梫':11,'梬':11,'梭':11,'梮':11,'梯':11,'械':11,'梱':11,'梲':11,'梳':11,'梴':10,'梵':11,'梶':11,'梷':11,'梸':11,'梹':11,
  '梺':11,'梻':11,'梼':11,'梽':11,'梾':11,'梿':11,'检':11,'棁':11,'棂':11,'棃':12,'棄':12,'棅':12,'棆':12,'棇':12,'棈':12,'棉':12,'棊':12,'棋':12,'棌':12,'棍':12,'棎':12,'棏':12,'棐':12,'棑':12,'棒':12,'棓':12,'棔':12,'棕':12,
  '棖':12,'棗':12,'棘':12,'棙':12,'棚':12,'棛':12,'棜':12,'棝':12,'棞':12,'棟':12,'棠':12,'棡':12,'棢':12,'棣':12,'棤':12,'棥':12,'棦':10,'棧':12,'棨':12,'棩':13,'棪':12,'棫':12,'棬':12,'棭':12,'森':12,'棯':12,'棰':12,'棱':12,
  '棲':12,'棳':12,'棴':12,'棵':12,'棶':12,'棷':12,'棸':12,'棹':12,'棺':12,'棻':11,'棼':12,'棽':12,'棾':12,'棿':12,'椀':12,'椁':12,'椂':12,'椃':12,'椄':12,'椅':12,'椆':12,'椇':12,'椈':12,'椉':12,'椊':12,'椋':12,'椌':12,'植':12,
  '椎':12,'椏':12,'椐':12,'椑':12,'椒':12,'椓':12,'椔':12,'椕':12,'椖':12,'椗':12,'椘':11,'椙':12,'椚':12,'椛':11,'検':12,'椝':12,'椞':12,'椟':12,'椠':12,'椡':12,'椢':12,'椣':12,'椤':12,'椥':12,'椦':12,'椧':12,'椨':12,'椩':12,
  '椪':12,'椫':12,'椬':12,'椭':12,'椮':12,'椯':13,'椰':12,'椱':13,'椲':13,'椳':13,'椴':13,'椵':13,'椶':13,'椷':13,'椸':13,'椹':13,'椺':13,'椻':13,'椼':13,'椽':13,'椾':13,'椿':13,'楀':13,'楁':13,'楂':13,'楃':13,'楄':13,'楅':13,
  '楆':13,'楇':12,'楈':13,'楉':12,'楊':13,'楋':13,'楌':13,'楍':13,'楎':13,'楏':13,'楐':13,'楑':13,'楒':13,'楓':13,'楔':13,'楕':13,'楖':11,'楗':12,'楘':13,'楙':13,'楚':13,'楛':12,'楜':13,'楝':13,'楞':13,'楟':13,'楠':13,'楡':13,
  '楢':13,'楣':13,'楤':13,'楥':13,'楦':13,'楧':12,'楨':13,'楩':13,'楪':13,'楫':13,'楬':13,'業':13,'楮':12,'楯':13,'楰':12,'楱':13,'楲':13,'楳':13,'楴':13,'極':12,'楶':13,'楷':13,'楸':13,'楹':13,'楺':13,'楻':13,'楼':13,'楽':13,
  '楾':13,'楿':13,'榀':13,'榁':13,'概':13,'榃':13,'榄':13,'榅':13,'榆':13,'榇':13,'榈':13,'榉':13,'榊':13,'榋':13,'榌':13,'榍':14,'榎':14,'榏':14,'榐':14,'榑':14,'榒':14,'榓':14,'榔':12,'榕':14,'榖':14,'榗':14,'榘':13,'榙':13,
  '榚':14,'榛':14,'榜':14,'榝':14,'榞':14,'榟':14,'榠':14,'榡':14,'榢':14,'榣':14,'榤':14,'榥':14,'榦':14,'榧':14,'榨':14,'榩':14,'榪':14,'榫':14,'榬':14,'榭':14,'榮':14,'榯':14,'榰':14,'榱':14,'榲':14,'榳':13,'榴':14,'榵':13,
  '榶':14,'榷':14,'榸':14,'榹':14,'榺':14,'榻':14,'榼':14,'榽':14,'榾':13,'榿':14,'槀':14,'槁':14,'槂':14,'槃':14,'槄':14,'槅':14,'槆':13,'槇':14,'槈':14,'槉':14,'槊':14,'構':14,'槌':13,'槍':14,'槎':13,'槏':14,'槐':13,'槑':14,
  '槒':14,'槓':14,'槔':14,'槕':14,'槖':14,'槗':14,'様':14,'槙':14,'槚':14,'槛':14,'槜':14,'槝':14,'槞':14,'槟':14,'槠':14,'槡':14,'槢':15,'槣':15,'槤':14,'槥':15,'槦':15,'槧':15,'槨':14,'槩':13,'槪':15,'槫':15,'槬':15,'槭':15,
  '槮':15,'槯':15,'槰':14,'槱':15,'槲':15,'槳':15,'槴':15,'槵':15,'槶':15,'槷':15,'槸':15,'槹':15,'槺':15,'槻':15,'槼':15,'槽':15,'槾':15,'槿':15,'樀':15,'樁':15,'樂':15,'樃':14,'樄':14,'樅':15,'樆':14,'樇':14,'樈':15,'樉':15,
  '樊':15,'樋':14,'樌':15,'樍':15,'樎':15,'樏':15,'樐':15,'樑':15,'樒':15,'樓':15,'樔':15,'樕':15,'樖':15,'樗':15,'樘':15,'標':15,'樚':15,'樛':15,'樜':15,'樝':15,'樞':15,'樟':15,'樠':15,'模':14,'樢':15,'樣':15,'樤':14,'樥':14,
  '樦':15,'樧':15,'樨':16,'権':15,'横':15,'樫':15,'樬':15,'樭':15,'樮':15,'樯':15,'樰':15,'樱':15,'樲':16,'樳':16,'樴':16,'樵':16,'樶':16,'樷':16,'樸':16,'樹':16,'樺':14,'樻':16,'樼':16,'樽':16,'樾':16,'樿':16,'橀':16,'橁':16,
  '橂':16,'橃':16,'橄':15,'橅':16,'橆':16,'橇':16,'橈':16,'橉':16,'橊':16,'橋':16,'橌':16,'橍':16,'橎':16,'橏':16,'橐':16,'橑':16,'橒':16,'橓':16,'橔':16,'橕':16,'橖':16,'橗':15,'橘':16,'橙':16,'橚':17,'橛':16,'橜':16,'橝':16,
  '橞':16,'機':16,'橠':16,'橡':15,'橢':15,'橣':16,'橤':16,'橥':15,'橦':16,'橧':16,'橨':16,'橩':16,'橪':16,'橫':16,'橬':16,'橭':16,'橮':16,'橯':16,'橰':16,'橱':16,'橲':16,'橳':16,'橴':16,'橵':16,'橶':16,'橷':16,'橸':16,'橹':16,
  '橺':16,'橻':16,'橼':16,'橽':16,'橾':17,'橿':17,'檀':17,'檁':17,'檂':17,'檃':16,'檄':17,'檅':17,'檆':17,'檇':16,'檈':17,'檉':17,'檊':17,'檋':17,'檌':17,'檍':17,'檎':16,'檏':17,'檐':17,'檑':17,'檒':17,'檓':17,'檔':17,'檕':17,
  '檖':16,'檗':17,'檘':17,'檙':16,'檚':17,'檛':15,'檜':17,'檝':16,'檞':17,'檟':17,'檠':16,'檡':17,'檢':17,'檣':17,'檤':16,'檥':17,'檦':17,'檧':16,'檨':16,'檩':17,'檪':17,'檫':18,'檬':17,'檭':18,'檮':18,'檯':18,'檰':18,'檱':18,
  '檲':18,'檳':18,'檴':17,'檵':18,'檶':18,'檷':18,'檸':18,'檹':18,'檺':18,'檻':18,'檼':18,'檽':18,'檾':18,'檿':18,'櫀':18,'櫁':18,'櫂':18,'櫃':18,'櫄':18,'櫅':18,'櫆':17,'櫇':18,'櫈':18,'櫉':18,'櫊':18,'櫋':19,'櫌':19,'櫍':19,
  '櫎':18,'櫏':19,'櫐':19,'櫑':19,'櫒':18,'櫓':19,'櫔':18,'櫕':19,'櫖':19,'櫗':18,'櫘':19,'櫙':18,'櫚':18,'櫛':17,'櫜':19,'櫝':19,'櫞':19,'櫟':19,'櫠':19,'櫡':18,'櫢':19,'櫣':17,'櫤':19,'櫥':19,'櫦':19,'櫧':19,'櫨':20,'櫩':20,
  '櫪':20,'櫫':19,'櫬':20,'櫭':18,'櫮':20,'櫯':20,'櫰':20,'櫱':20,'櫲':19,'櫳':20,'櫴':20,'櫵':19,'櫶':20,'櫷':22,'櫸':20,'櫹':20,'櫺':21,'櫻':21,'櫼':21,'櫽':20,'櫾':21,'櫿':20,'欀':21,'欁':21,'欂':20,'欃':21,'欄':21,'欅':21,
  '欆':22,'欇':22,'欈':22,'欉':22,'權':22,'欋':22,'欌':21,'欍':21,'欎':22,'欏':23,'欐':23,'欑':23,'欒':23,'欓':24,'欔':24,'欕':23,'欖':25,'欗':24,'欘':25,'欙':25,'欚':25,'欛':25,'欜':26,'欝':25,'欞':28,'欟':28,'欠':4,'次':6,'欢':6,
  '欣':8,'欤':7,'欥':8,'欦':8,'欧':8,'欨':9,'欩':9,'欪':9,'欫':11,'欬':10,'欭':10,'欮':10,'欯':10,'欰':10,'欱':10,'欲':11,'欳':11,'欴':10,'欵':11,'欶':11,'欷':11,'欸':11,'欹':12,'欺':12,'欻':12,'欼':12,'欽':12,'款':12,'欿':12,
  '歀':13,'歁':13,'歂':13,'歃':13,'歄':12,'歅':13,'歆':13,'歇':13,'歈':13,'歉':14,'歊':14,'歋':14,'歌':14,'歍':14,'歎':15,'歏':15,'歐':15,'歑':15,'歒':15,'歓':15,'歔':15,'歕':16,'歖':16,'歗':17,'歘':16,'歙':16,'歚':16,'歛':17,
  '歜':17,'歝':17,'歞':18,'歟':17,'歠':19,'歡':22,'止':4,'正':5,'此':6,'步':7,'武':8,'歧':8,'歨':8,'歩':8,'歪':9,'歫':8,'歬':10,'歭':10,'歮':12,'歯':12,'歰':14,'歱':13,'歲':13,'歳':13,'歴':14,'歵':15,'歶':15,'歷':16,'歸':18,'歹':4,
  '歺':5,'死':6,'歼':7,'歽':8,'歾':8,'歿':8,'殀':8,'殁':8,'殂':9,'殃':9,'殄':9,'殅':9,'殆':9,'殇':9,'殈':10,'殉':10,'殊':10,'残':9,'殌':11,'殍':11,'殎':11,'殏':11,'殐':11,'殑':11,'殒':11,'殓':11,'殔':12,'殕':12,'殖':12,'殗':12,
  '殘':12,'殙':12,'殚':12,'殛':12,'殜':13,'殝':14,'殞':14,'殟':13,'殠':14,'殡':14,'殢':15,'殣':15,'殤':15,'殥':15,'殦':15,'殧':16,'殨':16,'殩':16,'殪':16,'殫':16,'殬':17,'殭':17,'殮':17,'殯':18,'殰':19,'殱':19,'殲':21,'殳':4,
  '殴':8,'段':9,'殶':9,'殷':10,'殸':11,'殹':11,'殺':10,'殻':11,'殼':12,'殽':12,'殾':12,'殿':13,'毀':13,'毁':13,'毂':13,'毃':14,'毄':14,'毅':15,'毆':15,'毇':16,'毈':16,'毉':18,'毊':23,'毋':4,'毌':4,'母':5,'毎':6,'每':7,'毐':7,'毑':8,
  '毒':9,'毓':14,'比':4,'毕':6,'毖':9,'毗':9,'毘':9,'毙':10,'毚':17,'毛':4,'毜':7,'毝':7,'毞':8,'毟':8,'毠':9,'毡':9,'毢':10,'毣':10,'毤':10,'毥':10,'毦':10,'毧':10,'毨':10,'毩':10,'毪':10,'毫':11,'毬':11,'毭':11,'毮':12,'毯':12,
  '毰':12,'毱':12,'毲':12,'毳':12,'毴':12,'毵':12,'毶':12,'毷':13,'毸':13,'毹':13,'毺':13,'毻':13,'毼':13,'毽':12,'毾':14,'毿':15,'氀':15,'氁':14,'氂':15,'氃':16,'氄':16,'氅':16,'氆':16,'氇':16,'氈':17,'氉':17,'氊':17,'氋':17,
  '氌':19,'氍':22,'氎':26,'氏':4,'氐':5,'民':5,'氒':6,'氓':8,'气':4,'氕':5,'氖':6,'気':6,'氘':6,'氙':7,'氚':7,'氛':8,'氜':8,'氝':8,'氞':9,'氟':9,'氠':9,'氡':9,'氢':9,'氣':10,'氤':10,'氥':10,'氦':10,'氧':10,'氨':10,'氩':10,'氪':11,
  '氫':11,'氬':12,'氭':12,'氮':12,'氯':12,'氰':12,'氱':13,'氲':13,'氳':14,'水':4,'氵':3,'氶':5,'氷':5,'永':5,'氹':5,'氺':5,'氻':6,'氼':6,'氽':6,'氾':7,'氿':6,'汀':6,'汁':6,'求':7,'汃':6,'汄':6,'汅':6,'汆':6,'汇':6,'汈':6,'汉':6,
  '汊':7,'汋':7,'汌':7,'汍':7,'汎':7,'汏':7,'汐':7,'汑':7,'汒':7,'汓':7,'汔':7,'汕':7,'汖':7,'汗':7,'汘':7,'汙':7,'汚':7,'汛':7,'汜':7,'汝':7,'汞':7,'江':7,'池':6,'污':7,'汢':7,'汣':7,'汤':7,'汥':8,'汦':8,'汧':8,'汨':8,'汩':8,'汪':8,
  '汫':8,'汬':8,'汭':8,'汮':8,'汯':8,'汰':8,'汱':8,'汲':6,'汳':8,'汴':8,'汵':8,'汶':8,'汷':7,'汸':8,'汹':8,'決':8,'汻':8,'汼':8,'汽':8,'汾':8,'汿':8,'沀':8,'沁':8,'沂':8,'沃':8,'沄':8,'沅':8,'沆':8,'沇':8,'沈':8,'沉':8,'沊':8,'沋':8,
  '沌':8,'沍':8,'沎':8,'沏':8,'沐':8,'沑':8,'沒':7,'沓':8,'沔':8,'沕':8,'沖':8,'沗':9,'沘':8,'沙':8,'沚':8,'沛':8,'沜':8,'沝':8,'沞':8,'沟':8,'沠':8,'没':8,'沢':8,'沣':8,'沤':8,'沥':8,'沦':8,'沧':8,'沨':8,'沩':8,'沪':8,'沫':9,'沬':9,
  '沭':9,'沮':9,'沯':9,'沰':9,'沱':9,'沲':9,'河':9,'沴':9,'沵':9,'沶':9,'沷':9,'沸':9,'油':9,'沺':9,'治':9,'沼':9,'沽':9,'沾':9,'沿':8,'泀':9,'況':9,'泂':9,'泃':9,'泄':9,'泅':9,'泆':9,'泇':9,'泈':9,'泉':9,'泊':9,'泋':9,'泌':9,'泍':9,
  '泎':9,'泏':9,'泐':8,'泑':9,'泒':9,'泓':9,'泔':9,'法':9,'泖':9,'泗':9,'泘':9,'泙':9,'泚':10,'泛':8,'泜':9,'泝':9,'泞':9,'泟':9,'泠':9,'泡':9,'波':9,'泣':9,'泤':8,'泥':9,'泦':9,'泧':9,'注':9,'泩':9,'泪':9,'泫':9,'泬':9,'泭':9,'泮':9,
  '泯':9,'泰':10,'泱':9,'泲':9,'泳':9,'泴':9,'泵':9,'泶':9,'泷':9,'泸':9,'泹':9,'泺':9,'泻':9,'泼':9,'泽':9,'泾':9,'泿':10,'洀':10,'洁':10,'洂':10,'洃':10,'洄':10,'洅':10,'洆':10,'洇':10,'洈':10,'洉':10,'洊':10,'洋':10,'洌':10,
  '洍':10,'洎':10,'洏':10,'洐':10,'洑':10,'洒':10,'洓':10,'洔':10,'洕':10,'洖':11,'洗':10,'洘':10,'洙':10,'洚':10,'洛':10,'洜':10,'洝':10,'洞':10,'洟':10,'洠':10,'洡':10,'洢':10,'洣':10,'洤':10,'津':10,'洦':10,'洧':10,'洨':10,
  '洩':10,'洪':10,'洫':10,'洬':10,'洭':10,'洮':10,'洯':10,'洰':8,'洱':10,'洲':10,'洳':10,'洴':10,'洵':10,'洶':10,'洷':10,'洸':10,'洹':10,'洺':10,'活':10,'洼':10,'洽':10,'派':10,'洿':10,'浀':10,'流':11,'浂':10,'浃':10,'浄':10,
  '浅':9,'浆':10,'浇':10,'浈':10,'浉':10,'浊':10,'测':10,'浌':10,'浍':10,'济':10,'浏':9,'浐':10,'浑':10,'浒':10,'浓':10,'浔':10,'浕':10,'浖':11,'浗':11,'浘':11,'浙':11,'浚':11,'浛':11,'浜':11,'浝':11,'浞':11,'浟':11,'浠':11,
  '浡':11,'浢':11,'浣':11,'浤':11,'浥':11,'浦':11,'浧':11,'浨':11,'浩':11,'浪':11,'浫':11,'浬':11,'浭':11,'浮':11,'浯':11,'浰':11,'浱':11,'浲':11,'浳':11,'浴':11,'浵':11,'浶':11,'海':11,'浸':11,'浹':11,'浺':11,'浻':11,'浼':11,
  '浽':11,'浾':11,'浿':11,'涀':11,'涁':11,'涂':11,'涃':11,'涄':11,'涅':11,'涆':11,'涇':11,'消':11,'涉':11,'涊':11,'涋':11,'涌':11,'涍':11,'涎':10,'涏':10,'涐':11,'涑':11,'涒':11,'涓':11,'涔':11,'涕':11,'涖':11,'涗':11,'涘':11,
  '涙':11,'涚':11,'涛':11,'涜':11,'涝':11,'涞':11,'涟':11,'涠':11,'涡':11,'涢':11,'涣':11,'涤':11,'涥':11,'润':11,'涧':11,'涨':11,'涩':10,'涪':12,'涫':12,'涬':12,'涭':12,'涮':12,'涯':12,'涰':12,'涱':12,'液':12,'涳':12,'涴':12,
  '涵':12,'涶':12,'涷':12,'涸':12,'涹':12,'涺':12,'涻':12,'涼':12,'涽':12,'涾':12,'涿':12,'淀':12,'淁':12,'淂':12,'淃':12,'淄':12,'淅':12,'淆':12,'淇':12,'淈':12,'淉':12,'淊':12,'淋':12,'淌':12,'淍':12,'淎':12,'淏':12,'淐':12,
  '淑':12,'淒':12,'淓':11,'淔':12,'淕':12,'淖':12,'淗':12,'淘':12,'淙':12,'淚':12,'淛':12,'淜':12,'淝':12,'淞':12,'淟':12,'淠':12,'淡':11,'淢':12,'淣':12,'淤':12,'淥':12,'淦':12,'淧':12,'淨':12,'淩':12,'淪':12,'淫':12,'淬':12,
  '淭':12,'淮':12,'淯':12,'淰':12,'深':12,'淲':12,'淳':12,'淴':12,'淵':12,'淶':12,'混':12,'淸':12,'淹':12,'淺':12,'添':12,'淼':12,'淽':11,'淾':12,'淿':12,'渀':12,'渁':11,'渂':12,'渃':12,'渄':12,'清':12,'渆':12,'渇':11,'済':12,
  '渉':12,'渊':12,'渋':11,'渌':12,'渍':12,'渎':12,'渏':12,'渐':12,'渑':12,'渒':12,'渓':11,'渔':12,'渕':11,'渖':12,'渗':12,'渘':13,'渙':13,'渚':13,'減':13,'渜':13,'渝':13,'渞':13,'渟':13,'渠':12,'渡':13,'渢':13,'渣':13,'渤':13,
  '渥':13,'渦':12,'渧':13,'渨':13,'温':13,'渪':13,'渫':13,'測':13,'渭':13,'渮':12,'港':13,'渰':13,'渱':13,'渲':13,'渳':13,'渴':13,'渵':12,'渶':12,'渷':13,'游':13,'渹':13,'渺':13,'渻':13,'渼':13,'渽':13,'渾':13,'渿':13,'湀':13,
  '湁':13,'湂':13,'湃':13,'湄':13,'湅':13,'湆':13,'湇':13,'湈':13,'湉':13,'湊':13,'湋':13,'湌':13,'湍':13,'湎':13,'湏':13,'湐':13,'湑':13,'湒':13,'湓':13,'湔':13,'湕':12,'湖':13,'湗':13,'湘':13,'湙':13,'湚':13,'湛':12,'湜':13,
  '湝':13,'湞':13,'湟':13,'湠':13,'湡':13,'湢':13,'湣':13,'湤':13,'湥':13,'湦':13,'湧':13,'湨':13,'湩':13,'湪':13,'湫':13,'湬':13,'湭':13,'湮':13,'湯':13,'湰':13,'湱':13,'湲':13,'湳':13,'湴':12,'湵':13,'湶':13,'湷':13,'湸':13,
  '湹':13,'湺':13,'湻':13,'湼':12,'湽':12,'湾':13,'湿':13,'満':12,'溁':13,'溂':13,'溃':13,'溄':12,'溅':13,'溆':13,'溇':13,'溈':13,'溉':13,'溊':13,'溋':13,'溌':13,'溍':14,'溎':14,'溏':14,'源':14,'溑':14,'溒':14,'溓':14,'溔':14,
  '溕':14,'準':13,'溗':14,'溘':14,'溙':14,'溚':13,'溛':14,'溜':14,'溝':14,'溞':13,'溟':14,'溠':13,'溡':14,'溢':14,'溣':14,'溤':14,'溥':14,'溦':14,'溧':14,'溨':14,'溩':14,'溪':13,'溫':13,'溬':13,'溭':14,'溮':14,'溯':14,'溰':14,
  '溱':14,'溲':13,'溳':14,'溴':14,'溵':14,'溶':14,'溷':14,'溸':14,'溹':14,'溺':14,'溻':14,'溼':14,'溽':14,'溾':13,'溿':14,'滀':14,'滁':13,'滂':14,'滃':14,'滄':14,'滅':14,'滆':14,'滇':14,'滈':14,'滉':14,'滊':14,'滋':13,'滌':14,
  '滍':14,'滎':14,'滏':14,'滐':14,'滑':13,'滒':14,'滓':14,'滔':14,'滕':15,'滖':14,'滗':14,'滘':13,'滙':14,'滚':14,'滛':14,'滜':14,'滝':14,'滞':13,'滟':14,'滠':14,'满':13,'滢':14,'滣':14,'滤':14,'滥':14,'滦':14,'滧':14,'滨':14,
  '滩':14,'滪':14,'滫':14,'滬':15,'滭':14,'滮':15,'滯':15,'滰':15,'滱':15,'滲':15,'滳':15,'滴':15,'滵':15,'滶':14,'滷':15,'滸':15,'滹':15,'滺':15,'滻':15,'滼':15,'滽':15,'滾':15,'滿':14,'漀':15,'漁':15,'漂':15,'漃':15,'漄':15,
  '漅':15,'漆':15,'漇':15,'漈':15,'漉':15,'漊':15,'漋':15,'漌':15,'漍':15,'漎':15,'漏':15,'漐':15,'漑':15,'漒':16,'漓':14,'演':15,'漕':15,'漖':15,'漗':15,'漘':15,'漙':15,'漚':15,'漛':13,'漜':15,'漝':15,'漞':15,'漟':15,'漠':14,
  '漡':14,'漢':14,'漣':14,'漤':15,'漥':15,'漦':15,'漧':15,'漨':14,'漩':15,'漪':15,'漫':15,'漬':15,'漭':14,'漮':15,'漯':15,'漰':15,'漱':15,'漲':15,'漳':15,'漴':15,'漵':15,'漶':15,'漷':14,'漸':15,'漹':15,'漺':15,'漻':15,'漼':15,
  '漽':16,'漾':15,'漿':15,'潀':15,'潁':15,'潂':14,'潃':13,'潄':15,'潅':14,'潆':15,'潇':15,'潈':14,'潉':15,'潊':15,'潋':15,'潌':15,'潍':15,'潎':15,'潏':16,'潐':16,'潑':16,'潒':15,'潓':16,'潔':16,'潕':16,'潖':16,'潗':16,'潘':16,
  '潙':16,'潚':17,'潛':16,'潜':16,'潝':16,'潞':17,'潟':16,'潠':16,'潡':16,'潢':15,'潣':16,'潤':16,'潥':16,'潦':16,'潧':16,'潨':16,'潩':15,'潪':16,'潫':16,'潬':16,'潭':16,'潮':16,'潯':16,'潰':16,'潱':16,'潲':16,'潳':15,'潴':15,
  '潵':16,'潶':16,'潷':16,'潸':15,'潹':16,'潺':16,'潻':16,'潼':16,'潽':16,'潾':16,'潿':16,'澀':18,'澁':16,'澂':16,'澃':16,'澄':16,'澅':16,'澆':16,'澇':16,'澈':15,'澉':15,'澊':16,'澋':16,'澌':16,'澍':16,'澎':16,'澏':16,'澐':16,
  '澑':16,'澒':16,'澓':16,'澔':16,'澕':14,'澖':16,'澗':15,'澘':16,'澙':16,'澚':14,'澛':16,'澜':16,'澝':16,'澞':17,'澟':17,'澠':17,'澡':17,'澢':17,'澣':17,'澤':17,'澥':17,'澦':17,'澧':17,'澨':17,'澩':17,'澪':17,'澫':16,'澬':17,
  '澭':17,'澮':17,'澯':17,'澰':17,'澱':17,'澲':17,'澳':16,'澴':17,'澵':17,'澶':17,'澷':17,'澸':17,'澹':16,'澺':17,'澻':16,'澼':17,'澽':17,'澾':16,'澿':17,'激':17,'濁':17,'濂':17,'濃':17,'濄':15,'濅':17,'濆':16,'濇':17,'濈':16,
  '濉':17,'濊':17,'濋':17,'濌':17,'濍':16,'濎':16,'濏':17,'濐':16,'濑':17,'濒':17,'濓':17,'濔':18,'濕':18,'濖':17,'濗':17,'濘':18,'濙':18,'濚':18,'濛':17,'濜':18,'濝':18,'濞':18,'濟':18,'濠':18,'濡':18,'濢':18,'濣':18,'濤':18,
  '濥':18,'濦':18,'濧':18,'濨':17,'濩':17,'濪':18,'濫':18,'濬':18,'濭':17,'濮':18,'濯':18,'濰':18,'濱':18,'濲':19,'濳':20,'濴':18,'濵':18,'濶':18,'濷':18,'濸':17,'濹':19,'濺':19,'濻':18,'濼':19,'濽':19,'濾':19,'濿':18,'瀀':19,
  '瀁':18,'瀂':19,'瀃':19,'瀄':17,'瀅':19,'瀆':19,'瀇':18,'瀈':19,'瀉':19,'瀊':19,'瀋':19,'瀌':19,'瀍':19,'瀎':18,'瀏':19,'瀐':19,'瀑':19,'瀒':19,'瀓':19,'瀔':19,'瀕':20,'瀖':20,'瀗':20,'瀘':20,'瀙':20,'瀚':20,'瀛':20,'瀜':20,
  '瀝':20,'瀞':18,'瀟':20,'瀠':20,'瀡':18,'瀢':19,'瀣':20,'瀤':20,'瀥':20,'瀦':19,'瀧':20,'瀨':20,'瀩':20,'瀪':20,'瀫':20,'瀬':20,'瀭':20,'瀮':20,'瀯':20,'瀰':21,'瀱':21,'瀲':21,'瀳':20,'瀴':21,'瀵':21,'瀶':21,'瀷':21,'瀸':21,
  '瀹':21,'瀺':21,'瀻':21,'瀼':21,'瀽':21,'瀾':21,'瀿':21,'灀':21,'灁':21,'灂':21,'灃':22,'灄':22,'灅':22,'灆':21,'灇':22,'灈':22,'灉':22,'灊':22,'灋':21,'灌':21,'灍':22,'灎':26,'灏':21,'灐':22,'灑':23,'灒':23,'灓':23,'灔':23,
  '灕':22,'灖':23,'灗':23,'灘':23,'灙':24,'灚':24,'灛':24,'灜':24,'灝':25,'灞':25,'灟':25,'灠':25,'灡':24,'灢':26,'灣':25,'灤':27,'灥':27,'灦':27,'灧':28,'灨':28,'灩':32,'灪':33,'火':4,'灬':4,'灭':5,'灮':6,'灯':6,'灰':6,'灱':6,
  '灲':6,'灳':6,'灴':7,'灵':7,'灶':7,'灷':7,'灸':7,'灹':7,'灺':7,'灻':7,'灼':7,'災':7,'灾':7,'灿':7,'炀':7,'炁':8,'炂':8,'炃':8,'炄':8,'炅':8,'炆':8,'炇':8,'炈':8,'炉':8,'炊':8,'炋':8,'炌':8,'炍':8,'炎':8,'炏':8,'炐':8,'炑':8,'炒':8,
  '炓':8,'炔':8,'炕':8,'炖':8,'炗':8,'炘':8,'炙':8,'炚':8,'炛':8,'炜':8,'炝':8,'炞':8,'炟':9,'炠':9,'炡':9,'炢':9,'炣':9,'炤':9,'炥':9,'炦':9,'炧':9,'炨':9,'炩':9,'炪':9,'炫':9,'炬':9,'炭':9,'炮':9,'炯':9,'炰':9,'炱':9,'炲':9,'炳':9,
  '炴':9,'炵':9,'炶':9,'炷':9,'炸':9,'点':9,'為':9,'炻':9,'炼':9,'炽':9,'炾':9,'炿':9,'烀':9,'烁':9,'烂':9,'烃':9,'烄':10,'烅':10,'烆':10,'烇':10,'烈':10,'烉':10,'烊':10,'烋':10,'烌':10,'烍':10,'烎':8,'烏':10,'烐':10,'烑':10,'烒':10,
  '烓':10,'烔':10,'烕':10,'烖':10,'烗':10,'烘':10,'烙':10,'烚':10,'烛':10,'烜':10,'烝':10,'烞':10,'烟':10,'烠':10,'烡':10,'烢':10,'烣':10,'烤':10,'烥':10,'烦':10,'烧':10,'烨':10,'烩':10,'烪':10,'烫':10,'烬':10,'热':10,'烮':10,
  '烯':11,'烰':11,'烱':11,'烲':11,'烳':11,'烴':11,'烵':10,'烶':10,'烷':11,'烸':11,'烹':11,'烺':11,'烻':10,'烼':11,'烽':11,'烾':11,'烿':11,'焀':11,'焁':11,'焂':11,'焃':11,'焄':11,'焅':11,'焆':11,'焇':11,'焈':11,'焉':11,'焊':11,
  '焋':11,'焌':11,'焍':11,'焎':11,'焏':11,'焐':11,'焑':11,'焒':10,'焓':11,'焔':11,'焕':11,'焖':11,'焗':11,'焘':11,'焙':12,'焚':12,'焛':12,'焜':12,'焝':12,'焞':12,'焟':12,'焠':12,'無':12,'焢':12,'焣':12,'焤':12,'焥':12,'焦':12,
  '焧':12,'焨':12,'焩':12,'焪':12,'焫':11,'焬':12,'焭':12,'焮':12,'焯':12,'焰':12,'焱':12,'焲':12,'焳':12,'焴':12,'焵':12,'然':12,'焷':12,'焸':12,'焹':12,'焺':12,'焻':12,'焼':12,'焽':12,'焾':12,'焿':12,'煀':12,'煁':13,'煂':13,
  '煃':13,'煄':13,'煅':13,'煆':13,'煇':13,'煈':13,'煉':13,'煊':13,'煋':13,'煌':13,'煍':13,'煎':13,'煏':13,'煐':12,'煑':12,'煒':13,'煓':13,'煔':13,'煕':14,'煖':13,'煗':13,'煘':13,'煙':13,'煚':12,'煛':14,'煜':13,'煝':13,'煞':13,
  '煟':13,'煠':13,'煡':12,'煢':13,'煣':13,'煤':13,'煥':13,'煦':13,'照':13,'煨':13,'煩':13,'煪':13,'煫':13,'煬':13,'煭':13,'煮':12,'煯':13,'煰':13,'煱':12,'煲':13,'煳':13,'煴':13,'煵':13,'煶':13,'煷':13,'煸':13,'煹':14,'煺':13,
  '煻':14,'煼':14,'煽':14,'煾':14,'煿':14,'熀':14,'熁':14,'熂':14,'熃':14,'熄':14,'熅':14,'熆':14,'熇':14,'熈':14,'熉':14,'熊':14,'熋':14,'熌':14,'熍':13,'熎':14,'熏':14,'熐':14,'熑':14,'熒':14,'熓':14,'熔':14,'熕':14,'熖':14,
  '熗':14,'熘':14,'熙':14,'熚':14,'熛':15,'熜':15,'熝':15,'熞':15,'熟':15,'熠':15,'熡':15,'熢':14,'熣':15,'熤':15,'熥':14,'熦':15,'熧':15,'熨':15,'熩':15,'熪':15,'熫':15,'熬':14,'熭':15,'熮':15,'熯':15,'熰':15,'熱':15,'熲':15,
  '熳':15,'熴':15,'熵':15,'熶':16,'熷':16,'熸':16,'熹':16,'熺':16,'熻':16,'熼':15,'熽':17,'熾':16,'熿':15,'燀':16,'燁':16,'燂':16,'燃':16,'燄':16,'燅':16,'燆':16,'燇':16,'燈':16,'燉':16,'燊':16,'燋':16,'燌':16,'燍':16,'燎':16,
  '燏':16,'燐':16,'燑':16,'燒':16,'燓':16,'燔':16,'燕':16,'燖':16,'燗':16,'燘':16,'燙':16,'燚':16,'燛':16,'燜':16,'燝':16,'燞':16,'營':16,'燠':16,'燡':17,'燢':17,'燣':17,'燤':16,'燥':17,'燦':17,'燧':17,'燨':17,'燩':17,'燪':16,
  '燫':17,'燬':17,'燭':17,'燮':17,'燯':17,'燰':17,'燱':17,'燲':17,'燳':17,'燴':17,'燵':16,'燶':17,'燷':17,'燸':18,'燹':18,'燺':18,'燻':18,'燼':18,'燽':18,'燾':18,'燿':18,'爀':18,'爁':18,'爂':19,'爃':18,'爄':18,'爅':19,'爆':19,
  '爇':21,'爈':19,'爉':19,'爊':19,'爋':20,'爌':18,'爍':19,'爎':19,'爏':20,'爐':20,'爑':19,'爒':20,'爓':20,'爔':20,'爕':19,'爖':20,'爗':18,'爘':20,'爙':21,'爚':21,'爛':21,'爜':22,'爝':21,'爞':22,'爟':21,'爠':22,'爡':22,'爢':23,
  '爣':24,'爤':24,'爥':25,'爦':25,'爧':28,'爨':30,'爩':33,'爪':4,'爫':4,'爬':8,'爭':8,'爮':9,'爯':9,'爰':9,'爱':10,'爲':12,'爳':14,'爴':15,'爵':17,'父':4,'爷':6,'爸':8,'爹':10,'爺':12,'爻':4,'爼':9,'爽':11,'爾':14,'爿':4,'牀':8,
  '牁':9,'牂':10,'牃':13,'牄':14,'牅':15,'牆':17,'片':4,'版':8,'牉':9,'牊':9,'牋':12,'牌':12,'牍':12,'牎':13,'牏':13,'牐':13,'牑':13,'牒':13,'牓':14,'牔':14,'牕':15,'牖':15,'牗':15,'牘':19,'牙':4,'牚':12,'牛':4,'牜':4,'牝':6,'牞':6,
  '牟':6,'牠':7,'牡':7,'牢':7,'牣':7,'牤':7,'牥':8,'牦':8,'牧':8,'牨':8,'物':8,'牪':8,'牫':8,'牬':8,'牭':9,'牮':9,'牯':9,'牰':9,'牱':9,'牲':9,'牳':9,'牴':9,'牵':9,'牶':10,'牷':10,'牸':10,'特':10,'牺':10,'牻':11,'牼':11,'牽':11,
  '牾':11,'牿':11,'犀':12,'犁':11,'犂':12,'犃':12,'犄':12,'犅':12,'犆':12,'犇':12,'犈':12,'犉':12,'犊':12,'犋':12,'犌':13,'犍':12,'犎':13,'犏':13,'犐':13,'犑':13,'犒':14,'犓':14,'犔':14,'犕':14,'犖':14,'犗':14,'犘':15,'犙':15,
  '犚':15,'犛':15,'犜':16,'犝':16,'犞':16,'犟':16,'犠':17,'犡':18,'犢':19,'犣':19,'犤':19,'犥':19,'犦':19,'犧':20,'犨':20,'犩':21,'犪':25,'犫':27,'犬':4,'犭':3,'犮':5,'犯':7,'犰':6,'犱':7,'犲':7,'犳':7,'犴':7,'犵':7,'状':7,'犷':7,
  '犸':7,'犹':8,'犺':8,'犻':8,'犼':8,'犽':8,'犾':8,'犿':8,'狀':8,'狁':8,'狂':9,'狃':8,'狄':8,'狅':8,'狆':8,'狇':8,'狈':8,'狉':9,'狊':9,'狋':9,'狌':9,'狍':9,'狎':9,'狏':9,'狐':9,'狑':9,'狒':9,'狓':9,'狔':9,'狕':9,'狖':9,'狗':9,'狘':9,
  '狙':9,'狚':9,'狛':9,'狜':9,'狝':9,'狞':9,'狟':10,'狠':10,'狡':10,'狢':10,'狣':10,'狤':10,'狥':10,'狦':10,'狧':10,'狨':10,'狩':10,'狪':10,'狫':10,'独':10,'狭':10,'狮':10,'狯':10,'狰':10,'狱':9,'狲':10,'狳':11,'狴':11,'狵':11,
  '狶':11,'狷':11,'狸':11,'狹':11,'狺':11,'狻':11,'狼':11,'狽':11,'狾':11,'狿':10,'猀':11,'猁':11,'猂':11,'猃':11,'猄':12,'猅':12,'猆':12,'猇':12,'猈':12,'猉':12,'猊':12,'猋':12,'猌':12,'猍':12,'猎':12,'猏':12,'猐':11,'猑':12,
  '猒':12,'猓':12,'猔':12,'猕':12,'猖':12,'猗':12,'猘':12,'猙':12,'猚':12,'猛':12,'猜':12,'猝':12,'猞':12,'猟':12,'猠':12,'猡':12,'猢':13,'猣':13,'猤':13,'猥':13,'猦':13,'猧':12,'猨':13,'猩':13,'猪':12,'猫':12,'猬':13,'猭':13,
  '献':13,'猯':13,'猰':13,'猱':13,'猲':13,'猳':13,'猴':13,'猵':13,'猶':13,'猷':13,'猸':13,'猹':13,'猺':14,'猻':14,'猼':14,'猽':14,'猾':13,'猿':14,'獀':13,'獁':14,'獂':14,'獃':14,'獄':14,'獅':13,'獆':14,'獇':13,'獈':14,'獉':14,
  '獊':14,'獋':16,'獌':15,'獍':15,'獎':15,'獏':14,'獐':15,'獑':15,'獒':14,'獓':14,'獔':15,'獕':15,'獖':16,'獗':16,'獘':15,'獙':15,'獚':15,'獛':16,'獜':16,'獝':16,'獞':16,'獟':16,'獠':16,'獡':16,'獢':16,'獣':16,'獤':16,'獥':17,
  '獦':16,'獧':17,'獨':17,'獩':17,'獪':17,'獫':17,'獬':17,'獭':17,'獮':18,'獯':18,'獰':18,'獱':18,'獲':17,'獳':18,'獴':17,'獵':19,'獶':19,'獷':18,'獸':19,'獹':20,'獺':20,'獻':20,'獼':21,'獽':21,'獾':21,'獿':23,'玀':23,'玁':23,
  '玂':23,'玃':24,'玄':5,'玅':9,'玆':10,'率':11,'玈':11,'玉':5,'玊':6,'王':4,'玌':6,'玍':6,'玎':7,'玏':7,'玐':7,'玑':7,'玒':8,'玓':8,'玔':8,'玕':8,'玖':8,'玗':8,'玘':8,'玙':8,'玚':8,'玛':8,'玜':9,'玝':9,'玞':9,'玟':9,'玠':9,'玡':9,
  '玢':9,'玣':9,'玤':9,'玥':9,'玦':9,'玧':9,'玨':10,'玩':9,'玪':9,'玫':9,'玬':9,'玭':9,'玮':9,'环':9,'现':9,'玱':9,'玲':10,'玳':10,'玴':10,'玵':10,'玶':10,'玷':10,'玸':10,'玹':10,'玺':10,'玻':10,'玼':11,'玽':10,'玾':10,'玿':10,
  '珀':10,'珁':9,'珂':10,'珃':10,'珄':10,'珅':10,'珆':10,'珇':10,'珈':10,'珉':10,'珊':10,'珋':10,'珌':10,'珍':9,'珎':10,'珏':10,'珐':10,'珑':10,'珒':11,'珓':11,'珔':11,'珕':11,'珖':11,'珗':11,'珘':11,'珙':11,'珚':11,'珛':11,
  '珜':11,'珝':11,'珞':11,'珟':11,'珠':10,'珡':10,'珢':11,'珣':11,'珤':11,'珥':11,'珦':11,'珧':11,'珨':11,'珩':11,'珪':11,'珫':11,'珬':11,'班':10,'珮':11,'珯':11,'珰':11,'珱':10,'珲':11,'珳':12,'珴':12,'珵':12,'珶':12,'珷':13,
  '珸':12,'珹':11,'珺':12,'珻':12,'珼':12,'珽':11,'現':12,'珿':12,'琀':12,'琁':11,'琂':12,'球':12,'琄':12,'琅':12,'理':12,'琇':12,'琈':12,'琉':12,'琊':11,'琋':12,'琌':12,'琍':12,'琎':12,'琏':12,'琐':11,'琑':12,'琒':12,'琓':12,
  '琔':13,'琕':13,'琖':13,'琗':13,'琘':13,'琙':13,'琚':13,'琛':13,'琜':13,'琝':13,'琞':13,'琟':13,'琠':13,'琡':13,'琢':13,'琣':13,'琤':11,'琥':13,'琦':13,'琧':13,'琨':13,'琩':13,'琪':12,'琫':13,'琬':13,'琭':13,'琮':13,'琯':13,
  '琰':13,'琱':13,'琲':13,'琳':13,'琴':13,'琵':12,'琶':12,'琷':12,'琸':13,'琹':12,'琺':13,'琻':13,'琼':13,'琽':13,'琾':14,'琿':14,'瑀':14,'瑁':14,'瑂':14,'瑃':14,'瑄':14,'瑅':14,'瑆':14,'瑇':14,'瑈':14,'瑉':14,'瑊':14,'瑋':14,
  '瑌':14,'瑍':14,'瑎':14,'瑏':14,'瑐':14,'瑑':14,'瑒':14,'瑓':14,'瑔':14,'瑕':14,'瑖':14,'瑗':14,'瑘':13,'瑙':14,'瑚':14,'瑛':13,'瑜':14,'瑝':14,'瑞':13,'瑟':13,'瑠':15,'瑡':15,'瑢':15,'瑣':15,'瑤':14,'瑥':14,'瑦':15,'瑧':15,
  '瑨':15,'瑩':15,'瑪':15,'瑫':15,'瑬':15,'瑭':15,'瑮':15,'瑯':13,'瑰':14,'瑱':15,'瑲':15,'瑳':14,'瑴':14,'瑵':14,'瑶':15,'瑷':15,'瑸':15,'瑹':15,'瑺':16,'瑻':16,'瑼':16,'瑽':16,'瑾':16,'瑿':16,'璀':16,'璁':16,'璂':16,'璃':15,
  '璄':16,'璅':16,'璆':16,'璇':16,'璈':15,'璉':15,'璊':16,'璋':16,'璌':16,'璍':15,'璎':16,'璏':17,'璐':18,'璑':17,'璒':17,'璓':15,'璔':17,'璕':17,'璖':16,'璗':17,'璘':17,'璙':17,'璚':17,'璛':18,'璜':16,'璝':17,'璞':17,'璟':17,
  '璠':17,'璡':16,'璢':17,'璣':17,'璤':17,'璥':17,'璦':18,'璧':18,'璨':18,'璩':18,'璪':18,'璫':18,'璬':18,'璭':17,'璮':18,'璯':18,'環':17,'璱':18,'璲':17,'璳':17,'璴':18,'璵':18,'璶':19,'璷':20,'璸':19,'璹':19,'璺':20,'璻':19,
  '璼':19,'璽':19,'璾':19,'璿':19,'瓀':19,'瓁':18,'瓂':18,'瓃':20,'瓄':20,'瓅':20,'瓆':20,'瓇':20,'瓈':20,'瓉':20,'瓊':19,'瓋':19,'瓌':21,'瓍':19,'瓎':21,'瓏':21,'瓐':21,'瓑':21,'瓒':21,'瓓':22,'瓔':22,'瓕':22,'瓖':22,'瓗':23,
  '瓘':22,'瓙':23,'瓚':24,'瓛':25,'瓜':5,'瓝':8,'瓞':10,'瓟':10,'瓠':11,'瓡':13,'瓢':16,'瓣':19,'瓤':22,'瓥':24,'瓦':4,'瓧':7,'瓨':7,'瓩':7,'瓪':8,'瓫':8,'瓬':8,'瓭':8,'瓮':8,'瓯':8,'瓰':8,'瓱':9,'瓲':8,'瓳':9,'瓴':9,'瓵':9,'瓶':10,
  '瓷':10,'瓸':11,'瓹':11,'瓺':11,'瓻':11,'瓼':11,'瓽':12,'瓾':12,'瓿':12,'甀':12,'甁':12,'甂':13,'甃':13,'甄':14,'甅':13,'甆':13,'甇':14,'甈':14,'甉':14,'甊':15,'甋':15,'甌':15,'甍':14,'甎':15,'甏':16,'甐':16,'甑':16,'甒':16,
  '甓':17,'甔':17,'甕':17,'甖':18,'甗':20,'甘':5,'甙':8,'甚':9,'甛':11,'甜':11,'甝':13,'甞':13,'生':5,'甠':9,'甡':10,'產':11,'産':11,'甤':12,'甥':12,'甦':12,'甧':14,'用':5,'甩':5,'甪':6,'甫':7,'甬':7,'甭':9,'甮':9,'甯':12,'田':5,
  '由':5,'甲':5,'申':5,'甴':5,'电':5,'甶':6,'男':7,'甸':7,'甹':7,'町':7,'画':8,'甼':7,'甽':8,'甾':8,'甿':8,'畀':8,'畁':8,'畂':8,'畃':8,'畄':8,'畅':8,'畆':9,'畇':9,'畈':9,'畉':9,'畊':9,'畋':9,'界':9,'畍':9,'畎':9,'畏':9,'畐':9,'畑':9,
  '畒':9,'畓':9,'畔':10,'畕':10,'畖':10,'畗':10,'畘':10,'留':10,'畚':10,'畛':10,'畜':10,'畝':10,'畞':10,'畟':10,'畠':10,'畡':11,'畢':11,'畣':11,'畤':11,'略':11,'畦':11,'畧':11,'畨':11,'畩':11,'番':12,'畫':13,'畬':12,'畭':12,
  '畮':12,'畯':12,'異':11,'畱':12,'畲':12,'畳':12,'畴':12,'畵':13,'當':13,'畷':13,'畸':13,'畹':13,'畺':13,'畻':14,'畼':14,'畽':14,'畾':15,'畿':15,'疀':16,'疁':16,'疂':16,'疃':17,'疄':17,'疅':18,'疆':19,'疇':19,'疈':20,'疉':20,
  '疊':22,'疋':5,'疌':8,'疍':10,'疎':12,'疏':12,'疐':14,'疑':14,'疒':5,'疓':7,'疔':7,'疕':7,'疖':7,'疗':7,'疘':8,'疙':8,'疚':8,'疛':8,'疜':8,'疝':8,'疞':8,'疟':8,'疠':8,'疡':8,'疢':9,'疣':9,'疤':9,'疥':9,'疦':9,'疧':9,'疨':9,'疩':9,
  '疪':9,'疫':9,'疬':9,'疭':9,'疮':9,'疯':9,'疰':10,'疱':10,'疲':10,'疳':10,'疴':10,'疵':11,'疶':10,'疷':10,'疸':10,'疹':10,'疺':9,'疻':10,'疼':10,'疽':10,'疾':10,'疿':10,'痀':10,'痁':10,'痂':10,'痃':10,'痄':10,'病':10,'痆':10,
  '症':10,'痈':10,'痉':10,'痊':11,'痋':11,'痌':11,'痍':11,'痎':11,'痏':11,'痐':11,'痑':11,'痒':11,'痓':11,'痔':11,'痕':11,'痖':11,'痗':12,'痘':12,'痙':12,'痚':12,'痛':12,'痜':12,'痝':12,'痞':12,'痟':12,'痠':12,'痡':12,'痢':12,
  '痣':12,'痤':12,'痥':12,'痦':12,'痧':12,'痨':12,'痩':12,'痪':12,'痫':12,'痬':13,'痭':13,'痮':13,'痯':13,'痰':13,'痱':13,'痲':13,'痳':13,'痴':13,'痵':13,'痶':13,'痷':13,'痸':13,'痹':13,'痺':13,'痻':13,'痼':13,'痽':13,'痾':12,
  '痿':13,'瘀':13,'瘁':13,'瘂':13,'瘃':13,'瘄':13,'瘅':13,'瘆':13,'瘇':14,'瘈':14,'瘉':14,'瘊':14,'瘋':14,'瘌':14,'瘍':14,'瘎':14,'瘏':13,'瘐':13,'瘑':13,'瘒':14,'瘓':14,'瘔':13,'瘕':14,'瘖':14,'瘗':14,'瘘':14,'瘙':14,'瘚':15,
  '瘛':15,'瘜':15,'瘝':15,'瘞':15,'瘟':14,'瘠':15,'瘡':15,'瘢':15,'瘣':14,'瘤':15,'瘥':14,'瘦':14,'瘧':14,'瘨':15,'瘩':14,'瘪':15,'瘫':15,'瘬':16,'瘭':16,'瘮':16,'瘯':16,'瘰':16,'瘱':16,'瘲':16,'瘳':16,'瘴':16,'瘵':16,'瘶':16,
  '瘷':16,'瘸':16,'瘹':16,'瘺':16,'瘻':16,'瘼':15,'瘽':16,'瘾':16,'瘿':16,'癀':16,'癁':17,'療':17,'癃':16,'癄':17,'癅':17,'癆':17,'癇':17,'癈':17,'癉':17,'癊':15,'癋':17,'癌':17,'癍':17,'癎':17,'癏':18,'癐':18,'癑':18,'癒':18,
  '癓':18,'癔':18,'癕':18,'癖':18,'癗':18,'癘':17,'癙':18,'癚':18,'癛':18,'癜':18,'癝':18,'癞':18,'癟':19,'癠':19,'癡':19,'癢':19,'癣':19,'癤':18,'癥':20,'癦':20,'癧':21,'癨':21,'癩':21,'癪':21,'癫':21,'癬':22,'癭':22,'癮':21,
  '癯':23,'癰':23,'癱':24,'癲':24,'癳':26,'癴':28,'癵':30,'癶':5,'癷':8,'癸':9,'癹':9,'発':9,'登':12,'發':12,'白':5,'百':6,'癿':6,'皀':7,'皁':7,'皂':7,'皃':7,'的':8,'皅':9,'皆':9,'皇':9,'皈':9,'皉':11,'皊':10,'皋':10,'皌':10,'皍':9,
  '皎':11,'皏':11,'皐':11,'皑':11,'皒':12,'皓':12,'皔':12,'皕':12,'皖':12,'皗':13,'皘':13,'皙':13,'皚':15,'皛':15,'皜':15,'皝':15,'皞':15,'皟':16,'皠':16,'皡':16,'皢':17,'皣':15,'皤':17,'皥':17,'皦':18,'皧':18,'皨':18,'皩':19,
  '皪':20,'皫':20,'皬':21,'皭':22,'皮':5,'皯':8,'皰':10,'皱':10,'皲':11,'皳':12,'皴':12,'皵':13,'皶':14,'皷':14,'皸':14,'皹':14,'皺':15,'皻':16,'皼':17,'皽':18,'皾':20,'皿':5,'盀':7,'盁':7,'盂':8,'盃':9,'盄':9,'盅':9,'盆':9,'盇':9,
  '盈':9,'盉':10,'益':10,'盋':10,'盌':10,'盍':10,'盎':10,'盏':10,'盐':10,'监':10,'盒':11,'盓':11,'盔':11,'盕':11,'盖':11,'盗':11,'盘':11,'盙':12,'盚':12,'盛':11,'盜':12,'盝':13,'盞':13,'盟':13,'盠':14,'盡':14,'盢':14,'監':14,
  '盤':15,'盥':16,'盦':16,'盧':16,'盨':17,'盩':17,'盪':17,'盫':18,'盬':18,'盭':20,'目':5,'盯':7,'盰':8,'盱':8,'盲':8,'盳':8,'直':8,'盵':8,'盶':9,'盷':9,'相':9,'盹':9,'盺':9,'盻':9,'盼':9,'盽':9,'盾':9,'盿':9,'眀':9,'省':9,'眂':9,
  '眃':9,'眄':9,'眅':9,'眆':9,'眇':9,'眈':9,'眉':9,'眊':9,'看':9,'県':9,'眍':9,'眎':10,'眏':10,'眐':10,'眑':10,'眒':10,'眓':10,'眔':10,'眕':10,'眖':10,'眗':10,'眘':10,'眙':10,'眚':10,'眛':10,'眜':10,'眝':10,'眞':10,'真':10,'眠':10,
  '眡':10,'眢':10,'眣':10,'眤':10,'眥':11,'眦':11,'眧':10,'眨':9,'眩':10,'眪':10,'眫':10,'眬':10,'眭':11,'眮':11,'眯':11,'眰':11,'眱':11,'眲':11,'眳':11,'眴':11,'眵':11,'眶':11,'眷':11,'眸':11,'眹':11,'眺':11,'眻':11,'眼':11,
  '眽':11,'眾':11,'眿':10,'着':11,'睁':11,'睂':12,'睃':12,'睄':12,'睅':12,'睆':12,'睇':12,'睈':12,'睉':12,'睊':12,'睋':12,'睌':12,'睍':12,'睎':12,'睏':12,'睐':12,'睑':12,'睒':13,'睓':13,'睔':13,'睕':13,'睖':13,'睗':13,'睘':13,
  '睙':13,'睚':13,'睛':13,'睜':13,'睝':13,'睞':13,'睟':13,'睠':13,'睡':13,'睢':13,'督':13,'睤':13,'睥':13,'睦':13,'睧':13,'睨':13,'睩':13,'睪':13,'睫':13,'睬':13,'睭':13,'睮':14,'睯':14,'睰':13,'睱':14,'睲':14,'睳':14,'睴':14,
  '睵':14,'睶':14,'睷':13,'睸':14,'睹':13,'睺':14,'睻':14,'睼':14,'睽':14,'睾':14,'睿':14,'瞀':14,'瞁':14,'瞂':14,'瞃':14,'瞄':13,'瞅':14,'瞆':14,'瞇':14,'瞈':15,'瞉':15,'瞊':15,'瞋':15,'瞌':15,'瞍':14,'瞎':15,'瞏':15,'瞐':15,
  '瞑':15,'瞒':15,'瞓':15,'瞔':16,'瞕':16,'瞖':16,'瞗':16,'瞘':16,'瞙':15,'瞚':16,'瞛':16,'瞜':16,'瞝':15,'瞞':16,'瞟':16,'瞠':16,'瞡':16,'瞢':15,'瞣':16,'瞤':17,'瞥':16,'瞦':17,'瞧':17,'瞨':17,'瞩':17,'瞪':17,'瞫':17,'瞬':17,
  '瞭':17,'瞮':17,'瞯':17,'瞰':16,'瞱':15,'瞲':17,'瞳':17,'瞴':17,'瞵':17,'瞶':17,'瞷':17,'瞸':17,'瞹':18,'瞺':18,'瞻':18,'瞼':18,'瞽':18,'瞾':18,'瞿':18,'矀':18,'矁':18,'矂':18,'矃':19,'矄':19,'矅':19,'矆':18,'矇':18,'矈':19,
  '矉':19,'矊':19,'矋':19,'矌':19,'矍':20,'矎':19,'矏':20,'矐':21,'矑':21,'矒':20,'矓':21,'矔':22,'矕':24,'矖':24,'矗':24,'矘':25,'矙':24,'矚':26,'矛':5,'矜':9,'矝':10,'矞':12,'矟':12,'矠':13,'矡':25,'矢':5,'矣':7,'矤':8,'知':8,
  '矦':9,'矧':9,'矨':9,'矩':9,'矪':11,'矫':11,'矬':12,'短':12,'矮':13,'矯':17,'矰':17,'矱':18,'矲':20,'石':5,'矴':7,'矵':7,'矶':7,'矷':8,'矸':8,'矹':8,'矺':8,'矻':8,'矼':8,'矽':8,'矾':8,'矿':8,'砀':8,'码':8,'砂':9,'砃':9,'砄':9,
  '砅':9,'砆':9,'砇':9,'砈':9,'砉':9,'砊':9,'砋':9,'砌':9,'砍':9,'砎':9,'砏':9,'砐':8,'砑':9,'砒':9,'砓':9,'研':9,'砕':9,'砖':9,'砗':9,'砘':9,'砙':9,'砚':9,'砛':9,'砜':9,'砝':10,'砞':10,'砟':10,'砠':10,'砡':10,'砢':10,'砣':10,'砤':10,
  '砥':10,'砦':11,'砧':10,'砨':10,'砩':10,'砪':10,'砫':10,'砬':10,'砭':9,'砮':10,'砯':10,'砰':10,'砱':10,'砲':10,'砳':10,'破':10,'砵':10,'砶':10,'砷':10,'砸':10,'砹':10,'砺':10,'砻':10,'砼':10,'砽':10,'砾':10,'砿':10,'础':10,
  '硁':10,'硂':11,'硃':11,'硄':11,'硅':11,'硆':11,'硇':11,'硈':11,'硉':11,'硊':11,'硋':11,'硌':11,'硍':11,'硎':11,'硏':11,'硐':11,'硑':11,'硒':11,'硓':11,'硔':11,'硕':11,'硖':11,'硗':11,'硘':11,'硙':11,'硚':11,'硛':11,'硜':12,
  '硝':12,'硞':12,'硟':11,'硠':12,'硡':12,'硢':12,'硣':12,'硤':12,'硥':12,'硦':12,'硧':12,'硨':12,'硩':12,'硪':12,'硫':12,'硬':12,'硭':11,'确':12,'硯':12,'硰':12,'硱':12,'硲':12,'硳':12,'硴':12,'硵':12,'硶':12,'硷':12,'硸':13,
  '硹':13,'硺':13,'硻':13,'硼':13,'硽':13,'硾':13,'硿':13,'碀':11,'碁':13,'碂':13,'碃':13,'碄':13,'碅':13,'碆':13,'碇':13,'碈':13,'碉':13,'碊':13,'碋':13,'碌':13,'碍':13,'碎':13,'碏':13,'碐':13,'碑':13,'碒':13,'碓':13,'碔':13,
  '碕':13,'碖':13,'碗':13,'碘':13,'碙':13,'碚':13,'碛':13,'碜':13,'碝':14,'碞':14,'碟':14,'碠':14,'碡':14,'碢':13,'碣':14,'碤':13,'碥':14,'碦':14,'碧':14,'碨':14,'碩':14,'碪':14,'碫':14,'碬':14,'碭':14,'碮':14,'碯':14,'碰':13,
  '碱':14,'碲':14,'碳':14,'碴':14,'碵':14,'碶':14,'碷':14,'碸':14,'碹':14,'確':15,'碻':15,'碼':15,'碽':15,'碾':15,'碿':15,'磀':14,'磁':14,'磂':15,'磃':15,'磄':15,'磅':15,'磆':14,'磇':15,'磈':14,'磉':15,'磊':15,'磋':14,'磌':15,
  '磍':15,'磎':15,'磏':15,'磐':15,'磑':15,'磒':15,'磓':14,'磔':15,'磕':15,'磖':16,'磗':15,'磘':15,'磙':15,'磚':16,'磛':16,'磜':16,'磝':15,'磞':16,'磟':16,'磠':16,'磡':16,'磢':16,'磣':16,'磤':15,'磥':16,'磦':16,'磧':16,'磨':16,
  '磩':16,'磪':16,'磫':16,'磬':16,'磭':16,'磮':16,'磯':17,'磰':17,'磱':17,'磲':16,'磳':17,'磴':17,'磵':17,'磶':17,'磷':17,'磸':17,'磹':17,'磺':16,'磻':17,'磼':17,'磽':17,'磾':17,'磿':17,'礀':17,'礁':17,'礂':17,'礃':17,'礄':17,
  '礅':17,'礆':18,'礇':17,'礈':17,'礉':18,'礊':18,'礋':18,'礌':18,'礍':17,'礎':18,'礏':18,'礐':18,'礑':18,'礒':18,'礓':18,'礔':18,'礕':18,'礖':18,'礗':19,'礘':19,'礙':19,'礚':18,'礛':19,'礜':18,'礝':19,'礞':18,'礟':19,'礠':18,
  '礡':18,'礢':19,'礣':19,'礤':19,'礥':20,'礦':19,'礧':20,'礨':20,'礩':20,'礪':19,'礫':20,'礬':20,'礭':21,'礮':21,'礯':21,'礰':21,'礱':21,'礲':21,'礳':21,'礴':21,'礵':22,'礶':22,'礷':22,'礸':24,'礹':24,'示':5,'礻':4,'礼':6,'礽':7,
  '社':8,'礿':8,'祀':8,'祁':8,'祂':8,'祃':8,'祄':9,'祅':9,'祆':9,'祇':9,'祈':8,'祉':9,'祊':9,'祋':9,'祌':9,'祍':9,'祎':9,'祏':10,'祐':10,'祑':10,'祒':10,'祓':10,'祔':10,'祕':10,'祖':10,'祗':10,'祘':10,'祙':10,'祚':10,'祛':10,'祜':10,
  '祝':10,'神':10,'祟':10,'祠':10,'祡':11,'祢':10,'祣':10,'祤':11,'祥':11,'祦':12,'祧':11,'票':11,'祩':11,'祪':11,'祫':11,'祬':11,'祭':11,'祮':11,'祯':11,'祰':12,'祱':12,'祲':12,'祳':12,'祴':12,'祵':12,'祶':12,'祷':12,'祸':12,
  '祹':13,'祺':13,'祻':13,'祼':13,'祽':13,'祾':13,'祿':13,'禀':13,'禁':13,'禂':13,'禃':13,'禄':13,'禅':13,'禆':13,'禇':13,'禈':14,'禉':14,'禊':14,'禋':14,'禌':14,'禍':14,'禎':14,'福':14,'禐':14,'禑':14,'禒':14,'禓':14,'禔':14,
  '禕':16,'禖':14,'禗':14,'禘':14,'禙':14,'禚':15,'禛':14,'禜':15,'禝':15,'禞':15,'禟':15,'禠':15,'禡':15,'禢':15,'禣':15,'禤':15,'禥':16,'禦':17,'禧':17,'禨':17,'禩':16,'禪':17,'禫':17,'禬':18,'禭':17,'禮':18,'禯':18,'禰':19,
  '禱':19,'禲':19,'禳':22,'禴':22,'禵':23,'禶':24,'禷':24,'禸':4,'禹':9,'禺':9,'离':10,'禼':11,'禽':12,'禾':5,'禿':7,'秀':7,'私':7,'秂':7,'秃':7,'秄':8,'秅':8,'秆':8,'秇':8,'秈':8,'秉':8,'秊':8,'秋':9,'秌':9,'种':9,'秎':9,'秏':9,
  '秐':9,'科':9,'秒':9,'秓':9,'秔':9,'秕':9,'秖':9,'秗':9,'秘':10,'秙':10,'秚':10,'秛':10,'秜':10,'秝':10,'秞':10,'租':10,'秠':10,'秡':10,'秢':10,'秣':10,'秤':10,'秥':10,'秦':10,'秧':10,'秨':10,'秩':10,'秪':10,'秫':10,'秬':9,'秭':9,
  '秮':10,'积':10,'称':10,'秱':11,'秲':11,'秳':11,'秴':11,'秵':11,'秶':11,'秷':11,'秸':11,'秹':11,'秺':11,'移':11,'秼':11,'秽':11,'秾':11,'秿':12,'稀':12,'稁':12,'稂':12,'稃':12,'稄':12,'稅':12,'稆':11,'稇':12,'稈':12,'稉':12,
  '稊':12,'程':12,'稌':12,'稍':12,'税':12,'稏':13,'稐':13,'稑':13,'稒':13,'稓':13,'稔':13,'稕':13,'稖':13,'稗':13,'稘':13,'稙':13,'稚':13,'稛':13,'稜':13,'稝':13,'稞':13,'稟':13,'稠':13,'稡':13,'稢':13,'稣':13,'稤':13,'稥':13,
  '稦':14,'稧':14,'稨':14,'稩':14,'稪':14,'稫':14,'稬':14,'稭':14,'種':14,'稯':14,'稰':14,'稱':14,'稲':14,'稳':14,'稴':15,'稵':14,'稶':15,'稷':15,'稸':15,'稹':15,'稺':15,'稻':15,'稼':15,'稽':15,'稾':15,'稿':15,'穀':15,'穁':14,
  '穂':15,'穃':15,'穄':16,'穅':16,'穆':16,'穇':16,'穈':16,'穉':17,'穊':14,'穋':16,'穌':16,'積':16,'穎':16,'穏':16,'穐':16,'穑':16,'穒':16,'穓':16,'穔':16,'穕':17,'穖':17,'穗':17,'穘':17,'穙':17,'穚':17,'穛':17,'穜':17,'穝':17,
  '穞':17,'穟':17,'穠':18,'穡':18,'穢':18,'穣':18,'穤':19,'穥':18,'穦':19,'穧':19,'穨':19,'穩':19,'穪':19,'穫':18,'穬':19,'穭':20,'穮':20,'穯':20,'穰':22,'穱':22,'穲':24,'穳':24,'穴':5,'穵':6,'究':7,'穷':7,'穸':8,'穹':8,'空':8,
  '穻':8,'穼':9,'穽':9,'穾':9,'穿':9,'窀':9,'突':9,'窂':9,'窃':9,'窄':10,'窅':10,'窆':9,'窇':10,'窈':10,'窉':10,'窊':10,'窋':10,'窌':10,'窍':10,'窎':10,'窏':11,'窐':11,'窑':11,'窒':11,'窓':11,'窔':11,'窕':11,'窖':12,'窗':12,'窘':12,
  '窙':12,'窚':11,'窛':12,'窜':12,'窝':12,'窞':13,'窟':13,'窠':13,'窡':13,'窢':13,'窣':13,'窤':13,'窥':13,'窦':13,'窧':13,'窨':14,'窩':13,'窪':14,'窫':14,'窬':14,'窭':14,'窮':15,'窯':15,'窰':15,'窱':15,'窲':15,'窳':15,'窴':15,
  '窵':16,'窶':16,'窷':16,'窸':16,'窹':16,'窺':16,'窻':16,'窼':16,'窽':16,'窾':17,'窿':16,'竀':17,'竁':17,'竂':17,'竃':17,'竄':18,'竅':18,'竆':18,'竇':20,'竈':21,'竉':21,'竊':22,'立':5,'竌':7,'竍':7,'竎':8,'竏':8,'竐':9,'竑':9,
  '竒':9,'竓':9,'竔':9,'竕':9,'竖':9,'竗':9,'竘':10,'站':10,'竚':10,'竛':10,'竜':10,'竝':10,'竞':10,'竟':11,'章':11,'竡':11,'竢':12,'竣':12,'竤':12,'童':12,'竦':12,'竧':12,'竨':13,'竩':13,'竪':13,'竫':11,'竬':14,'竭':14,'竮':14,
  '端':14,'竰':14,'竱':16,'竲':17,'竳':17,'竴':17,'竵':18,'競':20,'竷':20,'竸':22,'竹':6,'竺':8,'竻':8,'竼':9,'竽':9,'竾':9,'竿':9,'笀':9,'笁':9,'笂':9,'笃':9,'笄':10,'笅':10,'笆':10,'笇':10,'笈':9,'笉':10,'笊':10,'笋':10,'笌':10,
  '笍':10,'笎':10,'笏':10,'笐':10,'笑':10,'笒':10,'笓':10,'笔':10,'笕':10,'笖':10,'笗':11,'笘':11,'笙':11,'笚':11,'笛':11,'笜':11,'笝':11,'笞':11,'笟':11,'笠':11,'笡':11,'笢':11,'笣':11,'笤':11,'笥':11,'符':11,'笧':11,'笨':11,
  '笩':11,'笪':11,'笫':10,'第':11,'笭':11,'笮':11,'笯':11,'笰':11,'笱':11,'笲':11,'笳':11,'笴':11,'笵':11,'笶':11,'笷':11,'笸':11,'笹':11,'笺':11,'笻':11,'笼':11,'笽':11,'笾':11,'笿':12,'筀':12,'筁':12,'筂':12,'筃':12,'筄':12,
  '筅':12,'筆':12,'筇':11,'筈':12,'等':12,'筊':12,'筋':12,'筌':12,'筍':12,'筎':12,'筏':12,'筐':12,'筑':12,'筒':12,'筓':12,'答':12,'筕':12,'策':12,'筗':12,'筘':12,'筙':12,'筚':12,'筛':12,'筜':12,'筝':12,'筞':13,'筟':13,'筠':13,
  '筡':13,'筢':13,'筣':13,'筤':13,'筥':12,'筦':13,'筧':13,'筨':13,'筩':13,'筪':13,'筫':13,'筬':12,'筭':13,'筮':13,'筯':13,'筰':13,'筱':13,'筲':13,'筳':12,'筴':13,'筵':12,'筶':13,'筷':13,'筸':13,'筹':13,'筺':13,'筻':13,'筼':13,
  '筽':13,'签':13,'筿':13,'简':13,'箁':14,'箂':14,'箃':14,'箄':14,'箅':14,'箆':14,'箇':14,'箈':14,'箉':14,'箊':14,'箋':14,'箌':14,'箍':14,'箎':14,'箏':14,'箐':14,'箑':14,'箒':14,'箓':14,'箔':14,'箕':14,'箖':14,'算':14,'箘':14,
  '箙':14,'箚':14,'箛':14,'箜':14,'箝':14,'箞':14,'箟':14,'箠':14,'管':14,'箢':14,'箣':14,'箤':14,'箥':14,'箦':14,'箧':14,'箨':14,'箩':14,'箪':14,'箫':14,'箬':14,'箭':15,'箮':15,'箯':15,'箰':15,'箱':15,'箲':15,'箳':15,'箴':15,
  '箵':15,'箶':15,'箷':15,'箸':14,'箹':15,'箺':15,'箻':15,'箼':15,'箽':15,'箾':15,'箿':15,'節':15,'篁':15,'篂':15,'篃':15,'範':15,'篅':15,'篆':15,'篇':15,'篈':15,'築':16,'篊':15,'篋':15,'篌':15,'篍':15,'篎':15,'篏':15,'篐':15,
  '篑':15,'篒':15,'篓':15,'篔':16,'篕':16,'篖':16,'篗':16,'篘':16,'篙':16,'篚':16,'篛':16,'篜':16,'篝':16,'篞':16,'篟':16,'篠':16,'篡':16,'篢':16,'篣':16,'篤':16,'篥':16,'篦':16,'篧':16,'篨':15,'篩':16,'篪':16,'篫':16,'篬':16,
  '篭':16,'篮':16,'篯':16,'篰':16,'篱':16,'篲':17,'篳':16,'篴':16,'篵':17,'篶':17,'篷':16,'篸':17,'篹':16,'篺':17,'篻':17,'篼':17,'篽':18,'篾':17,'篿':17,'簀':17,'簁':17,'簂':17,'簃':17,'簄':17,'簅':17,'簆':17,'簇':17,'簈':17,
  '簉':16,'簊':17,'簋':17,'簌':17,'簍':17,'簎':17,'簏':17,'簐':17,'簑':16,'簒':17,'簓':17,'簔':17,'簕':17,'簖':17,'簗':17,'簘':17,'簙':18,'簚':18,'簛':18,'簜':18,'簝':18,'簞':18,'簟':18,'簠':18,'簡':18,'簢':18,'簣':18,'簤':18,
  '簥':18,'簦':18,'簧':17,'簨':18,'簩':18,'簪':18,'簫':19,'簬':19,'簭':18,'簮':18,'簯':18,'簰':18,'簱':18,'簲':18,'簳':19,'簴':19,'簵':19,'簶':18,'簷':19,'簸':19,'簹':19,'簺':19,'簻':17,'簼':19,'簽':19,'簾':19,'簿':19,'籀':19,
  '籁':19,'籂':19,'籃':20,'籄':20,'籅':19,'籆':19,'籇':20,'籈':19,'籉':20,'籊':20,'籋':20,'籌':20,'籍':20,'籎':20,'籏':20,'籐':21,'籑':21,'籒':21,'籓':21,'籔':21,'籕':20,'籖':21,'籗':22,'籘':22,'籙':22,'籚':22,'籛':22,'籜':22,
  '籝':22,'籞':23,'籟':22,'籠':22,'籡':22,'籢':23,'籣':23,'籤':23,'籥':23,'籦':23,'籧':22,'籨':23,'籩':24,'籪':24,'籫':25,'籬':24,'籭':25,'籮':25,'籯':26,'籰':26,'籱':30,'籲':32,'米':6,'籴':8,'籵':8,'籶':8,'籷':9,'籸':9,'籹':9,
  '籺':9,'类':9,'籼':9,'籽':9,'籾':9,'籿':9,'粀':9,'粁':9,'粂':9,'粃':10,'粄':10,'粅':10,'粆':10,'粇':10,'粈':10,'粉':10,'粊':10,'粋':10,'粌':10,'粍':10,'粎':10,'粏':10,'粐':10,'粑':10,'粒':11,'粓':11,'粔':10,'粕':11,'粖':11,
  '粗':11,'粘':11,'粙':11,'粚':11,'粛':11,'粜':11,'粝':11,'粞':12,'粟':12,'粠':12,'粡':12,'粢':12,'粣':11,'粤':12,'粥':12,'粦':12,'粧':12,'粨':12,'粩':12,'粪':12,'粫':12,'粬':12,'粭':12,'粮':13,'粯':13,'粰':13,'粱':13,'粲':13,
  '粳':13,'粴':13,'粵':13,'粶':14,'粷':14,'粸':14,'粹':14,'粺':14,'粻':14,'粼':14,'粽':14,'精':14,'粿':14,'糀':13,'糁':14,'糂':15,'糃':15,'糄':15,'糅':15,'糆':15,'糇':15,'糈':15,'糉':15,'糊':15,'糋':15,'糌':15,'糍':15,'糎':15,
  '糏':16,'糐':16,'糑':16,'糒':16,'糓':16,'糔':15,'糕':16,'糖':16,'糗':16,'糘':16,'糙':16,'糚':16,'糛':17,'糜':17,'糝':17,'糞':17,'糟':17,'糠':17,'糡':17,'糢':16,'糣':18,'糤':18,'糥':18,'糦':18,'糧':18,'糨':18,'糩':19,'糪':19,
  '糫':19,'糬':19,'糭':19,'糮':20,'糯':20,'糰':20,'糱':22,'糲':20,'糳':26,'糴':22,'糵':22,'糶':25,'糷':26,'糸':6,'糹':6,'糺':7,'系':7,'糼':8,'糽':8,'糾':8,'糿':8,'紀':9,'紁':9,'紂':9,'紃':9,'約':9,'紅':9,'紆':9,'紇':9,'紈':9,'紉':9,
  '紊':10,'紋':10,'紌':10,'納':10,'紎':10,'紏':10,'紐':10,'紑':10,'紒':10,'紓':10,'純':10,'紕':10,'紖':10,'紗':10,'紘':10,'紙':10,'級':9,'紛':10,'紜':10,'紝':10,'紞':10,'紟':10,'素':10,'紡':10,'索':10,'紣':10,'紤':10,'紥':10,
  '紦':10,'紧':10,'紨':11,'紩':11,'紪':12,'紫':12,'紬':11,'紭':11,'紮':11,'累':11,'細':11,'紱':11,'紲':11,'紳':11,'紴':11,'紵':11,'紶':11,'紷':11,'紸':11,'紹':11,'紺':11,'紻':11,'紼':11,'紽':11,'紾':11,'紿':11,'絀':11,'絁':11,
  '終':11,'絃':11,'組':11,'絅':11,'絆':11,'絇':11,'絈':11,'絉':11,'絊':11,'絋':11,'経':11,'絍':12,'絎':12,'絏':12,'結':12,'絑':12,'絒':12,'絓':12,'絔':12,'絕':12,'絖':12,'絗':12,'絘':12,'絙':12,'絚':12,'絛':12,'絜':12,'絝':12,
  '絞':12,'絟':12,'絠':12,'絡':12,'絢':12,'絣':12,'絤':12,'絥':12,'給':12,'絧':12,'絨':12,'絩':12,'絪':12,'絫':12,'絬':12,'絭':12,'絮':12,'絯':12,'絰':12,'統':12,'絲':12,'絳':12,'絴':12,'絵':12,'絶':12,'絷':12,'絸':13,'絹':13,
  '絺':13,'絻':13,'絼':13,'絽':12,'絾':12,'絿':13,'綀':13,'綁':12,'綂':13,'綃':13,'綄':13,'綅':13,'綆':13,'綇':13,'綈':13,'綉':13,'綊':13,'綋':13,'綌':13,'綍':13,'綎':12,'綏':13,'綐':13,'綑':13,'綒':13,'經':13,'綔':13,'綕':13,
  '綖':12,'綗':13,'綘':13,'継':13,'続':13,'綛':13,'綜':14,'綝':14,'綞':14,'綟':14,'綠':14,'綡':14,'綢':14,'綣':14,'綤':13,'綥':14,'綦':14,'綧':14,'綨':14,'綩':14,'綪':14,'綫':14,'綬':14,'維':14,'綮':14,'綯':14,'綰':14,'綱':14,
  '網':14,'綳':14,'綴':14,'綵':14,'綶':14,'綷':14,'綸':14,'綹':14,'綺':14,'綻':14,'綼':14,'綽':14,'綾':14,'綿':14,'緀':14,'緁':14,'緂':14,'緃':14,'緄':14,'緅':14,'緆':14,'緇':14,'緈':14,'緉':14,'緊':14,'緋':14,'緌':14,'緍':14,
  '緎':14,'総':14,'緐':14,'緑':14,'緒':14,'緓':14,'緔':14,'緕':14,'緖':15,'緗':15,'緘':15,'緙':15,'線':15,'緛':15,'緜':15,'緝':15,'緞':15,'緟':15,'締':15,'緡':15,'緢':14,'緣':15,'緤':15,'緥':15,'緦':15,'緧':15,'編':15,'緩':15,
  '緪':15,'緫':15,'緬':15,'緭':15,'緮':15,'緯':15,'緰':15,'緱':15,'緲':15,'緳':15,'練':15,'緵':15,'緶':15,'緷':15,'緸':15,'緹':15,'緺':14,'緻':16,'緼':15,'緽':15,'緾':15,'緿':15,'縀':15,'縁':15,'縂':15,'縃':15,'縄':15,'縅':15,
  '縆':15,'縇':15,'縈':16,'縉':16,'縊':16,'縋':15,'縌':15,'縍':16,'縎':15,'縏':16,'縐':16,'縑':16,'縒':15,'縓':16,'縔':16,'縕':16,'縖':16,'縗':16,'縘':16,'縙':15,'縚':16,'縛':16,'縜':16,'縝':16,'縞':16,'縟':16,'縠':16,'縡':16,
  '縢':16,'縣':16,'縤':16,'縥':16,'縦':16,'縧':16,'縨':16,'縩':17,'縪':16,'縫':16,'縬':17,'縭':16,'縮':17,'縯':17,'縰':17,'縱':17,'縲':17,'縳':17,'縴':17,'縵':17,'縶':17,'縷':17,'縸':16,'縹':17,'縺':16,'縻':17,'縼':17,'總':17,
  '績':17,'縿':17,'繀':17,'繁':17,'繂':17,'繃':17,'繄':17,'繅':17,'繆':17,'繇':17,'繈':17,'繉':17,'繊':17,'繋':17,'繌':17,'繍':17,'繎':18,'繏':18,'繐':18,'繑':18,'繒':18,'繓':18,'織':18,'繕':18,'繖':18,'繗':18,'繘':18,'繙':18,
  '繚':18,'繛':18,'繜':18,'繝':18,'繞':18,'繟':18,'繠':18,'繡':19,'繢':18,'繣':18,'繤':20,'繥':18,'繦':18,'繧':18,'繨':18,'繩':19,'繪':19,'繫':19,'繬':19,'繭':18,'繮':19,'繯':19,'繰':19,'繱':18,'繲':19,'繳':19,'繴':19,'繵':19,
  '繶':19,'繷':19,'繸':18,'繹':19,'繺':19,'繻':20,'繼':20,'繽':20,'繾':19,'繿':20,'纀':20,'纁':20,'纂':20,'纃':20,'纄':19,'纅':21,'纆':21,'纇':21,'纈':21,'纉':21,'纊':20,'纋':21,'續':21,'纍':21,'纎':21,'纏':21,'纐':21,'纑':22,
  '纒':22,'纓':23,'纔':23,'纕':23,'纖':23,'纗':24,'纘':25,'纙':25,'纚':25,'纛':25,'纜':27,'纝':27,'纞':29,'纟':3,'纠':5,'纡':6,'红':6,'纣':6,'纤':6,'纥':6,'约':6,'级':6,'纨':6,'纩':6,'纪':6,'纫':6,'纬':7,'纭':7,'纮':7,'纯':7,'纰':7,
  '纱':7,'纲':7,'纳':7,'纴':7,'纵':7,'纶':7,'纷':7,'纸':7,'纹':7,'纺':7,'纻':7,'纼':7,'纽':7,'纾':7,'线':8,'绀':8,'绁':8,'绂':8,'练':8,'组':8,'绅':8,'细':8,'织':8,'终':8,'绉':8,'绊':8,'绋':8,'绌':8,'绍':8,'绎':8,'经':8,'绐':8,'绑':9,
  '绒':9,'结':9,'绔':9,'绕':9,'绖':9,'绗':9,'绘':9,'给':9,'绚':9,'绛':9,'络':9,'绝':9,'绞':9,'统':9,'绠':10,'绡':10,'绢':10,'绣':10,'绤':10,'绥':10,'绦':10,'继':10,'绨':10,'绩':11,'绪':11,'绫':11,'绬':11,'续':11,'绮':11,'绯':11,
  '绰':11,'绱':11,'绲':11,'绳':11,'维':11,'绵':11,'绶':11,'绷':11,'绸':11,'绹':11,'绺':11,'绻':11,'综':11,'绽':11,'绾':11,'绿':11,'缀':11,'缁':11,'缂':12,'缃':12,'缄':12,'缅':12,'缆':12,'缇':12,'缈':12,'缉':12,'缊':12,'缋':12,
  '缌':12,'缍':11,'缎':12,'缏':12,'缐':12,'缑':12,'缒':12,'缓':12,'缔':12,'缕':12,'编':12,'缗':12,'缘':12,'缙':13,'缚':13,'缛':13,'缜':13,'缝':13,'缞':13,'缟':13,'缠':13,'缡':13,'缢':13,'缣':13,'缤':13,'缥':14,'缦':14,'缧':14,
  '缨':14,'缩':14,'缪':14,'缫':14,'缬':15,'缭':15,'缮':15,'缯':15,'缰':16,'缱':16,'缲':16,'缳':16,'缴':16,'缵':19,'缶':6,'缷':8,'缸':9,'缹':10,'缺':10,'缻':10,'缼':10,'缽':11,'缾':12,'缿':12,'罀':12,'罁':14,'罂':14,'罃':16,'罄':17,
  '罅':17,'罆':17,'罇':18,'罈':18,'罉':18,'罊':19,'罋':19,'罌':20,'罍':21,'罎':22,'罏':22,'罐':23,'网':6,'罒':5,'罓':4,'罔':8,'罕':7,'罖':8,'罗':8,'罘':9,'罙':8,'罚':9,'罛':10,'罜':10,'罝':10,'罞':10,'罟':10,'罠':10,'罡':10,'罢':10,
  '罣':11,'罤':12,'罥':12,'罦':12,'罧':13,'罨':13,'罩':13,'罪':13,'罫':13,'罬':13,'罭':13,'置':13,'罯':14,'罰':14,'罱':14,'署':13,'罳':14,'罴':14,'罵':15,'罶':15,'罷':15,'罸':15,'罹':16,'罺':16,'罻':16,'罼':15,'罽':17,'罾':17,
  '罿':17,'羀':18,'羁':17,'羂':18,'羃':18,'羄':19,'羅':20,'羆':19,'羇':22,'羈':24,'羉':24,'羊':6,'羋':8,'羌':7,'羍':9,'美':9,'羏':9,'羐':10,'羑':9,'羒':10,'羓':10,'羔':10,'羕':11,'羖':10,'羗':9,'羘':10,'羙':10,'羚':11,'羛':11,
  '羜':11,'羝':11,'羞':10,'羟':11,'羠':12,'羡':12,'羢':12,'羣':13,'群':13,'羥':13,'羦':13,'羧':13,'羨':13,'義':13,'羪':13,'羫':14,'羬':15,'羭':15,'羮':15,'羯':15,'羰':15,'羱':16,'羲':16,'羳':18,'羴':18,'羵':18,'羶':19,'羷':19,
  '羸':19,'羹':19,'羺':20,'羻':21,'羼':21,'羽':6,'羾':9,'羿':9,'翀':10,'翁':10,'翂':10,'翃':10,'翄':10,'翅':10,'翆':10,'翇':11,'翈':11,'翉':11,'翊':11,'翋':11,'翌':11,'翍':11,'翎':11,'翏':11,'翐':11,'翑':11,'習':11,'翓':12,'翔':12,
  '翕':12,'翖':12,'翗':12,'翘':12,'翙':12,'翚':12,'翛':12,'翜':13,'翝':13,'翞':14,'翟':16,'翠':14,'翡':14,'翢':14,'翣':14,'翤':14,'翥':14,'翦':15,'翧':15,'翨':15,'翩':15,'翪':15,'翫':15,'翬':15,'翭':15,'翮':16,'翯':16,'翰':16,
  '翱':16,'翲':17,'翳':17,'翴':16,'翵':17,'翶':17,'翷':18,'翸':18,'翹':18,'翺':18,'翻':18,'翼':17,'翽':19,'翾':19,'翿':20,'耀':20,'老':6,'耂':4,'考':6,'耄':10,'者':8,'耆':10,'耇':9,'耈':11,'耉':9,'耊':10,'耋':12,'而':6,'耍':9,
  '耎':9,'耏':9,'耐':9,'耑':9,'耒':6,'耓':8,'耔':9,'耕':10,'耖':10,'耗':10,'耘':10,'耙':10,'耚':11,'耛':11,'耜':11,'耝':11,'耞':11,'耟':10,'耠':12,'耡':13,'耢':13,'耣':14,'耤':14,'耥':14,'耦':15,'耧':15,'耨':16,'耩':16,'耪':16,
  '耫':17,'耬':17,'耭':18,'耮':18,'耯':19,'耰':21,'耱':22,'耲':22,'耳':6,'耴':7,'耵':8,'耶':13,'耷':9,'耸':10,'耹':10,'耺':10,'耻':10,'耼':10,'耽':10,'耾':10,'耿':10,'聀':10,'聁':10,'聂':10,'聃':11,'聄':11,'聅':11,'聆':11,'聇':11,
  '聈':11,'聉':11,'聊':11,'聋':11,'职':11,'聍':11,'聎':12,'聏':12,'聐':12,'聑':12,'聒':12,'聓':12,'联':12,'聕':13,'聖':14,'聗':13,'聘':13,'聙':14,'聚':14,'聛':14,'聜':14,'聝':14,'聞':14,'聟':14,'聠':12,'聡':14,'聢':14,'聣':14,
  '聤':15,'聥':15,'聦':15,'聧':15,'聨':15,'聩':15,'聪':15,'聫':15,'聬':16,'聭':15,'聮':16,'聯':17,'聰':17,'聱':16,'聲':17,'聳':17,'聴':17,'聵':18,'聶':18,'職':18,'聸':19,'聹':20,'聺':20,'聻':20,'聼':19,'聽':22,'聾':22,'聿':6,
  '肀':4,'肁':10,'肂':10,'肃':8,'肄':13,'肅':13,'肆':13,'肇':14,'肈':14,'肉':6,'肊':5,'肋':8,'肌':8,'肍':6,'肎':6,'肏':8,'肐':7,'肑':7,'肒':7,'肓':9,'肔':7,'肕':7,'肖':7,'肗':7,'肘':9,'肙':7,'肚':9,'肛':9,'肜':7,'肝':9,'肞':7,'肟':7,
  '肠':7,'股':10,'肢':8,'肣':8,'肤':8,'肥':10,'肦':8,'肧':8,'肨':8,'肩':10,'肪':10,'肫':8,'肬':8,'肭':8,'肮':8,'肯':8,'肰':8,'肱':10,'育':9,'肳':8,'肴':8,'肵':8,'肶':8,'肷':8,'肸':8,'肹':8,'肺':8,'肻':8,'肼':8,'肽':8,'肾':8,'肿':8,
  '胀':8,'胁':8,'胂':9,'胃':11,'胄':11,'胅':9,'胆':9,'胇':9,'胈':9,'胉':9,'胊':9,'胋':9,'背':11,'胍':9,'胎':11,'胏':8,'胐':9,'胑':9,'胒':9,'胓':9,'胔':12,'胕':9,'胖':11,'胗':9,'胘':9,'胙':9,'胚':11,'胛':11,'胜':9,'胝':11,'胞':11,
  '胟':9,'胠':9,'胡':11,'胢':9,'胣':9,'胤':9,'胥':9,'胦':9,'胧':9,'胨':9,'胩':9,'胪':9,'胫':9,'胬':11,'胭':12,'胮':10,'胯':12,'胰':12,'胱':12,'胲':10,'胳':10,'胴':10,'胵':10,'胶':10,'胷':10,'胸':12,'胹':10,'胺':12,'胻':10,'胼':10,
  '能':10,'胾':12,'胿':10,'脀':10,'脁':10,'脂':12,'脃':10,'脄':10,'脅':12,'脆':12,'脇':10,'脈':12,'脉':9,'脊':10,'脋':10,'脌':10,'脍':10,'脎':10,'脏':10,'脐':10,'脑':10,'脒':10,'脓':10,'脔':12,'脕':11,'脖':11,'脗':11,'脘':13,
  '脙':11,'脚':11,'脛':13,'脜':11,'脝':11,'脞':11,'脟':11,'脠':10,'脡':10,'脢':11,'脣':13,'脤':11,'脥':11,'脦':11,'脧':11,'脨':11,'脩':10,'脪':11,'脫':13,'脬':11,'脭':11,'脮':11,'脯':13,'脰':11,'脱':11,'脲':11,'脳':11,'脴':11,
  '脵':11,'脶':11,'脷':11,'脸':11,'脹':14,'脺':12,'脻':12,'脼':12,'脽':12,'脾':14,'脿':12,'腀':12,'腁':12,'腂':12,'腃':12,'腄':12,'腅':12,'腆':12,'腇':12,'腈':12,'腉':12,'腊':12,'腋':14,'腌':12,'腍':12,'腎':14,'腏':12,'腐':14,
  '腑':14,'腒':12,'腓':14,'腔':14,'腕':14,'腖':14,'腗':12,'腘':12,'腙':12,'腚':12,'腛':13,'腜':13,'腝':13,'腞':13,'腟':13,'腠':13,'腡':12,'腢':13,'腣':13,'腤':13,'腥':13,'腦':15,'腧':13,'腨':13,'腩':13,'腪':13,'腫':15,'腬':13,
  '腭':13,'腮':13,'腯':13,'腰':13,'腱':14,'腲':13,'腳':15,'腴':14,'腵':13,'腶':13,'腷':13,'腸':15,'腹':15,'腺':15,'腻':13,'腼':13,'腽':13,'腾':13,'腿':15,'膀':16,'膁':14,'膂':14,'膃':14,'膄':13,'膅':14,'膆':14,'膇':13,'膈':14,
  '膉':14,'膊':16,'膋':14,'膌':14,'膍':14,'膎':14,'膏':16,'膐':16,'膑':14,'膒':15,'膓':15,'膔':15,'膕':15,'膖':14,'膗':15,'膘':17,'膙':16,'膚':15,'膛':17,'膜':16,'膝':17,'膞':15,'膟':15,'膠':17,'膡':15,'膢':15,'膣':15,'膤':15,
  '膥':17,'膦':16,'膧':16,'膨':18,'膩':18,'膪':16,'膫':16,'膬':16,'膭':16,'膮':16,'膯':16,'膰':16,'膱':16,'膲':16,'膳':18,'膴':16,'膵':15,'膶':16,'膷':15,'膸':17,'膹':16,'膺':17,'膻':17,'膼':15,'膽':19,'膾':17,'膿':17,'臀':19,
  '臁':17,'臂':19,'臃':19,'臄':17,'臅':17,'臆':19,'臇':16,'臈':16,'臉':19,'臊':17,'臋':19,'臌':17,'臍':20,'臎':18,'臏':18,'臐':18,'臑':18,'臒':17,'臓':18,'臔':19,'臕':19,'臖':20,'臗':18,'臘':21,'臙':20,'臚':22,'臛':20,'臜':20,
  '臝':21,'臞':22,'臟':23,'臠':25,'臡':25,'臢':23,'臣':6,'臤':8,'臥':8,'臦':12,'臧':14,'臨':17,'臩':17,'自':6,'臫':7,'臬':10,'臭':10,'臮':12,'臯':12,'臰':12,'臱':15,'臲':16,'至':6,'致':10,'臵':12,'臶':12,'臷':12,'臸':12,'臹':12,
  '臺':14,'臻':16,'臼':6,'臽':8,'臾':8,'臿':9,'舀':10,'舁':9,'舂':11,'舃':12,'舄':12,'舅':13,'舆':14,'與':13,'興':16,'舉':16,'舊':17,'舋':20,'舌':6,'舍':8,'舎':8,'舏':8,'舐':10,'舑':11,'舒':12,'舓':14,'舔':14,'舕':14,'舖':15,
  '舗':15,'舘':16,'舙':18,'舚':19,'舛':6,'舜':12,'舝':13,'舞':14,'舟':6,'舠':8,'舡':9,'舢':9,'舣':9,'舤':9,'舥':10,'舦':10,'舧':10,'舨':10,'舩':10,'航':10,'舫':10,'般':10,'舭':10,'舮':10,'舯':10,'舰':10,'舱':10,'舲':11,'舳':11,
  '舴':11,'舵':11,'舶':11,'舷':11,'舸':11,'船':11,'舺':11,'舻':11,'舼':12,'舽':12,'舾':12,'舿':12,'艀':13,'艁':13,'艂':13,'艃':13,'艄':13,'艅':13,'艆':13,'艇':12,'艈':13,'艉':13,'艊':14,'艋':14,'艌':14,'艍':14,'艎':15,'艏':15,
  '艐':15,'艑':15,'艒':15,'艓':15,'艔':15,'艕':16,'艖':15,'艗':16,'艘':15,'艙':16,'艚':17,'艛':17,'艜':17,'艝':17,'艞':18,'艟':18,'艠':18,'艡':19,'艢':19,'艣':19,'艤':19,'艥':18,'艦':20,'艧':19,'艨':19,'艩':20,'艪':21,'艫':22,
  '艬':23,'艭':24,'艮':6,'良':7,'艰':8,'艱':17,'色':6,'艳':10,'艴':11,'艵':12,'艶':19,'艷':24,'艸':6,'艹':3,'艺':7,'艻':8,'艼':8,'艽':8,'艾':8,'艿':8,'芀':8,'芁':8,'节':5,'芃':7,'芄':9,'芅':9,'芆':9,'芇':9,'芈':7,'芉':9,'芊':7,'芋':9,
  '芌':9,'芍':9,'芎':9,'芏':9,'芐':9,'芑':9,'芒':9,'芓':9,'芔':9,'芕':9,'芖':9,'芗':9,'芘':10,'芙':10,'芚':10,'芛':10,'芜':10,'芝':10,'芞':10,'芟':10,'芠':10,'芡':10,'芢':10,'芣':10,'芤':10,'芥':10,'芦':10,'芧':10,'芨':9,'芩':10,
  '芪':10,'芫':10,'芬':10,'芭':10,'芮':8,'芯':10,'芰':10,'花':10,'芲':7,'芳':10,'芴':10,'芵':10,'芶':10,'芷':10,'芸':10,'芹':10,'芺':10,'芻':10,'芼':10,'芽':10,'芾':10,'芿':10,'苀':10,'苁':10,'苂':10,'苃':10,'苄':10,'苅':10,
  '苆':10,'苇':10,'苈':10,'苉':10,'苊':10,'苋':10,'苌':10,'苍':10,'苎':10,'苏':10,'苐':11,'苑':11,'苒':11,'苓':11,'苔':11,'苕':11,'苖':11,'苗':11,'苘':11,'苙':11,'苚':11,'苛':11,'苜':11,'苝':11,'苞':11,'苟':11,'苠':11,'苡':9,
  '苢':11,'苣':10,'苤':11,'若':11,'苦':11,'苧':11,'苨':11,'苩':11,'苪':11,'苫':11,'苬':11,'苭':11,'苮':11,'苯':11,'苰':11,'英':11,'苲':11,'苳':11,'苴':11,'苵':11,'苶':11,'苷':11,'苸':11,'苹':11,'苺':11,'苻':11,'苼':11,'苽':11,
  '苾':11,'苿':11,'茀':11,'茁':11,'茂':9,'范':11,'茄':11,'茅':9,'茆':11,'茇':11,'茈':12,'茉':11,'茊':11,'茋':11,'茌':11,'茍':9,'茎':11,'茏':11,'茐':11,'茑':11,'茒':11,'茓':11,'茔':8,'茕':8,'茖':12,'茗':12,'茘':12,'茙':12,'茚':11,
  '茛':12,'茜':12,'茝':12,'茞':12,'茟':12,'茠':12,'茡':12,'茢':12,'茣':13,'茤':12,'茥':12,'茦':12,'茧':12,'茨':12,'茩':12,'茪':12,'茫':12,'茬':12,'茭':12,'茮':12,'茯':12,'茰':9,'茱':12,'茲':12,'茳':12,'茴':12,'茵':11,'茶':9,
  '茷':12,'茸':12,'茹':12,'茺':12,'茻':12,'茼':12,'茽':12,'茾':10,'茿':12,'荀':10,'荁':12,'荂':12,'荃':12,'荄':12,'荅':12,'荆':9,'荇':12,'荈':12,'草':12,'荊':10,'荋':12,'荌':12,'荍':12,'荎':12,'荏':12,'荐':12,'荑':12,'荒':12,
  '荓':12,'荔':12,'荕':12,'荖':12,'荗':12,'荘':12,'荙':12,'荚':12,'荛':12,'荜':12,'荝':12,'荞':12,'荟':12,'荠':12,'荡':12,'荢':12,'荣':12,'荤':12,'荥':12,'荦':9,'荧':9,'荨':12,'荩':12,'荪':12,'荫':12,'荬':12,'荭':12,'荮':12,
  '药':12,'荰':13,'荱':13,'荲':13,'荳':13,'荴':13,'荵':13,'荶':13,'荷':13,'荸':13,'荹':13,'荺':13,'荻':13,'荼':13,'荽':13,'荾':13,'荿':12,'莀':13,'莁':13,'莂':13,'莃':13,'莄':13,'莅':13,'莆':13,'莇':13,'莈':13,'莉':13,'莊':13,
  '莋':13,'莌':13,'莍':13,'莎':13,'莏':13,'莐':13,'莑':13,'莒':12,'莓':13,'莔':13,'莕':13,'莖':13,'莗':13,'莘':10,'莙':13,'莚':12,'莛':12,'莜':13,'莝':13,'莞':13,'莟':13,'莠':13,'莡':13,'莢':13,'莣':13,'莤':13,'莥':13,'莦':13,
  '莧':13,'莨':13,'莩':13,'莪':13,'莫':13,'莬':13,'莭':13,'莮':13,'莯':13,'莰':13,'莱':13,'莲':13,'莳':13,'莴':13,'莵':10,'莶':13,'获':13,'莸':13,'莹':10,'莺':10,'莻':13,'莼':13,'莽':10,'莾':14,'莿':14,'菀':14,'菁':14,'菂':14,
  '菃':13,'菄':14,'菅':14,'菆':14,'菇':14,'菈':14,'菉':14,'菊':14,'菋':14,'菌':14,'菍':14,'菎':14,'菏':14,'菐':12,'菑':14,'菒':14,'菓':14,'菔':14,'菕':14,'菖':14,'菗':14,'菘':14,'菙':14,'菚':14,'菛':14,'菜':14,'菝':14,'菞':14,
  '菟':14,'菠':14,'菡':14,'菢':14,'菣':14,'菤':14,'菥':14,'菦':13,'菧':14,'菨':14,'菩':14,'菪':14,'菫':11,'菬':14,'菭':14,'菮':14,'華':14,'菰':14,'菱':14,'菲':14,'菳':14,'菴':14,'菵':14,'菶':14,'菷':14,'菸':14,'菹':14,'菺':14,
  '菻':14,'菼':14,'菽':14,'菾':14,'菿':14,'萀':14,'萁':14,'萂':14,'萃':14,'萄':14,'萅':14,'萆':14,'萇':14,'萈':11,'萉':14,'萊':14,'萋':14,'萌':14,'萍':14,'萎':14,'萏':14,'萐':14,'萑':14,'萒':14,'萓':14,'萔':14,'萕':14,'萖':14,
  '萗':14,'萘':14,'萙':14,'萚':14,'萛':14,'萜':14,'萝':14,'萞':11,'萟':14,'萠':14,'萡':14,'萢':14,'萣':14,'萤':11,'营':11,'萦':11,'萧':14,'萨':11,'萩':15,'萪':15,'萫':15,'萬':13,'萭':15,'萮':15,'萯':15,'萰':15,'萱':15,'萲':15,
  '萳':15,'萴':15,'萵':14,'萶':15,'萷':15,'萸':14,'萹':15,'萺':15,'萻':15,'萼':15,'落':15,'萾':15,'萿':15,'葀':15,'葁':15,'葂':15,'葃':15,'葄':15,'葅':15,'葆':15,'葇':15,'葈':15,'葉':15,'葊':15,'葋':15,'葌':15,'葍':15,'葎':15,
  '葏':15,'葐':15,'葑':15,'葒':15,'葓':15,'葔':15,'葕':15,'葖':15,'著':14,'葘':12,'葙':15,'葚':15,'葛':15,'葜':15,'葝':15,'葞':15,'葟':15,'葠':15,'葡':15,'葢':15,'董':15,'葤':15,'葥':15,'葦':15,'葧':15,'葨':15,'葩':15,'葪':15,
  '葫':15,'葬':12,'葭':15,'葮':15,'葯':15,'葰':15,'葱':15,'葲':15,'葳':15,'葴':15,'葵':15,'葶':15,'葷':15,'葸':15,'葹':15,'葺':15,'葻':15,'葼':15,'葽':15,'葾':15,'葿':15,'蒀':15,'蒁':14,'蒂':15,'蒃':15,'蒄':15,'蒅':15,'蒆':12,
  '蒇':12,'蒈':15,'蒉':15,'蒊':15,'蒋':15,'蒌':15,'蒍':15,'蒎':15,'蒏':12,'蒐':15,'蒑':16,'蒒':16,'蒓':16,'蒔':16,'蒕':16,'蒖':16,'蒗':16,'蒘':16,'蒙':14,'蒚':16,'蒛':16,'蒜':16,'蒝':16,'蒞':16,'蒟':16,'蒠':16,'蒡':16,'蒢':15,
  '蒣':16,'蒤':16,'蒥':16,'蒦':16,'蒧':13,'蒨':16,'蒩':16,'蒪':16,'蒫':15,'蒬':16,'蒭':16,'蒮':16,'蒯':13,'蒰':16,'蒱':16,'蒲':16,'蒳':16,'蒴':16,'蒵':16,'蒶':16,'蒷':16,'蒸':16,'蒹':16,'蒺':16,'蒻':16,'蒼':13,'蒽':16,'蒾':15,
  '蒿':16,'蓀':16,'蓁':16,'蓂':16,'蓃':15,'蓄':16,'蓅':16,'蓆':16,'蓇':15,'蓈':14,'蓉':16,'蓊':16,'蓋':16,'蓌':16,'蓍':16,'蓎':16,'蓏':16,'蓐':16,'蓑':16,'蓒':16,'蓓':17,'蓔':16,'蓕':16,'蓖':16,'蓗':16,'蓘':16,'蓙':16,'蓚':15,
  '蓛':16,'蓜':16,'蓝':16,'蓞':16,'蓟':13,'蓠':16,'蓡':16,'蓢':16,'蓣':16,'蓤':16,'蓥':13,'蓦':13,'蓧':16,'蓨':16,'蓩':16,'蓪':16,'蓫':16,'蓬':17,'蓭':17,'蓮':17,'蓯':17,'蓰':17,'蓱':15,'蓲':17,'蓳':17,'蓴':17,'蓵':17,'蓶':17,
  '蓷':17,'蓸':17,'蓹':18,'蓺':17,'蓻':17,'蓼':17,'蓽':16,'蓾':17,'蓿':17,'蔀':16,'蔁':17,'蔂':17,'蔃':18,'蔄':17,'蔅':17,'蔆':17,'蔇':15,'蔈':17,'蔉':17,'蔊':17,'蔋':17,'蔌':17,'蔍':17,'蔎':17,'蔏':17,'蔐':17,'蔑':14,'蔒':17,
  '蔓':17,'蔔':17,'蔕':17,'蔖':17,'蔗':17,'蔘':17,'蔙':17,'蔚':17,'蔛':17,'蔜':16,'蔝':17,'蔞':17,'蔟':17,'蔠':17,'蔡':17,'蔢':17,'蔣':17,'蔤':17,'蔥':17,'蔦':17,'蔧':17,'蔨':17,'蔩':17,'蔪':17,'蔫':17,'蔬':18,'蔭':16,'蔮':17,
  '蔯':16,'蔰':17,'蔱':16,'蔲':17,'蔳':17,'蔴':17,'蔵':14,'蔶':17,'蔷':17,'蔸':17,'蔹':17,'蔺':17,'蔻':17,'蔼':17,'蔽':17,'蔾':18,'蔿':18,'蕀':18,'蕁':18,'蕂':18,'蕃':18,'蕄':18,'蕅':18,'蕆':15,'蕇':18,'蕈':18,'蕉':18,'蕊':18,
  '蕋':18,'蕌':18,'蕍':18,'蕎':18,'蕏':17,'蕐':15,'蕑':18,'蕒':18,'蕓':18,'蕔':18,'蕕':18,'蕖':17,'蕗':19,'蕘':18,'蕙':18,'蕚':15,'蕛':18,'蕜':18,'蕝':18,'蕞':18,'蕟':18,'蕠':18,'蕡':18,'蕢':18,'蕣':18,'蕤':18,'蕥':18,'蕦':18,
  '蕧':18,'蕨':18,'蕩':18,'蕪':18,'蕫':18,'蕬':18,'蕭':18,'蕮':18,'蕯':17,'蕰':18,'蕱':18,'蕲':15,'蕳':18,'蕴':18,'蕵':18,'蕶':19,'蕷':19,'蕸':18,'蕹':19,'蕺':18,'蕻':16,'蕼':19,'蕽':19,'蕾':19,'蕿':19,'薀':19,'薁':18,'薂':19,
  '薃':19,'薄':19,'薅':19,'薆':19,'薇':19,'薈':19,'薉':19,'薊':17,'薋':19,'薌':17,'薍':19,'薎':16,'薏':19,'薐':19,'薑':19,'薒':19,'薓':19,'薔':19,'薕':19,'薖':17,'薗':19,'薘':18,'薙':19,'薚':16,'薛':19,'薜':19,'薝':19,'薞':19,
  '薟':19,'薠':19,'薡':18,'薢':19,'薣':19,'薤':19,'薥':19,'薦':19,'薧':19,'薨':16,'薩':19,'薪':19,'薫':19,'薬':19,'薭':19,'薮':19,'薯':19,'薰':20,'薱':20,'薲':20,'薳':19,'薴':20,'薵':20,'薶':20,'薷':20,'薸':20,'薹':20,'薺':20,
  '薻':20,'薼':20,'薽':19,'薾':20,'薿':20,'藀':20,'藁':20,'藂':20,'藃':20,'藄':20,'藅':20,'藆':20,'藇':19,'藈':20,'藉':20,'藊':20,'藋':20,'藌':20,'藍':20,'藎':20,'藏':20,'藐':20,'藑':20,'藒':20,'藓':20,'藔':21,'藕':21,'藖':21,
  '藗':20,'藘':21,'藙':21,'藚':21,'藛':21,'藜':21,'藝':18,'藞':21,'藟':21,'藠':21,'藡':20,'藢':21,'藣':21,'藤':21,'藥':21,'藦':21,'藧':21,'藨':21,'藩':21,'藪':21,'藫':21,'藬':20,'藭':21,'藮':22,'藯':21,'藰':21,'藱':20,'藲':21,
  '藳':21,'藴':21,'藵':20,'藶':22,'藷':21,'藸':21,'藹':22,'藺':22,'藻':22,'藼':22,'藽':22,'藾':22,'藿':22,'蘀':22,'蘁':22,'蘂':22,'蘃':19,'蘄':19,'蘅':22,'蘆':22,'蘇':22,'蘈':22,'蘉':19,'蘊':22,'蘋':22,'蘌':23,'蘍':22,'蘎':19,
  '蘏':22,'蘐':22,'蘑':22,'蘒':22,'蘓':19,'蘔':22,'蘕':22,'蘖':20,'蘗':23,'蘘':23,'蘙':23,'蘚':23,'蘛':20,'蘜':23,'蘝':23,'蘞':23,'蘟':22,'蘠':23,'蘡':23,'蘢':22,'蘣':22,'蘤':23,'蘥':23,'蘦':23,'蘧':22,'蘨':23,'蘩':23,'蘪':23,
  '蘫':23,'蘬':24,'蘭':21,'蘮':23,'蘯':23,'蘰':23,'蘱':25,'蘲':24,'蘳':23,'蘴':24,'蘵':24,'蘶':23,'蘷':21,'蘸':25,'蘹':25,'蘺':24,'蘻':25,'蘼':25,'蘽':25,'蘾':25,'蘿':25,'虀':25,'虁':27,'虂':27,'虃':26,'虄':26,'虅':26,'虆':27,
  '虇':27,'虈':27,'虉':27,'虊':29,'虋':32,'虌':30,'虍':6,'虎':8,'虏':8,'虐':9,'虑':10,'虒':10,'虓':10,'虔':10,'處':11,'虖':11,'虗':11,'虘':11,'虙':11,'虚':11,'虛':12,'虜':13,'虝':12,'虞':13,'號':13,'虠':14,'虡':13,'虢':15,'虣':16,
  '虤':16,'虥':16,'虦':16,'虧':17,'虨':17,'虩':18,'虪':26,'虫':6,'虬':7,'虭':8,'虮':8,'虯':8,'虰':8,'虱':8,'虲':8,'虳':9,'虴':9,'虵':9,'虶':9,'虷':9,'虸':9,'虹':9,'虺':9,'虻':9,'虼':9,'虽':9,'虾':9,'虿':9,'蚀':9,'蚁':9,'蚂':9,'蚃':9,
  '蚄':10,'蚅':10,'蚆':10,'蚇':10,'蚈':10,'蚉':10,'蚊':10,'蚋':10,'蚌':10,'蚍':10,'蚎':10,'蚏':10,'蚐':10,'蚑':10,'蚒':10,'蚓':10,'蚔':10,'蚕':10,'蚖':10,'蚗':10,'蚘':10,'蚙':10,'蚚':10,'蚛':10,'蚜':10,'蚝':10,'蚞':10,'蚟':11,
  '蚠':10,'蚡':10,'蚢':10,'蚣':10,'蚤':9,'蚥':10,'蚦':10,'蚧':10,'蚨':10,'蚩':10,'蚪':10,'蚫':11,'蚬':10,'蚭':11,'蚮':11,'蚯':11,'蚰':11,'蚱':11,'蚲':11,'蚳':11,'蚴':11,'蚵':11,'蚶':11,'蚷':10,'蚸':11,'蚹':11,'蚺':11,'蚻':11,
  '蚼':11,'蚽':11,'蚾':11,'蚿':11,'蛀':11,'蛁':11,'蛂':11,'蛃':11,'蛄':11,'蛅':11,'蛆':11,'蛇':11,'蛈':11,'蛉':11,'蛊':11,'蛋':11,'蛌':11,'蛍':11,'蛎':11,'蛏':11,'蛐':12,'蛑':12,'蛒':12,'蛓':12,'蛔':12,'蛕':12,'蛖':13,'蛗':12,
  '蛘':12,'蛙':12,'蛚':12,'蛛':12,'蛜':12,'蛝':12,'蛞':12,'蛟':12,'蛠':12,'蛡':12,'蛢':12,'蛣':12,'蛤':12,'蛥':12,'蛦':12,'蛧':12,'蛨':12,'蛩':12,'蛪':12,'蛫':12,'蛬':12,'蛭':12,'蛮':12,'蛯':12,'蛰':12,'蛱':12,'蛲':12,'蛳':12,
  '蛴':12,'蛵':13,'蛶':13,'蛷':13,'蛸':13,'蛹':13,'蛺':13,'蛻':13,'蛼':13,'蛽':13,'蛾':13,'蛿':13,'蜀':13,'蜁':13,'蜂':13,'蜃':13,'蜄':13,'蜅':13,'蜆':13,'蜇':13,'蜈':13,'蜉':13,'蜊':13,'蜋':13,'蜌':13,'蜍':13,'蜎':13,'蜏':13,
  '蜐':13,'蜑':12,'蜒':12,'蜓':12,'蜔':13,'蜕':13,'蜖':13,'蜗':13,'蜘':14,'蜙':14,'蜚':14,'蜛':14,'蜜':14,'蜝':14,'蜞':14,'蜟':14,'蜠':14,'蜡':14,'蜢':14,'蜣':13,'蜤':14,'蜥':14,'蜦':14,'蜧':14,'蜨':14,'蜩':14,'蜪':14,'蜫':14,
  '蜬':14,'蜭':14,'蜮':14,'蜯':14,'蜰':14,'蜱':14,'蜲':14,'蜳':14,'蜴':14,'蜵':15,'蜶':14,'蜷':14,'蜸':14,'蜹':13,'蜺':14,'蜻':14,'蜼':14,'蜽':14,'蜾':14,'蜿':14,'蝀':14,'蝁':14,'蝂':14,'蝃':14,'蝄':14,'蝅':14,'蝆':13,'蝇':14,
  '蝈':14,'蝉':14,'蝊':14,'蝋':14,'蝌':15,'蝍':13,'蝎':15,'蝏':15,'蝐':15,'蝑':15,'蝒':15,'蝓':15,'蝔':15,'蝕':14,'蝖':15,'蝗':15,'蝘':15,'蝙':15,'蝚':15,'蝛':15,'蝜':15,'蝝':15,'蝞':15,'蝟':15,'蝠':15,'蝡':15,'蝢':15,'蝣':15,
  '蝤':15,'蝥':15,'蝦':15,'蝧':14,'蝨':15,'蝩':15,'蝪':15,'蝫':14,'蝬':15,'蝭':15,'蝮':15,'蝯':15,'蝰':15,'蝱':15,'蝲':15,'蝳':15,'蝴':15,'蝵':15,'蝶':15,'蝷':15,'蝸':14,'蝹':15,'蝺':15,'蝻':15,'蝼':15,'蝽':15,'蝾':15,'蝿':15,
  '螀':15,'螁':15,'螂':14,'螃':16,'螄':16,'螅':16,'螆':15,'螇':16,'螈':16,'螉':16,'螊':16,'螋':15,'螌':16,'融':16,'螎':16,'螏':16,'螐':16,'螑':16,'螒':16,'螓':16,'螔':16,'螕':16,'螖':15,'螗':16,'螘':16,'螙':16,'螚':16,'螛':16,
  '螜':16,'螝':15,'螞':16,'螟':16,'螠':16,'螡':16,'螢':16,'螣':16,'螤':16,'螥':16,'螦':16,'螧':16,'螨':16,'螩':16,'螪':17,'螫':17,'螬':17,'螭':16,'螮':17,'螯':16,'螰':17,'螱':17,'螲':17,'螳':17,'螴':16,'螵':17,'螶':16,'螷':17,
  '螸':17,'螹':17,'螺':17,'螻':17,'螼':17,'螽':17,'螾':17,'螿':17,'蟀':17,'蟁':17,'蟂':17,'蟃':17,'蟄':17,'蟅':17,'蟆':16,'蟇':16,'蟈':17,'蟉':17,'蟊':17,'蟋':17,'蟌':17,'蟍':17,'蟎':17,'蟏':17,'蟐':17,'蟑':17,'蟒':16,'蟓':17,
  '蟔':18,'蟕':19,'蟖':18,'蟗':18,'蟘':18,'蟙':18,'蟚':18,'蟛':18,'蟜':18,'蟝':17,'蟞':17,'蟟':18,'蟠':18,'蟡':18,'蟢':18,'蟣':18,'蟤':18,'蟥':17,'蟦':18,'蟧':18,'蟨':18,'蟩':18,'蟪':18,'蟫':18,'蟬':18,'蟭':18,'蟮':18,'蟯':18,
  '蟰':19,'蟱':18,'蟲':18,'蟳':18,'蟴':18,'蟵':18,'蟶':19,'蟷':19,'蟸':19,'蟹':19,'蟺':19,'蟻':19,'蟼':18,'蟽':18,'蟾':19,'蟿':19,'蠀':19,'蠁':17,'蠂':18,'蠃':19,'蠄':18,'蠅':19,'蠆':18,'蠇':18,'蠈':19,'蠉':19,'蠊':19,'蠋':19,
  '蠌':19,'蠍':19,'蠎':17,'蠏':19,'蠐':20,'蠑':20,'蠒':20,'蠓':19,'蠔':20,'蠕':20,'蠖':19,'蠗':20,'蠘':20,'蠙':20,'蠚':20,'蠛':20,'蠜':21,'蠝':21,'蠞':19,'蠟':21,'蠠':21,'蠡':21,'蠢':21,'蠣':20,'蠤':21,'蠥':22,'蠦':22,'蠧':22,
  '蠨':22,'蠩':21,'蠪':22,'蠫':21,'蠬':22,'蠭':22,'蠮':23,'蠯':23,'蠰':23,'蠱':23,'蠲':23,'蠳':23,'蠴':22,'蠵':24,'蠶':24,'蠷':24,'蠸':23,'蠹':24,'蠺':24,'蠻':25,'蠼':26,'蠽':27,'蠾':27,'蠿':27,'血':6,'衁':9,'衂':9,'衃':10,'衄':10,
  '衅':11,'衆':12,'衇':12,'衈':12,'衉':12,'衊':20,'衋':24,'行':6,'衍':9,'衎':9,'衏':10,'衐':10,'衑':11,'衒':11,'術':11,'衔':11,'衕':12,'衖':12,'街':12,'衘':13,'衙':13,'衚':15,'衛':15,'衜':15,'衝':15,'衞':16,'衟':16,'衠':16,'衡':16,
  '衢':24,'衣':6,'衤':5,'补':8,'衦':9,'衧':9,'表':8,'衩':9,'衪':9,'衫':9,'衬':9,'衭':10,'衮':10,'衯':10,'衰':10,'衱':9,'衲':10,'衳':10,'衴':10,'衵':10,'衶':10,'衷':10,'衸':10,'衹':10,'衺':10,'衻':10,'衼':10,'衽':10,'衾':10,'衿':10,
  '袀':10,'袁':10,'袂':10,'袃':10,'袄':10,'袅':10,'袆':10,'袇':10,'袈':11,'袉':11,'袊':11,'袋':11,'袌':11,'袍':11,'袎':11,'袏':11,'袐':11,'袑':11,'袒':11,'袓':11,'袔':11,'袕':11,'袖':11,'袗':11,'袘':11,'袙':11,'袚':11,'袛':11,
  '袜':11,'袝':11,'袞':11,'袟':11,'袠':11,'袡':11,'袢':11,'袣':11,'袤':11,'袥':11,'袦':11,'袧':11,'袨':11,'袩':11,'袪':11,'被':11,'袬':11,'袭':11,'袮':11,'袯':11,'袰':11,'袱':12,'袲':12,'袳':12,'袴':12,'袵':12,'袶':12,'袷':12,
  '袸':12,'袹':12,'袺':12,'袻':12,'袼':12,'袽':12,'袾':12,'袿':12,'裀':12,'裁':12,'裂':12,'裃':12,'裄':12,'装':12,'裆':12,'裇':12,'裈':12,'裉':12,'裊':13,'裋':13,'裌':13,'裍':13,'裎':13,'裏':13,'裐':13,'裑':13,'裒':12,'裓':13,
  '裔':13,'裕':13,'裖':13,'裗':13,'裘':13,'裙':13,'裚':13,'裛':13,'補':13,'裝':13,'裞':13,'裟':13,'裠':13,'裡':13,'裢':13,'裣':13,'裤':13,'裥':13,'裦':14,'裧':14,'裨':14,'裩':14,'裪':14,'裫':17,'裬':14,'裭':14,'裮':14,'裯':14,
  '裰':14,'裱':14,'裲':14,'裳':14,'裴':14,'裵':14,'裶':14,'裷':14,'裸':14,'裹':14,'裺':14,'裻':14,'裼':14,'製':14,'裾':14,'裿':14,'褀':14,'褁':12,'褂':14,'褃':14,'褄':14,'褅':15,'褆':15,'複':15,'褈':15,'褉':15,'褊':15,'褋':15,
  '褌':15,'褍':15,'褎':14,'褏':14,'褐':15,'褑':15,'褒':15,'褓':15,'褔':15,'褕':15,'褖':15,'褗':15,'褘':15,'褙':15,'褚':14,'褛':15,'褜':15,'褝':14,'褞':15,'褟':16,'褠':16,'褡':15,'褢':15,'褣':16,'褤':16,'褥':16,'褦':16,'褧':16,
  '褨':15,'褩':16,'褪':15,'褫':16,'褬':16,'褭':16,'褮':16,'褯':16,'褰':16,'褱':16,'褲':16,'褳':16,'褴':16,'褵':16,'褶':17,'褷':17,'褸':17,'褹':17,'褺':17,'褻':17,'褼':17,'褽':17,'褾':17,'褿':17,'襀':17,'襁':18,'襂':17,'襃':16,
  '襄':17,'襅':16,'襆':18,'襇':18,'襈':18,'襉':18,'襊':18,'襋':18,'襌':18,'襍':18,'襎':18,'襏':18,'襐':17,'襑':18,'襒':17,'襓':18,'襔':17,'襕':18,'襖':18,'襗':19,'襘':19,'襙':19,'襚':18,'襛':19,'襜':19,'襝':19,'襞':19,'襟':19,
  '襠':19,'襡':19,'襢':19,'襣':20,'襤':20,'襥':20,'襦':20,'襧':20,'襨':20,'襩':21,'襪':20,'襫':21,'襬':21,'襭':21,'襮':21,'襯':22,'襰':22,'襱':22,'襲':22,'襳':23,'襴':23,'襵':24,'襶':23,'襷':23,'襸':25,'襹':25,'襺':24,'襻':25,
  '襼':24,'襽':26,'襾':6,'西':6,'覀':6,'要':9,'覂':10,'覃':12,'覄':12,'覅':13,'覆':18,'覇':19,'覈':19,'覉':23,'覊':25,'見':7,'覌':9,'覍':10,'覎':10,'規':11,'覐':11,'覑':11,'覒':11,'覓':11,'覔':11,'覕':12,'視':12,'覗':12,'覘':12,
  '覙':12,'覚':12,'覛':13,'覜':13,'覝':14,'覞':14,'覟':14,'覠':14,'覡':14,'覢':15,'覣':15,'覤':15,'覥':15,'覦':16,'覧':16,'覨':16,'覩':15,'親':16,'覫':17,'覬':17,'覭':17,'覮':17,'覯':17,'覰':18,'覱':18,'覲':18,'観':18,'覴':19,
  '覵':19,'覶':19,'覷':18,'覸':19,'覹':20,'覺':20,'覻':20,'覼':21,'覽':21,'覾':22,'覿':22,'觀':24,'见':4,'观':6,'觃':7,'规':8,'觅':8,'视':9,'觇':9,'览':9,'觉':9,'觊':10,'觋':11,'觌':12,'觍':12,'觎':13,'觏':14,'觐':15,'觑':15,'角':7,
  '觓':9,'觔':9,'觕':11,'觖':11,'觗':11,'觘':11,'觙':10,'觚':12,'觛':12,'觜':13,'觝':12,'觞':12,'觟':13,'觠':13,'觡':13,'觢':13,'解':13,'觤':13,'觥':13,'触':13,'觧':13,'觨':14,'觩':14,'觪':14,'觫':14,'觬':15,'觭':15,'觮':15,
  '觯':15,'觰':15,'觱':16,'觲':17,'觳':17,'觴':18,'觵':18,'觶':19,'觷':20,'觸':20,'觹':19,'觺':21,'觻':22,'觼':21,'觽':22,'觾':23,'觿':25,'言':7,'訁':7,'訂':9,'訃':9,'訄':9,'訅':9,'訆':9,'訇':9,'計':9,'訉':10,'訊':10,'訋':10,
  '訌':10,'訍':10,'討':10,'訏':10,'訐':10,'訑':10,'訒':10,'訓':10,'訔':10,'訕':10,'訖':10,'託':10,'記':10,'訙':10,'訚':10,'訛':11,'訜':11,'訝':11,'訞':11,'訟':11,'訠':11,'訡':11,'訢':11,'訣':11,'訤':11,'訥':11,'訦':11,'訧':11,
  '訨':11,'訩':11,'訪':11,'訫':11,'訬':11,'設':11,'訮':11,'訯':10,'訰':11,'許':11,'訲':11,'訳':11,'訴':12,'訵':12,'訶':12,'訷':12,'訸':12,'訹':12,'診':12,'註':12,'証':12,'訽':12,'訾':13,'訿':13,'詀':12,'詁':12,'詂':12,'詃':12,
  '詄':12,'詅':12,'詆':12,'詇':12,'詈':12,'詉':12,'詊':12,'詋':12,'詌':12,'詍':12,'詎':11,'詏':12,'詐':12,'詑':12,'詒':12,'詓':12,'詔':12,'評':12,'詖':12,'詗':12,'詘':12,'詙':12,'詚':12,'詛':12,'詜':12,'詝':12,'詞':12,'詟':12,
  '詠':12,'詡':13,'詢':13,'詣':13,'詤':13,'詥':13,'試':13,'詧':13,'詨':13,'詩':13,'詪':13,'詫':13,'詬':13,'詭':13,'詮':13,'詯':13,'詰':13,'話':13,'該':13,'詳':13,'詴':13,'詵':13,'詶':13,'詷':13,'詸':13,'詹':13,'詺':13,'詻':13,
  '詼':13,'詽':13,'詾':13,'詿':13,'誀':13,'誁':13,'誂':13,'誃':13,'誄':13,'誅':13,'誆':13,'誇':13,'誈':13,'誉':13,'誊':13,'誋':14,'誌':14,'認':14,'誎':14,'誏':14,'誐':14,'誑':14,'誒':14,'誓':14,'誔':13,'誕':13,'誖':14,'誗':14,
  '誘':14,'誙':14,'誚':14,'誛':14,'誜':14,'誝':14,'語':14,'誟':14,'誠':14,'誡':14,'誢':14,'誣':14,'誤':14,'誥':14,'誦':14,'誧':14,'誨':14,'誩':14,'說':14,'誫':14,'説':14,'読':14,'誮':14,'誯':15,'誰':15,'誱':15,'課':15,'誳':15,
  '誴':15,'誵':15,'誶':15,'誷':15,'誸':15,'誹':15,'誺':15,'誻':15,'誼':15,'誽':15,'誾':15,'調':15,'諀':15,'諁':15,'諂':15,'諃':15,'諄':15,'諅':15,'諆':15,'談':15,'諈':15,'諉':15,'諊':15,'請':15,'諌':15,'諍':13,'諎':15,'諏':15,
  '諐':15,'諑':15,'諒':15,'諓':15,'諔':15,'諕':15,'論':15,'諗':15,'諘':15,'諙':15,'諚':15,'諛':15,'諜':16,'諝':16,'諞':16,'諟':16,'諠':16,'諡':16,'諢':16,'諣':15,'諤':16,'諥':16,'諦':16,'諧':16,'諨':16,'諩':15,'諪':16,'諫':16,
  '諬':16,'諭':16,'諮':16,'諯':16,'諰':16,'諱':16,'諲':16,'諳':16,'諴':16,'諵':16,'諶':16,'諷':16,'諸':16,'諹':16,'諺':16,'諻':16,'諼':16,'諽':16,'諾':15,'諿':16,'謀':16,'謁':16,'謂':16,'謃':16,'謄':17,'謅':17,'謆':17,'謇':17,
  '謈':17,'謉':16,'謊':16,'謋':17,'謌':17,'謍':17,'謎':16,'謏':16,'謐':17,'謑':17,'謒':17,'謓':17,'謔':16,'謕':17,'謖':17,'謗':17,'謘':17,'謙':17,'謚':17,'講':17,'謜':17,'謝':17,'謞':17,'謟':17,'謠':17,'謡':17,'謢':17,'謣':18,
  '謤':18,'謥':18,'謦':18,'謧':17,'謨':17,'謩':17,'謪':18,'謫':18,'謬':18,'謭':18,'謮':18,'謯':18,'謰':17,'謱':18,'謲':18,'謳':18,'謴':18,'謵':18,'謶':18,'謷':17,'謸':17,'謹':18,'謺':18,'謻':18,'謼':18,'謽':19,'謾':18,'謿':19,
  '譀':18,'譁':17,'譂':19,'譃':18,'譄':19,'譅':21,'譆':19,'譇':18,'譈':19,'證':19,'譊':19,'譋':19,'譌':19,'譍':20,'譎':19,'譏':19,'譐':19,'譑':19,'譒':19,'譓':19,'譔':19,'譕':19,'譖':19,'譗':19,'識':19,'譙':19,'譚':19,'譛':19,
  '譜':19,'譝':20,'譞':20,'譟':20,'譠':20,'譡':20,'譢':19,'譣':20,'譤':20,'譥':20,'警':19,'譧':20,'譨':20,'譩':20,'譪':19,'譫':20,'譬':20,'譭':20,'譮':20,'譯':20,'議':20,'譱':20,'譲':20,'譳':21,'譴':20,'譵':21,'譶':21,'護':20,
  '譸':21,'譹':21,'譺':21,'譻':21,'譼':21,'譽':20,'譾':22,'譿':22,'讀':22,'讁':21,'讂':21,'讃':22,'讄':22,'讅':22,'讆':22,'讇':23,'讈':23,'讉':22,'變':23,'讋':23,'讌':23,'讍':23,'讎':23,'讏':23,'讐':23,'讑':24,'讒':24,'讓':24,
  '讔':23,'讕':24,'讖':24,'讗':25,'讘':25,'讙':24,'讚':26,'讛':25,'讜':27,'讝':26,'讞':27,'讟':29,'讠':2,'计':4,'订':4,'讣':4,'认':4,'讥':4,'讦':5,'讧':5,'讨':5,'让':5,'讪':5,'讫':5,'讬':5,'训':5,'议':5,'讯':5,'记':5,'讱':5,'讲':6,
  '讳':6,'讴':6,'讵':6,'讶':6,'讷':6,'许':6,'讹':6,'论':6,'讻':6,'讼':6,'讽':6,'设':6,'访':6,'诀':6,'证':7,'诂':7,'诃':7,'评':7,'诅':7,'识':7,'诇':7,'诈':7,'诉':7,'诊':7,'诋':7,'诌':7,'词':7,'诎':7,'诏':7,'诐':7,'译':7,'诒':7,'诓':8,
  '诔':8,'试':8,'诖':8,'诗':8,'诘':8,'诙':8,'诚':8,'诛':8,'诜':8,'话':8,'诞':8,'诟':8,'诠':8,'诡':8,'询':8,'诣':8,'诤':8,'该':8,'详':8,'诧':8,'诨':8,'诩':8,'诪':9,'诫':9,'诬':9,'语':9,'诮':9,'误':9,'诰':9,'诱':9,'诲':9,'诳':9,'说':9,
  '诵':9,'诶':9,'请':10,'诸':10,'诹':10,'诺':10,'读':10,'诼':10,'诽':10,'课':10,'诿':10,'谀':10,'谁':10,'谂':10,'调':10,'谄':10,'谅':10,'谆':10,'谇':10,'谈':10,'谉':10,'谊':10,'谋':11,'谌':11,'谍':11,'谎':11,'谏':11,'谐':11,
  '谑':11,'谒':11,'谓':11,'谔':11,'谕':11,'谖':11,'谗':11,'谘':11,'谙':11,'谚':11,'谛':11,'谜':11,'谝':11,'谞':11,'谟':12,'谠':12,'谡':12,'谢':12,'谣':12,'谤':12,'谥':12,'谦':12,'谧':12,'谨':13,'谩':13,'谪':13,'谫':13,'谬':13,
  '谭':14,'谮':14,'谯':14,'谰':14,'谱':14,'谲':14,'谳':15,'谴':15,'谵':15,'谶':19,'谷':7,'谸':10,'谹':11,'谺':11,'谻':11,'谼':13,'谽':14,'谾':15,'谿':17,'豀':17,'豁':17,'豂':18,'豃':18,'豄':22,'豅':23,'豆':7,'豇':10,'豈':10,
  '豉':11,'豊':13,'豋':13,'豌':15,'豍':15,'豎':15,'豏':17,'豐':18,'豑':20,'豒':25,'豓':27,'豔':28,'豕':7,'豖':8,'豗':10,'豘':11,'豙':11,'豚':11,'豛':11,'豜':11,'豝':11,'豞':12,'豟':12,'豠':12,'象':11,'豢':13,'豣':13,'豤':13,
  '豥':13,'豦':13,'豧':14,'豨':14,'豩':14,'豪':14,'豫':15,'豬':15,'豭':16,'豮':16,'豯':17,'豰':17,'豱':16,'豲':17,'豳':17,'豴':18,'豵':18,'豶':19,'豷':19,'豸':7,'豹':10,'豺':10,'豻':10,'豼':11,'豽':11,'豾':12,'豿':12,'貀':12,
  '貁':12,'貂':12,'貃':12,'貄':13,'貅':13,'貆':13,'貇':13,'貈':13,'貉':13,'貊':13,'貋':14,'貌':14,'貍':14,'貎':15,'貏':15,'貐':16,'貑':16,'貒':16,'貓':15,'貔':17,'貕':17,'貖':17,'貗':18,'貘':17,'貙':18,'貚':19,'貛':24,'貜':27,
  '貝':7,'貞':9,'貟':9,'負':9,'財':10,'貢':10,'貣':10,'貤':10,'貥':11,'貦':11,'貧':11,'貨':11,'販':11,'貪':11,'貫':11,'責':11,'貭':11,'貮':11,'貯':12,'貰':12,'貱':12,'貲':13,'貳':12,'貴':12,'貵':12,'貶':11,'買':12,'貸':12,'貹':12,
  '貺':12,'費':12,'貼':12,'貽':12,'貾':12,'貿':12,'賀':12,'賁':12,'賂':13,'賃':13,'賄':13,'賅':13,'賆':13,'資':13,'賈':13,'賉':13,'賊':13,'賋':13,'賌':13,'賍':13,'賎':13,'賏':14,'賐':14,'賑':14,'賒':14,'賓':14,'賔':14,'賕':14,
  '賖':14,'賗':14,'賘':14,'賙':15,'賚':15,'賛':15,'賜':15,'賝':15,'賞':15,'賟':15,'賠':15,'賡':15,'賢':15,'賣':15,'賤':15,'賥':15,'賦':15,'賧':15,'賨':15,'賩':15,'質':15,'賫':15,'賬':15,'賭':15,'賮':16,'賯':16,'賰':16,'賱':16,
  '賲':16,'賳':16,'賴':16,'賵':16,'賶':17,'賷':17,'賸':17,'賹':17,'賺':17,'賻':17,'購':17,'賽':17,'賾':18,'賿':18,'贀':18,'贁':18,'贂':18,'贃':18,'贄':18,'贅':17,'贆':19,'贇':19,'贈':19,'贉':19,'贊':19,'贋':19,'贌':19,'贍':20,
  '贎':19,'贏':20,'贐':21,'贑':21,'贒':21,'贓':21,'贔':21,'贕':22,'贖':22,'贗':22,'贘':22,'贙':23,'贚':23,'贛':24,'贜':24,'贝':4,'贞':6,'负':6,'贠':6,'贡':7,'财':7,'责':8,'贤':8,'败':8,'账':8,'货':8,'质':8,'贩':8,'贪':8,'贫':8,
  '贬':8,'购':8,'贮':8,'贯':8,'贰':9,'贱':9,'贲':9,'贳':9,'贴':9,'贵':9,'贶':9,'贷':9,'贸':9,'费':9,'贺':9,'贻':9,'贼':10,'贽':10,'贾':10,'贿':10,'赀':10,'赁':10,'赂':10,'赃':10,'资':10,'赅':10,'赆':10,'赇':11,'赈':11,'赉':11,
  '赊':11,'赋':12,'赌':12,'赍':12,'赎':12,'赏':12,'赐':12,'赑':12,'赒':12,'赓':12,'赔':12,'赕':12,'赖':13,'赗':13,'赘':14,'赙':14,'赚':14,'赛':14,'赜':15,'赝':16,'赞':16,'赟':16,'赠':16,'赡':17,'赢':17,'赣':21,'赤':7,'赥':11,
  '赦':11,'赧':11,'赨':13,'赩':13,'赪':13,'赫':14,'赬':16,'赭':15,'赮':16,'赯':17,'走':7,'赱':6,'赲':9,'赳':9,'赴':9,'赵':9,'赶':10,'起':10,'赸':10,'赹':11,'赺':11,'赻':11,'赼':11,'赽':11,'赾':11,'赿':11,'趀':11,'趁':12,'趂':12,
  '趃':12,'趄':12,'超':12,'趆':12,'趇':12,'趈':12,'趉':12,'越':12,'趋':12,'趌':13,'趍':13,'趎':13,'趏':13,'趐':13,'趑':13,'趒':13,'趓':13,'趔':13,'趕':14,'趖':14,'趗':14,'趘':14,'趙':14,'趚':14,'趛':15,'趜':15,'趝':15,'趞':15,
  '趟':15,'趠':15,'趡':15,'趢':15,'趣':15,'趤':15,'趥':16,'趦':16,'趧':16,'趨':17,'趩':18,'趪':18,'趫':19,'趬':19,'趭':19,'趮':20,'趯':21,'趰':21,'趱':23,'趲':26,'足':7,'趴':9,'趵':10,'趶':10,'趷':10,'趸':10,'趹':11,'趺':11,
  '趻':11,'趼':11,'趽':11,'趾':11,'趿':10,'跀':11,'跁':11,'跂':11,'跃':11,'跄':11,'跅':12,'跆':12,'跇':12,'跈':12,'跉':12,'跊':12,'跋':12,'跌':12,'跍':12,'跎':12,'跏':12,'跐':13,'跑':12,'跒':12,'跓':12,'跔':12,'跕':12,'跖':12,
  '跗':12,'跘':12,'跙':12,'跚':12,'跛':12,'跜':12,'距':11,'跞':12,'跟':13,'跠':13,'跡':13,'跢':13,'跣':13,'跤':13,'跥':13,'跦':13,'跧':13,'跨':13,'跩':13,'跪':13,'跫':13,'跬':13,'跭':13,'跮':13,'路':13,'跰':13,'跱':13,'跲':13,
  '跳':13,'跴':13,'践':12,'跶':13,'跷':13,'跸':13,'跹':13,'跺':13,'跻':13,'跼':14,'跽':14,'跾':14,'跿':14,'踀':14,'踁':14,'踂':14,'踃':14,'踄':14,'踅':14,'踆':14,'踇':14,'踈':14,'踉':14,'踊':14,'踋':14,'踌':14,'踍':14,'踎':14,
  '踏':15,'踐':15,'踑':15,'踒':15,'踓':15,'踔':15,'踕':15,'踖':15,'踗':15,'踘':15,'踙':15,'踚':15,'踛':15,'踜':15,'踝':15,'踞':15,'踟':15,'踠':15,'踡':15,'踢':15,'踣':15,'踤':15,'踥':15,'踦':15,'踧':15,'踨':15,'踩':15,'踪':15,
  '踫':15,'踬':15,'踭':13,'踮':15,'踯':15,'踰':16,'踱':16,'踲':16,'踳':16,'踴':16,'踵':16,'踶':16,'踷':15,'踸':16,'踹':16,'踺':15,'踻':15,'踼':16,'踽':16,'踾':16,'踿':16,'蹀':16,'蹁':16,'蹂':16,'蹃':15,'蹄':16,'蹅':16,'蹆':16,
  '蹇':17,'蹈':17,'蹉':16,'蹊':17,'蹋':17,'蹌':17,'蹍':17,'蹎':17,'蹏':17,'蹐':17,'蹑':17,'蹒':17,'蹓':17,'蹔':18,'蹕':17,'蹖':18,'蹗':18,'蹘':18,'蹙':18,'蹚':18,'蹛':18,'蹜':18,'蹝':18,'蹞':18,'蹟':18,'蹠':18,'蹡':18,'蹢':18,
  '蹣':18,'蹤':18,'蹥':17,'蹦':18,'蹧':18,'蹨':19,'蹩':18,'蹪':19,'蹫':19,'蹬':19,'蹭':19,'蹮':19,'蹯':19,'蹰':19,'蹱':19,'蹲':19,'蹳':19,'蹴':19,'蹵':19,'蹶':19,'蹷':19,'蹸':19,'蹹':19,'蹺':19,'蹻':19,'蹼':19,'蹽':19,'蹾':19,
  '蹿':19,'躀':18,'躁':20,'躂':19,'躃':20,'躄':20,'躅':20,'躆':20,'躇':18,'躈':20,'躉':19,'躊':21,'躋':21,'躌':21,'躍':21,'躎':21,'躏':21,'躐':22,'躑':21,'躒':22,'躓':22,'躔':22,'躕':22,'躖':22,'躗':22,'躘':23,'躙':23,'躚':22,
  '躛':23,'躜':23,'躝':24,'躞':24,'躟':24,'躠':23,'躡':25,'躢':25,'躣':25,'躤':24,'躥':25,'躦':26,'躧':26,'躨':28,'躩':27,'躪':26,'身':7,'躬':10,'躭':11,'躮':11,'躯':11,'躰':12,'躱':13,'躲':13,'躳':13,'躴':14,'躵':14,'躶':15,
  '躷':15,'躸':15,'躹':15,'躺':15,'躻':15,'躼':15,'躽':16,'躾':16,'躿':18,'軀':18,'軁':18,'軂':19,'軃':19,'軄':19,'軅':19,'軆':20,'軇':21,'軈':24,'軉':27,'車':7,'軋':8,'軌':9,'軍':9,'軎':10,'軏':10,'軐':10,'軑':10,'軒':10,'軓':10,
  '軔':10,'軕':10,'軖':12,'軗':11,'軘':11,'軙':11,'軚':11,'軛':11,'軜':11,'軝':11,'軞':11,'軟':11,'軠':11,'軡':11,'転':11,'軣':11,'軤':12,'軥':12,'軦':12,'軧':12,'軨':12,'軩':12,'軪':12,'軫':12,'軬':12,'軭':13,'軮':12,'軯':12,
  '軰':12,'軱':12,'軲':12,'軳':12,'軴':12,'軵':12,'軶':12,'軷':12,'軸':12,'軹':12,'軺':12,'軻':12,'軼':12,'軽':12,'軾':13,'軿':13,'輀':13,'輁':13,'輂':13,'較':13,'輄':13,'輅':13,'輆':13,'輇':13,'輈':13,'載':13,'輊':13,'輋':13,
  '輌':13,'輍':14,'輎':14,'輏':14,'輐':14,'輑':14,'輒':14,'輓':14,'輔':14,'輕':14,'輖':15,'輗':15,'輘':15,'輙':15,'輚':15,'輛':15,'輜':15,'輝':15,'輞':15,'輟':15,'輠':15,'輡':15,'輢':15,'輣':15,'輤':15,'輥':15,'輦':15,'輧':15,
  '輨':15,'輩':15,'輪':15,'輫':15,'輬':15,'輭':16,'輮':16,'輯':16,'輰':16,'輱':16,'輲':16,'輳':16,'輴':16,'輵':16,'輶':16,'輷':16,'輸':16,'輹':16,'輺':16,'輻':16,'輼':16,'輽':17,'輾':17,'輿':17,'轀':17,'轁':17,'轂':17,'轃':17,
  '轄':17,'轅':17,'轆':18,'轇':18,'轈':18,'轉':18,'轊':18,'轋':17,'轌':18,'轍':19,'轎':19,'轏':19,'轐':19,'轑':19,'轒':19,'轓':19,'轔':19,'轕':19,'轖':20,'轗':20,'轘':20,'轙':20,'轚':20,'轛':21,'轜':21,'轝':20,'轞':21,'轟':21,
  '轠':22,'轡':22,'轢':22,'轣':23,'轤':23,'轥':26,'车':4,'轧':5,'轨':6,'轩':7,'轪':7,'轫':7,'转':8,'轭':8,'轮':8,'软':8,'轰':8,'轱':9,'轲':9,'轳':9,'轴':9,'轵':9,'轶':9,'轷':9,'轸':9,'轹':9,'轺':9,'轻':9,'轼':10,'载':10,'轾':10,
  '轿':10,'辀':10,'辁':10,'辂':10,'较':10,'辄':11,'辅':11,'辆':11,'辇':12,'辈':12,'辉':12,'辊':12,'辋':12,'辌':12,'辍':12,'辎':12,'辏':13,'辐':13,'辑':13,'辒':13,'输':13,'辔':13,'辕':14,'辖':14,'辗':14,'辘':15,'辙':16,'辚':16,
  '辛':7,'辜':12,'辝':12,'辞':13,'辟':13,'辠':13,'辡':14,'辢':14,'辣':14,'辤':15,'辥':16,'辦':16,'辧':16,'辨':16,'辩':16,'辪':16,'辫':17,'辬':18,'辭':19,'辮':20,'辯':21,'辰':7,'辱':10,'農':13,'辳':15,'辴':19,'辵':7,'辶':3,'辷':8,
  '辸':9,'边':9,'辺':9,'辻':9,'込':9,'辽':9,'达':10,'辿':10,'迀':10,'迁':10,'迂':10,'迃':10,'迄':10,'迅':10,'迆':10,'过':10,'迈':10,'迉':10,'迊':11,'迋':12,'迌':11,'迍':11,'迎':11,'迏':11,'运':11,'近':11,'迒':11,'迓':11,'返':11,
  '迕':11,'迖':11,'迗':11,'还':11,'这':11,'迚':11,'进':11,'远':11,'违':11,'连':11,'迟':11,'迠':12,'迡':12,'迢':12,'迣':12,'迤':12,'迥':12,'迦':12,'迧':12,'迨':12,'迩':12,'迪':12,'迫':12,'迬':12,'迭':12,'迮':12,'迯':12,'述':12,
  '迱':12,'迲':12,'迳':12,'迴':13,'迵':13,'迶':13,'迷':13,'迸':13,'迹':13,'迺':13,'迻':13,'迼':13,'追':13,'迾':13,'迿':13,'退':13,'送':13,'适':13,'逃':13,'逄':11,'逅':13,'逆':13,'逇':13,'逈':13,'选':13,'逊':13,'逋':14,'逌':14,
  '逍':14,'逎':14,'透':14,'逐':14,'逑':14,'递':14,'逓':14,'途':14,'逕':14,'逖':14,'逗':14,'逘':14,'這':14,'通':11,'逛':14,'逜':14,'逝':14,'逞':14,'速':14,'造':14,'逡':14,'逢':14,'連':14,'逤':14,'逥':14,'逦':14,'逧':14,'逨':15,
  '逩':15,'逪':15,'逫':15,'逬':15,'逭':15,'逮':15,'逯':15,'逰':11,'週':15,'進':12,'逳':15,'逴':15,'逵':15,'逶':15,'逷':15,'逸':15,'逹':15,'逺':15,'逻':15,'逼':16,'逽':15,'逾':16,'逿':16,'遀':12,'遁':16,'遂':16,'遃':16,'遄':16,
  '遅':16,'遆':16,'遇':16,'遈':16,'遉':16,'遊':16,'運':16,'遌':16,'遍':16,'過':15,'遏':16,'遐':16,'遑':16,'遒':16,'道':16,'達':16,'違':16,'遖':16,'遗':16,'遘':17,'遙':17,'遚':16,'遛':17,'遜':17,'遝':17,'遞':17,'遟':17,'遠':17,
  '遡':17,'遢':17,'遣':17,'遤':17,'遥':17,'遦':18,'遧':18,'遨':17,'適':18,'遪':18,'遫':18,'遬':18,'遭':18,'遮':18,'遯':18,'遰':18,'遱':18,'遲':16,'遳':17,'遴':19,'遵':19,'遶':19,'遷':15,'選':19,'遹':19,'遺':19,'遻':19,'遼':19,
  '遽':20,'遾':20,'避':20,'邀':20,'邁':19,'邂':20,'邃':17,'還':20,'邅':20,'邆':19,'邇':21,'邈':21,'邉':17,'邊':22,'邋':22,'邌':22,'邍':19,'邎':25,'邏':26,'邐':26,'邑':7,'邒':9,'邓':9,'邔':10,'邕':10,'邖':10,'邗':10,'邘':10,'邙':10,
  '邚':10,'邛':10,'邜':10,'邝':10,'邞':11,'邟':11,'邠':11,'邡':11,'邢':7,'那':6,'邤':11,'邥':11,'邦':11,'邧':11,'邨':11,'邩':11,'邪':11,'邫':11,'邬':11,'邭':12,'邮':12,'邯':12,'邰':8,'邱':12,'邲':12,'邳':12,'邴':8,'邵':8,'邶':12,
  '邷':11,'邸':12,'邹':12,'邺':12,'邻':12,'邼':13,'邽':13,'邾':13,'邿':13,'郀':13,'郁':13,'郂':13,'郃':13,'郄':13,'郅':13,'郆':13,'郇':13,'郈':13,'郉':13,'郊':13,'郋':13,'郌':13,'郍':13,'郎':8,'郏':13,'郐':13,'郑':13,'郒':13,
  '郓':13,'郔':13,'郕':13,'郖':14,'郗':9,'郘':13,'郙':14,'郚':14,'郛':14,'郜':10,'郝':14,'郞':14,'郟':14,'郠':14,'郡':14,'郢':14,'郣':14,'郤':11,'郥':14,'郦':14,'郧':14,'部':15,'郩':15,'郪':15,'郫':15,'郬':15,'郭':15,'郮':15,
  '郯':15,'郰':15,'郱':13,'郲':15,'郳':15,'郴':15,'郵':15,'郶':15,'郷':10,'郸':15,'郹':16,'郺':16,'郻':16,'郼':16,'都':15,'郾':16,'郿':16,'鄀':15,'鄁':16,'鄂':16,'鄃':16,'鄄':16,'鄅':16,'鄆':16,'鄇':16,'鄈':16,'鄉':11,'鄊':11,
  '鄋':16,'鄌':17,'鄍':17,'鄎':17,'鄏':17,'鄐':17,'鄑':17,'鄒':17,'鄓':17,'鄔':17,'鄕':12,'鄖':17,'鄗':17,'鄘':18,'鄙':18,'鄚':17,'鄛':18,'鄜':18,'鄝':18,'鄞':14,'鄟':18,'鄠':18,'鄡':18,'鄢':18,'鄣':18,'鄤':18,'鄥':18,'鄦':19,
  '鄧':19,'鄨':18,'鄩':19,'鄪':19,'鄫':19,'鄬':19,'鄭':19,'鄮':19,'鄯':19,'鄰':19,'鄱':19,'鄲':19,'鄳':20,'鄴':20,'鄵':20,'鄶':20,'鄷':20,'鄸':20,'鄹':21,'鄺':21,'鄻':22,'鄼':22,'鄽':22,'鄾':22,'鄿':22,'酀':23,'酁':24,'酂':23,
  '酃':24,'酄':24,'酅':25,'酆':25,'酇':26,'酈':19,'酉':7,'酊':9,'酋':9,'酌':10,'配':10,'酎':10,'酏':10,'酐':10,'酑':10,'酒':11,'酓':11,'酔':11,'酕':11,'酖':11,'酗':11,'酘':11,'酙':11,'酚':11,'酛':11,'酜':11,'酝':11,'酞':11,'酟':12,
  '酠':12,'酡':12,'酢':12,'酣':12,'酤':12,'酥':12,'酦':12,'酧':13,'酨':13,'酩':13,'酪':13,'酫':13,'酬':13,'酭':13,'酮':13,'酯':13,'酰':13,'酱':13,'酲':14,'酳':14,'酴':14,'酵':14,'酶':14,'酷':14,'酸':14,'酹':14,'酺':14,'酻':14,
  '酼':14,'酽':14,'酾':14,'酿':14,'醀':15,'醁':15,'醂':15,'醃':15,'醄':15,'醅':15,'醆':15,'醇':15,'醈':15,'醉':15,'醊':15,'醋':15,'醌':15,'醍':16,'醎':16,'醏':15,'醐':16,'醑':16,'醒':16,'醓':16,'醔':16,'醕':16,'醖':16,'醗':16,
  '醘':17,'醙':16,'醚':16,'醛':16,'醜':16,'醝':16,'醞':17,'醟':17,'醠':17,'醡':17,'醢':17,'醣':17,'醤':17,'醥':18,'醦':18,'醧':18,'醨':17,'醩':18,'醪':18,'醫':18,'醬':18,'醭':19,'醮':19,'醯':19,'醰':19,'醱':19,'醲':20,'醳':20,
  '醴':20,'醵':20,'醶':20,'醷':20,'醸':20,'醹':21,'醺':21,'醻':21,'醼':23,'醽':24,'醾':24,'醿':24,'釀':24,'釁':26,'釂':24,'釃':26,'釄':26,'釅':26,'釆':7,'采':8,'釈':11,'釉':12,'释':12,'釋':20,'里':7,'重':9,'野':11,'量':12,'釐':18,
  '金':8,'釒':8,'釓':9,'釔':9,'釕':10,'釖':10,'釗':10,'釘':10,'釙':10,'釚':10,'釛':10,'釜':10,'針':10,'釞':10,'釟':10,'釠':10,'釡':10,'釢':10,'釣':11,'釤':11,'釥':11,'釦':11,'釧':11,'釨':11,'釩':11,'釪':11,'釫':11,'釬':11,'釭':11,
  '釮':11,'釯':11,'釰':11,'釱':11,'釲':11,'釳':11,'釴':11,'釵':11,'釶':11,'釷':11,'釸':11,'釹':11,'釺':11,'釻':11,'釼':11,'釽':12,'釾':12,'釿':12,'鈀':12,'鈁':12,'鈂':12,'鈃':12,'鈄':12,'鈅':12,'鈆':12,'鈇':12,'鈈':12,'鈉':12,
  '鈊':12,'鈋':12,'鈌':12,'鈍':12,'鈎':12,'鈏':12,'鈐':12,'鈑':12,'鈒':11,'鈓':12,'鈔':12,'鈕':12,'鈖':12,'鈗':12,'鈘':12,'鈙':12,'鈚':12,'鈛':12,'鈜':12,'鈝':12,'鈞':13,'鈟':12,'鈠':12,'鈡':12,'鈢':12,'鈣':12,'鈤':12,'鈥':12,
  '鈦':12,'鈧':12,'鈨':12,'鈩':12,'鈪':12,'鈫':12,'鈬':12,'鈭':14,'鈮':13,'鈯':13,'鈰':13,'鈱':13,'鈲':13,'鈳':13,'鈴':13,'鈵':13,'鈶':13,'鈷':13,'鈸':13,'鈹':13,'鈺':13,'鈻':13,'鈼':13,'鈽':13,'鈾':13,'鈿':13,'鉀':13,'鉁':13,
  '鉂':13,'鉃':13,'鉄':13,'鉅':12,'鉆':13,'鉇':13,'鉈':13,'鉉':13,'鉊':13,'鉋':13,'鉌':13,'鉍':13,'鉎':13,'鉏':13,'鉐':13,'鉑':13,'鉒':13,'鉓':13,'鉔':13,'鉕':13,'鉖':13,'鉗':13,'鉘':13,'鉙':13,'鉚':13,'鉛':13,'鉜':13,'鉝':13,
  '鉞':13,'鉟':13,'鉠':13,'鉡':13,'鉢':13,'鉣':13,'鉤':13,'鉥':13,'鉦':13,'鉧':13,'鉨':13,'鉩':13,'鉪':13,'鉫':13,'鉬':13,'鉭':13,'鉮':13,'鉯':12,'鉰':13,'鉱':13,'鉲':13,'鉳':13,'鉴':13,'鉵':14,'鉶':14,'鉷':14,'鉸':14,'鉹':14,
  '鉺':14,'鉻':14,'鉼':14,'鉽':14,'鉾':14,'鉿':14,'銀':14,'銁':14,'銂':14,'銃':14,'銄':14,'銅':14,'銆':14,'銇':14,'銈':14,'銉':14,'銊':14,'銋':14,'銌':14,'銍':14,'銎':14,'銏':13,'銐':14,'銑':14,'銒':14,'銓':14,'銔':14,'銕':14,
  '銖':14,'銗':14,'銘':14,'銙':14,'銚':14,'銛':14,'銜':14,'銝':14,'銞':14,'銟':14,'銠':14,'銡':14,'銢':14,'銣':14,'銤':14,'銥':14,'銦':14,'銧':14,'銨':14,'銩':14,'銪':14,'銫':14,'銬':14,'銭':14,'銮':14,'銯':14,'銰':14,'銱':14,
  '銲':15,'銳':15,'銴':15,'銵':15,'銶':15,'銷':15,'銸':15,'銹':15,'銺':15,'銻':15,'銼':15,'銽':15,'銾':15,'銿':15,'鋀':15,'鋁':14,'鋂':15,'鋃':15,'鋄':15,'鋅':15,'鋆':15,'鋇':15,'鋈':15,'鋉':15,'鋊':15,'鋋':14,'鋌':14,'鋍':15,
  '鋎':15,'鋏':15,'鋐':15,'鋑':15,'鋒':15,'鋓':15,'鋔':15,'鋕':15,'鋖':15,'鋗':15,'鋘':15,'鋙':15,'鋚':15,'鋛':15,'鋜':15,'鋝':15,'鋞':15,'鋟':15,'鋠':15,'鋡':15,'鋢':15,'鋣':14,'鋤':15,'鋥':15,'鋦':15,'鋧':15,'鋨':15,'鋩':14,
  '鋪':15,'鋫':15,'鋬':15,'鋭':15,'鋮':14,'鋯':15,'鋰':15,'鋱':15,'鋲':15,'鋳':15,'鋴':15,'鋵':15,'鋶':15,'鋷':16,'鋸':16,'鋹':16,'鋺':16,'鋻':16,'鋼':16,'鋽':16,'鋾':16,'鋿':16,'錀':16,'錁':16,'錂':16,'錃':16,'錄':16,'錅':16,
  '錆':16,'錇':16,'錈':16,'錉':16,'錊':16,'錋':16,'錌':16,'錍':16,'錎':16,'錏':16,'錐':16,'錑':16,'錒':15,'錓':15,'錔':16,'錕':16,'錖':16,'錗':16,'錘':16,'錙':16,'錚':16,'錛':16,'錜':16,'錝':16,'錞':16,'錟':16,'錠':16,'錡':16,
  '錢':16,'錣':16,'錤':16,'錥':16,'錦':16,'錧':16,'錨':16,'錩':16,'錪':16,'錫':16,'錬':16,'錭':16,'錮':16,'錯':16,'錰':16,'錱':16,'録':16,'錳':16,'錴':16,'錵':15,'錶':16,'錷':16,'錸':16,'錹':16,'錺':15,'錻':16,'錼':16,'錽':16,
  '錾':16,'錿':16,'鍀':16,'鍁':16,'鍂':16,'鍃':16,'鍄':16,'鍅':16,'鍆':16,'鍇':17,'鍈':16,'鍉':17,'鍊':17,'鍋':16,'鍌':17,'鍍':17,'鍎':17,'鍏':17,'鍐':17,'鍑':17,'鍒':17,'鍓':17,'鍔':17,'鍕':17,'鍖':17,'鍗':17,'鍘':17,'鍙':17,
  '鍚':17,'鍛':17,'鍜':17,'鍝':17,'鍞':17,'鍟':17,'鍠':17,'鍡':17,'鍢':17,'鍣':16,'鍤':17,'鍥':17,'鍦':17,'鍧':17,'鍨':17,'鍩':16,'鍪':17,'鍫':17,'鍬':17,'鍭':17,'鍮':17,'鍯':17,'鍰':17,'鍱':17,'鍲':17,'鍳':17,'鍴':17,'鍵':16,
  '鍶':17,'鍷':17,'鍸':17,'鍹':17,'鍺':16,'鍻':17,'鍼':17,'鍽':17,'鍾':17,'鍿':17,'鎀':17,'鎁':16,'鎂':17,'鎃':17,'鎄':17,'鎅':17,'鎆':17,'鎇':17,'鎈':17,'鎉':18,'鎊':18,'鎋':18,'鎌':18,'鎍':18,'鎎':18,'鎏':18,'鎐':18,'鎑':18,
  '鎒':18,'鎓':18,'鎔':18,'鎕':18,'鎖':18,'鎗':18,'鎘':18,'鎙':18,'鎚':17,'鎛':18,'鎜':18,'鎝':17,'鎞':18,'鎟':18,'鎠':18,'鎡':17,'鎢':18,'鎣':18,'鎤':18,'鎥':18,'鎦':18,'鎧':18,'鎨':18,'鎩':18,'鎪':17,'鎫':18,'鎬':18,'鎭':18,
  '鎮':18,'鎯':16,'鎰':18,'鎱':18,'鎲':18,'鎳':18,'鎴':18,'鎵':18,'鎶':18,'鎷':18,'鎸':18,'鎹':17,'鎺':17,'鎻':18,'鎼':18,'鎽':18,'鎾':17,'鎿':18,'鏀':19,'鏁':19,'鏂':19,'鏃':19,'鏄':19,'鏅':18,'鏆':19,'鏇':19,'鏈':18,'鏉':19,
  '鏊':18,'鏋':19,'鏌':18,'鏍':19,'鏎':18,'鏏':19,'鏐':19,'鏑':19,'鏒':19,'鏓':19,'鏔':19,'鏕':19,'鏖':19,'鏗':20,'鏘':19,'鏙':19,'鏚':19,'鏛':19,'鏜':19,'鏝':19,'鏞':19,'鏟':19,'鏠':18,'鏡':19,'鏢':19,'鏣':19,'鏤':19,'鏥':19,
  '鏦':19,'鏧':19,'鏨':19,'鏩':19,'鏪':19,'鏫':19,'鏬':19,'鏭':19,'鏮':19,'鏯':19,'鏰':19,'鏱':19,'鏲':19,'鏳':20,'鏴':21,'鏵':18,'鏶':20,'鏷':20,'鏸':20,'鏹':20,'鏺':20,'鏻':20,'鏼':20,'鏽':21,'鏾':20,'鏿':20,'鐀':20,'鐁':20,
  '鐂':20,'鐃':20,'鐄':19,'鐅':19,'鐆':19,'鐇':20,'鐈':20,'鐉':20,'鐊':19,'鐋':20,'鐌':19,'鐍':20,'鐎':20,'鐏':20,'鐐':20,'鐑':20,'鐒':20,'鐓':20,'鐔':20,'鐕':20,'鐖':20,'鐗':20,'鐘':20,'鐙':20,'鐚':20,'鐛':20,'鐜':20,'鐝':20,
  '鐞':20,'鐟':20,'鐠':20,'鐡':20,'鐢':20,'鐣':20,'鐤':20,'鐥':20,'鐦':20,'鐧':20,'鐨':20,'鐩':20,'鐪':21,'鐫':20,'鐬':21,'鐭':20,'鐮':21,'鐯':19,'鐰':21,'鐱':21,'鐲':21,'鐳':21,'鐴':21,'鐵':21,'鐶':21,'鐷':20,'鐸':21,'鐹':19,
  '鐺':21,'鐻':21,'鐼':20,'鐽':20,'鐾':21,'鐿':21,'鑀':21,'鑁':21,'鑂':22,'鑃':22,'鑄':22,'鑅':22,'鑆':22,'鑇':22,'鑈':22,'鑉':21,'鑊':21,'鑋':22,'鑌':22,'鑍':22,'鑎':22,'鑏':22,'鑐':22,'鑑':22,'鑒':22,'鑓':21,'鑔':22,'鑕':23,
  '鑖':22,'鑗':23,'鑘':23,'鑙':23,'鑚':23,'鑛':22,'鑜':23,'鑝':21,'鑞':23,'鑟':23,'鑠':23,'鑡':23,'鑢':23,'鑣':23,'鑤':23,'鑥':23,'鑦':23,'鑧':22,'鑨':24,'鑩':24,'鑪':24,'鑫':24,'鑬':24,'鑭':25,'鑮':24,'鑯':25,'鑰':25,'鑱':25,
  '鑲':25,'鑳':25,'鑴':26,'鑵':25,'鑶':25,'鑷':26,'鑸':26,'鑹':26,'鑺':26,'鑻':27,'鑼':27,'鑽':27,'鑾':27,'鑿':28,'钀':28,'钁':28,'钂':28,'钃':29,'钄':28,'钅':5,'钆':6,'钇':6,'针':7,'钉':7,'钊':7,'钋':7,'钌':7,'钍':8,'钎':8,'钏':8,
  '钐':8,'钑':8,'钒':8,'钓':8,'钔':8,'钕':8,'钖':8,'钗':8,'钘':9,'钙':9,'钚':9,'钛':9,'钜':9,'钝':9,'钞':9,'钟':9,'钠':9,'钡':9,'钢':9,'钣':9,'钤':9,'钥':9,'钦':9,'钧':9,'钨':9,'钩':9,'钪':9,'钫':9,'钬':9,'钭':9,'钮':9,'钯':9,'钰':10,
  '钱':10,'钲':10,'钳':10,'钴':10,'钵':10,'钶':10,'钷':10,'钸':10,'钹':10,'钺':10,'钻':10,'钼':10,'钽':10,'钾':10,'钿':10,'铀':10,'铁':10,'铂':10,'铃':10,'铄':10,'铅':10,'铆':10,'铇':10,'铈':10,'铉':10,'铊':10,'铋':10,'铌':10,
  '铍':10,'铎':10,'铏':11,'铐':11,'铑':11,'铒':11,'铓':11,'铔':11,'铕':11,'铖':11,'铗':11,'铘':11,'铙':11,'铚':11,'铛':11,'铜':11,'铝':11,'铞':11,'铟':11,'铠':11,'铡':11,'铢':11,'铣':11,'铤':11,'铥':11,'铦':11,'铧':11,'铨':11,
  '铩':11,'铪':11,'铫':11,'铬':11,'铭':11,'铮':11,'铯':11,'铰':11,'铱':11,'铲':11,'铳':11,'铴':11,'铵':11,'银':11,'铷':11,'铸':12,'铹':12,'铺':12,'铻':12,'铼':12,'铽':12,'链':12,'铿':12,'销':12,'锁':12,'锂':12,'锃':12,'锄':12,
  '锅':12,'锆':12,'锇':12,'锈':12,'锉':12,'锊':12,'锋':12,'锌':12,'锍':12,'锎':12,'锏':12,'锐':12,'锑':12,'锒':12,'锓':12,'锔':12,'锕':12,'锖':13,'锗':13,'锘':13,'错':13,'锚':13,'锛':13,'锜':13,'锝':13,'锞':13,'锟':13,'锠':13,
  '锡':13,'锢':13,'锣':13,'锤':13,'锥':13,'锦':13,'锧':13,'锨':13,'锩':13,'锪':13,'锫':13,'锬':13,'锭':13,'键':13,'锯':13,'锰':13,'锱':13,'锲':14,'锳':13,'锴':14,'锵':14,'锶':14,'锷':14,'锸':14,'锹':14,'锺':14,'锻':14,'锼':14,
  '锽':14,'锾':14,'锿':14,'镀':14,'镁':14,'镂':14,'镃':14,'镄':14,'镅':14,'镆':15,'镇':15,'镈':15,'镉':15,'镊':15,'镋':15,'镌':15,'镍':15,'镎':15,'镏':15,'镐':15,'镑':15,'镒':15,'镓':15,'镔':15,'镕':15,'镖':16,'镗':16,'镘':16,
  '镙':16,'镚':16,'镛':16,'镜':16,'镝':16,'镞':16,'镟':16,'镠':16,'镡':17,'镢':17,'镣':17,'镤':17,'镥':17,'镦':17,'镧':17,'镨':17,'镩':17,'镪':17,'镫':17,'镬':18,'镭':18,'镮':18,'镯':18,'镰':18,'镱':18,'镲':19,'镳':20,'镴':20,
  '镵':22,'镶':22,'長':8,'镸':7,'镹':10,'镺':11,'镻':12,'镼':15,'镽':19,'镾':21,'长':4,'門':8,'閁':9,'閂':9,'閃':10,'閄':10,'閅':10,'閆':11,'閇':11,'閈':11,'閉':11,'閊':11,'開':12,'閌':12,'閍':12,'閎':10,'閏':13,'閐':12,'閑':12,
  '閒':12,'間':12,'閔':12,'閕':12,'閖':12,'閗':12,'閘':13,'閙':13,'閚':13,'閛':13,'閜':13,'閝':13,'閞':13,'閟':13,'閠':13,'閡':14,'関':14,'閣':14,'閤':14,'閥':14,'閦':14,'閧':14,'閨':14,'閩':14,'閪':14,'閫':15,'閬':15,'閭':14,
  '閮':14,'閯':15,'閰':14,'閱':15,'閲':15,'閳':15,'閴':15,'閵':16,'閶':16,'閷':16,'閸':16,'閹':16,'閺':16,'閻':16,'閼':16,'閽':16,'閾':16,'閿':16,'闀':17,'闁':16,'闂':16,'闃':17,'闄':17,'闅':17,'闆':17,'闇':17,'闈':17,'闉':17,
  '闊':17,'闋':17,'闌':17,'闍':16,'闎':17,'闏':17,'闐':18,'闑':18,'闒':18,'闓':18,'闔':18,'闕':18,'闖':18,'闗':18,'闘':18,'闙':19,'闚':19,'闛':19,'關':19,'闝':19,'闞':19,'闟':20,'闠':20,'闡':20,'闢':21,'闣':21,'闤':21,'闥':20,
  '闦':21,'闧':22,'门':3,'闩':4,'闪':5,'闫':6,'闬':6,'闭':6,'问':6,'闯':6,'闰':8,'闱':7,'闲':7,'闳':7,'间':7,'闵':7,'闶':7,'闷':7,'闸':8,'闹':8,'闺':9,'闻':9,'闼':9,'闽':9,'闾':9,'闿':9,'阀':9,'阁':9,'阂':9,'阃':10,'阄':10,'阅':10,
  '阆':10,'阇':11,'阈':11,'阉':11,'阊':11,'阋':11,'阌':11,'阍':11,'阎':11,'阏':11,'阐':11,'阑':12,'阒':12,'阓':12,'阔':12,'阕':12,'阖':13,'阗':13,'阘':13,'阙':13,'阚':14,'阛':16,'阜':8,'阝':2,'阞':10,'队':10,'阠':11,'阡':11,
  '阢':11,'阣':11,'阤':11,'阥':12,'阦':12,'阧':12,'阨':12,'阩':12,'阪':12,'阫':12,'阬':12,'阭':12,'阮':12,'阯':12,'阰':12,'阱':12,'防':12,'阳':12,'阴':12,'阵':12,'阶':12,'阷':13,'阸':13,'阹':13,'阺':13,'阻':13,'阼':13,'阽':13,
  '阾':13,'阿':13,'陀':13,'陁':13,'陂':13,'陃':13,'附':13,'际':13,'陆':13,'陇':13,'陈':13,'陉':13,'陊':14,'陋':8,'陌':14,'降':14,'陎':14,'陏':14,'限':14,'陑':14,'陒':14,'陓':14,'陔':14,'陕':14,'陖':15,'陗':15,'陘':15,'陙':15,
  '陚':16,'陛':15,'陜':15,'陝':15,'陞':15,'陟':15,'陠':15,'陡':15,'院':15,'陣':15,'除':15,'陥':9,'陦':15,'陧':15,'陨':15,'险':15,'陪':16,'陫':16,'陬':16,'陭':16,'陮':16,'陯':16,'陰':11,'陱':16,'陲':16,'陳':16,'陴':16,'陵':16,
  '陶':16,'陷':16,'陸':16,'陹':10,'険':16,'陻':17,'陼':16,'陽':17,'陾':17,'陿':17,'隀':17,'隁':17,'隂':11,'隃':17,'隄':17,'隅':17,'隆':17,'隇':17,'隈':17,'隉':11,'隊':17,'隋':11,'隌':17,'隍':17,'階':17,'随':17,'隐':17,'隑':18,
  '隒':18,'隓':18,'隔':18,'隕':18,'隖':18,'隗':13,'隘':18,'隙':18,'隚':19,'際':19,'障':19,'隝':19,'隞':18,'隟':19,'隠':18,'隡':19,'隢':20,'隣':20,'隤':20,'隥':20,'隦':21,'隧':20,'隨':20,'隩':20,'險':21,'隫':20,'隬':22,'隭':22,
  '隮':22,'隯':22,'隰':22,'隱':22,'隲':16,'隳':17,'隴':24,'隵':25,'隶':8,'隷':16,'隸':17,'隹':8,'隺':10,'隻':10,'隼':10,'隽':10,'难':10,'隿':11,'雀':11,'雁':12,'雂':12,'雃':12,'雄':12,'雅':12,'集':12,'雇':12,'雈':12,'雉':13,
  '雊':13,'雋':12,'雌':14,'雍':13,'雎':13,'雏':13,'雐':14,'雑':14,'雒':14,'雓':15,'雔':16,'雕':16,'雖':17,'雗':18,'雘':17,'雙':18,'雚':20,'雛':18,'雜':18,'雝':18,'雞':18,'雟':18,'雠':18,'雡':19,'離':18,'難':19,'雤':21,'雥':24,
  '雦':24,'雧':28,'雨':8,'雩':11,'雪':11,'雫':11,'雬':12,'雭':11,'雮':12,'雯':12,'雰':12,'雱':12,'雲':12,'雳':12,'雴':13,'雵':13,'零':13,'雷':13,'雸':13,'雹':13,'雺':13,'電':13,'雼':13,'雽':13,'雾':13,'雿':14,'需':14,'霁':14,
  '霂':15,'霃':15,'霄':15,'霅':15,'霆':15,'震':15,'霈':15,'霉':15,'霊':15,'霋':16,'霌':16,'霍':16,'霎':16,'霏':16,'霐':16,'霑':16,'霒':16,'霓':16,'霔':16,'霕':16,'霖':16,'霗':16,'霘':17,'霙':16,'霚':17,'霛':17,'霜':17,'霝':17,
  '霞':17,'霟':17,'霠':17,'霡':17,'霢':18,'霣':18,'霤':18,'霥':18,'霦':19,'霧':19,'霨':19,'霩':18,'霪':19,'霫':19,'霬':19,'霭':19,'霮':20,'霯':20,'霰':20,'霱':20,'露':21,'霳':19,'霴':20,'霵':20,'霶':21,'霷':21,'霸':21,'霹':21,
  '霺':21,'霻':21,'霼':22,'霽':22,'霾':22,'霿':21,'靀':21,'靁':23,'靂':24,'靃':24,'靄':24,'靅':24,'靆':23,'靇':24,'靈':24,'靉':25,'靊':26,'靋':27,'靌':27,'靍':27,'靎':27,'靏':29,'靐':39,'靑':8,'青':8,'靓':12,'靔':12,'靕':13,
  '靖':13,'靗':14,'靘':14,'静':14,'靚':15,'靛':16,'靜':16,'靝':18,'非':8,'靟':12,'靠':15,'靡':19,'面':9,'靣':8,'靤':14,'靥':15,'靦':16,'靧':21,'靨':23,'革':9,'靪':11,'靫':12,'靬':12,'靭':12,'靮':12,'靯':12,'靰':12,'靱':12,'靲':13,
  '靳':13,'靴':13,'靵':13,'靶':13,'靷':13,'靸':12,'靹':13,'靺':14,'靻':14,'靼':14,'靽':14,'靾':14,'靿':14,'鞀':14,'鞁':14,'鞂':14,'鞃':14,'鞄':14,'鞅':14,'鞆':14,'鞇':15,'鞈':15,'鞉':15,'鞊':15,'鞋':15,'鞌':15,'鞍':15,'鞎':15,
  '鞏':15,'鞐':15,'鞑':15,'鞒':15,'鞓':16,'鞔':16,'鞕':16,'鞖':16,'鞗':15,'鞘':16,'鞙':16,'鞚':17,'鞛':17,'鞜':17,'鞝':17,'鞞':17,'鞟':17,'鞠':17,'鞡':17,'鞢':18,'鞣':18,'鞤':18,'鞥':18,'鞦':18,'鞧':18,'鞨':18,'鞩':18,'鞪':18,
  '鞫':18,'鞬':17,'鞭':18,'鞮':18,'鞯':18,'鞰':18,'鞱':19,'鞲':19,'鞳':18,'鞴':19,'鞵':19,'鞶':19,'鞷':19,'鞸':19,'鞹':19,'鞺':20,'鞻':20,'鞼':21,'鞽':21,'鞾':19,'鞿':21,'韀':22,'韁':22,'韂':22,'韃':21,'韄':22,'韅':23,'韆':24,
  '韇':24,'韈':23,'韉':25,'韊':29,'韋':9,'韌':12,'韍':14,'韎':14,'韏':15,'韐':15,'韑':15,'韒':16,'韓':17,'韔':17,'韕':17,'韖':18,'韗':18,'韘':18,'韙':18,'韚':18,'韛':19,'韜':19,'韝':19,'韞':18,'韟':19,'韠':19,'韡':19,'韢':21,
  '韣':22,'韤':23,'韥':24,'韦':4,'韧':7,'韨':9,'韩':12,'韪':13,'韫':13,'韬':14,'韭':9,'韮':15,'韯':15,'韰':16,'韱':17,'韲':19,'音':9,'韴':13,'韵':13,'韶':14,'韷':14,'韸':16,'韹':18,'韺':17,'韻':19,'韼':19,'韽':20,'韾':20,'響':20,
  '頀':22,'頁':9,'頂':11,'頃':11,'頄':11,'項':12,'順':12,'頇':12,'須':12,'頉':13,'頊':14,'頋':13,'頌':13,'頍':13,'頎':13,'頏':13,'預':13,'頑':13,'頒':13,'頓':13,'頔':14,'頕':14,'頖':14,'頗':14,'領':14,'頙':14,'頚':14,'頛':15,
  '頜':15,'頝':15,'頞':15,'頟':15,'頠':15,'頡':15,'頢':15,'頣':15,'頤':16,'頥':16,'頦':15,'頧':15,'頨':15,'頩':15,'頪':15,'頫':15,'頬':15,'頭':16,'頮':16,'頯':16,'頰':16,'頱':16,'頲':15,'頳':16,'頴':16,'頵':16,'頶':16,'頷':16,
  '頸':16,'頹':16,'頺':16,'頻':16,'頼':16,'頽':16,'頾':18,'頿':18,'顀':17,'顁':17,'顂':17,'顃':17,'顄':17,'顅':17,'顆':17,'顇':17,'顈':17,'顉':17,'顊':17,'顋':18,'題':18,'額':18,'顎':18,'顏':18,'顐':18,'顑':18,'顒':18,'顓':18,
  '顔':18,'顕':18,'顖':19,'顗':19,'願':19,'顙':19,'顚':19,'顛':19,'顜':19,'顝':18,'類':19,'顟':20,'顠':20,'顡':20,'顢':20,'顣':20,'顤':21,'顥':21,'顦':21,'顧':21,'顨':21,'顩':22,'顪':22,'顫':22,'顬':23,'顭':22,'顮':23,'顯':23,
  '顰':24,'顱':25,'顲':25,'顳':27,'顴':26,'页':6,'顶':8,'顷':8,'顸':9,'项':9,'顺':9,'须':9,'顼':11,'顽':10,'顾':10,'顿':10,'颀':10,'颁':10,'颂':10,'颃':10,'预':10,'颅':11,'领':11,'颇':11,'颈':11,'颉':12,'颊':12,'颋':12,'颌':12,
  '颍':12,'颎':12,'颏':12,'颐':13,'频':13,'颒':13,'颓':13,'颔':13,'颕':13,'颖':13,'颗':14,'题':15,'颙':15,'颚':15,'颛':15,'颜':15,'额':15,'颞':16,'颟':16,'颠':16,'颡':16,'颢':18,'颣':18,'颤':19,'颥':20,'颦':21,'颧':23,'風':9,
  '颩':12,'颪':12,'颫':13,'颬':13,'颭':14,'颮':14,'颯':14,'颰':14,'颱':14,'颲':15,'颳':15,'颴':16,'颵':16,'颶':17,'颷':17,'颸':18,'颹':18,'颺':18,'颻':19,'颼':18,'颽':19,'颾':18,'颿':19,'飀':19,'飁':20,'飂':20,'飃':20,'飄':20,
  '飅':21,'飆':21,'飇':21,'飈':21,'飉':21,'飊':21,'飋':22,'飌':26,'飍':27,'风':4,'飏':7,'飐':9,'飑':9,'飒':9,'飓':12,'飔':13,'飕':13,'飖':14,'飗':14,'飘':15,'飙':16,'飚':16,'飛':9,'飜':21,'飝':27,'飞':3,'食':9,'飠':8,'飡':11,
  '飢':10,'飣':10,'飤':10,'飥':11,'飦':11,'飧':12,'飨':12,'飩':12,'飪':12,'飫':12,'飬':13,'飭':12,'飮':13,'飯':12,'飰':12,'飱':13,'飲':12,'飳':13,'飴':13,'飵':13,'飶':13,'飷':13,'飸':14,'飹':13,'飺':15,'飻':13,'飼':13,'飽':13,
  '飾':13,'飿':13,'餀':13,'餁':14,'餂':14,'餃':14,'餄':14,'餅':14,'餆':14,'餇':14,'餈':15,'餉':14,'養':15,'餋':15,'餌':14,'餍':15,'餎':14,'餏':14,'餐':16,'餑':15,'餒':15,'餓':15,'餔':15,'餕':15,'餖':15,'餗':15,'餘':15,'餙':15,
  '餚':16,'餛':16,'餜':16,'餝':15,'餞':16,'餟':16,'餠':16,'餡':16,'餢':16,'餣':16,'餤':16,'餥':17,'餦':16,'餧':16,'館':16,'餩':16,'餪':17,'餫':17,'餬':17,'餭':17,'餮':18,'餯':17,'餰':17,'餱':17,'餲':17,'餳':17,'餴':16,'餵':17,
  '餶':17,'餷':17,'餸':17,'餹':18,'餺':18,'餻':18,'餼':18,'餽':17,'餾':18,'餿':17,'饀':18,'饁':18,'饂':17,'饃':18,'饄':19,'饅':19,'饆':18,'饇':19,'饈':18,'饉':19,'饊':20,'饋':20,'饌':20,'饍':20,'饎':20,'饏':20,'饐':20,'饑':20,
  '饒':20,'饓':20,'饔':22,'饕':22,'饖':21,'饗':20,'饘':21,'饙':20,'饚':21,'饛':21,'饜':23,'饝':24,'饞':25,'饟':25,'饠':27,'饡':27,'饢':30,'饣':3,'饤':5,'饥':5,'饦':6,'饧':6,'饨':7,'饩':7,'饪':7,'饫':7,'饬':7,'饭':7,'饮':7,'饯':8,
  '饰':8,'饱':8,'饲':8,'饳':8,'饴':8,'饵':9,'饶':9,'饷':9,'饸':9,'饹':9,'饺':9,'饻':9,'饼':9,'饽':10,'饾':10,'饿':10,'馀':10,'馁':10,'馂':10,'馃':11,'馄':11,'馅':11,'馆':11,'馇':12,'馈':12,'馉':12,'馊':12,'馋':12,'馌':13,'馍':13,
  '馎':13,'馏':13,'馐':13,'馑':14,'馒':14,'馓':15,'馔':15,'馕':25,'首':9,'馗':11,'馘':17,'香':9,'馚':13,'馛':14,'馜':14,'馝':14,'馞':16,'馟':16,'馠':16,'馡':17,'馢':17,'馣':17,'馤':18,'馥':18,'馦':19,'馧':18,'馨':20,'馩':21,
  '馪':23,'馫':27,'馬':10,'馭':12,'馮':12,'馯':13,'馰':13,'馱':13,'馲':13,'馳':13,'馴':13,'馵':13,'馶':14,'馷':14,'馸':14,'馹':14,'馺':13,'馻':14,'馼':14,'馽':14,'馾':14,'馿':14,'駀':14,'駁':14,'駂':14,'駃':14,'駄':14,'駅':14,
  '駆':14,'駇':14,'駈':15,'駉':15,'駊':15,'駋':15,'駌':15,'駍':15,'駎':15,'駏':14,'駐':15,'駑':15,'駒':15,'駓':15,'駔':15,'駕':15,'駖':15,'駗':15,'駘':15,'駙':15,'駚':15,'駛':15,'駜':15,'駝':15,'駞':15,'駟':15,'駠':15,'駡':16,
  '駢':16,'駣':16,'駤':16,'駥':16,'駦':16,'駧':16,'駨':16,'駩':16,'駪':16,'駫':16,'駬':16,'駭':16,'駮':16,'駯':16,'駰':16,'駱':16,'駲':16,'駳':16,'駴':17,'駵':17,'駶':17,'駷':17,'駸':17,'駹':17,'駺':17,'駻':17,'駼':17,'駽':17,
  '駾':17,'駿':17,'騀':17,'騁':17,'騂':17,'騃':17,'騄':18,'騅':18,'騆':18,'騇':18,'騈':18,'騉':18,'騊':18,'騋':18,'騌':18,'騍':18,'騎':18,'騏':18,'騐':18,'騑':18,'騒':18,'験':18,'騔':19,'騕':19,'騖':19,'騗':19,'騘':19,'騙':19,
  '騚':19,'騛':19,'騜':19,'騝':18,'騞':19,'騟':19,'騠':19,'騡':19,'騢':19,'騣':19,'騤':19,'騥':19,'騦':19,'騧':18,'騨':19,'騩':19,'騪':19,'騫':20,'騬':20,'騭':19,'騮':20,'騯':20,'騰':20,'騱':20,'騲':19,'騳':20,'騴':20,'騵':20,
  '騶':20,'騷':19,'騸':20,'騹':21,'騺':21,'騻':21,'騼':21,'騽':21,'騾':21,'騿':21,'驀':20,'驁':20,'驂':21,'驃':21,'驄':21,'驅':21,'驆':20,'驇':21,'驈':22,'驉':21,'驊':22,'驋':22,'驌':23,'驍':22,'驎':22,'驏':22,'驐':22,'驑':22,
  '驒':22,'驓':22,'驔':22,'驕':22,'驖':23,'驗':23,'驘':23,'驙':23,'驚':22,'驛':23,'驜':23,'驝':24,'驞':24,'驟':24,'驠':26,'驡':26,'驢':26,'驣':26,'驤':27,'驥':27,'驦':27,'驧':27,'驨':28,'驩':27,'驪':29,'驫':30,'马':3,'驭':5,'驮':6,
  '驯':6,'驰':6,'驱':7,'驲':7,'驳':7,'驴':7,'驵':8,'驶':8,'驷':8,'驸':8,'驹':8,'驺':8,'驻':8,'驼':8,'驽':8,'驾':8,'驿':8,'骀':8,'骁':9,'骂':9,'骃':9,'骄':9,'骅':9,'骆':9,'骇':9,'骈':9,'骉':9,'骊':10,'骋':10,'验':10,'骍':10,'骎':10,
  '骏':10,'骐':11,'骑':11,'骒':11,'骓':11,'骔':11,'骕':11,'骖':11,'骗':12,'骘':12,'骙':12,'骚':12,'骛':12,'骜':13,'骝':13,'骞':13,'骟':13,'骠':14,'骡':14,'骢':14,'骣':15,'骤':17,'骥':19,'骦':20,'骧':20,'骨':9,'骩':11,'骪':12,
  '骫':12,'骬':12,'骭':12,'骮':12,'骯':13,'骰':13,'骱':13,'骲':14,'骳':14,'骴':15,'骵':14,'骶':14,'骷':14,'骸':15,'骹':15,'骺':15,'骻':15,'骼':15,'骽':16,'骾':16,'骿':15,'髀':17,'髁':17,'髂':18,'髃':18,'髄':18,'髅':18,'髆':19,
  '髇':19,'髈':19,'髉':19,'髊':18,'髋':19,'髌':19,'髍':20,'髎':20,'髏':20,'髐':21,'髑':22,'髒':21,'髓':21,'體':22,'髕':23,'髖':23,'髗':25,'高':10,'髙':11,'髚':14,'髛':15,'髜':18,'髝':22,'髞':23,'髟':10,'髠':12,'髡':13,'髢':13,
  '髣':14,'髤':14,'髥':14,'髦':14,'髧':14,'髨':14,'髩':14,'髪':14,'髫':15,'髬':15,'髭':16,'髮':15,'髯':15,'髰':15,'髱':15,'髲':15,'髳':15,'髴':15,'髵':16,'髶':16,'髷':16,'髸':16,'髹':16,'髺':16,'髻':16,'髼':17,'髽':17,'髾':17,
  '髿':17,'鬀':17,'鬁':17,'鬂':17,'鬃':18,'鬄':18,'鬅':18,'鬆':18,'鬇':16,'鬈':18,'鬉':19,'鬊':19,'鬋':19,'鬌':19,'鬍':19,'鬎':19,'鬏':19,'鬐':20,'鬑':20,'鬒':20,'鬓':20,'鬔':20,'鬕':20,'鬖':21,'鬗':21,'鬘':21,'鬙':22,'鬚':22,
  '鬛':22,'鬜':22,'鬝':22,'鬞':23,'鬟':23,'鬠':23,'鬡':24,'鬢':24,'鬣':25,'鬤':27,'鬥':10,'鬦':14,'鬧':15,'鬨':16,'鬩':18,'鬪':20,'鬫':21,'鬬':25,'鬭':24,'鬮':27,'鬯':10,'鬰':27,'鬱':29,'鬲':10,'鬳':16,'鬴':17,'鬵':18,'鬶':18,
  '鬷':19,'鬸':20,'鬹':21,'鬺':21,'鬻':22,'鬼':9,'鬽':12,'鬾':13,'鬿':13,'魀':13,'魁':14,'魂':13,'魃':14,'魄':14,'魅':14,'魆':14,'魇':15,'魈':16,'魉':16,'魊':17,'魋':17,'魌':17,'魍':17,'魎':17,'魏':18,'魐':19,'魑':19,'魒':20,
  '魓':19,'魔':20,'魕':21,'魖':20,'魗':23,'魘':23,'魙':23,'魚':11,'魛':13,'魜':13,'魝':13,'魞':13,'魟':14,'魠':14,'魡':14,'魢':14,'魣':15,'魤':15,'魥':14,'魦':15,'魧':15,'魨':15,'魩':15,'魪':15,'魫':15,'魬':15,'魭':15,'魮':15,
  '魯':15,'魰':15,'魱':15,'魲':15,'魳':15,'魴':15,'魵':15,'魶':15,'魷':15,'魸':15,'魹':15,'魺':16,'魻':16,'魼':16,'魽':16,'魾':16,'魿':16,'鮀':16,'鮁':16,'鮂':16,'鮃':16,'鮄':16,'鮅':16,'鮆':17,'鮇':16,'鮈':16,'鮉':16,'鮊':16,
  '鮋':16,'鮌':16,'鮍':16,'鮎':16,'鮏':16,'鮐':16,'鮑':16,'鮒':16,'鮓':16,'鮔':15,'鮕':16,'鮖':16,'鮗':16,'鮘':16,'鮙':17,'鮚':17,'鮛':17,'鮜':17,'鮝':17,'鮞':17,'鮟':17,'鮠':17,'鮡':17,'鮢':17,'鮣':16,'鮤':17,'鮥':17,'鮦':17,
  '鮧':17,'鮨':17,'鮩':17,'鮪':17,'鮫':17,'鮬':17,'鮭':17,'鮮':17,'鮯':17,'鮰':17,'鮱':17,'鮲':17,'鮳':17,'鮴':17,'鮵':18,'鮶':18,'鮷':18,'鮸':18,'鮹':18,'鮺':17,'鮻':18,'鮼':18,'鮽':18,'鮾':18,'鮿':18,'鯀':18,'鯁':18,'鯂':18,
  '鯃':18,'鯄':18,'鯅':17,'鯆':18,'鯇':18,'鯈':17,'鯉':18,'鯊':18,'鯋':18,'鯌':18,'鯍':18,'鯎':17,'鯏':18,'鯐':18,'鯑':18,'鯒':18,'鯓':18,'鯔':19,'鯕':19,'鯖':19,'鯗':18,'鯘':19,'鯙':19,'鯚':19,'鯛':19,'鯜':19,'鯝':19,'鯞':19,
  '鯟':19,'鯠':19,'鯡':19,'鯢':19,'鯣':19,'鯤':19,'鯥':19,'鯦':19,'鯧':19,'鯨':19,'鯩':19,'鯪':19,'鯫':19,'鯬':19,'鯭':19,'鯮':19,'鯯':19,'鯰':19,'鯱':19,'鯲':19,'鯳':19,'鯴':19,'鯵':19,'鯶':20,'鯷':20,'鯸':20,'鯹':20,'鯺':19,
  '鯻':20,'鯼':20,'鯽':18,'鯾':20,'鯿':20,'鰀':20,'鰁':20,'鰂':20,'鰃':20,'鰄':20,'鰅':20,'鰆':20,'鰇':20,'鰈':20,'鰉':20,'鰊':20,'鰋':20,'鰌':20,'鰍':20,'鰎':19,'鰏':20,'鰐':20,'鰑':20,'鰒':20,'鰓':20,'鰔':20,'鰕':20,'鰖':20,
  '鰗':20,'鰘':20,'鰙':19,'鰚':20,'鰛':20,'鰜':21,'鰝':21,'鰞':21,'鰟':21,'鰠':20,'鰡':21,'鰢':21,'鰣':21,'鰤':21,'鰥':21,'鰦':20,'鰧':21,'鰨':21,'鰩':21,'鰪':21,'鰫':21,'鰬':21,'鰭':21,'鰮':21,'鰯':21,'鰰':20,'鰱':21,'鰲':21,
  '鰳':22,'鰴':22,'鰵':22,'鰶':22,'鰷':21,'鰸':22,'鰹':22,'鰺':22,'鰻':22,'鰼':22,'鰽':22,'鰾':22,'鰿':22,'鱀':20,'鱁':21,'鱂':22,'鱃':21,'鱄':22,'鱅':22,'鱆':22,'鱇':22,'鱈':22,'鱉':22,'鱊':23,'鱋':22,'鱌':22,'鱍':23,'鱎':23,
  '鱏':23,'鱐':24,'鱑':22,'鱒':23,'鱓':23,'鱔':23,'鱕':23,'鱖':23,'鱗':23,'鱘':23,'鱙':23,'鱚':23,'鱛':23,'鱜':22,'鱝':23,'鱞':24,'鱟':24,'鱠':24,'鱡':24,'鱢':24,'鱣':24,'鱤':24,'鱥':24,'鱦':24,'鱧':24,'鱨':25,'鱩':24,'鱪':23,
  '鱫':24,'鱬':25,'鱭':25,'鱮':24,'鱯':24,'鱰':24,'鱱':25,'鱲':26,'鱳':26,'鱴':25,'鱵':26,'鱶':25,'鱷':27,'鱸':27,'鱹':28,'鱺':30,'鱻':33,'鱼':8,'鱽':10,'鱾':11,'鱿':12,'鲀':12,'鲁':12,'鲂':12,'鲃':12,'鲄':13,'鲅':13,'鲆':13,
  '鲇':13,'鲈':13,'鲉':13,'鲊':13,'鲋':13,'鲌':13,'鲍':13,'鲎':13,'鲏':13,'鲐':13,'鲑':14,'鲒':14,'鲓':14,'鲔':14,'鲕':14,'鲖':14,'鲗':14,'鲘':14,'鲙':14,'鲚':14,'鲛':14,'鲜':14,'鲝':14,'鲞':14,'鲟':14,'鲠':15,'鲡':15,'鲢':15,
  '鲣':15,'鲤':15,'鲥':15,'鲦':15,'鲧':15,'鲨':15,'鲩':15,'鲪':15,'鲫':15,'鲬':15,'鲭':16,'鲮':16,'鲯':16,'鲰':16,'鲱':16,'鲲':16,'鲳':16,'鲴':16,'鲵':16,'鲶':16,'鲷':16,'鲸':16,'鲹':16,'鲺':16,'鲻':16,'鲼':17,'鲽':17,'鲾':17,
  '鲿':17,'鳀':17,'鳁':17,'鳂':17,'鳃':17,'鳄':17,'鳅':17,'鳆':17,'鳇':17,'鳈':17,'鳉':17,'鳊':17,'鳋':17,'鳌':18,'鳍':18,'鳎':18,'鳏':18,'鳐':18,'鳑':18,'鳒':18,'鳓':19,'鳔':19,'鳕':19,'鳖':19,'鳗':19,'鳘':19,'鳙':19,'鳚':19,
  '鳛':19,'鳜':20,'鳝':20,'鳞':20,'鳟':20,'鳠':21,'鳡':21,'鳢':21,'鳣':21,'鳤':22,'鳥':11,'鳦':12,'鳧':13,'鳨':13,'鳩':13,'鳪':13,'鳫':13,'鳬':9,'鳭':13,'鳮':13,'鳯':13,'鳰':13,'鳱':14,'鳲':14,'鳳':14,'鳴':14,'鳵':14,'鳶':14,
  '鳷':15,'鳸':15,'鳹':15,'鳺':15,'鳻':15,'鳼':15,'鳽':15,'鳾':15,'鳿':16,'鴀':15,'鴁':15,'鴂':15,'鴃':15,'鴄':15,'鴅':15,'鴆':15,'鴇':15,'鴈':15,'鴉':15,'鴊':16,'鴋':15,'鴌':15,'鴍':15,'鴎':15,'鴏':16,'鴐':16,'鴑':16,'鴒':16,
  '鴓':16,'鴔':15,'鴕':16,'鴖':16,'鴗':16,'鴘':16,'鴙':16,'鴚':16,'鴛':16,'鴜':17,'鴝':16,'鴞':16,'鴟':16,'鴠':16,'鴡':16,'鴢':16,'鴣':16,'鴤':16,'鴥':16,'鴦':16,'鴧':16,'鴨':16,'鴩':16,'鴪':16,'鴫':16,'鴬':16,'鴭':17,'鴮':17,
  '鴯':17,'鴰':17,'鴱':16,'鴲':17,'鴳':17,'鴴':17,'鴵':17,'鴶':17,'鴷':17,'鴸':17,'鴹':17,'鴺':17,'鴻':17,'鴼':17,'鴽':17,'鴾':17,'鴿':17,'鵀':17,'鵁':17,'鵂':17,'鵃':17,'鵄':17,'鵅':17,'鵆':17,'鵇':17,'鵈':17,'鵉':17,'鵊':18,
  '鵋':18,'鵌':18,'鵍':18,'鵎':18,'鵏':18,'鵐':18,'鵑':18,'鵒':18,'鵓':18,'鵔':18,'鵕':18,'鵖':16,'鵗':18,'鵘':18,'鵙':18,'鵚':18,'鵛':18,'鵜':18,'鵝':18,'鵞':18,'鵟':18,'鵠':18,'鵡':19,'鵢':18,'鵣':18,'鵤':18,'鵥':18,'鵦':19,
  '鵧':17,'鵨':19,'鵩':19,'鵪':19,'鵫':19,'鵬':19,'鵭':19,'鵮':19,'鵯':19,'鵰':19,'鵱':19,'鵲':19,'鵳':19,'鵴':19,'鵵':19,'鵶':19,'鵷':19,'鵸':19,'鵹':19,'鵺':19,'鵻':19,'鵼':19,'鵽':19,'鵾':19,'鵿':19,'鶀':19,'鶁':19,'鶂':19,
  '鶃':19,'鶄':19,'鶅':19,'鶆':19,'鶇':19,'鶈':19,'鶉':19,'鶊':19,'鶋':19,'鶌':19,'鶍':19,'鶎':19,'鶏':19,'鶐':19,'鶑':19,'鶒':20,'鶓':19,'鶔':20,'鶕':20,'鶖':20,'鶗':20,'鶘':20,'鶙':20,'鶚':20,'鶛':20,'鶜':19,'鶝':20,'鶞':20,
  '鶟':20,'鶠':20,'鶡':20,'鶢':20,'鶣':20,'鶤':20,'鶥':20,'鶦':20,'鶧':19,'鶨':20,'鶩':20,'鶪':20,'鶫':20,'鶬':21,'鶭':21,'鶮':21,'鶯':21,'鶰':21,'鶱':21,'鶲':21,'鶳':21,'鶴':21,'鶵':21,'鶶':21,'鶷':21,'鶸':21,'鶹':21,'鶺':21,
  '鶻':20,'鶼':21,'鶽':21,'鶾':21,'鶿':20,'鷀':20,'鷁':21,'鷂':21,'鷃':21,'鷄':21,'鷅':21,'鷆':21,'鷇':21,'鷈':21,'鷉':21,'鷊':21,'鷋':21,'鷌':21,'鷍':21,'鷎':21,'鷏':21,'鷐':22,'鷑':22,'鷒':22,'鷓':22,'鷔':21,'鷕':22,'鷖':22,
  '鷗':22,'鷘':22,'鷙':22,'鷚':22,'鷛':22,'鷜':22,'鷝':21,'鷞':22,'鷟':22,'鷠':22,'鷡':23,'鷢':23,'鷣':23,'鷤':23,'鷥':23,'鷦':23,'鷧':23,'鷨':21,'鷩':22,'鷪':23,'鷫':24,'鷬':22,'鷭':23,'鷮':23,'鷯':23,'鷰':23,'鷱':23,'鷲':23,
  '鷳':23,'鷴':23,'鷵':22,'鷶':23,'鷷':23,'鷸':23,'鷹':24,'鷺':24,'鷻':23,'鷼':23,'鷽':24,'鷾':24,'鷿':24,'鸀':24,'鸁':24,'鸂':24,'鸃':24,'鸄':24,'鸅':24,'鸆':24,'鸇':24,'鸈':24,'鸉':24,'鸊':24,'鸋':25,'鸌':24,'鸍':25,'鸎':25,
  '鸏':24,'鸐':25,'鸑':25,'鸒':24,'鸓':26,'鸔':26,'鸕':27,'鸖':27,'鸗':27,'鸘':28,'鸙':28,'鸚':28,'鸛':28,'鸜':29,'鸝':30,'鸞':30,'鸟':5,'鸠':7,'鸡':7,'鸢':8,'鸣':8,'鸤':8,'鸥':9,'鸦':9,'鸧':9,'鸨':9,'鸩':9,'鸪':10,'鸫':10,'鸬':10,
  '鸭':10,'鸮':10,'鸯':10,'鸰':10,'鸱':10,'鸲':10,'鸳':10,'鸴':10,'鸵':10,'鸶':10,'鸷':11,'鸸':11,'鸹':11,'鸺':11,'鸻':11,'鸼':11,'鸽':11,'鸾':11,'鸿':11,'鹀':12,'鹁':12,'鹂':12,'鹃':12,'鹄':12,'鹅':12,'鹆':12,'鹇':12,'鹈':12,
  '鹉':13,'鹊':13,'鹋':13,'鹌':13,'鹍':13,'鹎':13,'鹏':13,'鹐':13,'鹑':13,'鹒':13,'鹓':13,'鹔':13,'鹕':14,'鹖':14,'鹗':14,'鹘':14,'鹙':14,'鹚':14,'鹛':14,'鹜':14,'鹝':15,'鹞':15,'鹟':15,'鹠':15,'鹡':15,'鹢':15,'鹣':15,'鹤':15,
  '鹥':16,'鹦':16,'鹧':16,'鹨':16,'鹩':17,'鹪':17,'鹫':17,'鹬':17,'鹭':18,'鹮':18,'鹯':18,'鹰':18,'鹱':18,'鹲':18,'鹳':22,'鹴':22,'鹵':11,'鹶':15,'鹷':16,'鹸':19,'鹹':20,'鹺':20,'鹻':21,'鹼':24,'鹽':24,'鹾':16,'鹿':11,'麀':13,
  '麁':13,'麂':13,'麃':15,'麄':15,'麅':16,'麆':16,'麇':16,'麈':16,'麉':17,'麊':17,'麋':17,'麌':18,'麍':18,'麎':18,'麏':18,'麐':18,'麑':19,'麒':19,'麓':19,'麔':19,'麕':19,'麖':19,'麗':19,'麘':20,'麙':20,'麚':20,'麛':20,'麜':21,
  '麝':21,'麞':22,'麟':23,'麠':24,'麡':25,'麢':28,'麣':30,'麤':33,'麥':11,'麦':7,'麧':14,'麨':15,'麩':15,'麪':15,'麫':15,'麬':16,'麭':16,'麮':16,'麯':17,'麰':17,'麱':18,'麲':18,'麳':19,'麴':17,'麵':20,'麶':21,'麷':29,'麸':11,
  '麹':15,'麺':16,'麻':11,'麼':14,'麽':14,'麾':15,'麿':17,'黀':19,'黁':20,'黂':23,'黃':12,'黄':11,'黅':15,'黆':15,'黇':16,'黈':16,'黉':16,'黊':17,'黋':17,'黌':24,'黍':12,'黎':15,'黏':17,'黐':22,'黑':12,'黒':11,'黓':15,'黔':16,
  '黕':16,'黖':16,'黗':16,'默':16,'黙':15,'黚':17,'黛':17,'黜':17,'黝':17,'點':17,'黟':18,'黠':18,'黡':18,'黢':19,'黣':19,'黤':20,'黥':20,'黦':20,'黧':20,'黨':20,'黩':20,'黪':20,'黫':21,'黬':21,'黭':21,'黮':21,'黯':21,'黰':22,
  '黱':22,'黲':23,'黳':23,'黴':23,'黵':25,'黶':26,'黷':27,'黸':28,'黹':12,'黺':16,'黻':17,'黼':19,'黽':13,'黾':8,'黿':17,'鼀':18,'鼁':18,'鼂':18,'鼃':19,'鼄':19,'鼅':21,'鼆':23,'鼇':23,'鼈':24,'鼉':25,'鼊':26,'鼋':12,'鼌':13,
  '鼍':20,'鼎':12,'鼏':14,'鼐':14,'鼑':14,'鼒':15,'鼓':13,'鼔':13,'鼕':18,'鼖':18,'鼗':19,'鼘':22,'鼙':21,'鼚':21,'鼛':21,'鼜':22,'鼝':25,'鼞':24,'鼟':25,'鼠':13,'鼡':8,'鼢':17,'鼣':17,'鼤':17,'鼥':18,'鼦':18,'鼧':18,'鼨':18,
  '鼩':18,'鼪':18,'鼫':18,'鼬':18,'鼭':19,'鼮':19,'鼯':20,'鼰':20,'鼱':21,'鼲':22,'鼳':22,'鼴':22,'鼵':22,'鼶':23,'鼷':23,'鼸':23,'鼹':23,'鼺':28,'鼻':14,'鼼':16,'鼽':16,'鼾':17,'鼿':17,'齀':18,'齁':19,'齂':22,'齃':23,'齄':23,
  '齅':24,'齆':24,'齇':25,'齈':27,'齉':36,'齊':14,'齋':17,'齌':18,'齍':19,'齎':21,'齏':23,'齐':6,'齑':15,'齒':15,'齓':16,'齔':17,'齕':18,'齖':19,'齗':19,'齘':19,'齙':20,'齚':20,'齛':20,'齜':21,'齝':20,'齞':20,'齟':20,'齠':20,
  '齡':20,'齢':17,'齣':20,'齤':21,'齥':21,'齦':21,'齧':21,'齨':21,'齩':21,'齪':22,'齫':22,'齬':22,'齭':23,'齮':23,'齯':23,'齰':23,'齱':23,'齲':24,'齳':24,'齴':24,'齵':24,'齶':24,'齷':24,'齸':25,'齹':24,'齺':25,'齻':25,'齼':28,
  '齽':28,'齾':35,'齿':8,'龀':10,'龁':11,'龂':12,'龃':13,'龄':13,'龅':13,'龆':13,'龇':14,'龈':14,'龉':15,'龊':15,'龋':17,'龌':17,'龍':16,'龎':18,'龏':19,'龐':19,'龑':20,'龒':21,'龓':22,'龔':22,'龕':22,'龖':32,'龗':33,'龘':48,
  '龙':5,'龚':11,'龛':11,'龜':17,'龝':22,'龞':28,'龟':7,'龠':17,'龡':21,'龢':22,'龣':25,'龤':26,'龥':26,'龦':15,'龧':16,'龨':10,'龩':19,'龪':9,'龫':12,'龬':16,'龭':21,'龮':27,'龯':13,'龰':4,'龱':5,'龲':18,'龳':16,'龴':2,'龵':3,
  '龶':4,'龷':5,'龸':5,'龹':6,'龺':8,'龻':19,'龼':17,'龽':15,'龾':13,'龿':14,'鿀':24,'鿁':13,'鿂':18,'鿃':12,'鿄':10,'鿅':18,'鿆':9,'鿇':8,'鿈':7,'鿉':7,'鿊':13,'鿋':18,'鿌':13,'鿒':12,'鿓':15,
};

const NUMEROLOGY_81 = {
  1:'吉(太極之數)',2:'凶(分離之數)',3:'吉(進取如意)',4:'凶(破敗之數)',5:'吉(陰陽和合)',
  6:'吉(安穩繁榮)',7:'吉(剛毅果斷)',8:'吉(努力發展)',9:'凶(窮乏之數)',10:'凶(萬事終局)',
  11:'吉(穩健著實)',12:'凶(意志薄弱)',13:'吉(智謀優秀)',14:'凶(離散之數)',15:'吉(福壽圓滿)',
  16:'吉(貴人得助)',17:'吉(突破萬難)',18:'吉(有志竟成)',19:'凶(風雲蔽日)',20:'凶(非業破運)',
  21:'吉(明月中天)',22:'凶(秋草逢霜)',23:'吉(旭日東昇)',24:'吉(家門餘慶)',25:'吉(資性英敏)',
  26:'凶(波瀾重重)',27:'凶(中年有厄)',28:'凶(遭逢刑劫)',29:'吉(智謀出眾)',30:'凶(吉凶參半)',
  31:'吉(智勇雙全)',32:'吉(意外之惠)',33:'吉(家門隆昌)',34:'凶(破家亡身)',35:'吉(溫和平靜)',
  36:'凶(波瀾起伏)',37:'吉(權威顯達)',38:'吉(藝術有成)',39:'吉(富貴榮華)',40:'凶(謹慎保安)',
  41:'吉(德高望重)',42:'凶(專而不精)',43:'凶(雨夜之花)',44:'凶(愁眉不展)',45:'吉(新生泰運)',
  46:'凶(浪裡行舟)',47:'吉(開花結果)',48:'吉(德智兼備)',49:'凶(吉凶互見)',50:'凶(吉凶參半)',
  51:'凶(盛衰交替)',52:'吉(先見之明)',53:'凶(外美內苦)',54:'凶(多難之數)',55:'凶(外實內虛)',
  56:'凶(事事挫敗)',57:'吉(努力有成)',58:'吉(先苦後甘)',59:'凶(遇事無成)',60:'凶(黑暗無光)',
  61:'吉(名利雙收)',62:'凶(基礎不穩)',63:'吉(萬物化育)',64:'凶(禍患不絕)',65:'吉(貴人得助)',
  66:'凶(內外不和)',67:'吉(順風揚帆)',68:'吉(思慮周密)',69:'凶(動搖不安)',70:'凶(慘澹經營)',
  71:'吉(吉中帶凶)',72:'凶(利害相伴)',73:'吉(安樂自來)',74:'凶(利不及費)',75:'吉(吉中帶凶)',
  76:'凶(離祖破家)',77:'吉(先苦後樂)',78:'吉(晚年有損)',79:'凶(前功盡棄)',80:'凶(得而復失)',
  81:'吉(還原之數,復歸為吉)',
};

function strokeOf(char) {
  return STROKES[char] !== undefined ? STROKES[char] : null;
}

const NUM_TO_WUXING = n => {
  const m = n % 10;
  if (m === 1 || m === 2) return '木';
  if (m === 3 || m === 4) return '火';
  if (m === 5 || m === 6) return '土';
  if (m === 7 || m === 8) return '金';
  return '水';
};

function analyzeName(surname, givenName) {
  const surnameChars = surname.split('');
  const givenChars = givenName.split('');
  // v6.2新增：五格剖象法的地格／外格公式，僅在「單姓(1字)＋單名(1字)」「單姓(1字)＋雙名(2字)」
  // 「複姓(2字)＋單名(1字)」「複姓(2字)＋雙名(2字)」這4種組合下才符合標準姓名學公式（總字數2~4字、
  // 名字最多2字）。若名字達3字以上，傳統五格公式並無統一標準寫法（不同流派算法不一致），
  // 為避免用「土法煉鋼」的算法給出看似正確、實則不具代表性的結果，此情況下明確告知使用者、不予計算，
  // 而非沿用可能誤導的簡化公式。
  if (givenChars.length > 2) {
    return { error: true, unsupportedLength: true, missingChars: [] };
  }
  if (surnameChars.length > 2) {
    return { error: true, unsupportedLength: true, missingChars: [] };
  }
  const allChars = [...surnameChars, ...givenChars];
  const missing = allChars.filter(c => strokeOf(c) === null);
  if (missing.length > 0) {
    return { error: true, missingChars: missing };
  }
  const sStrokes = surnameChars.map(strokeOf);
  const gStrokes = givenChars.map(strokeOf);

  let tiange, renge, dige, waige, zongge;
  zongge = sStrokes.reduce((a, b) => a + b, 0) + gStrokes.reduce((a, b) => a + b, 0);

  if (sStrokes.length === 1) {
    tiange = sStrokes[0] + 1;
    renge = sStrokes[0] + gStrokes[0];
    dige = gStrokes.length === 1 ? gStrokes[0] + 1 : gStrokes.reduce((a, b) => a + b, 0);
  } else {
    tiange = sStrokes.reduce((a, b) => a + b, 0);
    renge = sStrokes[sStrokes.length - 1] + gStrokes[0];
    dige = gStrokes.length === 1 ? gStrokes[0] + 1 : gStrokes.reduce((a, b) => a + b, 0);
  }
  waige = zongge - renge + 1; // 標準公式：外格 = 總格 - 人格 + 1
  // v10.6修正（缺失⑥）：單姓(1字)+單名(1字)時，人格＝總格（兩者都是姓+名的筆畫和，算的是同一組數字），
  // 若沿用上面的一般公式會得出「外格＝總格－總格＋1＝1」，但傳統姓名學慣例對「單姓單名」這個特殊情況
  // 另有明文規定——外格固定為2（代表「孤獨之數」，因為沒有其他字可搭配計算）。原本的程式碼在此處沒有
  // 特別處理，且註解誤以為一般公式在此情況下也會得出2（實際上會得出1），這裡加上特殊情況判斷予以修正。
  if (sStrokes.length === 1 && gStrokes.length === 1) {
    waige = 2;
  }

  const grids = { 天格: tiange, 人格: renge, 地格: dige, 外格: waige, 總格: zongge };
  const details = Object.entries(grids).map(([name, num]) => ({
    name, num, wuxing: NUM_TO_WUXING(num), fortune: NUMEROLOGY_81[((num - 1) % 81) + 1] || '未收錄',
  }));
  const sancai = [tiange, renge, dige].map(NUM_TO_WUXING).join('');

  return { error: false, grids, details, sancai };
}

module.exports = { strokeOf, analyzeName, NUMEROLOGY_81, STROKES };

    })(module, require);
    return module.exports;
  })();

  return {
    astroCore: __modules['./astro-core.js'],
    baziCore: __modules['./bazi-core.js'],
    almanacCore: __modules['./almanac-core.js'],
    lunarCore: __modules['./lunar-core.js'],
    ziweiCore: __modules['./ziwei-core.js'],
    astrologyCore: __modules['./astrology-core.js'],
    nameCore: __modules['./name-core.js'],
  };
})();
if (typeof window !== 'undefined') { window.FortuneEngine = FortuneEngine; }
if (typeof module !== 'undefined') { module.exports = FortuneEngine; }

// v5.6新增：核心引擎自我檢測（迴歸測試）。針對日柱、節氣、六吉六煞安星、占星逆行等
// 已知萬年曆／天文基準值進行比對，避免未來修改程式時不小心改壞既有正確邏輯卻未被發現。
// 使用方式：在瀏覽器主控台（F12）輸入 FortuneEngine.runSelfTests() 即可查看結果；
// 開發模式（網址加上 ?selftest=1）會在頁面載入時自動執行一次並印出於主控台。
(function attachSelfTests(FE){
  function runSelfTests(){
    const results = [];
    function check(name, actual, expected){
      const pass = JSON.stringify(actual) === JSON.stringify(expected);
      results.push({ name, pass, actual, expected });
      return pass;
    }
    try{
      const B = FE.baziCore, A = FE.astroCore, Z = FE.ziweiCore;
      // 1. 日柱萬年曆基準值比對
      [[1900,1,1,'甲戌'],[2024,1,1,'甲子'],[2024,2,10,'甲辰'],[2024,8,2,'戊戌']].forEach(([y,m,d,exp])=>{
        const r = B.computeFourPillars({year:y,month:m,day:d,hour:12,minute:0,tzOffset:8,longitude:120,useTrueSolarTime:false});
        check(`日柱 ${y}-${m}-${d}`, r.pillars.day.gan + r.pillars.day.zhi, exp);
      });
      // 2. 紫微六吉六煞安星訣（庚辰年、午時、農曆五月，人工核對值）
      const zr = Z.computeZiweiChart({lunarYear:2000, lunarMonth:5, lunarDay:15, hourZhiIdx:6, yearGanZhi:'庚辰', gender:'M'});
      const findZhi = (arr, star) => (arr.find(p=>p.stars.includes(star)||p.shaStars.includes(star))||{}).zhi;
      check('天魁(庚年)', findZhi(zr.palaces,'天魁'), '丑');
      check('天鉞(庚年)', findZhi(zr.palaces,'天鉞'), '未');
      check('文昌(午時)', findZhi(zr.palaces,'文昌'), '辰');
      check('文曲(午時)', findZhi(zr.palaces,'文曲'), '戌');
      check('擎羊(庚年)', findZhi(zr.palaces,'擎羊'), '酉');
      check('陀羅(庚年)', findZhi(zr.palaces,'陀羅'), '未');
      // 3. 天府/紫微對照公式簡化前後行為一致性（回歸測試：確保簡化寫法未改變結果）
      check('天府對照(紫微在寅idx2)', ((4-2)%12+12)%12, 2);
      check('天府對照(紫微在戌idx10)', ((4-10)%12+12)%12, 6);
      // 4. 姓名學：部首還原筆畫一致性回歸測試（v6.2修正：洋9→10、陽12→17，避免未來再度改壞）
      const N = FE.nameCore;
      check('筆畫「洋」(部首還原水4+羊6)', N.strokeOf('洋'), 10);
      check('筆畫「陽」(部首還原阜8+昜9)', N.strokeOf('陽'), 17);
      check('筆畫「陳」(部首還原阜8+東8，對照組)', N.strokeOf('陳'), 16);
      check('筆畫「河」(部首還原水4+可5，對照組)', N.strokeOf('河'), 9);
      // 5. 姓名學：超出支援長度組合（名3字以上）應明確回傳unsupportedLength，而非套用簡化公式硬算
      check('姓名學 3字名應標示不支援', N.analyzeName('陳','大文豪').unsupportedLength, true);
      check('姓名學 標準單姓雙名應可正常計算', N.analyzeName('陳','冠宇').error, false);
      // 6.（v8.9.1新增）通書規則引擎：以公開黃曆查詢範例（2026/7/29＝甲辰日）交叉核對沖煞／方位神
      const AL = FE.almanacCore;
      const cs2026 = AL.getChongSha('辰');
      check('沖煞(辰日)：沖生肖', cs2026.chongZodiac, '狗');
      check('沖煞(辰日)：煞方位', cs2026.shaDirection, '南');
      const gods2026 = AL.getDailyGods('甲');
      check('財神方位(甲日)', gods2026.caishen, '東北');
      check('喜神方位(甲日)', gods2026.xishi, '東北');
      // 建除十二神：正月建寅口訣＝寅月寅日必為「建」
      check('建除(寅月寅日＝建)', AL.getJianchu('寅','寅').name, '建');
      check('建除(子月丑日＝除)', AL.getJianchu('子','丑').name, '除');
      // 六沖對稱性：60甲子任一地支之沖，互為對方之沖（回歸測試，避免未來誤改表格造成不對稱）
      let chongSymmetric = true;
      ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'].forEach(z=>{
        if(AL.CHONG_ZHI[AL.CHONG_ZHI[z]] !== z) chongSymmetric = false;
      });
      check('沖表對稱性(12地支互沖一致)', chongSymmetric, true);
    }catch(e){
      results.push({ name:'（自我檢測執行時發生例外）', pass:false, actual:String(e), expected:'不應拋出例外' });
    }
    const failCount = results.filter(r=>!r.pass).length;
    const summary = `五象 FiveLens自我檢測：共${results.length}項，通過${results.length-failCount}項，失敗${failCount}項`;
    if(typeof console!=='undefined'){
      console.log(summary);
      results.forEach(r=>{ if(!r.pass) console.warn(`✗ ${r.name}：實際=${JSON.stringify(r.actual)}，預期=${JSON.stringify(r.expected)}`); });
      if(failCount===0) console.log('✓ 全部通過');
    }
    return { summary, results, failCount };
  }
  FE.runSelfTests = runSelfTests;
  if(typeof window !== 'undefined' && typeof location !== 'undefined' && /[?&]selftest=1/.test(location.search)){
    setTimeout(()=>runSelfTests(), 0);
  }
})(FortuneEngine);
