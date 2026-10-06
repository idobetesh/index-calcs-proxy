/**
 * Index calculation helpers.
 *
 * CALC_* tries hon.co.il first (cached), then the Cloudflare Worker.
 *
 * Usage:
 *   =CALC_INDEX(F3, TEXT(G3,"YYYY-MM"), "cpi")        → "1082000\n0.0820"
 *   =CALC_AMOUNT(F3, TEXT(G3,"YYYY-MM"), "cpi")       → 1082000  (integer)
 *   =CALC_PERCENT(F3, TEXT(G3,"YYYY-MM"), "cpi")      → 0.082    (decimal fraction)
 *
 * HON-only (no Worker fallback):
 *   =HONINDEX(G3, F3, "cpi")
 *   =HONINDEX(G3, F3, "cpi", H3)
 *
 * Or using WORKER() directly with INDEX/SPLIT:
 *   =INDEX(SPLIT(WORKER("calc?amount="&INT(F3)&"&from="&TEXT(G3,"YYYY-MM")&"&index=cpi"), CHAR(10)), 1, 1)
 */

/**
 * @param {number} amount
 * @param {string} from
 * @param {string} index
 * @param {string=} to
 * @returns {string}
 */
function fetchWorkerCalcIndex_(amount, from, index, to) {
  let path =
    'calc?amount=' +
    Math.round(amount) +
    '&from=' +
    from +
    '&index=' +
    index +
    '&format=text';
  if (to) {
    path += '&to=' + to;
  }
  return WORKER(path);
}

/**
 * HON first, Worker on failure. Two lines: indexed amount, percent fraction.
 *
 * @param {number} amount
 * @param {string} from
 * @param {string} index
 * @param {string=} to
 * @returns {string}
 */
function calcIndexRaw_(amount, from, index, to) {
  try {
    return honCalcIndexText_(amount, from, index, to);
  } catch (honError) {
    return fetchWorkerCalcIndex_(amount, from, index, to);
  }
}

/**
 * Returns the raw two-line response: "<indexed_amount>\n<percentage_fraction>"
 *
 * @param {number} amount   - Original amount (positive integer)
 * @param {string} from     - Start period in YYYY-MM format
 * @param {string} index    - Index type: cpi, construction, or housing
 * @param {string=} to      - End period YYYY-MM (optional; HON: today if omitted, Worker: latest published)
 * @returns {string}
 * @customfunction
 */
function CALC_INDEX(amount, from, index, to) {
  return calcIndexRaw_(amount, from, index, to);
}

/**
 * Returns the inflation-adjusted amount as an integer.
 *
 * @param {number} amount   - Original amount
 * @param {string} from     - Start period YYYY-MM
 * @param {string} index    - Index type: cpi, construction, or housing
 * @param {string=} to      - End period YYYY-MM (optional)
 * @returns {number}
 * @customfunction
 */
function CALC_AMOUNT(amount, from, index, to) {
  const raw = calcIndexRaw_(amount, from, index, to);
  return parseInt(raw.split('\n')[0] ?? '0', 10);
}

/**
 * Returns the percentage change as a decimal fraction (e.g. 0.082 for 8.2%).
 * Use TEXT(value, "0.00%") in the sheet to display as "8.20%".
 *
 * @param {number} amount   - Original amount
 * @param {string} from     - Start period YYYY-MM
 * @param {string} index    - Index type: cpi, construction, or housing
 * @param {string=} to      - End period YYYY-MM (optional)
 * @returns {number}
 * @customfunction
 */
function CALC_PERCENT(amount, from, index, to) {
  const raw = calcIndexRaw_(amount, from, index, to);
  return parseFloat(raw.split('\n')[1] ?? '0');
}
