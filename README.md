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
