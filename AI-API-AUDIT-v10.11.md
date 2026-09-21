# AI API / 模型模組技術盤點 — v10.11

## 盤點範圍

本次檢查 `index.html` 內所有 API Key 讀取與 AI 呼叫路徑，以及 `netlify/functions/` 下的函式。

### 找到的 AI API Key 模組

1. AI 白話追問
2. 手相／面相影像分析
3. 行銷個人化 AI 文案

三者現在共用 `AI_PROVIDERS`、API Key、模型名稱與（需要時）Base URL 設定。

### Serverless Functions

`netlify/functions/` 內沒有另外保存 AI Provider API Key；現有 AI BYOK 架構仍由瀏覽器直接呼叫原廠 API。

## Provider 支援

| Provider | API 型式 | 模型策略 | 預設／建議 |
|---|---|---|---|
| Claude | Anthropic Messages API | 可手動輸入；支援官方 `/models` | `claude-sonnet-4-6` |
| OpenAI | OpenAI API | 可手動輸入；支援官方 `/models` | `gpt-5.6-luna` |
| Gemini | Google Gemini API / OpenAI compatibility | 可手動輸入；支援官方 OpenAI-compatible `/models` | `gemini-2.5-flash` |
| Agnes AI | OpenAI-compatible | 可手動輸入 | `agnes-2.5-flash`；可輸入 `agnes-3.0-flash` |
| NVIDIA NIM | OpenAI-compatible | 可動態取得 `/models` 或手動輸入 | 不寫死免費模型 |
| GroqCloud | OpenAI-compatible | 可動態取得 `/models` 或手動輸入 | 不寫死免費模型 |
| OpenRouter | OpenAI-compatible | 可動態取得 `/models` 或手動輸入 | `openrouter/free` 動態免費路由 |
| Mistral AI Studio | Chat Completions | 可動態取得 `/models` 或手動輸入 | 不寫死免費模型 |

## 已修正的舊模型

- Agnes `agnes-2.0-flash` → `agnes-2.5-flash`
- Gemini `gemini-2.0-flash` → `gemini-2.5-flash`
- Gemini `gemini-2.0-flash-lite` → `gemini-2.5-flash-lite`
- OpenAI `gpt-4o-mini` → `gpt-5.6-luna`

舊版已儲存在瀏覽器的模型設定會在讀取時自動轉換，避免既有使用者繼續呼叫已不合適的舊預設。

## 原廠文件核對

- NVIDIA NIM LLM API：`https://docs.api.nvidia.com/nim/re/reference/llm-apis`
- NVIDIA NIM 模型／Free Endpoint：`https://build.nvidia.com/models`
- Groq OpenAI Compatibility：`https://console.groq.com/docs/openai`
- Groq Models：`https://console.groq.com/docs/models`
- OpenRouter Free Models：`https://openrouter.ai/collections/free-models`
- OpenRouter Free Router：`https://openrouter.ai/openrouter/free`
- Mistral API Quickstart：`https://docs.mistral.ai/getting-started/quickstarts/developer/first-api-request`
- Mistral API：`https://docs.mistral.ai/api`
- Gemini Models：`https://ai.google.dev/gemini-api/docs/models`
- Gemini OpenAI Compatibility：`https://ai.google.dev/gemini-api/docs/openai`
- OpenAI Models：`https://platform.openai.com/docs/models`
- Anthropic Model Deprecations：`https://docs.anthropic.com/en/docs/about-claude/model-deprecations`

Agnes 的 `agnes-2.5-flash` / `agnes-3.0-flash` 更新依本次使用者提供的 Agnes 客服原廠回覆；程式同時保留可編輯模型名稱，不將免費模型鎖死。

## 重要架構限制

本專案維持 BYOK 直連原廠的設計，因此 API Key 不經本站後端。若某一原廠、企業網路或瀏覽器環境不允許該 API 的跨來源瀏覽器請求（CORS），即使 API 本身有效，瀏覽器仍可能無法直連；這不是模型名稱問題。此情況應改採原廠允許的瀏覽器方式或自行建立受控 Proxy，而不是把 Key 寫入前端程式碼。
