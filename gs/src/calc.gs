/**
 * Index calculation helpers.
 *
 * CALC_* tries CBS through the Worker first. HON is a fallback for national indexes.
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

var HOUSING_REGIONS = ['jerusalem', 'north', 'haifa', 'central', 'tel aviv', 'south'];

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
 * @param {string=} region
 * @param {string=} basis
 * @returns {string}
 */
function fetchWorkerCalcIndex_(amount, from, index, to, region, basis) {
  const roundedAmount = normalizeCalcAmount_(amount);
  let path =
    'calc?amount=' +
    roundedAmount +
    '&from=' +
    from +
    '&index=' +
    index +
    '&format=text&basis=' + basis;
  if (to) {
    path += '&to=' + to;
  }
  if (region) {
    path += '&region=' + encodeURIComponent(region);
  }
  return WORKER(path);
}

/**
 * CBS first, HON on failure for national indexes. Two lines: indexed amount, percent fraction.
 *
 * @param {number} amount
 * @param {string} from
 * @param {string} index
 * @param {string=} to
 * @param {string=} region
 * @param {string=} basis
 * @returns {string}
 */
function calcIndexRaw_(amount, from, index, to, region, basis) {
  const roundedAmount = normalizeCalcAmount_(amount);
  const fromPeriod = normalizeCalcFrom_(from);
  const toPeriod =
    to !== undefined && to !== null && to !== '' ? normalizeCalcFrom_(to) : to;

  const selectedBasis = String(basis == null ? '' : basis).trim().toLowerCase() || 'known';
  if (selectedBasis !== 'known' && selectedBasis !== 'period') {
    throw new Error('Choose a basis: known or period.');
  }

  const district = String(region == null ? '' : region).trim().toLowerCase();
  if (district) {
    if (String(index).trim().toLowerCase() !== 'housing') {
      throw new Error('Region is available for the housing index.');
    }
    if (HOUSING_REGIONS.indexOf(district) === -1) {
      throw new Error('Choose a housing region: ' + HOUSING_REGIONS.join(', ') + '.');
    }
    return fetchWorkerCalcIndex_(roundedAmount, fromPeriod, 'housing', toPeriod, district, selectedBasis);
  }

  if (selectedBasis === 'period') {
    return fetchWorkerCalcIndex_(roundedAmount, fromPeriod, index, toPeriod, '', selectedBasis);
  }

  try {
    return fetchWorkerCalcIndex_(roundedAmount, fromPeriod, index, toPeriod, '', selectedBasis);
  } catch (workerError) {
    const cache = CacheService.getScriptCache();
    const blockedKey = 'hon_fallback_blocked_' + String(index).trim().toLowerCase();
    if (cache.get(blockedKey) !== null) {
      throw new Error('Worker failed (' + workerError.message + '); HON fallback paused after HTTP 403');
    }

    try {
      return honCalcIndexText_(roundedAmount, fromPeriod, index, toPeriod);
    } catch (honError) {
      if (honError.httpStatus === 403) {
        cache.put(blockedKey, '1', HON_CACHE_TTL_SEC);
      }
      throw new Error(
        'Worker failed (' + workerError.message + '); HON failed (' + honError.message + ')'
      );
    }
  }
}

/**
 * CBS index adjustment: two-line text — indexed amount, then change as decimal fraction.
 *
 * @param {number} amount Original amount (positive number).
 * @param {string} from Start period YYYY-MM.
 * @param {string} index cpi, construction, or housing.
 * @param {string=} to End period YYYY-MM (optional; latest published if omitted).
 * @param {string=} region Housing district. Blank uses the national index. Choices: jerusalem, north, haifa, central, tel aviv, south.
 * @param {string=} basis known (default) uses publication lags; period uses index months.
 * @return {string} Line 1: indexed amount; line 2: fraction (e.g. 0.053).
 * @customfunction
 */
function CALC_INDEX(amount, from, index, to, region, basis) {
  return calcIndexRaw_(amount, from, index, to, region, basis);
}

/**
 * CBS index adjustment: inflation-linked amount only (integer).
 *
 * @param {number} amount Original amount.
 * @param {string} from Start period YYYY-MM.
 * @param {string} index cpi, construction, or housing.
 * @param {string=} to End period YYYY-MM (optional).
 * @param {string=} region Housing district. Blank uses the national index. Choices: jerusalem, north, haifa, central, tel aviv, south.
 * @param {string=} basis known (default) uses publication lags; period uses index months.
 * @return {number} Indexed amount rounded to integer.
 * @customfunction
 */
function CALC_AMOUNT(amount, from, index, to, region, basis) {
  const raw = calcIndexRaw_(amount, from, index, to, region, basis);
  return parseCalcIndexRaw_(raw).indexedAmount;
}

/**
 * CBS index adjustment: total change as decimal fraction (use TEXT(...,"0.00%") to display).
 *
 * @param {number} amount Original amount.
 * @param {string} from Start period YYYY-MM.
 * @param {string} index cpi, construction, or housing.
 * @param {string=} to End period YYYY-MM (optional).
 * @param {string=} region Housing district. Blank uses the national index. Choices: jerusalem, north, haifa, central, tel aviv, south.
 * @param {string=} basis known (default) uses publication lags; period uses index months.
 * @return {number} Fraction (e.g. 0.082 for 8.2%).
 * @customfunction
 */
function CALC_PERCENT(amount, from, index, to, region, basis) {
  const raw = calcIndexRaw_(amount, from, index, to, region, basis);
  return parseCalcIndexRaw_(raw).fraction;
}
