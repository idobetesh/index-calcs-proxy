/**
 * Time-driven trigger setup — OPTIONAL, for auto-refresh without user interaction.
 *
 * ── You probably don't need this ──────────────────────────────────────────────
 * Use =WORKER(), =MARKET_OPEN(), =CALC_AMOUNT() etc. directly in any cell, any
 * tab. They work like normal sheet formulas and recalculate whenever the sheet
 * recalculates (open, manual refresh, dependency change).
 *
 * ── When you DO need a trigger ────────────────────────────────────────────────
 * Custom functions do NOT auto-refresh on a timer by themselves. If you need
 * values to update every N minutes with no user action (e.g. a dashboard left
 * open on a screen), the only option is a trigger that calls worker APIs and
 * writes the results into specific cells you choose.
 *
 * To use:
 *   1. Edit refreshMarketData() below — call setValue() on whatever cells you want.
 *   2. In Apps Script editor: Run → Run function → installTriggers
 *   3. Approve permissions when prompted.
 *
 * To remove: Run → Run function → uninstallTriggers
 */

/**
 * Called automatically by the time trigger.
 * Edit this function to write into whichever cells and tabs you want refreshed.
 *
 * Example — write TASE open status into cell B2 on tab "Dashboard":
 *   const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Dashboard');
 *   sheet.getRange('B2').setValue(MARKET_OPEN('tase'));
 */
function refreshMarketData() {
  // ── Add your cell writes here ──────────────────────────────────────────────
  // const ss = SpreadsheetApp.getActiveSpreadsheet();
  // const dashboard = ss.getSheetByName('Dashboard');
  // dashboard.getRange('B2').setValue(MARKET_OPEN('tase'));
  // dashboard.getRange('C2').setValue(MARKET_OPEN('nyse'));
  // dashboard.getRange('D2').setValue(parseFloat(WORKER('rate?format=text')));
  // ──────────────────────────────────────────────────────────────────────────

  Logger.log('refreshMarketData: OK at ' + new Date().toISOString());
}

/**
 * Installs a time-driven trigger that calls refreshMarketData() every 5 minutes.
 * Safe to call multiple times — deletes existing triggers first.
 */
function installTriggers() {
  uninstallTriggers();
  ScriptApp.newTrigger('refreshMarketData')
    .timeBased()
    .everyMinutes(5)
    .create();
  Logger.log('Trigger installed: refreshMarketData every 5 minutes');
}

/**
 * Removes all triggers created by this script.
 */
function uninstallTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers
    .filter((t) => t.getHandlerFunction() === 'refreshMarketData')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  Logger.log('Triggers removed');
}
