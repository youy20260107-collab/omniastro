// netlify/functions/log-login.js
//
// v10.2 取代原本的 identity-login.js。
//
// 差異很關鍵：這支函式「不是」Netlify 保留給登入流程用的特殊檔名，
// 不會被接進 Google 登入的必經流程裡。前端會在使用者「已經登入成功」之後，
// 才主動呼叫這支 API 去記一筆登入紀錄（見 index.html 裡的 recordLoginOnce）。
// 就算這支函式出任何錯，使用者早就已經登入成功了，不會被連帶擋住——
// 這正是原本 identity-login.js 會出現 "Failed to handle signup webhook"
// 導致整個登入失敗的原因：那個檔名會被 Netlify 當成登入的必經關卡。

const { getStore, connectLambda } = require("@netlify/blobs");

exports.handler = async (event, context) => {
  try {
    connectLambda(event);

    if (event.httpMethod !== "POST") {
      return jsonResponse(405, { error: "不支援的方法" });
    }

    // 只信任 Netlify Identity 驗證過的登入身分，前端無法偽造成別人。
    const user = context.clientContext && context.clientContext.user;
    if (!user || !user.sub) {
      return jsonResponse(401, { error: "尚未登入，無法記錄登入事件。" });
    }

    const store = getStore("zhenmingpan-login-logs");

    const meta = user.user_metadata || {};
    const appMeta = user.app_metadata || {};
    const record = {
      ts: new Date().toISOString(),
      userId: user.sub,
      email: user.email || "",
      name: meta.full_name || meta.name || "",
      provider: appMeta.provider || (Array.isArray(appMeta.providers) ? appMeta.providers.join(",") : "") || "",
      ip: (event.headers && (event.headers["x-nf-client-connection-ip"] || event.headers["client-ip"])) || "",
    };

    // key 用「時間戳記-亂數」，字串排序就等於時間排序，亂數尾巴避免同一瞬間互相覆蓋。
    const key = Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    await store.set(key, JSON.stringify(record));

    return jsonResponse(200, { ok: true });
  } catch (err) {
    console.error("[log-login] 寫入登入紀錄失敗：", err);
    // 就算真的出錯也回 200：記錄登入這件事本身不該讓使用者卡在任何地方。
    return jsonResponse(200, { ok: false });
  }
};

function jsonResponse(statusCode, bodyObj) {
  return {
    statusCode: statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyObj),
  };
}
