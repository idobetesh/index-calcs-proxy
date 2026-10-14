/**
 * Fear & Greed via Worker /fear-greed — use FEAR_GREED() only.
 */

/** @const {number} Script cache TTL (seconds); matches Worker edge cache (~30 min). */
var FEAR_GREED_CACHE_TTL_SEC = 30 * 60;

/**
 * Fear & Greed index (0–100) and metadata; spills 5 columns: value, rating, market, source, timestamp.
 *
 * @param {string=} market Omit or "stocks" for CNN US index; "crypto" for Bitcoin index.
 * @return {Array<Array<number|string>>} One row — value, title-case rating, market, source, ISO timestamp.
 * @customfunction
 */
function FEAR_GREED(market) {
  const m = resolveFearGreedMarket_(market);
  return [fearGreedRow_(m)];
}

/**
 * @param {"stocks"|"crypto"} market
 * @returns {(string|number)[]}
 */
function fearGreedRow_(market) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'fear_greed_' + market;
  const cached = cache.get(cacheKey);
  if (cached !== null) {
    const row = JSON.parse(cached);
    row[1] = capitalizeFirst_(row[1]);
    return row;
  }

  const row = fetchFearGreedRow_(market);
  cache.put(cacheKey, JSON.stringify(row), FEAR_GREED_CACHE_TTL_SEC);
  return row;
}

/** Title-case each word: extreme fear → Extreme Fear */
function capitalizeFirst_(text) {
  const s = String(text ?? '').trim();
  if (s === '') {
    return '';
  }
  return s.toLowerCase().split(/\s+/).map(function (word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');
}

/**
 * @param {"stocks"|"crypto"} market
 * @returns {(string|number)[]}
 */
function fetchFearGreedRow_(market) {
  const raw = WORKER('fear-greed?market=' + encodeURIComponent(market) + '&format=json');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error('Invalid Fear & Greed JSON');
  }

  const value = Number(data.value);
  if (!Number.isFinite(value)) {
    throw new Error('Invalid Fear & Greed value');
  }

  return [
    Math.round(value),
    capitalizeFirst_(data.rating),
    String(data.market ?? market),
    String(data.source ?? ''),
    String(data.timestamp ?? ''),
  ];
}

/** @param {string=} market @returns {"stocks"|"crypto"} */
function resolveFearGreedMarket_(market) {
  const key = String(market ?? '')
    .trim()
    .toLowerCase();
  if (key === '') {
    return 'stocks';
  }
  if (key === 'crypto' || key === 'bitcoin' || key === 'btc') {
    return 'crypto';
  }
  if (key === 'stocks' || key === 'stock' || key === 'equity' || key === 'market') {
    return 'stocks';
  }
  throw new Error('market must be omitted (stocks), "stocks", or "crypto"');
}
