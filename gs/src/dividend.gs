/**
 * Next or last dividend per share for a stock/ETF ticker (not TASE numeric ids).
 *
 * @param {string|number} id Ticker symbol (e.g. AAPL, TEVA.TA).
 * @return {number} Dividend amount in the quote currency.
 * @customfunction
 */
function DIV_AMOUNT(id) {
  return dividendField_(id, 'amount');
}

/**
 * Estimated or announced next dividend payment date for a ticker.
 *
 * @param {string|number} id Ticker symbol (e.g. AAPL).
 * @return {string} Date as YYYY-MM-DD.
 * @customfunction
 */
function DIV_DATE(id) {
  return dividendField_(id, 'date');
}

/** @param {string|number} id @param {"amount"|"date"} part @returns {number|string} */
function dividendField_(id, part) {
  const cleaned = String(id ?? '')
    .trim()
    .replace(/[^A-Za-z0-9.\-]/g, '');
  if (!cleaned) {
    throw new Error('Missing ticker');
  }
  if (/^\d+$/.test(cleaned)) {
    throw new Error('Use a ticker (e.g. TEVA.TA), not a TASE number');
  }

  const query =
    part === 'date'
      ? 'dividend?id=' + encodeURIComponent(cleaned) + '&format=text&part=date'
      : 'dividend?id=' + encodeURIComponent(cleaned) + '&format=text';
  const raw = WORKER(query);
  if (part === 'date') {
    return raw;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error('Invalid dividend amount');
  }
  return value;
}
