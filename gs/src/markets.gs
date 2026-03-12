/**
 * Market status helpers.
 *
 * Usage:
 *   =MARKET_OPEN("tase")   → TRUE / FALSE
 *   =MARKET_OPEN("nyse")
 *   =MARKET_OPEN("lse")
 *   =MARKET_OPEN("six")
 *
 * @param {string} market - Exchange key: tase, lse, nyse, six
 * @returns {boolean}
 * @customfunction
 */
function MARKET_OPEN(market) {
  const result = WORKER(`market-status?market=${market}&format=text`);
  return result === 'true';
}

/**
 * Returns the full market status JSON for all four exchanges.
 * Intended for use in triggers / server-side logic, not as a sheet formula.
 *
 * @returns {object} { tase, lse, nyse, six, asOf }
 */
function getAllMarketStatuses() {
  const secret = PropertiesService.getScriptProperties().getProperty('SECRET_KEY') ?? '';
  const url = `https://index-calcs-proxy.idobetesh.workers.dev/market-status?secret=${secret}`;
  const response = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
  return JSON.parse(response.getContentText());
}
