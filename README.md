# index-calcs-proxy

<p align="center">
  <a href="https://github.com/idobetesh/index-calcs-proxy/actions/workflows/deploy.yml"><img src="https://github.com/idobetesh/index-calcs-proxy/actions/workflows/deploy.yml/badge.svg?branch=master" alt="Deploy" /></a>
  <a href="https://github.com/idobetesh/index-calcs-proxy/actions/workflows/deploy-gs.yml"><img src="https://github.com/idobetesh/index-calcs-proxy/actions/workflows/deploy-gs.yml/badge.svg?branch=master" alt="Deploy Apps Script" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.4-blue?logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://hono.dev/"><img src="https://img.shields.io/badge/Hono-4.4-orange?logo=hono&logoColor=white" alt="Hono" /></a>
  <a href="https://workers.cloudflare.com/"><img src="https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white" alt="Cloudflare Workers" /></a>
  <a href="https://github.com/idobetesh/index-calcs-proxy/actions/workflows/ci.yml"><img src="https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/idobetesh/13d12fa7c5d211a509b87a343c3258dc/raw/index-calcs-proxy-coverage.json" alt="Coverage" /></a>
  <a href="gs/README.md"><img src="https://img.shields.io/badge/Google_Apps_Script-clasp-4285F4?logo=google&logoColor=white" alt="Google Apps Script" /></a>
</p>

<p align="center">Cloudflare Worker for CBS index calcs, TASE/global prices, BOI rate, and market status — with a <a href="gs/README.md">Google Apps Script</a> integration for Sheets.</p>

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

### `GET /price`

Returns the current price of a security. Accepts either a **TASE security number** (Israeli ETFs/funds) or a **ticker symbol** (global stocks and ETFs).

**Query parameters**

| Parameter | Required | Description                                                                             |
| --------- | -------- | --------------------------------------------------------------------------------------- |
| `id`      | Yes      | TASE security number (6–10 digits) **or** ticker symbol (e.g. `AAPL`, `TEVA.TA`, `SPY`) |
| `format`  | No       | `text` (default) or `json`                                                              |
| `secret`  | Yes\*    | Auth secret (\*or `Authorization: Bearer` header)                                       |

**Routing:**

- Numeric `id` → TASE Maya/TASE APIs → price in ILA (אגורות)
- Alpha `id` → Yahoo Finance chart API → price in the security's native currency

**Text response** (default, for Google Sheets):

```
57615
```

(TASE ids: plain number is **agorot** — divide by 100 for ₪. Tickers: native currency units, e.g. `213.49` USD.)

**Caching:** responses are stored in Cloudflare’s cache for **10 minutes** per `id` + format (`Cache-Control: public, max-age=600` in `price.ts`).

**JSON response** (`format=json`) — TASE security:

```json
{
  "id": "1159235",
  "name": "תכלית S&P 500",
  "price": 57615,
  "currency": "ILA",
  "date": "2024-12-31",
  "source": "maya-mutual"
}
```

**JSON response** (`format=json`) — ticker symbol:

```json
{
  "id": "AAPL",
  "name": "Apple Inc.",
  "price": 213.49,
  "currency": "USD",
  "exchange": "NasdaqGS",
  "date": "2026-03-17",
  "source": "yahoo"
}
```

---

### `GET /rate`

Returns the current Bank of Israel interest rate (ריבית בנק ישראל).

> Note: prime rate = BOI rate + 1.5%

**Query parameters**

| Parameter | Required | Description                                       |
| --------- | -------- | ------------------------------------------------- |
| `format`  | No       | `text` (default) or `json`                        |
| `secret`  | Yes\*    | Auth secret (\*or `Authorization: Bearer` header) |

**Text response** (default):

```
4.00
```

**JSON response** (`format=json`):

```json
{
  "rate": 4,
  "effectiveDate": "2026-01-26",
  "asOf": "2026-03-12T10:00:00.000Z"
}
```

`Cache-Control: public, max-age=3600`

---

### `GET /fear-greed`

Returns the **Fear & Greed** sentiment index (0–100) for **US stocks** or **crypto**.

**Query parameters**

| Parameter | Required | Description                                       |
| --------- | -------- | ------------------------------------------------- |
| `market`  | Yes      | `stocks` (CNN-style US market) or `crypto`        |
| `format`  | No       | `text` (default) or `json`                        |
| `secret`  | Yes\*    | Auth secret (\*or `Authorization: Bearer` header) |

**Text response** (default): a single integer, e.g. `41` — use with conditional formatting in Sheets (`FEAR_GREED()` col 1 for value, col 2 for rating).

**JSON response** (`format=json`):

```json
{
  "market": "crypto",
  "value": 62,
  "rating": "greed",
  "source": "alternative.me",
  "timestamp": "2026-03-17T00:00:00.000Z"
}
```

**Sources:** crypto → [alternative.me FNG API](https://alternative.me/crypto/fear-and-greed-index/) (Jina fallback). **Stocks → CNN** [`production.dataviz.cnn.io`](https://www.cnn.com/markets/fear-and-greed): `value` is the rounded index shown on CNN; `rating` is CNN’s own label (not recomputed). Fallback: feargreedmeter via Jina (`source`: `feargreedmeter-jina`).

`Cache-Control: public, max-age=1800`

---

### `GET /market-status`

Returns open/closed status for major stock exchanges. Holiday-aware via [Nager.Date](https://date.nager.at).

**Query parameters**

| Parameter | Required | Description                                           |
| --------- | -------- | ----------------------------------------------------- |
| `market`  | No       | `tase`, `lse`, `nyse`, or `six`. Omit for all four.   |
| `format`  | No       | `json` (default) or `text` (only valid with `market`) |
| `secret`  | Yes\*    | Auth secret (\*or `Authorization: Bearer` header)     |

**All markets response** (no `market` param):

```json
{
  "tase": {
    "key": "tase",
    "name": "Tel Aviv Stock Exchange",
    "open": true,
    "localTime": "14:30",
    "timezone": "Asia/Jerusalem",
    "flag": "🇮🇱"
  },
  "lse": {
    "key": "lse",
    "name": "London Stock Exchange",
    "open": true,
    "localTime": "12:30",
    "timezone": "Europe/London",
    "flag": "🇬🇧"
  },
  "nyse": {
    "key": "nyse",
    "name": "New York Stock Exchange",
    "open": false,
    "localTime": "07:30",
    "timezone": "America/New_York",
    "flag": "🇺🇸"
  },
  "six": {
    "key": "six",
    "name": "SIX Swiss Exchange",
    "open": true,
    "localTime": "13:30",
    "timezone": "Europe/Zurich",
    "flag": "🇨🇭"
  },
  "asOf": "2026-03-12T12:30:00.000Z"
}
```

**Single market text response** (`market=nyse&format=text`):

```
false
```

**TASE hours:** Monday–Thursday 09:59–17:25, Friday 09:59–14:00 (early close for Shabbat). Holiday-aware via Nager.Date.

**Known limitations:** US early-close days (Thanksgiving eve, Christmas eve) and TASE Erev Chag (holiday eve) early-close are not modeled. After-hours / pre-market sessions are not modeled.

`Cache-Control: no-store`

---

### `GET /market`

Returns live prices for metals, volatility, and equity indices (server-side proxied to avoid CORS).

**Query parameters**

| Parameter | Required | Description                                       |
| --------- | -------- | ------------------------------------------------- |
| `secret`  | Yes\*    | Auth secret (\*or `Authorization: Bearer` header) |

**Response:**

```json
{
  "gold": { "price": 2650.0, "change": 0.42 },
  "silver": { "price": 30.15, "change": -0.21 },
  "vix": { "price": 18.5, "change": -1.3 },
  "sp500": { "price": 5200.0, "change": 0.15 },
  "nasdaq": { "price": 18400.0, "change": 0.22 },
  "russell": { "price": 2100.0, "change": -0.08 },
  "msci": { "price": 110.5, "change": 0.05 }
}
```

---

### `GET /health`

Health check. No auth required.

```
ok
```

---

## Google Sheets

Use the bound Apps Script in [`gs/`](gs/README.md) (`clasp push`). Set **`SECRET_KEY`** in Script properties (same value as the Worker secret). Formulas call helpers below — the secret is not pasted in cells.

### Custom functions

| Function       | Example                                          | Returns                                                                                                                                                                                            |
| -------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CALC_AMOUNT`  | `=CALC_AMOUNT(F3, TEXT(G3,"YYYY-MM"), "cpi")`    | Indexed amount (integer). HON first, then Worker.                                                                                                                                                  |
| `CALC_PERCENT` | `=CALC_PERCENT(1, TEXT(G3,"YYYY-MM"), "cpi")`    | % change as decimal fraction (`TEXT(...,"0.00%")` for display).                                                                                                                                    |
| `CALC_INDEX`   | `=CALC_INDEX(F3, TEXT(G3,"YYYY-MM"), "housing")` | Two lines: amount + fraction (`SPLIT` / `INDEX`).                                                                                                                                                  |
| `HONINDEX`     | `=HONINDEX(G3, F3, "cpi")`                       | HON-only indexed amount (date, amount, type — note argument order).                                                                                                                                |
| `PRICE`        | `=PRICE(1150572)` · `=PRICE("AAPL")`             | TASE price in **agorot** (integer) or ticker in native currency.                                                                                                                                   |
| `BOI_RATE`     | `=BOI_RATE()`                                    | Bank of Israel rate (% number, e.g. `4`).                                                                                                                                                          |
| `PRIME_RATE`   | `=PRIME_RATE()`                                  | Prime rate = BOI + 1.5%.                                                                                                                                                                           |
| `FEAR_GREED`   | `=FEAR_GREED()` · `=FEAR_GREED("crypto")`        | Spills one row (formula cell = col 1): **1** `value` (0–100) · **2** `rating` · **3** `market` · **4** `source` · **5** `timestamp`. Default market: US stocks. Label: `=INDEX(FEAR_GREED(),1,2)`. |
| `MARKET_OPEN`  | `=MARKET_OPEN("tase")`                           | `TRUE` / `FALSE` (tase, nyse, lse, six).                                                                                                                                                           |
| `WORKER`       | `=WORKER("health")`                              | Raw Worker response (advanced; prefer typed helpers).                                                                                                                                              |

`CALC_*` / `HONINDEX` index types: `cpi`, `construction`, `housing`.

Full setup and troubleshooting: **[gs/README.md](gs/README.md)**.

`IMPORTDATA` with `?secret=` still works but is optional; Apps Script is preferred (no URL secret in the sheet, better errors).

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

- **Primary calculator**: [CBS Calculator API](https://www.cbs.gov.il/he/Pages/default.aspx) — official chaining coefficients, handles base-year changes automatically
- **Fallback (chaining)**: [CBS Price Index API](https://www.cbs.gov.il/he/Pages/default.aspx) — month-over-month percent compounding, used when CBS calculator is unavailable
- **TASE security prices**: [TASE Maya](https://maya.tase.co.il) (mutual funds, ETFs) · [TASE intraday API](https://api.tase.co.il) · [Jina Reader](https://jina.ai) (fallback)
- **Global stock / ETF prices**: [Yahoo Finance](https://finance.yahoo.com) chart API · [Jina Reader](https://jina.ai) (fallback)
- **BOI interest rate**: [Bank of Israel SDMX v2](https://edge.boi.gov.il)
- **Fear & Greed (crypto)**: [alternative.me](https://api.alternative.me/fng/) · **(stocks)**: CNN dataviz · [feargreedmeter.com](https://feargreedmeter.com) via [Jina Reader](https://jina.ai) (fallback)
- **Public holidays**: [Nager.Date](https://date.nager.at)
- **Market data**: [Stooq](https://stooq.com) (Gold, Silver, S&P 500, NASDAQ, Russell, MSCI), [CBOE](https://www.cboe.com/tradable_products/vix/vix_historical_data/) (VIX), [Frankfurter](https://frankfurter.app) (USD/ILS, EUR/ILS, GBP/ILS), [CoinGecko](https://coingecko.com) (BTC, ETH)
