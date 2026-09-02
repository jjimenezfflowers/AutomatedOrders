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
