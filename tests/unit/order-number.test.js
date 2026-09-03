const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { extractOrderNumber } = require('../helpers/order-number');

describe('extractOrderNumber', () => {
  describe('regression: prose from the confirmation page is not an order number', () => {
    // order-history.json accumulated 476 entries with only 63 distinct
    // orderNumbers: 362 were "Your order is confirmed", 32 "Finalize order" and
    // 22 "Order summary", all scraped verbatim from headings the selectors matched.
    const headings = [
      'Your order is confirmed',
      'Order summary',
      'Finalize order',
      'Thank you!',
      'Order',
      '',
      '   ',
    ];

    for (const heading of headings) {
      test(`rejects ${JSON.stringify(heading)}`, () => {
        assert.equal(extractOrderNumber(heading), null);
      });
    }

    test('the old fallback regex captured "summary" from "Order summary"', () => {
      // Documents precisely what regressed: /(Order|#)\s*([A-Z0-9\-]+)/i is
      // case-insensitive, so [A-Z0-9-]+ also matched lowercase words.
      const legacyMatch = 'Order summary'.match(/(Order|#)\s*([A-Z0-9\-]+)/i);

      assert.equal(legacyMatch[2], 'summary');
      assert.equal(extractOrderNumber('Order summary'), null);
    });
  });

  describe('extracts the identifier out of surrounding prose', () => {
    test('pulls the token from "Your order number is: DEV-BB-50F2327"', () => {
      assert.equal(extractOrderNumber('Your order number is: DEV-BB-50F2327'), 'DEV-BB-50F2327');
    });

    test('handles staging identifiers', () => {
      assert.equal(extractOrderNumber('Your order number is: STAGE-BB-1204'), 'STAGE-BB-1204');
    });

    test('collapses newlines and surrounding whitespace', () => {
      const text = '\n  Your order number is:\n\n   DEV-BB-50F2340  \n';

      assert.equal(extractOrderNumber(text), 'DEV-BB-50F2340');
    });

    test('reads a classic Shopify number and drops the hash', () => {
      assert.equal(extractOrderNumber('Order #1234 confirmed'), '1234');
    });
  });

  describe('shape guards', () => {
    test('rejects a hyphenated token with no digits', () => {
      assert.equal(extractOrderNumber('SHOP-NOW'), null);
    });

    test('rejects short bare numbers that are not order numbers', () => {
      assert.equal(extractOrderNumber('Arrives in 3 days'), null);
    });

    test('tolerates null and undefined', () => {
      assert.equal(extractOrderNumber(null), null);
      assert.equal(extractOrderNumber(undefined), null);
    });
  });

  describe('every junk value already in order-history.json is now rejected', () => {
    const junkFromHistory = ['Your order is confirmed', 'Order summary', 'Finalize order'];

    test('none of them survive extraction', () => {
      const survivors = junkFromHistory.filter((value) => extractOrderNumber(value) !== null);

      assert.deepEqual(survivors, []);
    });
  });
});

describe('regression: a hex colour is not an order number', () => {
  /*
   * A real run against the dev store captured "#303030" — a dark grey — and stored
   * it as the order number. The bare /#\d{3,}/ fallback matched it, and because it
   * matched, the selector loop stopped before reaching the element that actually
   * holds "Your order number is: DEV-BB-50F5137".
   */
  for (const text of ['#303030', 'color: #303030', '.x{color:#303030}', '#ffffff', '#123456']) {
    test(`rejects ${JSON.stringify(text)}`, () => {
      assert.equal(extractOrderNumber(text), null);
    });
  }

  test('still reads a numeric order number when the word is there', () => {
    assert.equal(extractOrderNumber('Order #1234 confirmed'), '1234');
  });

  test('is case-insensitive about the word', () => {
    assert.equal(extractOrderNumber('ORDER #987654'), '987654');
  });

  test('a page carrying both a hex colour and a real id reads the id', () => {
    const page = '<style>.a{color:#303030}</style> Your order number is: DEV-BB-50F5137';

    assert.equal(extractOrderNumber(page), 'DEV-BB-50F5137');
  });
});
