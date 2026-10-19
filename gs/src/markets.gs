/**
 * Whether a major exchange is open now (holiday-aware).
 *
 * @param {string} market Exchange code: tase, nyse, lse, or six.
 * @return {boolean} TRUE if open, FALSE if closed.
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
  const raw = WORKER('market-status');
  return JSON.parse(raw);
}
