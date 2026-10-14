/**
 * Latest price for a TASE fund/ETF (agorot) or a global ticker (native currency).
 *
 * @param {string|number} id TASE security number (6–10 digits) or ticker (e.g. AAPL, TEVA.TA).
 * @return {number} Agorot (integer) for numeric TASE ids; decimal price for tickers.
 * @customfunction
 */
function SEC_PRICE(id) {
  const cleaned = String(id ?? '')
    .trim()
    .replace(/[^A-Za-z0-9.\-]/g, '');
  if (!cleaned) {
    throw new Error('Missing security id or ticker');
  }

  const raw = WORKER('price?id=' + encodeURIComponent(cleaned) + '&format=text');
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error('Invalid price response');
  }

  if (/^\d+$/.test(cleaned)) {
    return Math.round(value);
  }

  return value;
}
