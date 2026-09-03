const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  ShopifyClient,
  ShopifyError,
  shopFor,
  readCredentials,
  hasCredentials,
} = require('../../lib/shopify');

const CREDENTIALS = { SHOPIFY_CLIENT_ID: 'id', SHOPIFY_CLIENT_SECRET: 'secret' };

/** A fetch that answers from a queue and records what it was asked. */
function fakeFetch(responses) {
  const calls = [];
  const queue = [...responses];

  const impl = async (url, options = {}) => {
    calls.push({ url, options });
    const next = queue.shift();
    if (!next) throw new Error(`Unexpected request to ${url}`);
    return {
      ok: next.ok ?? true,
      status: next.status ?? 200,
      json: async () => next.body ?? {},
    };
  };

  impl.calls = calls;
  return impl;
}

const tokenResponse = (overrides = {}) => ({
  body: { access_token: 'tok', expires_in: 86_400, scope: 'read_orders', ...overrides },
});

describe('readCredentials', () => {
  test('returns both credentials when set', () => {
    assert.deepEqual(readCredentials(CREDENTIALS), { clientId: 'id', clientSecret: 'secret' });
  });

  test('names the file to look in when one is missing', () => {
    assert.throws(() => readCredentials({ SHOPIFY_CLIENT_ID: 'id' }), /\.env\.example/);
  });

  test('rejects an empty string as firmly as an absent value', () => {
    assert.throws(() => readCredentials({ ...CREDENTIALS, SHOPIFY_CLIENT_SECRET: '' }), ShopifyError);
  });
});

describe('hasCredentials', () => {
  test('is true only when both are present', () => {
    assert.equal(hasCredentials(CREDENTIALS), true);
    assert.equal(hasCredentials({ SHOPIFY_CLIENT_ID: 'id' }), false);
    assert.equal(hasCredentials({}), false);
  });
});

describe('shopFor', () => {
  test('defaults to the known stores', () => {
    assert.equal(shopFor('dev', {}), 'bloom-brain-dev');
    assert.equal(shopFor('staging', {}), 'bloom-brain-stage');
  });

  test('lets the environment override the default', () => {
    assert.equal(shopFor('dev', { SHOPIFY_DEV_SHOP: 'other-shop' }), 'other-shop');
  });

  test('treats anything that is not staging as dev', () => {
    assert.equal(shopFor(undefined, {}), 'bloom-brain-dev');
  });
});

describe('accessToken', () => {
  test('asks for a client_credentials grant against the right shop', async () => {
    const fetch = fakeFetch([tokenResponse()]);
    const client = new ShopifyClient({ environment: 'dev', env: CREDENTIALS, fetch });

    assert.equal(await client.accessToken(), 'tok');

    const [call] = fetch.calls;
    assert.equal(call.url, 'https://bloom-brain-dev.myshopify.com/admin/oauth/access_token');
    assert.equal(call.options.method, 'POST');
    assert.match(call.options.body, /grant_type=client_credentials/);
    assert.match(call.options.body, /client_id=id/);
  });

  test('caches the token instead of asking once per request', async () => {
    const fetch = fakeFetch([tokenResponse()]);
    const client = new ShopifyClient({ env: CREDENTIALS, fetch });

    await client.accessToken();
    await client.accessToken();

    assert.equal(fetch.calls.length, 1);
  });

  test('refreshes a token that has already expired', async () => {
    const fetch = fakeFetch([tokenResponse({ expires_in: 0 }), tokenResponse({ access_token: 'fresh' })]);
    const client = new ShopifyClient({ env: CREDENTIALS, fetch });

    await client.accessToken();

    assert.equal(await client.accessToken(), 'fresh');
  });

  test('refreshes early, so a request cannot race the deadline', async () => {
    // 30s left is inside the refresh margin: the token is still technically valid
    // but must not be handed out for a request that might outlive it.
    const fetch = fakeFetch([tokenResponse({ expires_in: 30 }), tokenResponse({ access_token: 'fresh' })]);
    const client = new ShopifyClient({ env: CREDENTIALS, fetch });

    await client.accessToken();

    assert.equal(await client.accessToken(), 'fresh');
  });

  test('reports a rejected grant without leaking the credentials', async () => {
    const fetch = fakeFetch([{ ok: false, status: 401 }]);
    const client = new ShopifyClient({ env: CREDENTIALS, fetch });

    await assert.rejects(() => client.accessToken(), (error) => {
      assert.equal(error.status, 401);
      assert.doesNotMatch(error.message, /secret/);
      return true;
    });
  });

  test('fails clearly when no credentials are configured at all', async () => {
    const client = new ShopifyClient({ env: {}, fetch: fakeFetch([]) });

    await assert.rejects(() => client.accessToken(), ShopifyError);
  });
});

describe('graphql', () => {
  test('sends the token as a header and the query as JSON', async () => {
    const fetch = fakeFetch([tokenResponse(), { body: { data: { shop: { name: 'BB' } } } }]);
    const client = new ShopifyClient({ env: CREDENTIALS, fetch });

    const data = await client.graphql('{ shop { name } }', { a: 1 });

    assert.deepEqual(data, { shop: { name: 'BB' } });
    const [, call] = fetch.calls;
    assert.match(call.url, /\/admin\/api\/[\d-]+\/graphql\.json$/);
    assert.equal(call.options.headers['X-Shopify-Access-Token'], 'tok');
    assert.deepEqual(JSON.parse(call.options.body).variables, { a: 1 });
  });

  test('raises errors Shopify reports with HTTP 200', async () => {
    // The failure mode this guards: GraphQL answers 200 with an errors array, so a
    // client that only checks the status returns undefined data as if it succeeded.
    const fetch = fakeFetch([
      tokenResponse(),
      { body: { errors: [{ message: 'Field does not exist' }] } },
    ]);
    const client = new ShopifyClient({ env: CREDENTIALS, fetch });

    await assert.rejects(() => client.graphql('{ nope }'), /Field does not exist/);
  });

  test('raises transport failures too', async () => {
    const fetch = fakeFetch([tokenResponse(), { ok: false, status: 500 }]);
    const client = new ShopifyClient({ env: CREDENTIALS, fetch });

    await assert.rejects(() => client.graphql('{ shop { name } }'), (error) => {
      assert.equal(error.status, 500);
      return true;
    });
  });
});
