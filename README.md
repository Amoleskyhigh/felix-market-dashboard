# Market Dashboard (Felix)

Local market dashboard + JSON API.

## Run locally

```bash
npm i
node market-server.js
```

Then open:
- http://127.0.0.1:8899/market-dashboard.html
- http://127.0.0.1:8899/api/data

## Notes
- Data sources: Yahoo Finance chart API, multpl (Shiller PE), CNN (Fear & Greed fallback).
- **Daily update rule (required):** Market Breadth (`市場廣度 >200MA`) must use **Barchart symbol `$S5TH`** as the hard source. If `$S5TH` cannot be fetched, show `N/A` (do not use guessed/fallback percentages like 100%).

## ETF forward P/E snapshots

`SPY`、`QQQ`、`SMH`、`IGV` 的 forward P/E 由 `scripts/update-forward-pe-history.js` 在盤後寫入 `forward-pe-history.json` 與 `docs/forward-pe-history.json`。需設定 `ALPHA_VANTAGE_API_KEY`（用於 ETF 持股權重）：

```bash
/opt/homebrew/opt/node@24/bin/node scripts/update-forward-pe-history.js
```

此數值是以 constituent analyst-consensus forward P/E 的持股加權調和平均估算，並非基金發行商公告的單一官方口徑。腳本優先讀取 Yahoo quote endpoint 的 `forwardPE`（個別缺漏才以同欄位的 quote page 補足），絕不以 `trailingPE` 冒充；每筆保存完整持股覆蓋率、來源、資料日期與擷取時間。低於 80% 時 UI 顯示「部分」，低於 40% 時顯示 `N/A` 並保留來源/日期/錯誤。免費來源沒有可靠可回溯的歷史 forward P/E，故趨勢從首次每日快照日起累積、不回填。
