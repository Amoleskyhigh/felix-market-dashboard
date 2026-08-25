# Market Dashboard Data Sources (SSOT)

本檔定義「單一資料真相來源（Single Source of Truth）」。
原則：**網頁與日報共用同一份快照 `docs/market-data-snapshot.json`**。

## 指標來源對照

- SPY / SPX / IXIC / SOX / QQQ / SMH / BOXX / QLD / VIX / DXY / TNX / USDTWD
  - Source: Yahoo Finance chart API (`/v8/finance/chart/...`)
  - Method: close series + currentPrice

- Shiller PE
  - Source: multpl.com Shiller PE table
  - Method: parse latest monthly value

- Fear & Greed
  - Source: feargreedmeter.com
  - Method: parse score text/json snippet

- HY OAS / Credit Spread
  - Source: FRED `BAMLH0A0HYM2`
  - Method: latest valid CSV point; UI shows `%` and converts to `bp`

- Market Breadth (>200MA)
  - **Hard Source: Barchart `$S5TH`**
  - Method: fetch `$S5TH` latest value, must be 0~100
  - Rule: source failure => `N/A` (no guessed fallback)

- Copper trend signal
  - Source: `HG=F` (COMEX Copper futures)
  - Method: 6mo close series + MA3

- SPY / QQQ / SMH / IGV Forward P/E（每日快照）
  - Holdings source: Alpha Vantage `ETF_PROFILE` （成分股與權重）
  - Forward P/E source: Yahoo Finance quote endpoint `forwardPE`（cookie/crumb session；個股 analyst consensus），個別缺漏才使用同欄位的 quote page fallback
  - Method: 僅納入正值 `forwardPE` 的成分股，以持股權重計算調和平均；**不讀取、也不會以 `trailingPE` 替代**。覆蓋率以完整 ETF 已揭露持股權重計算（非僅截取的成分股），並保存 coverage、covered/selected/total holdings、來源、資料日期與擷取時間。
  - Storage: `forward-pe-history.json` 與 `docs/forward-pe-history.json`
  - Status rule: coverage >= 80% = `available`；40%~80% = `partial`；<40% = `unavailable`（前端顯示 `N/A`，仍保留來源/日期/錯誤）。免費來源沒有可驗證的歷史序列，從首次每日快照日開始累積，不回填。

## 一致性規則

1. 日報腳本優先讀取 `felix-market-dashboard/docs/market-data-snapshot.json`。
2. 若快照缺核心欄位，日報可 fallback 外部抓取，並在日誌標記。
3. 不允許網頁和日報使用不同口徑同名指標。
