// Shopify surfaces its own rate-limiting notice with the same wording we use to
// detect real checkout failures, so it is ignored on purpose.
const IGNORED_CHECKOUT_ERRORS = ['There was a problem with our checkout'];

// "declined" / "could not be processed" are the wordings Shopify uses for a
// rejected card; without them the most common real failure went undetected.
const CHECKOUT_ERROR_SELECTOR =
  'text=/There was a problem|error|failed|declined|could not be processed|unable to process/i';

// Returns the checkout error text, or null when the page is clean or unreadable.
// This never throws: the caller decides how to fail, so that a "browser may have
// closed" guard can never swallow a genuine checkout failure.
async function readCheckoutError(page) {
  let errorText = null;

  try {
    errorText = await page
      .locator(CHECKOUT_ERROR_SELECTOR)
      .first()
      .textContent({ timeout: 3000 })
      .catch(() => null);
  } catch (e) {
    return null;
  }

  if (!errorText) return null;
  if (IGNORED_CHECKOUT_ERRORS.some((ignored) => errorText.includes(ignored))) return null;

  return errorText;
}

module.exports = { readCheckoutError, CHECKOUT_ERROR_SELECTOR, IGNORED_CHECKOUT_ERRORS };
