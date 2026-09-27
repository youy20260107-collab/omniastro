# FiveLens v10.12 登入與資料架構

- 正式環境：Netlify Identity / Google 登入 → Profile Gate → 完成基本資料後使用核心功能。
- 測試環境：網址加 `?mode=test`，不需要 Google 登入；資料只存在目前瀏覽器，方便測試。
- 正式會員基本資料：Netlify Function `/.netlify/functions/profile` + Netlify Blobs `profiles/<Identity user id>`。
- 命盤存摺：`/.netlify/functions/data` + Netlify Blobs `users/<Identity user id>/savedCharts`。
- 管理者：`felix670131@gmail.com`，後端再次驗證，不只依賴前端隱藏按鈕。
- 登入紀錄：`loginlogs/<timestamp>-<uuid>`。
