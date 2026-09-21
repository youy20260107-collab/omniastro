# 五象 FiveLens v10.11 — Netlify 部署套件

## 這個壓縮檔裡有什麼

```
index.html                              ← 網站首頁（五象 FiveLens本體）
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


---

## v10.11 AI API Key / 模型模組更新

本版已統一 AI Provider 設定，文字 AI、手相／面相影像 AI、以及行銷 AI 文案三條呼叫路徑共用同一組 Provider／API Key／模型設定。

目前支援：

- Claude（Anthropic）
- ChatGPT（OpenAI）
- Gemini（Google AI Studio）
- Agnes AI（OpenAI 相容；預設 `agnes-2.5-flash`，可手動輸入 `agnes-3.0-flash`）
- NVIDIA NIM
- GroqCloud
- OpenRouter
- Mistral AI Studio

### 模型不再鎖死

需要模型名稱的 Provider 都保留可編輯的模型輸入框；支援官方 `/models` 的 Provider 另外提供「取得模型清單」功能。使用者可以直接輸入原廠新模型，不必等待網站程式更新。OpenRouter 預設使用 `openrouter/free` 動態路由，因此不綁定單一免費模型。

### 免費方案說明

「免費 API」是指原廠目前提供免費層、免費 endpoint 或免費模型路由的服務，不代表每一個模型、每一個帳戶、每一種請求都永久免費。實際額度、速率限制、模型可用性以各原廠最新政策為準。網站不內建或共享任何第三方 API Key，使用者必須自行貼上自己的 Key。

### 瀏覽器直連注意事項

網站原本採 BYOK（Bring Your Own Key）架構：Key 僅儲存在使用者瀏覽器本機，AI 請求直接送往所選原廠 API，不經本站後端。部分原廠或特定網路環境可能限制瀏覽器跨來源請求（CORS）；若發生此情況，介面會提示連線失敗，仍可先用模型名稱手動設定，或日後再加官方／自有後端 Proxy。
