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

### BOI Interest Rate

```
=WORKER("rate?format=text")
```

Returns the current Bank of Israel rate as plain text (e.g. `4.00`).

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

### ETF price

```
=WORKER("etf?id=1159235&format=text")
```

Returns the current price of an Israeli ETF by TASE security number.

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

`CALC_PERCENT` returns a decimal fraction — use `TEXT(value, "0.00%")` to display as `8.20%`.

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
    triggers.gs      # installTriggers() / uninstallTriggers() / refreshMarketData()
    appsscript.json  # Apps Script manifest (runtime, timezone, OAuth scopes)
  .clasp.json        # Script ID + rootDir — gitignored, create locally (see step 4)
  ONBOARDING.md      # This file
```

---

## Troubleshooting

| Symptom                     | Fix                                                                            |
| --------------------------- | ------------------------------------------------------------------------------ |
| `#ERROR!` in cell           | Open Apps Script editor → View → Logs to see the error                         |
| `clasp push` fails with 403 | Make sure Apps Script API is enabled (step 2) and you're logged in             |
| Function not found in sheet | After `clasp push`, reload the sheet — new functions take a moment to appear   |
| `SECRET_KEY` missing        | Check Project Settings → Script properties — make sure `SECRET_KEY` is set     |
| Worker returns 401          | Wrong secret in Script Properties — verify it matches Cloudflare               |
| Rate limit errors           | You're hitting Google's 6min/day limit — use time triggers to spread calls out |

---

## Security notes

- **Never hardcode the secret** in source files — always use `PropertiesService`
- `.clasprc.json` (login credentials) is stored at `~/.clasprc.json` — never commit it
- Anyone with **edit access** to the sheet can open Extensions → Apps Script and read the code — keep the sheet private if the integration handles sensitive data
- Rotate the secret via Cloudflare dashboard (`wrangler secret put SECRET_KEY`) and update Script Properties accordingly
