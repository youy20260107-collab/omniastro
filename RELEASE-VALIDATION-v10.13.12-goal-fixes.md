# FiveLens v10.13.12 Goal Fixes

## 本版修正
1. 管理者登入紀錄回傳欄位與前端讀取欄位統一（records / ts，同時相容舊 logs / loginAt）。
2. 管理者使用者資料改為回傳 users，並同時包含 profiles 與 savedCharts；管理面板可直接查看基本資料。
3. 基本資料只在登入後的 Profile Gate 儲存一次；儲存成功會同步主排盤表單與出生地，避免再次輸入。
4. 全站 AI 功能共用同一份已儲存 API Key；已有 Key 時 AI 白話追問／手相面相不再要求重填，改由 AI 智能設定更換。
5. 登入紀錄改為每個帳號／分頁各自記錄，避免同一瀏覽器切換帳號後被舊 session flag 錯誤擋住。

## 另外檢查出的邏輯缺口
- Admin endpoint 與前端 response schema 曾不一致。
- Admin 資料 API 曾只讀命盤，不讀 profiles。
- Profile Gate 與主排盤表單存在兩套輸入狀態。
- AI 功能存在多個 API Key 輸入點，沒有真正以單一設定為來源。
- login logging sessionStorage flag 未綁定 user id。
