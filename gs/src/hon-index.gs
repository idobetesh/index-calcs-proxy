/**
 * HON (hon.co.il) index calculations from embedded HON_CBS_IDX data.
 *
 * Usage:
 *   =HONINDEX(G3, F3, "cpi")
 *   =HONINDEX(G3, F3, "cpi", H3)
 *   =HONINDEX(G3, F3, "housing")
 *   =HONINDEX(G3, F3, "construction")
 */

/** @const {number} Cache TTL for fetched index maps (seconds). */
var HON_CACHE_TTL_SEC = 4 * 60 * 60;

/** @const {Object<string, {series: string, lag: number, url: string}>} */
var HON_TYPES = {
  construction: {
    series: '200010',
    lag: 2,
    url:
      'https://www.hon.co.il/%D7%9E%D7%97%D7%A9%D7%91%D7%95%D7%9F-%D7%9E%D7%93%D7%93-%D7%AA%D7%A9%D7%95%D7%9E%D7%95%D7%AA-%D7%94%D7%91%D7%A0%D7%99%D7%99%D7%94/',
  },
  housing: {
    series: '40010',
    lag: 3,
    url:
      'https://www.hon.co.il/%D7%9E%D7%97%D7%A9%D7%91%D7%95%D7%9F-%D7%9E%D7%97%D7%99%D7%A8%D7%99-%D7%94%D7%93%D7%99%D7%A8%D7%95%D7%AA/',
  },
  cpi: {
    series: '120010',
    lag: 2,
    url:
      'https://www.hon.co.il/%D7%9E%D7%97%D7%A9%D7%91%D7%95%D7%9F-%D7%9E%D7%93%D7%93-%D7%9E%D7%97%D7%99%D7%A8%D7%99%D7%9D-%D7%9C%D7%A6%D7%A8%D7%9B%D7%9F/',
  },
};

/**
 * @param {string} type
 * @returns {Object<string, number|string>}
 */
function getHonIndexMap_(type) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'hon_series_' + type;
  const cached = cache.get(cacheKey);
  if (cached !== null) {
    return JSON.parse(cached);
  }

  const config = HON_TYPES[type];
  const response = UrlFetchApp.fetch(config.url, {
    muteHttpExceptions: true,
    followRedirects: true,
  });

  if (response.getResponseCode() !== 200) {
    throw new Error('HON returned HTTP ' + response.getResponseCode());
  }

  const html = response.getContentText();
  const regex = /data:text\/javascript;base64,([A-Za-z0-9+/=]+)/g;
  let match;
  let honCode = null;

  while ((match = regex.exec(html)) !== null) {
    try {
      const decoded = Utilities.newBlob(Utilities.base64Decode(match[1])).getDataAsString();
      if (
        decoded.indexOf('HON_CBS_IDX') !== -1 &&
        decoded.indexOf('"' + config.series + '"') !== -1
      ) {
        honCode = decoded;
        break;
      }
    } catch (e) {
      // skip invalid base64 blocks
    }
  }

  if (!honCode) {
    throw new Error('Could not find HON index database for ' + type);
  }

  const marker = 'var HON_CBS_IDX = ';
  const start = honCode.indexOf(marker);
  if (start === -1) {
    throw new Error('HON_CBS_IDX not found');
  }

  const jsonStart = start + marker.length;
  const jsonEnd = honCode.indexOf(';', jsonStart);
  if (jsonEnd === -1) {
    throw new Error('Could not parse HON index database');
  }

  const data = JSON.parse(honCode.substring(jsonStart, jsonEnd).trim());
  if (!data.series || !data.series[config.series]) {
    throw new Error('HON series ' + config.series + ' not found');
  }

  const indexMap = data.series[config.series];
  const payload = JSON.stringify(indexMap);
  if (payload.length > 90000) {
    throw new Error('HON index map too large to cache');
  }

  cache.put(cacheKey, payload, HON_CACHE_TTL_SEC);
  return indexMap;
}

/**
 * @param {Date|string|number} value
 * @returns {Date}
 */
function parseHonDate_(value) {
  if (value instanceof Date) {
    const copy = new Date(value);
    if (isNaN(copy.getTime())) {
      throw new Error('Invalid date');
    }
    return copy;
  }

  const text = String(value).trim();
  let match = text.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, 1);
  }

  match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new Error('Invalid date: ' + value);
  }
  return date;
}

/**
 * @param {Date} date
 * @param {number} lag
 * @returns {string}
 */
function honKnownKey_(date, lag) {
  const d = new Date(date);
  d.setDate(1);
  d.setMonth(d.getMonth() - lag);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

/**
 * @param {Object<string, number|string>} indexMap
 * @param {string} key
 * @returns {{key: string, value: number}}
 */
function honLookup_(indexMap, key) {
  const parts = key.split('-');
  let y = Number(parts[0]);
  let m = Number(parts[1]);

  for (let i = 0; i <= 8; i++) {
    const k = y + '-' + String(m).padStart(2, '0');
    if (indexMap[k] != null) {
      return { key: k, value: Number(indexMap[k]) };
    }
    m--;
    if (m < 1) {
      m = 12;
      y--;
    }
  }

  throw new Error('No HON index available for ' + key);
}

/**
 * @param {Date|string} startDate
 * @param {number} amount
 * @param {string} type
 * @param {Date|string=} endDate
 * @returns {number}
 */
function honIndexedAmount_(startDate, amount, type, endDate) {
  const normalizedType = String(type || 'construction').trim().toLowerCase();
  if (!HON_TYPES[normalizedType]) {
    throw new Error('Invalid type. Use "construction", "housing", or "cpi".');
  }

  const config = HON_TYPES[normalizedType];
  const indexMap = getHonIndexMap_(normalizedType);
  const parsedStart = parseHonDate_(startDate);
  const parsedEnd =
    endDate !== undefined && endDate !== null && endDate !== ''
      ? parseHonDate_(endDate)
      : new Date();

  const startIndex = honLookup_(indexMap, honKnownKey_(parsedStart, config.lag));
  const endIndex = honLookup_(indexMap, honKnownKey_(parsedEnd, config.lag));

  return Number(amount) * (endIndex.value / startIndex.value);
}

/**
 * Same two-line plain text as the Worker calc endpoint (for CALC_INDEX fallback).
 *
 * @param {number} amount
 * @param {string} from Start period YYYY-MM (or parseHonDate_-compatible string)
 * @param {string} index cpi, construction, or housing
 * @param {string=} to End period YYYY-MM (optional; default = today for HON)
 * @returns {string}
 */
function honCalcIndexText_(amount, from, index, to) {
  const amt = Number(amount);
  const endArg =
    to !== undefined && to !== null && to !== '' ? to : undefined;
  const exact = honIndexedAmount_(from, amt, index, endArg);
  const indexedAmount = Math.round(exact);
  const multiplier = exact / amt;
  const percentage = Math.round((multiplier - 1) * 100 * 100) / 100;
  const fraction = (percentage / 100).toFixed(4);
  return indexedAmount + '\n' + fraction;
}

/**
 * Calculates an amount adjusted according to HON index data.
 *
 * @param {Date|string} startDate Starting date (Date, YYYY-MM, or YYYY-MM-DD).
 * @param {number} amount Original amount to adjust.
 * @param {string} type Index type: "construction", "housing", or "cpi".
 * @param {Date|string=} endDate Optional ending date. Defaults to today.
 * @return {number} The amount adjusted according to the selected index.
 * @customfunction
 */
function HONINDEX(startDate, amount, type, endDate) {
  if (!startDate || amount === '' || amount == null) {
    return '';
  }
  return honIndexedAmount_(startDate, amount, type, endDate);
}
