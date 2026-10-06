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
 * @param {Date|string|number} from
 * @returns {string} YYYY-MM
 */
function normalizeCalcFrom_(from) {
  if (from === undefined || from === null || from === '') {
    throw new Error('Missing start period (use TEXT(dateCell,"YYYY-MM") or YYYY-MM)');
  }

  if (from instanceof Date) {
    if (isNaN(from.getTime())) {
      throw new Error('Invalid start date');
    }
    return Utilities.formatDate(from, Session.getScriptTimeZone(), 'yyyy-MM');
  }

  const text = String(from).trim();
  if (/^\d{4}-\d{2}$/.test(text)) {
    return text;
  }

  const parsed = parseHonDate_(from);
  return Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'yyyy-MM');
}

/**
 * @param {number|string} amount
 * @returns {number} Positive integer amount for calc APIs
 */
function normalizeCalcAmount_(amount) {
  if (amount === '' || amount === null || amount === undefined) {
    throw new Error('Missing amount (H3 must be a positive number)');
  }

  const cleaned = String(amount).replace(/[\s,₪$€£]/g, '');
  const value = Number(cleaned);

  if (!isFinite(value) || value <= 0) {
    throw new Error('Amount must be a positive number');
  }

  return Math.round(value);
}

/**
 * @param {string} raw
 * @returns {{indexedAmount: number, fraction: number}}
 */
function parseCalcIndexRaw_(raw) {
  const lines = String(raw).trim().split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error('Invalid calc response (expected two lines)');
  }

  const indexedAmount = parseInt(lines[0], 10);
  const fraction = parseFloat(lines[1]);

  if (!isFinite(indexedAmount) || !isFinite(fraction)) {
    throw new Error('Invalid calc response (non-numeric lines)');
  }

  return { indexedAmount: indexedAmount, fraction: fraction };
}

/**
 * @param {number} amount
 * @param {string} from
 * @param {string} index
 * @param {string=} to
 * @returns {string}
 */
function fetchWorkerCalcIndex_(amount, from, index, to) {
  const roundedAmount = normalizeCalcAmount_(amount);
  let path =
    'calc?amount=' +
    roundedAmount +
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
  const roundedAmount = normalizeCalcAmount_(amount);
  const fromPeriod = normalizeCalcFrom_(from);
  const toPeriod =
    to !== undefined && to !== null && to !== '' ? normalizeCalcFrom_(to) : to;

  try {
    return honCalcIndexText_(roundedAmount, fromPeriod, index, toPeriod);
  } catch (honError) {
    try {
      return fetchWorkerCalcIndex_(roundedAmount, fromPeriod, index, toPeriod);
    } catch (workerError) {
      throw new Error(
        'HON failed (' +
          honError.message +
          '); Worker failed (' +
          workerError.message +
          ')'
      );
    }
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
  return parseCalcIndexRaw_(raw).indexedAmount;
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
  return parseCalcIndexRaw_(raw).fraction;
}
