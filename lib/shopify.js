/*
 * Shopify Admin API client.
 *
 * The app authenticates per store with an OAuth client-credentials grant, the same
 * flow shopify-stores-sync-metafields uses:
 *
 *   POST https://{shop}.myshopify.com/admin/oauth/access_token
 *     grant_type=client_credentials&client_id=…&client_secret=…
 *   → { access_token, scope: "write_orders,read_customers", expires_in: 86399 }
 *
 * Tokens last 24h, so they are cached in memory per shop and refreshed a minute
 * early rather than fetched per request.
 */

const API_VERSION = '2025-01';

/** Refresh this many ms before expiry, so a request never races the deadline. */
const REFRESH_MARGIN_MS = 60_000;

class ShopifyError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'ShopifyError';
    this.status = status;
    this.body = body;
  }
}

/** Reads the credentials once, so a missing one fails with a clear message. */
function readCredentials(env = process.env) {
  const clientId = env.SHOPIFY_CLIENT_ID;
  const clientSecret = env.SHOPIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new ShopifyError(
      'SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET must be set. See .env.example.',
    );
  }

  return { clientId, clientSecret };
}

/**
 * Whether the Admin API can be used at all. Lets a caller skip the API cleanly
 * rather than attempting it and reporting a failure every single run.
 */
function hasCredentials(env = process.env) {
  return Boolean(env.SHOPIFY_CLIENT_ID && env.SHOPIFY_CLIENT_SECRET);
}

/** Maps an environment to its shop handle, defaulting to the known stores. */
function shopFor(environment, env = process.env) {
  const shop =
    environment === 'staging'
      ? (env.SHOPIFY_STAGING_SHOP ?? 'bloom-brain-stage')
      : (env.SHOPIFY_DEV_SHOP ?? 'bloom-brain-dev');

  if (!shop) throw new ShopifyError(`No shop configured for environment "${environment}".`);
  return shop;
}

class ShopifyClient {
  /**
   * @param {object} options
   * @param {'dev'|'staging'} [options.environment]
   * @param {object} [options.env] process.env, injectable for tests
   * @param {Function} [options.fetch] injectable for tests
   */
  constructor({ environment = 'dev', env = process.env, fetch: fetchImpl = globalThis.fetch } = {}) {
    this.environment = environment;
    this.env = env;
    this.fetch = fetchImpl;
    this.shop = shopFor(environment, env);
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  get baseUrl() {
    return `https://${this.shop}.myshopify.com`;
  }

  /** Cached across calls; Shopify's tokens are valid for 24h. */
  async accessToken() {
    if (this.token && Date.now() < this.tokenExpiresAt) return this.token;

    const { clientId, clientSecret } = readCredentials(this.env);
    const response = await this.fetch(`${this.baseUrl}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });

    if (!response.ok) {
      throw new ShopifyError(`Could not get an access token for ${this.shop}.`, {
        status: response.status,
      });
    }

    const payload = await response.json();
    this.token = payload.access_token;
    this.tokenExpiresAt = Date.now() + Math.max(0, payload.expires_in * 1000 - REFRESH_MARGIN_MS);
    this.scope = payload.scope;

    return this.token;
  }

  /** Admin GraphQL. Shopify reports GraphQL errors with HTTP 200, so both are checked. */
  async graphql(query, variables = {}) {
    const token = await this.accessToken();
    const response = await this.fetch(`${this.baseUrl}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new ShopifyError(`Admin API returned ${response.status}.`, {
        status: response.status,
      });
    }

    const payload = await response.json();
    if (payload.errors?.length) {
      throw new ShopifyError(payload.errors.map((e) => e.message).join('; '), { status: 200 });
    }

    return payload.data;
  }
}

module.exports = {
  ShopifyClient,
  ShopifyError,
  shopFor,
  readCredentials,
  hasCredentials,
  API_VERSION,
};
