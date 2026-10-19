/** Response shape: explicit ?format= wins; else Accept: application/json → json (UI fetch). */
export function resolveTextJsonFormat(
  formatParam: string | undefined,
  acceptHeader: string | undefined,
): 'text' | 'json' | undefined {
  if (formatParam === 'json' || formatParam === 'text') {
    return formatParam;
  }
  const accept = acceptHeader?.toLowerCase() ?? '';
  if (accept.includes('application/json')) {
    return 'json';
  }
  return undefined;
}

/** @deprecated Use resolveTextJsonFormat */
export const resolveEtfQueryFormat = resolveTextJsonFormat;
