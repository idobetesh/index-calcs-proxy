/**
 * Annual management fee or ETF expense ratio, in **percent points** (0.06 = 0.06% per year).
 * For Sheets `Percent` format or `TEXT(..., "0.00%")`, divide by 100 (see `TOTAL_FEE_RATE`).
 *
 * @param {string|number} id TASE security number or ticker (e.g. 1150572, SPY).
 * @return {number} Management fee in percent per year.
 * @customfunction
 */
function MGMT_FEE(id) {
  return mgmtFeeField_(id, 'management');
}

/**
 * Trustee fee for TASE mutual funds/ETFs, in **percent points** (0.01 = 0.01% per year).
 *
 * @param {string|number} id TASE security number (e.g. 5108519).
 * @return {number} Trustee fee in percent per year.
 * @customfunction
 */
function TRUSTEE_FEE(id) {
  return mgmtFeeField_(id, 'trustee');
}

/**
 * Total annual fee (management + trustee when present) as a Sheets **percent decimal**
 * (0.0007 = 0.07%). One worker call. Example: `=TEXT(TOTAL_FEE_RATE(5140918), "0.00%")`.
 *
 * @param {string|number} id TASE security number or ticker.
 * @return {number} Combined fee as decimal for percent formatting.
 * @customfunction
 */
function TOTAL_FEE_RATE(id) {
  const cleaned = String(id ?? '')
    .trim()
    .replace(/[^A-Za-z0-9.\-]/g, '');
  if (!cleaned) {
    throw new Error('Missing security id or ticker');
  }

  const raw = WORKER('mgmt-fee?id=' + encodeURIComponent(cleaned) + '&format=json');
  const data = JSON.parse(raw);
  const mgmt = Number(data.managementFee);
  if (!Number.isFinite(mgmt)) {
    throw new Error('Invalid fee response');
  }
  const trustee = Number(data.trusteeFee);
  const sum = mgmt + (Number.isFinite(trustee) ? trustee : 0);
  return sum / 100;
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
