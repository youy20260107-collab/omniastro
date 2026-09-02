// netlify/functions/get-all-user-charts.js
//
// 管理員專用 API：
//   GET /.netlify/functions/get-all-user-charts
// 回傳「所有」使用者的命盤存摺資料（不是只有自己的），給管理者查看/客服使用。
//
// v10.2 改版：管理者判斷改用 Netlify 環境變數 ADMIN_EMAILS（跟 get-login-logs.js
// 同一套邏輯），不再用 app_metadata.roles，改完環境變數馬上生效、不用重新登入。
//
// email 對照表是透過 Netlify 提供給函式的「管理員短效權杖」
// （context.clientContext.identity）去查 Identity 的使用者名單取得，
// 不需要另外存一份 userId→email 的對照表。

const { getStore, connectLambda } = require('@netlify/blobs');

exports.handler = async (event, context) => {
  connectLambda(event);

  const user = context.clientContext && context.clientContext.user;
  if (!user || !user.sub) {
    return jsonResponse(401, { error: '尚未登入' });
  }

  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (adminEmails.length === 0) {
    return jsonResponse(403, {
      error: '尚未設定管理者名單。請到 Netlify 後台 Project configuration → ' +
        'Environment variables，新增 ADMIN_EMAILS（值填你的登入信箱），存檔後重新部署一次網站。',
    });
  }

  const myEmail = (user.email || '').toLowerCase();
  if (adminEmails.indexOf(myEmail) === -1) {
    return jsonResponse(403, { error: '這個帳號沒有查看使用者資料的權限' });
  }

  try {
    // 1) 取得所有使用者的 email 對照表（userId -> email）
    const emailMap = await fetchAllUserEmails(context);

    // 2) 掃描所有使用者的命盤存摺資料
    const store = getStore('zhenmingpan-user-data');
    const { blobs } = await store.list();
    const chartBlobs = blobs.filter((b) => b.key.endsWith('/savedCharts'));

    const results = await Promise.all(
      chartBlobs.map(async (b) => {
        const userId = b.key.slice(0, -'/savedCharts'.length);
        const raw = await store.get(b.key, { type: 'json' });
        const list = (raw && Array.isArray(raw.list)) ? raw.list : [];
        return {
          userId,
          email: emailMap[userId] || '(找不到對應的 email)',
          updatedAt: (raw && raw.updatedAt) || null,
          chartCount: list.length,
          charts: list,
        };
      })
    );

    results.sort((a, b) => (b.updatedAt || '').toString().localeCompare((a.updatedAt || '').toString()));

    return jsonResponse(200, results);
  } catch (err) {
    console.error('[get-all-user-charts] 讀取失敗：', err);
    return jsonResponse(500, { error: '讀取失敗：' + (err && err.message ? err.message : String(err)) });
  }
};

// 透過 Netlify 提供的管理員短效權杖，呼叫 GoTrue Admin API 列出所有使用者，
// 建立 userId(sub) -> email 的對照表。有分頁保護，最多抓 1000 人，避免無窮迴圈。
async function fetchAllUserEmails(context) {
  const identity = context.clientContext && context.clientContext.identity;
  const map = {};
  if (!identity || !identity.url || !identity.token) return map;

  let page = 1;
  const perPage = 100;
  for (let i = 0; i < 10; i++) {
    const res = await fetch(`${identity.url}/admin/users?per_page=${perPage}&page=${page}`, {
      headers: { Authorization: 'Bearer ' + identity.token },
    });
    if (!res.ok) break;
    const data = await res.json();
    const list = Array.isArray(data) ? data : (data.users || []);
    if (list.length === 0) break;
    list.forEach((u) => { if (u && u.id) map[u.id] = u.email; });
    if (list.length < perPage) break;
    page++;
  }
  return map;
}

function jsonResponse(statusCode, bodyObj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyObj),
  };
}
