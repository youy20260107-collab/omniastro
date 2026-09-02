// netlify/functions/identity-login.js
//
// 這支函式的「檔名」就是觸發條件：只要檔名叫 identity-login.js，
// Netlify 就會在「每一次」有人透過 Netlify Identity 登入成功時（包含用 Google 登入）
// 自動呼叫這支函式一次，不需要前端自己呼叫。
//
// 用途：把這次登入的 email / 登入時間 / 使用的登入方式（google/email）
// 寫進 Netlify Blobs（Netlify 內建的免設定資料儲存，不用另外申請資料庫)。

const { getStore, connectLambda } = require('@netlify/blobs');

exports.handler = async (event) => {
  // 用 exports.handler（Lambda 相容模式）時，Netlify Blobs 不會自動注入連線資訊，
  // 一定要在 getStore() 之前先呼叫 connectLambda(event)，否則會出現
  // MissingBlobsEnvironmentError。
  connectLambda(event);

  try {
    const body = JSON.parse(event.body || '{}');
    // Netlify 觸發時，事件內容會放在 payload 裡
    const user = body.user || body.payload || {};

    const email = user.email || 'unknown';
    const userId = user.id || null;
    const provider = (user.app_metadata && user.app_metadata.provider) || 'email';
    const loginAt = new Date().toISOString();

    const store = getStore('login-logs');
    // key 用「時間_email」，list 出來時天然就會照時間排序
    const key = `${loginAt}__${email}`;

    await store.setJSON(key, { email, userId, provider, loginAt });

    // 一定要回 200，避免因為記錄失敗反而擋掉使用者正常登入
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('[identity-login] 寫入登入紀錄失敗：', err);
    return { statusCode: 200, body: JSON.stringify({ ok: false }) };
  }
};
