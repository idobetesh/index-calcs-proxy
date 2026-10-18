export interface Env {
  SECRET_KEY: string;
  ENVIRONMENT: string;
  /** Optional — raises Jina Reader rate limits (wrangler secret put JINA_API_KEY). */
  JINA_API_KEY?: string;
}
