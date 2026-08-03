# JudicialApiBackup

每日登入司法院裁判書開放API並呼叫 JList，把原始 JSON 回應存檔（`jlist/{yyyy-MM-dd}.json`），獨立於部署環境之外執行

## 設定

repo 的 Settings → Secrets and variables → Actions 需要設定：

- `API_USER`：司法院API帳號
- `API_MIMA`：司法院API密碼
