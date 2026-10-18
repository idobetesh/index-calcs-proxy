/**
 * AAII Investor Sentiment Survey — weekly bullish / neutral / bearish (%).
 */

/** @const {number} Script cache TTL (seconds); matches Worker edge cache (~24h). */
var AAII_SENTIMENT_CACHE_TTL_SEC = 24 * 60 * 60;

/**
 * Recent AAII sentiment weeks (newest first). Spills N rows × 4 columns:
 * weekEnding (ISO), bullish, neutral, bearish.
 *
 * @param {number=} weeks Number of weeks (default 5, max 52).
 * @return {Array<Array<string|number>>} Table spill.
 * @customfunction
 */
function AAII_SENTIMENT(weeks) {
  const n = resolveAaiiWeeks_(weeks);
  const cache = CacheService.getScriptCache();
  const cacheKey = 'aaii_sentiment_' + n;
  const cached = cache.get(cacheKey);
  if (cached !== null) {
    return JSON.parse(cached);
  }

  const table = fetchAaiiSentimentTable_(n);
  cache.put(cacheKey, JSON.stringify(table), AAII_SENTIMENT_CACHE_TTL_SEC);
  return table;
}

/** @param {number=} weeks @returns {number} */
function resolveAaiiWeeks_(weeks) {
  if (weeks === undefined || weeks === null || weeks === '') {
    return 5;
  }
  const n = Number(weeks);
  if (!Number.isFinite(n) || n < 1 || n > 52) {
    throw new Error('weeks must be between 1 and 52');
  }
  return Math.floor(n);
}

/** @param {number} weeks @returns {Array<Array<string|number>>} */
function fetchAaiiSentimentTable_(weeks) {
  const raw = WORKER('aaii-sentiment?weeks=' + encodeURIComponent(String(weeks)) + '&format=json');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error('Invalid AAII sentiment JSON');
  }

  const list = data.weeks;
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('No AAII sentiment weeks in response');
  }

  return list.map(function (row) {
    const bullish = Number(row.bullish);
    const neutral = Number(row.neutral);
    const bearish = Number(row.bearish);
    if (!Number.isFinite(bullish) || !Number.isFinite(neutral) || !Number.isFinite(bearish)) {
      throw new Error('Invalid AAII sentiment row');
    }
    return [String(row.weekEnding ?? ''), bullish, neutral, bearish];
  });
}
