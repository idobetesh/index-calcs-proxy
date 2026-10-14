/**
 * Security price via Worker /price (TASE id or ticker).
 *
 * Usage:
 *   =PRICE(1150572)        → TASE price in agorot (integer)
 *   =PRICE("AAPL")         → USD price (may include decimals)
 *   =PRICE(A1)             → id from cell
 */

/**
 * @param {string|number} id TASE security number (6–10 digits) or ticker (AAPL, TEVA.TA)
 * @returns {number}
 * @customfunction
 */
function PRICE(id) {
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
