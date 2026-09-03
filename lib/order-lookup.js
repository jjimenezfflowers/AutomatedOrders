/*
 * Finds the order a checkout run just created, by asking the store instead of
 * reading the confirmation page.
 *
 * Scraping produced 55 history entries whose "order number" was page furniture —
 * "Finalize order", "Order summary" — and one that was the hex colour #303030. The
 * store knows what it created; asking it is both correct and cheaper than guessing
 * at checkout markup, whose class names Shopify generates and does not keep stable.
 *
 * Admin GraphQL only. The REST Admin API is on its way out, and everything needed
 * here is available in GraphQL: `name` is the number a person quotes,
 * `confirmationNumber` is what the thank-you page shows, and `statusPageUrl`
 * carries the order-status token the browser was redirected to.
 *
 * Three ways in, in order of confidence:
 *
 *  1. The cart token. The storefront's documented Ajax API hands it out at
 *     /cart.js, and the order search accepts it as `cart_token:` — so a run that
 *     noted its own cart token can ask for exactly one order and get it. This is
 *     the only path that stays exact when several runs overlap.
 *  2. The order-status token, from the URL the browser landed on
 *     (…/{shop_id}/orders/{token}), matched against `statusPageUrl`.
 *  3. A time window plus the products ordered — the run knows when it started and
 *     what it asked for. Weakest, but it still works when the browser closed
 *     early, which is the case scraping handled worst.
 *
 * `cart_token` and `checkout_token` are search filters only: the `Order` type does
 * not expose them as fields, so they can be queried but never read back. That the
 * filters are real was confirmed against a live store — an unknown key such as
 * `zzz_not_a_filter:` is silently ignored and returns unrelated orders, while
 * `cart_token:` returned exactly the one matching order.
 *
 * The checkout page's `serialized-sourceToken` is deliberately not used: it did not
 * equal the cart token of the order that same run produced (hWNGO7ok… against
 * hWNGO828…), so matching on it would silently find nothing. The shared `hWNGO`
 * prefix is the store's, not the session's.
 */

const { ShopifyClient } = require('./shopify');

/** Identity, money and lines — everything the history file records about an order. */
const ORDER_FRAGMENT = `
  id
  name
  confirmationNumber
  statusPageUrl
  createdAt
  displayFinancialStatus
  totalPriceSet { shopMoney { amount currencyCode } }
  lineItems(first: 50) {
    nodes { title quantity variantTitle }
  }
`;

const RECENT_ORDERS_QUERY = `
  query RecentOrders($first: Int!, $query: String) {
    orders(first: $first, reverse: true, sortKey: CREATED_AT, query: $query) {
      nodes { ${ORDER_FRAGMENT} }
    }
  }
`;

const ORDER_SEARCH_QUERY = `
  query FindOrder($query: String!) {
    orders(first: 2, reverse: true, sortKey: CREATED_AT, query: $query) {
      nodes { ${ORDER_FRAGMENT} }
    }
  }
`;

const ORDER_BY_ID_QUERY = `
  query OrderById($id: ID!) {
    order(id: $id) { ${ORDER_FRAGMENT} }
  }
`;

/**
 * Pulls the order-status token out of whatever URL the checkout landed on.
 * Both `…/orders/{token}` and `…/orders/{token}?key=…` are handled.
 */
function orderTokenFromUrl(url) {
  if (!url) return null;
  const match = String(url).match(/\/orders\/([a-f0-9]{20,})/i);
  return match ? match[1] : null;
}

/**
 * Pulls the cart token out of a checkout URL. Shopify's checkout lives at
 * /checkouts/cn/{cartToken}/…, so the token is on screen for the whole of
 * checkout — steadier than /cart.js, which needs the storefront session and is
 * gone once the browser is on the checkout domain.
 *
 * Confirmed against a live order: the run that landed on
 * /checkouts/cn/hWNGO9qYF0y9W6MN7NCvSaGY/en-us/payment produced the order filed
 * under cart_token hWNGO9qYF0y9W6MN7NCvSaGY.
 */
function cartTokenFromCheckoutUrl(url) {
  if (!url) return null;
  const match = String(url).match(/\/checkouts\/cn\/([A-Za-z0-9_-]{16,})/);
  return match ? match[1] : null;
}

/**
 * Normalises a cart token for searching. /cart.js returns
 * `hWNGO8pyCVTkUGxB0qq58SCQ?key=3ad3647…`, but the order is filed under the part
 * before the `?` — the key is a separate read credential, not part of the token.
 */
function normaliseCartToken(token) {
  if (!token) return null;
  return String(token).split('?')[0].trim() || null;
}

/** Flattens a GraphQL order into the shape the history file stores. */
function summarise(order) {
  if (!order) return null;

  const money = order.totalPriceSet?.shopMoney;

  return {
    id: order.id ?? null,
    orderNumber: order.name ?? null,
    confirmationNumber: order.confirmationNumber ?? null,
    statusUrl: order.statusPageUrl ?? null,
    createdAt: order.createdAt ?? null,
    financialStatus: order.displayFinancialStatus ?? null,
    total: money ? `${money.amount} ${money.currencyCode}` : null,
    products: (order.lineItems?.nodes ?? []).map((item) => ({
      title: item.title,
      quantity: item.quantity,
      variant: item.variantTitle ?? undefined,
    })),
  };
}

class OrderLookup {
  constructor({ environment = 'dev', client, ...options } = {}) {
    this.client = client ?? new ShopifyClient({ environment, ...options });
  }

  /** Orders created at or after `since`, newest first. */
  async recentOrders({ since, first = 20 } = {}) {
    // Shopify's search syntax wants the timestamp quoted; unquoted it parses the
    // colons in the time as extra filter separators and matches nothing.
    const query = since ? `created_at:>='${new Date(since).toISOString()}'` : null;
    const data = await this.client.graphql(RECENT_ORDERS_QUERY, { first, query });

    return data.orders?.nodes ?? [];
  }

  /** A single order by its GraphQL id, e.g. gid://shopify/Order/6103319609484. */
  async orderById(id) {
    const data = await this.client.graphql(ORDER_BY_ID_QUERY, { id });
    return summarise(data.order);
  }

  /**
   * Finds the single order matching a search filter, or null if it is ambiguous.
   * Two hits means the filter did not identify one order, and guessing between
   * them would be worse than falling through to a slower but honest match.
   */
  async findOneBy(query) {
    const data = await this.client.graphql(ORDER_SEARCH_QUERY, { query });
    const nodes = data.orders?.nodes ?? [];

    return nodes.length === 1 ? nodes[0] : null;
  }

  /**
   * The order this run created.
   *
   * @param {object} options
   * @param {string} [options.cartToken] from /cart.js, with or without its ?key=
   * @param {string} [options.statusUrl] the URL the checkout landed on
   * @param {Date|string|number} [options.since] when the run started
   * @param {string[]} [options.productTitles] what the run ordered
   * @returns {Promise<object|null>} the order, tagged with how it was matched
   */
  async findRunOrder({ cartToken, statusUrl, since, productTitles = [] } = {}) {
    const cart = normaliseCartToken(cartToken);
    if (cart) {
      const exact = await this.findOneBy(`cart_token:${cart}`);
      if (exact) return { ...summarise(exact), matchedBy: 'cartToken' };
    }

    const token = orderTokenFromUrl(statusUrl);
    const orders = await this.recentOrders({ since });

    if (token) {
      const exact = orders.find((order) => (order.statusPageUrl ?? '').includes(token));
      if (exact) return { ...summarise(exact), matchedBy: 'orderStatusToken' };
    }

    if (!orders.length) return null;

    // Without a token, the newest order carrying every product this run asked for
    // is its own. Requiring all of them avoids picking up a concurrent run that
    // happened to order one of the same items.
    const wanted = productTitles.map((title) => title.toLowerCase()).filter(Boolean);
    if (wanted.length) {
      const match = orders.find((order) => {
        const titles = (order.lineItems?.nodes ?? []).map((item) => (item.title ?? '').toLowerCase());
        return wanted.every((title) => titles.some((candidate) => candidate.includes(title)));
      });
      if (match) return { ...summarise(match), matchedBy: 'productsAndTime' };
    }

    return { ...summarise(orders[0]), matchedBy: 'mostRecent' };
  }
}

module.exports = {
  OrderLookup,
  orderTokenFromUrl,
  cartTokenFromCheckoutUrl,
  normaliseCartToken,
  summarise,
  ORDER_FRAGMENT,
};
