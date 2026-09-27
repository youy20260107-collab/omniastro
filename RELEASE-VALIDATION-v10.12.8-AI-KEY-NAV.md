# 五象 FiveLens v10.12.8 — AI Key 導覽邏輯驗證

## 修正
- AI 智能區導覽不再只檢查目前選取的 provider。
- 只要任一 AI provider 已儲存且可解碼的 API Key，即視為 AI 已設定。
- 若 `zmp_ai_provider` 遺失或指向沒有 Key 的 provider，自動切換到實際已有 Key 的 provider。
- 已設定時點選上方「AI 智能區」直接開啟 AI 功能目錄，不再要求重新輸入 API Key。
- 未設定任何 API Key 時才開啟 AI 設定視窗。

## 自我驗證
- 8 個 inline script 全部 `node --check` 通過。
- 原始碼確認上方 AI 導覽與 capture-phase 導覽皆使用 `FiveLensAIConfigured()`。
- `FiveLensAIConfigured()` 已覆蓋：
  1. 目前 provider 有 Key → true
  2. 目前 provider 無 Key，但其他 provider 有 Key → true 並自動切換
  3. 所有 provider 都無 Key → false
  4. localStorage / decode 發生例外 → false，不中斷頁面
