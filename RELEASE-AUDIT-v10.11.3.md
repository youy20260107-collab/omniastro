# 五象 FiveLens v10.11.3 修正版測試說明

本版依前一輪完整程式邏輯檢查報告修正，原則是只改必要程式，不改動命盤計算核心與無關 UI。

## 已修正
- AI 全域安全流量 Governor：14 RPM、49 RPD、19,000 TPM 安全值。
- AI 請求佇列與單次請求鎖，避免快速連按造成並發請求。
- AI 60 秒 timeout；429、408、每日額度與等待超時均有友善訊息。
- AI 對話歷史限制為最近 12 則，避免 TPM 無限累積。
- AI Provider 在每次請求開始時固定快照，避免切換 Provider 的非同步競態。
- 模型清單請求也經過同一安全流量層。
- 經緯度 0/0 不再被錯誤當成空值改成台北預設座標。
- 命盤 JSON 匯入增加 schema、ID、日期、時間、經緯度、備註長度與 2MB 檔案驗證。
- 命盤匯入總數限制 50 筆，避免大量資料造成 localStorage/UI 壓力。
- 命盤存摺 data-id 輸出使用 HTML escape。
- 雲端同步讀取失敗時不再把空資料誤寫回雲端。
- 雲端命盤寫入加入序列化佇列，降低多次快速儲存互相覆蓋的競態。
- 雲端同步成功/失敗狀態修正，不再在寫入失敗時顯示「已同步」。
- Netlify Identity API 呼叫統一使用 `await user.jwt()` 取得最新 JWT。
- 管理者前端入口改由後端 `admin-status` 依 `ADMIN_EMAILS` 判斷，不再前端寫死單一信箱。

## 保留
- FiveLens 品牌名稱。
- 五象主視覺。
- v10.10 更新記錄移除。
- Agnes 2.5 Flash 預設模型與可手動輸入新模型。
- NVIDIA NIM、GroqCloud、OpenRouter、Mistral AI Studio。
- 免費模型不寫死，可取得模型清單或手動輸入。
- 原命盤計算核心與 28 個功能頁籤。

## 驗證
- HTML 內 3 個 inline JavaScript 區塊通過 `node --check`。
- `script0.js`、`script2.js` 通過 `node --check`。
- `netlify/functions/admin-status.js` 通過 `node --check`。
- HTML ID 無重複。
- 未發現外部 script src（網站核心 JS 為 inline）。

## 流量限制說明
本版是「主動遵守安全上限」，不是繞過原廠限制。超過安全值會排隊、延後或停止，不會自動輪替 API Key 以規避原廠 quota。
