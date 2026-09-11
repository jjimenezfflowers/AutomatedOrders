const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { parseDeliveryDate } = require('../helpers/product-form');

describe('parseDeliveryDate', () => {
  describe('regression: slash dates are month-first (US storefront)', () => {
    // Bug: `isMonthFirst = second > 12` made every ambiguous slash date day-first,
    // so 09/10/2026 resolved to October 9 and the order shipped a month late.
    test('09/10/2026 is September 10, not October 9', () => {
      const parsed = parseDeliveryDate('09/10/2026');

      assert.equal(parsed.month, 9);
      assert.equal(parsed.day, 10);
      assert.equal(parsed.iso, '2026-09-10');
    });

    test('every ambiguous pair below 13 keeps the first component as the month', () => {
      for (let month = 1; month <= 12; month++) {
        for (let day = 1; day <= 12; day++) {
          const input = `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/2026`;
          const parsed = parseDeliveryDate(input);

          assert.equal(parsed.month, month, `month for ${input}`);
          assert.equal(parsed.day, day, `day for ${input}`);
        }
      }
    });

    test('falls back to day-first only when the first component cannot be a month', () => {
      const parsed = parseDeliveryDate('25/12/2026');

      assert.equal(parsed.month, 12);
      assert.equal(parsed.day, 25);
      assert.equal(parsed.iso, '2026-12-25');
    });

    test('unambiguous month-first dates are unchanged', () => {
      const parsed = parseDeliveryDate('12/25/2026');

      assert.equal(parsed.month, 12);
      assert.equal(parsed.day, 25);
      assert.equal(parsed.iso, '2026-12-25');
    });
  });

  describe('ISO dates', () => {
    test('parses YYYY-MM-DD', () => {
      const parsed = parseDeliveryDate('2026-09-10');

      assert.equal(parsed.year, '2026');
      assert.equal(parsed.month, 9);
      assert.equal(parsed.day, 10);
      assert.equal(parsed.iso, '2026-09-10');
    });

    test('zero-pads single-digit components in iso', () => {
      assert.equal(parseDeliveryDate('2026-9-3').iso, '2026-09-03');
    });
  });

  describe('rejects input it cannot honour', () => {
    for (const input of ['', null, undefined, 'tomorrow', '2026/09/10', '09-10-2026']) {
      test(`throws on ${JSON.stringify(input)}`, () => {
        assert.throws(() => parseDeliveryDate(input), /Formato de fecha no soportado/);
      });
    }

    for (const input of ['2026-13-01', '2026-00-10', '2026-09-32', '13/32/2026']) {
      test(`throws on out-of-range ${input}`, () => {
        assert.throws(() => parseDeliveryDate(input), /Fecha invalida|Formato de fecha no soportado/);
      });
    }
  });
});

describe('parseDeliveryDate relative offsets', () => {
  // Regression: mini-calla-product-options.spec.js pinned "2026-09-02" (the day it
  // was written) and three checked-in order configs pointed at dates already in the
  // past, so `npm run test:peach-sorbet` failed on day one.
  const now = new Date(2026, 8, 2); // 2026-09-02

  test('+14d resolves two weeks out', () => {
    assert.equal(parseDeliveryDate('+14d', { now }).iso, '2026-09-16');
  });

  test('+0d resolves to today', () => {
    assert.equal(parseDeliveryDate('+0d', { now }).iso, '2026-09-02');
  });

  test('rolls over into the next month', () => {
    assert.equal(parseDeliveryDate('+30d', { now }).iso, '2026-10-02');
  });

  test('rolls over into the next year', () => {
    assert.equal(parseDeliveryDate('+180d', { now: new Date(2026, 10, 15) }).iso, '2027-05-14');
  });

  test('returns month and day as numbers, matching the absolute formats', () => {
    const parsed = parseDeliveryDate('+14d', { now });

    assert.equal(parsed.year, '2026');
    assert.equal(parsed.month, 9);
    assert.equal(parsed.day, 16);
  });

  test('is case insensitive', () => {
    assert.equal(parseDeliveryDate('+7D', { now }).iso, parseDeliveryDate('+7d', { now }).iso);
  });

  test('rejects malformed offsets', () => {
    for (const input of ['+d', '14d', '+14', '+14w', '-14d']) {
      assert.throws(() => parseDeliveryDate(input, { now }), /Formato de fecha no soportado/);
    }
  });

  test('defaults to the real clock when now is not injected', () => {
    const today = new Date();
    const expected = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const pad = (n) => String(n).padStart(2, '0');

    assert.equal(
      parseDeliveryDate('+1d').iso,
      `${expected.getFullYear()}-${pad(expected.getMonth() + 1)}-${pad(expected.getDate())}`,
    );
  });
});

describe('checked-in order configs stay valid over time', () => {
  const fs = require('node:fs');
  const path = require('node:path');

  /*
   * The staging config moved into the database with the rest of the application
   * state, so the same guard for its draft lives in tests/integration/store.
   * These two remain files because npm scripts select them by name.
   */
  const configs = ['order-config-peach-sorbet.json', 'order-config-example-with-options.json'];

  for (const file of configs) {
    test(`${file} does not pin a date that can expire`, () => {
      const config = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8'),
      );

      const dates = [config.deliveryDate, ...(config.orders || []).map((o) => o.deliveryDate)]
        .filter(Boolean);

      assert.ok(dates.length > 0, 'expected at least one delivery date');
      for (const date of dates) {
        assert.match(date, /^\+\d+d$/, `${file} still pins the absolute date ${date}`);
        // And it must actually resolve to a future date.
        assert.ok(new Date(parseDeliveryDate(date).iso) > new Date());
      }
    });
  }
});
