// Shopify confirmation pages surface the order number inside prose ("Your order
// number is: DEV-BB-50F2327") and the selectors we scrape also match unrelated
// headings ("Order summary", "Your order is confirmed"). Extract the token that
// actually looks like an order number, and return null rather than storing prose.

const ORDER_NUMBER_PATTERNS = [
  // Environment-prefixed identifiers, e.g. DEV-BB-50F2327 / STAGE-BB-1204.
  /\b([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)\b/,
  /*
   * Classic Shopify order numbers, e.g. "Order #1234".
   *
   * The word is required: a bare /#\d{3,}/ also matches a hex colour, and a real
   * run captured "#303030" off the confirmation page and stored it as the order
   * number.
   */
  /\border\s*#\s*(\d{3,})\b/i,
];

function extractOrderNumber(text) {
  const value = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!value) return null;

  for (const pattern of ORDER_NUMBER_PATTERNS) {
    const match = value.match(pattern);
    // An order number always carries at least one digit; this rejects tokens
    // like "SHOP-NOW" that match the shape but are not identifiers.
    if (match && /\d/.test(match[1])) {
      return match[1];
    }
  }

  return null;
}

module.exports = { extractOrderNumber };
