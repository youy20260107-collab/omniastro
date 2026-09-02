// netlify/functions/data.js
//
// 真命盤的後端資料儲存 API（跟 LifeCompass 用同一套架構）。
// 部署到 Netlify 後會變成一個網址：/.netlify/functions/data
// 前端用 zmpServerStorageGet / zmpServerStorageSet 呼叫這支函式，
// 目前用來同步「命盤存摺」，讓使用者換裝置登入後也看得到已存的命盤。
//
// 資料存在 Netlify Blobs（Netlify 內建儲存空間，不用另外申請帳號或金鑰）。
//
// 安全機制：
// 只信任 Netlify Identity 驗證過的登入身分（context.clientContext.user），
// 前端每次呼叫都要帶登入後拿到的權杖（JWT）；沒登入或權杖無效一律回 401。
// 資料用「使用者帳號 ID + 資料項目名稱」當鍵值，不同使用者的資料完全分開。

const { getStore, connectLambda } = require("@netlify/blobs");

exports.handler = async (event, context) => {
  // exports.handler（Lambda 相容模式）下，Netlify Blobs 不會自動注入連線資訊，
  // 一定要在 getStore() 之前先呼叫 connectLambda(event)，
  // 否則會出現 MissingBlobsEnvironmentError。
  connectLambda(event);

  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "不支援的方法" });
  }

  const user = context.clientContext && context.clientContext.user;
  if (!user || !user.sub) {
    return jsonResponse(401, { error: "尚未登入或登入已過期，請重新整理頁面再試一次。" });
  }
  const userId = user.sub;

  let store;
  try {
    // 所有使用者共用同一個「儲存空間」（zhenmingpan-user-data），
    // 每筆資料的鍵值都加上使用者 ID 當前綴，資料彼此不會互相看到。
    store = getStore("zhenmingpan-user-data");
  } catch (err) {
    return jsonResponse(500, { error: "儲存空間初始化失敗：" + describeError(err) });
  }

  try {
    if (event.httpMethod === "GET") {
      const key = event.queryStringParameters && event.queryStringParameters.key;
      if (!key) return jsonResponse(400, { error: "缺少 key 參數" });

      const raw = await store.get(blobKey(userId, key));
      const value = raw ? JSON.parse(raw) : null;
      return jsonResponse(200, { value: value });
    }

    // POST：寫入資料
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch (e) {
      return jsonResponse(400, { error: "請求格式錯誤，body 必須是合法的 JSON" });
    }
    const key = body.key;
    if (!key) return jsonResponse(400, { error: "缺少 key 參數" });

    const value = body.value === undefined ? null : body.value;
    await store.set(blobKey(userId, key), JSON.stringify(value));
    return jsonResponse(200, { ok: true });
  } catch (err) {
    return jsonResponse(500, { error: "伺服器錯誤：" + describeError(err) });
  }
};

function blobKey(userId, key) {
  return userId + "/" + key;
}

function jsonResponse(statusCode, bodyObj) {
  return {
    statusCode: statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyObj),
  };
}

function describeError(err) {
  return err && err.message ? err.message : String(err);
}
