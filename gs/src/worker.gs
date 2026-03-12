/**
 * WORKER() — base helper for calling the index-calcs-proxy Cloudflare Worker.
 *
 * Usage in any cell:
 *   =WORKER("health")
 *   =WORKER("rate?format=text")
 *   =WORKER("calc?amount=1000000&from=2023-01&index=cpi")
 *
 * @param {string} path - Path + query string (e.g. "calc?amount=100&from=2024-01")
 * @returns {string} Response body
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
