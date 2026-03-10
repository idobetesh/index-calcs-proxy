# index-calcs-proxy

[![Deploy](https://github.com/idobetesh/index-calcs-proxy/actions/workflows/deploy.yml/badge.svg?branch=master)](https://github.com/idobetesh/index-calcs-proxy/actions/workflows/deploy.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Hono](https://img.shields.io/badge/Hono-4.4-orange?logo=hono&logoColor=white)](https://hono.dev/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Vitest](https://img.shields.io/badge/tested_with-Vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)

A lightweight Cloudflare Worker that proxies the Israeli Central Bureau of Statistics (CBS) calculator API and returns plain-text results consumable directly by Google Sheets `IMPORTDATA`.

---

<video src="https://github.com/user-attachments/assets/8457e2b0-ad9c-4c0d-9432-353d8063aada" controls width="100%"></video>

---

## What it does

Given an original amount and a starting month, the worker calls the CBS official calculator API and returns the inflation-adjusted equivalent. It supports three index types:

| Index          | CBS ID | Description                                  |
| -------------- | ------ | -------------------------------------------- |
| `cpi`          | 120010 | Consumer Price Index — general               |
| `construction` | 200010 | Construction input price index (residential) |
| `housing`      | 40010  | Prices of dwellings                          |

**Calculation strategy:** CBS official calculator API is the primary source (handles base-year chaining with official coefficients). If the CBS API is unavailable, falls back to chaining monthly percent changes from the CBS price series.

---

## API

### `GET /calc`

Returns an inflation-adjusted amount.

**Query parameters**

| Parameter | Required | Default                                       | Description                                       |
| --------- | -------- | --------------------------------------------- | ------------------------------------------------- |
| `amount`  | Yes      | —                                             | Original amount (positive number)                 |
| `from`    | Yes      | —                                             | Start period (`YYYY-MM`)                          |
| `to`      | No       | current month (CBS snaps to latest published) | End period (`YYYY-MM`)                            |
| `index`   | No       | `cpi`                                         | Index type: `cpi`, `construction`, `housing`      |
| `format`  | No       | `text`                                        | Response format: `text` or `json`                 |
| `secret`  | Yes\*    | —                                             | Auth secret (\*or `Authorization: Bearer` header) |

**Text response** (default, for Google Sheets):

```
1729769
0.0820
```

Two plain lines — no formatting, no currency symbol:

- Line 1: indexed amount as an integer
- Line 2: percentage as a decimal fraction (`TEXT(0.0820, "0.00%")` → `8.20%` in Sheets)

**JSON response** (`format=json`):

```json
{
  "fromPeriod": "2023-12",
  "toPeriod": "2026-01",
  "fromValue": 129.8,
  "toValue": 101.3,
  "originalAmount": 1598000,
  "indexedAmount": 1729769,
  "difference": 131769,
  "percentage": 8.2,
  "formatted": "₪1,729,769 / 8.20%"
}
```

Note: `fromPeriod`/`toPeriod` reflect the CBS-snapped periods used internally (due to publication lag). The requested dates drive the calculation — CBS chooses the nearest published period automatically.

---

## Google Sheets integration

The single-formula approach using `LET` (no helper cells needed):

```
=LET(
  data, IMPORTDATA(CONCATENATE(
    "https://index-calcs-proxy.idobetesh.workers.dev/calc?amount=", INT(G3),
    "&from=", TEXT(M2,"YYYY-MM"),
    "&index=construction",
    "&secret=YOUR_SECRET"
  )),
  CONCATENATE(DOLLAR(INDEX(data,1,1)-G3,0)," / ",TEXT(INDEX(data,2,1),"0.00%"))
)
```

- `INDEX(data,1,1)` → indexed amount — `DOLLAR(value - G3, 0)` gives the difference formatted as currency
- `INDEX(data,2,1)` → decimal fraction (e.g. `0.0820`) — `TEXT(value, "0.00%")` renders as `8.20%`

`Cache-Control: no-store` is set on all `/calc` responses to prevent stale data being served.

---

## Local development

```bash
# Install dependencies
npm install

# Create local secrets file (git-ignored)
echo "SECRET_KEY=dev-secret" > .dev.vars

# Start local dev server
npm run dev
# → http://localhost:8787

# Open calculator UI (cookie set on first visit, no key needed after)
open "http://localhost:8787/?key=dev-secret"

# Test the API
curl "http://localhost:8787/calc?amount=1598000&from=2024-02&index=construction&secret=dev-secret"
curl "http://localhost:8787/calc?amount=1598000&from=2024-02&index=construction&format=json&secret=dev-secret"

# Run checks
npm run typecheck
npm run lint
npm test
```

---

## Adding a new index type

1. Add the type and ID to `src/types/index.ts`:
   ```typescript
   export type IndexType = 'cpi' | 'construction' | 'housing' | 'wages';
   export const INDEX_IDS = { ..., wages: 120050 };
   export const INDEX_NAMES = { ..., wages: 'Wage Index' };
   ```
2. Create `src/calculations/wages.ts` (copy `cpi.ts` as a template)
3. Register it in `src/controllers/calc.ts`

No other files need changing.

---

## Data sources

- **Primary calculator**: [CBS Calculator API](https://api.cbs.gov.il/index/data/calculator) — official chaining coefficients, handles base-year changes automatically
- **Fallback (chaining)**: [CBS Price Index API](https://api.cbs.gov.il/index/data/price) — month-over-month percent compounding, used when CBS calculator is unavailable
- **Market data**: [Stooq](https://stooq.com) (Gold, Silver, S&P 500, NASDAQ, Russell, MSCI), [CBOE](https://www.cboe.com/tradable_products/vix/vix_historical_data/) (VIX), [Frankfurter](https://frankfurter.app) (USD/ILS, EUR/ILS, GBP/ILS), [CoinGecko](https://coingecko.com) (BTC, ETH)
