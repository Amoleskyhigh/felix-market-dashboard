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

## 一致性規則

1. 日報腳本優先讀取 `market-dashboard/docs/market-data-snapshot.json`。
2. 若快照缺核心欄位，日報可 fallback 外部抓取，並在日誌標記。
3. 不允許網頁和日報使用不同口徑同名指標。
