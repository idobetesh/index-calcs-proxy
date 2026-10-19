/**
 * Default Worker origin (no trailing slash). Override with Script property WORKER_URL.
 * @const {string}
 */
var WORKER_DEFAULT_BASE_URL = 'https://index-calcs-proxy.idobetesh.workers.dev';

/**
 * Worker base URL from script properties (WORKER_URL) or default.
 * @return {string}
 */
function workerBaseUrl_() {
  var custom = PropertiesService.getScriptProperties().getProperty('WORKER_URL');
  var base = (custom && String(custom).trim()) || WORKER_DEFAULT_BASE_URL;
  return String(base).replace(/\/+$/, '');
}

/**
 * Raw HTTP GET to the index-calcs-proxy Worker (path + query; auth via script property).
 *
 * @param {string} path Worker path and query, e.g. "health" or "calc?amount=100&from=2024-01&index=cpi".
 * @return {string} Response body text.
 * @customfunction
 */
function WORKER(path) {
  var secret = PropertiesService.getScriptProperties().getProperty('SECRET_KEY') ?? '';
  var url = workerBaseUrl_() + '/' + path;

  var response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + secret },
    muteHttpExceptions: true,
  });

  var code = response.getResponseCode();
  if (code !== 200) {
    throw new Error('Worker returned HTTP ' + code + ': ' + response.getContentText());
  }

  return response.getContentText().trim();
}
