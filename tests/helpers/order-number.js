// Shopify confirmation pages surface the order number inside prose ("Your order
// number is: DEV-BB-50F2327") and the selectors we scrape also match unrelated
// headings ("Order summary", "Your order is confirmed"). Extract the token that
// actually looks like an order number, and return null rather than storing prose.

const ORDER_NUMBER_PATTERNS = [
  // Store order names, e.g. DEV-BB-50F2327 / BB-STAGE-50F1412.
  /\b(((?:DEV|STG|STAGE|STAGING)-BB|BB-(?:DEV|STG|STAGE|STAGING))-(?:50F)?\d+)(?![A-Z0-9-])/i,
  /*
   * Classic Shopify order numbers, e.g. "Order #1234".
   *
   * The word is required: a bare /#\d{3,}/ also matches a hex colour, and a real
   * run captured "#303030" off the confirmation page and stored it as the order
   * number.
   */
  /\border\s*#\s*(\d{3,})\b/i,
];

const SHOPIFY_ORDER_NUMBER_PATTERNS = [
  // Checkout copy button: "Copy order number DEV-BB-50F6086 (Order 16808)".
  /\(\s*Order\s+#?\s*(\d{3,})\s*\)/i,
  // Confirmation metadata: "Order 16808".
  /\bOrder\s+#?\s*(\d{3,})\b/i,
];

const CONFIRMATION_NUMBER_PATTERN = /\bconfirmation(?:\s+number)?\s*#?\s*:?\s*([A-Z0-9]+(?:-[A-Z0-9]+)*)\b/i;

function normaliseText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractOrderNumber(text) {
  const value = normaliseText(text);

  if (!value) return null;

  for (const pattern of ORDER_NUMBER_PATTERNS) {
    const match = value.match(pattern);
    // An order number always carries at least one digit; this rejects tokens
    // like "SHOP-NOW" that match the shape but are not identifiers.
    const bbSequence = match?.[1].match(/(?:-BB-|BB-(?:DEV|STG|STAGE|STAGING)-)(?:50F)?(\d+)$/i)?.[1];
    if (match && (!bbSequence || !/^0+$/.test(bbSequence))) {
      return match[1];
    }
  }

  return null;
}

function extractShopifyOrderNumber(text) {
  const value = normaliseText(text);

  if (!value) return null;

  for (const pattern of SHOPIFY_ORDER_NUMBER_PATTERNS) {
    const match = value.match(pattern);
    if (match) return match[1];
  }

  return null;
}

function extractConfirmationNumber(text) {
  const value = normaliseText(text);

  if (!value) return null;

  const code = value.match(CONFIRMATION_NUMBER_PATTERN)?.[1];
  if (!code || !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(code)) return null;
  return code.length >= 8 || code.includes('-') ? code : null;
}

module.exports = { extractOrderNumber, extractShopifyOrderNumber, extractConfirmationNumber };
