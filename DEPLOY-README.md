# 真命盤 v10.2 — Netlify 部署套件

## 這個壓縮檔裡有什麼

```
index.html                              ← 網站首頁（真命盤本體）
netlify.toml                            ← Netlify 部署設定
package.json                            ← 宣告 Functions 需要的套件
netlify/functions/data.js               ← 命盤存摺雲端同步 API
netlify/functions/log-login.js          ← 記錄登入事件（登入成功後才呼叫，不會擋登入）
netlify/functions/get-login-logs.js     ← 管理員專用：查看登入紀錄
netlify/functions/get-all-user-charts.js← 管理員專用：查看所有使用者的命盤資料
```

**沒有 `identity-login.js`**——這是刻意的。舊版用這個特殊檔名會被 Netlify
接進 Google 登入的必經流程，只要一出狀況就會讓整個登入失敗
（`Failed to handle signup webhook`）。這個版本改用 `log-login.js`，
在使用者登入成功「之後」才呼叫，不會影響登入本身。

如果你的 GitHub 上還留著舊的 `netlify/functions/identity-login.js`，
**部署前務必先手動刪除它**，這個壓縮檔不會自動幫你刪掉舊倉庫裡的檔案。

---

## 部署步驟

### 1. 上傳到 GitHub

把這個壓縮檔解壓縮後，**整個資料夾結構**（含 `netlify` 子資料夾）上傳到你的
GitHub repository，維持一樣的資料夾層級，不要打散或改路徑。

如果你是用「Add file → Upload files」網頁介面上傳，記得同時勾選/拖入
`netlify/functions/` 底下的 4 個檔案，讓它們維持在正確的子資料夾裡。

如果原本的 repo 已經有一份舊版（`identity-login.js`、舊版 `index.html` 等），
上傳這批新檔案時記得順手刪除舊的 `netlify/functions/identity-login.js`。

### 2. 設定管理員名單（環境變數）

Netlify 後台 → **Project configuration → Environment variables** → 新增一筆：

| Key | Value |
|---|---|
| `ADMIN_EMAILS` | `felix670131@gmail.com` |

多個管理者用逗號分隔，例如 `a@gmail.com,b@gmail.com`。

### 3. 觸發重新部署

存完環境變數，Netlify 通常會提示「需要重新部署才會生效」，照著做一次
（或直接去 GitHub 那邊隨便改一個空白 commit 也會觸發）。

### 4. 測試

- 用一般使用者 Google 帳號登入 → 應該正常，不受影響
- 用 felix670131@gmail.com 登入 → 這次應該**不會**再出現 `server_error`
- 登入後右上角應該出現「管理者專用入口」，不用重新登入就會生效
- 點開確認「登入紀錄」「所有使用者資料」都看得到內容
- 存一筆命盤 → 換裝置登入同帳號 → 應該看得到剛剛存的那筆
