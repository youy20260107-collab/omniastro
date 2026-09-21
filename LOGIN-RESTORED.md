# FiveLens v10.11.13

已恢復 Google 帳號登入驗證：
- TEMP_DISABLE_LOGIN = false
- 保留 Netlify Identity widget
- 保留 Google 登入按鈕與 login/logout handlers

注意：本機 file:// 開啟無法實際完成 Netlify Identity 登入；請部署到 Netlify 網站後測試。Netlify 後台仍需啟用 Identity，並啟用 Google 外部登入 Provider。
