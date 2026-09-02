// netlify/functions/get-login-logs.js
//
// 這是給「管理者」查看登入紀錄用的 API：
//   GET /.netlify/functions/get-login-logs
// 前端呼叫時要帶著登入者的 JWT（見下方 admin 面板範例），
// 函式會檢查這個人的 Netlify Identity 帳號是否有 "admin" 角色，
// 沒有的話一律回 401，避免任何登入使用者都能看到別人的登入紀錄。

const { getStore, connectLambda } = require('@netlify/blobs');

exports.handler = async (event, context) => {
  // 同樣要先呼叫 connectLambda(event)，Netlify Blobs 才能正常運作。
  connectLambda(event);

  const user = context.clientContext && context.clientContext.user;
  const roles = (user && user.app_metadata && user.app_metadata.roles) || [];

  if (!user || !roles.includes('admin')) {
    return { statusCode: 401, body: JSON.stringify({ error: '沒有權限查看登入紀錄' }) };
  }

  try {
    const store = getStore('login-logs');
    const { blobs } = await store.list();

    const records = await Promise.all(
      blobs.map((b) => store.get(b.key, { type: 'json' }))
    );

    // 新的登入排前面
    records.sort((a, b) => (b?.loginAt || '').localeCompare(a?.loginAt || ''));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(records),
    };
  } catch (err) {
    console.error('[get-login-logs] 讀取失敗：', err);
    return { statusCode: 500, body: JSON.stringify({ error: '讀取登入紀錄失敗' }) };
  }
};
