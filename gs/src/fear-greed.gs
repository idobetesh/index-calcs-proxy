/**
 * Fear & Greed via Worker /fear-greed — use FEAR_GREED() only.
 */

/** @const {number} Script cache TTL (seconds); matches Worker edge cache (~30 min). */
var FEAR_GREED_CACHE_TTL_SEC = 30 * 60;

/**
 * Returns the Fear & Greed sentiment index (0–100) and metadata. Spills 5 columns from the formula cell: value | rating | market | source | timestamp. US stocks when market is omitted; cached 30 minutes.
 *
 * @param {string=} market Optional. Use crypto for the crypto index; omit or use stocks for US equities.
 * @return {Array<Array<number|string>>} One row: col 1 index 0-100; col 2 rating; col 3 market; col 4 source; col 5 timestamp (ISO).
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
    return JSON.parse(cached);
  }

  const row = fetchFearGreedRow_(market);
  cache.put(cacheKey, JSON.stringify(row), FEAR_GREED_CACHE_TTL_SEC);
  return row;
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
    String(data.rating ?? ''),
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
