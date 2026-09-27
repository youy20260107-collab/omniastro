# FiveLens v10.12.0 最終自我驗證

## 已完成
- Google 登入後自動檢查基本資料。
- 基本資料未完成時，開啟可拖曳、可調整大小的浮動視窗。
- 測試模式：`?mode=test`，不需 Google 登入即可建立本機測試資料。
- 基本資料完成後，28 大功能與 AI 智能區不再出現無聲無息的點擊狀態。
- 會員中心改為真正顯示帳號、資料完成度與命盤數量。
- `profile`、`data`、`admin-status`、`log-login`、`get-login-logs`、`get-all-user-charts` Netlify Functions 已加入。
- 正式會員資料與命盤存摺透過 Netlify Blobs 保存；測試模式資料只存目前瀏覽器。
- 管理員後端以 `felix670131@gmail.com` 再次驗證權限。
- 文字／背景使用深色文字配白色卡片、白色文字配深藍標題列，避免低對比。
- Footer 移除舊版 v10.11 版本免責文字。

## 程式驗證
- 所有 inline JavaScript 通過 `node --check`。
- 所有 Netlify Functions `.mjs` 通過 `node --check`。
- HTML ID 無重複。
- 正式環境不使用「測試模式・未登入」徽章；該文字僅在 `?mode=test` 測試模式顯示。
- ZIP `unzip -t` 通過。

## 真實部署必要條件
1. Netlify 啟用 Identity。
2. Identity > External providers 啟用 Google。
3. Netlify 部署本資料夾內容，讓 `netlify/functions` 一併部署。
4. 首次正式登入後完成基本資料。
5. 管理員 `felix670131@gmail.com` 登入後才會看到管理入口。
