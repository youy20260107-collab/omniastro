// netlify/functions/get-login-logs.js
//
// 管理員專用 API：GET /.netlify/functions/get-login-logs
//
// v10.2 改版：判斷「誰是管理者」的方式改成 Netlify 環境變數 ADMIN_EMAILS，
// 不再用 app_metadata.roles。原因：roles 是存在使用者的登入權杖（JWT）裡，
// 後台改了角色之後，一定要「登出再重新登入」權杖才會更新，容易搞混、卡關；
// 環境變數是伺服器每次即時讀取，改完存檔、重新整理頁面就生效，不用重新登入。
//
// 設定方式：Netlify 後台 → Project configuration → Environment variables，
// 新增一筆 ADMIN_EMAILS，值填你的登入信箱（多個管理者用逗號分隔，
// 例如 "felix670131@gmail.com,other@gmail.com"），存檔後重新部署一次網站。

const { getStore, connectLambda } = require("@netlify/blobs");

const MAX_RECORDS = 300;

exports.handler = async (event, context) => {
  try {
    connectLambda(event);

    if (event.httpMethod !== "GET") {
      return jsonResponse(405, { error: "不支援的方法" });
    }

    const user = context.clientContext && context.clientContext.user;
    if (!user || !user.sub) {
      return jsonResponse(401, { error: "尚未登入。" });
    }

    const adminEmails = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    if (adminEmails.length === 0) {
      return jsonResponse(403, {
        error: "尚未設定管理者名單。請到 Netlify 後台 Project configuration → " +
          "Environment variables，新增 ADMIN_EMAILS（值填你的登入信箱），存檔後重新部署一次網站。",
      });
    }

    const myEmail = (user.email || "").toLowerCase();
    if (adminEmails.indexOf(myEmail) === -1) {
      return jsonResponse(403, { error: "這個帳號沒有查看登入紀錄的權限。" });
    }

    const store = getStore("zhenmingpan-login-logs");
    const listResult = await store.list();
    let keys = (listResult && listResult.blobs) ? listResult.blobs.map((b) => b.key) : [];
    keys.sort().reverse();
    keys = keys.slice(0, MAX_RECORDS);

    const records = [];
    for (const key of keys) {
      try {
        const raw = await store.get(key);
        if (raw) records.push(JSON.parse(raw));
      } catch (e) {
        // 單筆壞資料跳過，不要讓整份清單讀不出來
      }
    }
    return jsonResponse(200, { records });
  } catch (err) {
    console.error("[get-login-logs] 讀取失敗：", err);
    return jsonResponse(500, { error: "讀取失敗：" + (err && err.message ? err.message : String(err)) });
  }
};

function jsonResponse(statusCode, bodyObj) {
  return {
    statusCode: statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyObj),
  };
}
