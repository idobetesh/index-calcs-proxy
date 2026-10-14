/**
 * Raw HTTP GET to the index-calcs-proxy Worker (path + query; secret from script properties).
 *
 * @param {string} path Worker path and query, e.g. "health" or "calc?amount=100&from=2024-01&index=cpi".
 * @return {string} Response body text.
 * @customfunction
 */
function WORKER(path) {
  const secret = PropertiesService.getScriptProperties().getProperty('SECRET_KEY') ?? '';
  const sep = path.includes('?') ? '&' : '?';
  const url = `https://index-calcs-proxy.idobetesh.workers.dev/${path}${sep}secret=${secret}`;

  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
  });

  const code = response.getResponseCode();
  if (code !== 200) {
    throw new Error(`Worker returned HTTP ${code}: ${response.getContentText()}`);
  }

  return response.getContentText().trim();
}
