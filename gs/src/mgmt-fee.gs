/**
 * Annual management fee (דמי ניהול) or ETF expense ratio, in percent (0.25 = 0.25%).
 *
 * @param {string|number} id TASE security number or ticker (e.g. 1150572, SPY).
 * @return {number} Management fee in percent per year.
 * @customfunction
 */
function MGMT_FEE(id) {
  return mgmtFeeField_(id, 'management');
}

/**
 * Trustee fee (דמי נאמן) for TASE mutual funds/ETFs, in percent (often absent for US tickers).
 *
 * @param {string|number} id TASE security number (e.g. 5108519).
 * @return {number} Trustee fee in percent per year.
 * @customfunction
 */
function TRUSTEE_FEE(id) {
  return mgmtFeeField_(id, 'trustee');
}

/** @param {string|number} id @param {string} part @returns {number} */
function mgmtFeeField_(id, part) {
  const cleaned = String(id ?? '')
    .trim()
    .replace(/[^A-Za-z0-9.\-]/g, '');
  if (!cleaned) {
    throw new Error('Missing security id or ticker');
  }

  const path =
    'mgmt-fee?id=' +
    encodeURIComponent(cleaned) +
    '&format=text' +
    (part === 'management' ? '' : '&part=' + encodeURIComponent(part));
  const raw = WORKER(path);
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error('Invalid fee response');
  }
  return value;
}
