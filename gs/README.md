# Google Apps Script — Onboarding Guide

This folder contains the Google Apps Script code for the `index-calcs-proxy` Google Sheets integration. It uses [clasp](https://github.com/google/clasp) to manage the script locally and deploy it from the command line.

---

## Prerequisites

- Node.js 18+
- A Google account with access to the target Google Sheet
- The Cloudflare Worker deployed and `SECRET_KEY` set

---

## 1. Install clasp

```bash
npm install -g @google/clasp
```

---

## 2. Enable the Apps Script API

1. Go to [https://script.google.com/home/usersettings](https://script.google.com/home/usersettings)
2. Turn on **Google Apps Script API**

This is required for clasp to push/pull scripts.

---

## 3. Login

```bash
clasp login
```

Opens a browser window. Authenticate with your Google account. Credentials are stored at `~/.clasprc.json` — never commit this file.

---

## 4. Link to your Google Sheet's script

Every Google Sheet has a bound Apps Script project. To find your script ID:

1. Open your Google Sheet
2. **Extensions → Apps Script**
3. In the editor, go to **Project Settings** (⚙️)
4. Copy the **Script ID**

Then create `.clasp.json` in this folder (it's gitignored for the `scriptId` — see note below):

```json
{
  "scriptId": "YOUR_SCRIPT_ID_HERE",
  "rootDir": "./src"
}
```

> **Note:** `.clasp.json` is gitignored — each developer creates it locally with their own sheet's script ID. The `scriptId` is not a secret, but since it's personal to your sheet it's kept out of the repo.

---

## 5. Set the secret key (one-time)

The `SECRET_KEY` is stored in Apps Script **Script Properties** — never hardcoded in the source.

1. Open your Google Sheet → **Extensions → Apps Script**
2. Go to **Project Settings** (⚙️) → **Script properties**
3. Click **Add script property**
   - Property: `SECRET_KEY`
   - Value: your Cloudflare Worker secret (same one in `.dev.vars` / Cloudflare dashboard)
4. Click **Save script properties**

The code reads it at runtime:

```typescript
const secret = PropertiesService.getScriptProperties().getProperty('SECRET_KEY') ?? '';
```

---

## 6. Push the script

```bash
cd gs
clasp push
```

This uploads all files from `src/` to the bound Apps Script project. You'll see the functions appear in **Extensions → Apps Script** in your sheet.

To watch for changes and push automatically:

```bash
clasp push --watch
```

---

## 7. Use the functions in your sheet

After pushing, the custom functions are available in any cell:

### Health check

```
=WORKER("health")
```

Returns `ok` if the worker is up.

### BOI interest rate and prime

```
=BOI_RATE()                              → e.g. 4 (percent)
=PRIME_RATE()                            → BOI + 1.5 (e.g. 5.5)
=TEXT(BOI_RATE(), "0.00") & "%"
```

Worker `/rate` is cached ~1 hour at the edge. Same as `=WORKER("rate?format=text")` but returns a number.

### Fear & Greed (stocks and crypto)

One function; **`format=json` on the Worker** is parsed into a **single spilled row** (Sheets cannot display a JSON object in one cell):

| Col | Field                                      |
| --- | ------------------------------------------ |
| 1   | `value` (0–100) — same cell as the formula |
| 2   | `rating` (e.g. `Fear`, `Extreme Fear`)     |
| 3   | `market`                                   |
| 4   | `source`                                   |
| 5   | `timestamp` (ISO)                          |

```
=FEAR_GREED()                    → stocks (default)
=FEAR_GREED("crypto")
=INDEX(FEAR_GREED(), 1, 2)       → rating text (title case)
```

Cached in **Apps Script** (~30 min per market) and on the **Worker** edge (`max-age=1800`). Use **Format → Conditional formatting** on the **value** cell (column 1).

**US stocks:** score and rating from [CNN Fear & Greed](https://www.cnn.com/markets/fear-and-greed) when `source` is `cnn`. **Crypto:** [alternative.me](https://alternative.me/crypto/fear-and-greed-index/).

### AAII sentiment

[AAII survey](https://www.aaii.com/sentimentsurvey) — spills **N rows × 4 columns** (newest week first):

| Col | Field              |
| --- | ------------------ |
| 1   | `weekEnding` (ISO) |
| 2   | `bullish` %        |
| 3   | `neutral` %        |
| 4   | `bearish` %        |

```
=AAII_SENTIMENT()       → 5 weeks (default)
=AAII_SENTIMENT(10)
=INDEX(AAII_SENTIMENT(), 1, 2)   → latest bullish
```

Cached ~24h in Apps Script and on the Worker edge.

### Market Status

```
=WORKER("market-status?market=tase&format=text")
=WORKER("market-status?market=lse&format=text")
=WORKER("market-status?market=nyse&format=text")
=WORKER("market-status?market=six&format=text")
```

Returns `true` (open) or `false` (closed).

With a label:

```
=IF(WORKER("market-status?market=nyse&format=text")="true","🟢 Open","🔴 Closed")
```

### Index calculation (CPI / Construction / Housing)

```
=WORKER("calc?amount="&INT(F3)&"&from="&TEXT(G3,"YYYY-MM")&"&index=cpi")
```

Returns two lines — use `INDEX()` to extract:

```
=INDEX(SPLIT(WORKER("calc?amount="&INT(F3)&"&from="&TEXT(G3,"YYYY-MM")&"&index=cpi"), CHAR(10)), 1, 1)
```

- Row 1: indexed amount (integer)
- Row 2: percentage as decimal fraction (e.g. `0.0530`)

### Security price

```
=SEC_PRICE(1150572)              → TASE (agorot, integer)
=SEC_PRICE("AAPL")               → ticker (native currency)
=WORKER("price?id=1159235&format=text")   → same as SEC_PRICE()
```

`SEC_PRICE()` calls the Worker `/price` endpoint (Maya → TASE → Jina fallbacks on the server). TASE numeric ids return **ILA agorot** (אגורות); tickers return the quote currency (e.g. USD).

Worker responses are **cached ~10 minutes** at the edge (`Cache-Control: max-age=600`). Apps Script does not add a separate price cache — each formula recalc calls the Worker unless the edge cache hits.

### Management fee (דמי ניהול)

```
=MGMT_FEE(1150572)     → 0.25  (0.25% per year — **percent points**, not a Sheets decimal)
=TRUSTEE_FEE(1150572)  → 0.03  (0.03% per year)
=MGMT_FEE("SPY")       → expense ratio for US ETF
=TEXT(TOTAL_FEE_RATE(5140918), "0.00%")  → 0.07% total (mgmt + trustee), one API call
```

TASE ids use Maya; tickers use Yahoo expense ratio. Values are **percent points** (0.06 + 0.01 = 0.07 means 0.07% total). For `TEXT(..., "0.00%")` or **Percent** cell format, use `TOTAL_FEE_RATE(id)` or divide by 100: `=(MGMT_FEE(id)+TRUSTEE_FEE(id))/100`. To show the number with a literal percent sign: `=(MGMT_FEE(id)+TRUSTEE_FEE(id))&"%"`.

### Dividends (tickers)

```
=DIV_AMOUNT("AAPL")
=DIV_DATE("AAPL")
```

Not available for TASE numeric ids — use a ticker such as `TEVA.TA`.

### Market open/closed (typed helper)

```
=MARKET_OPEN("tase")   → TRUE / FALSE
=MARKET_OPEN("nyse")
=MARKET_OPEN("lse")
=MARKET_OPEN("six")
```

Returns a boolean — useful in `IF()` formulas:

```
=IF(MARKET_OPEN("nyse"), "🟢 Open", "🔴 Closed")
```

### Index calculation (typed helpers)

```
=CALC_AMOUNT(F3, TEXT(G3,"YYYY-MM"), "cpi")    → indexed amount (integer)
=CALC_PERCENT(F3, TEXT(G3,"YYYY-MM"), "cpi")   → decimal fraction (e.g. 0.082)
```

`CALC_INDEX`, `CALC_AMOUNT`, and `CALC_PERCENT` try **hon.co.il** first (cached ~4h), then fall back to the **Worker** if HON fails. Use `=HONINDEX(...)` when you need HON only (no fallback).

Example change label (no sheet `IFERROR`):

```
=LET(
  raw, CALC_INDEX(H3, TEXT(M2,"YYYY-MM"), "cpi"),
  DOLLAR(INT(INDEX(SPLIT(raw,CHAR(10)),1,1))-H3,0)
  & " / " &
  TEXT(VALUE(INDEX(SPLIT(raw,CHAR(10)),1,2)),"0.00%")
)
```

`CALC_PERCENT` returns a decimal fraction — use `TEXT(value, "0.00%")` to display as `8.20%`.

### HON index (matches hon.co.il calculators)

Uses HON’s embedded `HON_CBS_IDX` data (fetched once per index type, cached ~4 hours):

```
=HONINDEX(G3, F3, "cpi")
=HONINDEX(G3, F3, "housing")
=HONINDEX(G3, F3, "construction", H3)
```

Argument order is **start date, amount, type** (opposite of `CALC_AMOUNT`). Dates can be Sheet dates or `TEXT(..., "YYYY-MM")`.

---

## 8. Auto-refresh with a time trigger (optional)

**You probably don't need this.** Use `=MARKET_OPEN()`, `=WORKER()`, `=CALC_AMOUNT()` etc. directly in any cell, any tab — they work like normal Sheets formulas.

The trigger is only needed if you want values to update on a timer with **no user interaction** (e.g. a dashboard left open on a screen). Custom functions don't auto-refresh on their own — a trigger must call the APIs and write values directly into cells.

To set it up:

1. Open `src/triggers.ts` and add your cell writes inside `refreshMarketData()` — the file has commented-out examples.
2. In the Apps Script editor: **Run → Run function → `installTriggers`**
3. Approve permissions when prompted.
4. The trigger will call `refreshMarketData()` every 5 minutes.

To remove the trigger:

```
Run → Run function → uninstallTriggers
```

---

## 9. Pulling changes made in the editor

If you edit the script directly in the browser editor:

```bash
clasp pull
```

This overwrites your local `src/` files with the latest from Google. Commit after pulling.

---

## Project structure

```
gs/
  src/
    worker.gs        # WORKER() helper — base fetch function
    markets.gs       # MARKET_OPEN() and getAllMarketStatuses()
    calc.gs          # CALC_INDEX(), CALC_AMOUNT(), CALC_PERCENT()
    hon-index.gs     # HONINDEX() — hon.co.il index (cached)
    price.gs         # SEC_PRICE() — TASE / ticker via Worker
    mgmt-fee.gs      # MGMT_FEE() — דמי ניהול / expense ratio
    dividend.gs      # DIV_AMOUNT(), DIV_DATE()
    rate.gs          # BOI_RATE(), PRIME_RATE()
    fear-greed.gs    # FEAR_GREED()
    aaii-sentiment.gs # AAII_SENTIMENT()
    triggers.gs      # installTriggers() / uninstallTriggers() / refreshMarketData()
    appsscript.json  # Apps Script manifest (runtime, timezone, OAuth scopes)
  .clasp.json        # Script ID + rootDir — gitignored, create locally (see step 4)
  README.md          # This file
```

---

## Troubleshooting

| Symptom                                                            | Fix                                                                                                                                                                                                |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `#ERROR!` in cell                                                  | Open Apps Script editor → View → Logs to see the error                                                                                                                                             |
| `clasp push` fails with 403                                        | Make sure Apps Script API is enabled (step 2) and you're logged in                                                                                                                                 |
| Function not found in sheet                                        | After `clasp push`, reload the sheet — new functions take a moment to appear                                                                                                                       |
| `SECRET_KEY` missing                                               | Check Project Settings → Script properties — make sure `SECRET_KEY` is set                                                                                                                         |
| Worker returns 401                                                 | Wrong secret in Script Properties — verify it matches Cloudflare                                                                                                                                   |
| `AAII_SENTIMENT` / Worker 502, `[aaii-jina] HTTP 429`              | Jina rate limit — redeploy latest Worker (XLS fallback + stale cache), wait ~30m, or set Worker secret `JINA_API_KEY`. Sheets caches successful results ~24h.                                      |
| Rate limit errors                                                  | You're hitting Google's 6min/day limit — use time triggers to spread calls out                                                                                                                     |
| **Deploy Apps Script** CI fails (`access_token` / `invalid_grant`) | GitHub → **Settings → Secrets**: update **`CLASP_RC`** with the full contents of `~/.clasprc.json` after `clasp login`. Verify **`CLASP_SCRIPT_ID`**. Test locally: `cd gs && clasp push --force`. |

---

## Security notes

- **Never hardcode the secret** in source files — always use `PropertiesService`
- `.clasprc.json` (login credentials) is stored at `~/.clasprc.json` — never commit it
- Anyone with **edit access** to the sheet can open Extensions → Apps Script and read the code — keep the sheet private if the integration handles sensitive data
- Rotate the secret via Cloudflare dashboard (`wrangler secret put SECRET_KEY`) and update Script Properties accordingly
