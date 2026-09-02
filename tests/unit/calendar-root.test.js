const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { getCalendarRoot } = require('../helpers/product-form');

// Minimal stand-in for a Playwright page. `roots` maps a selector to the number of
// matching elements, and `dayButtons` to how many `button[name="day"]` each contains.
function fakePage({ roots = {}, onWait } = {}) {
  const makeLocator = (selector, index = null) => ({
    selector,
    index,
    count: async () => (index === null ? (roots[selector]?.length ?? 0) : 1),
    nth: (i) => makeLocator(selector, i),
    locator: (inner) => ({
      count: async () => {
        if (inner !== 'button[name="day"]') return 0;
        return roots[selector]?.[index ?? 0] ?? 0;
      },
    }),
  });

  return {
    locator: (selector) => makeLocator(selector),
    waitForTimeout: async () => {
      if (onWait) onWait();
    },
  };
}

const CALENDAR = '[data-ff-product-calendar][calendar-location="product-template"]';

describe('getCalendarRoot', () => {
  describe('regression: no silent fallback to body', () => {
    // The helper used to `return page.locator('body')` when no calendar matched.
    // Every downstream call then ran unscoped, so clickAvailableCalendarDay could
    // click a day cell belonging to a different calendar or an adjacent month and
    // the order shipped on the wrong date without any error.
    test('throws when no calendar element exists', async () => {
      const page = fakePage({ roots: {} });

      await assert.rejects(
        () => getCalendarRoot(page, 0),
        /No se encontro el calendario de entrega/,
      );
    });

    test('throws when the calendar exists but has no day buttons', async () => {
      const page = fakePage({ roots: { [CALENDAR]: [0] } });

      await assert.rejects(
        () => getCalendarRoot(page, 0),
        /No se encontro el calendario de entrega/,
      );
    });

    test('never returns a body locator', async () => {
      const page = fakePage({ roots: {} });
      const result = await getCalendarRoot(page, 0).catch((error) => error);

      assert.ok(result instanceof Error);
      assert.notEqual(result?.selector, 'body');
    });

    test('the error names the selectors it looked for', async () => {
      const page = fakePage({ roots: {} });

      await assert.rejects(() => getCalendarRoot(page, 0), (error) => {
        assert.match(error.message, /data-ff-product-calendar/);
        assert.match(error.message, /\.calendar-container/);
        return true;
      });
    });
  });

  describe('finds the calendar', () => {
    test('returns the primary calendar when it has day buttons', async () => {
      const page = fakePage({ roots: { [CALENDAR]: [35] } });
      const root = await getCalendarRoot(page, 0);

      assert.equal(root.selector, CALENDAR);
    });

    test('falls through to .calendar-container', async () => {
      const page = fakePage({ roots: { '.calendar-container': [30] } });
      const root = await getCalendarRoot(page, 0);

      assert.equal(root.selector, '.calendar-container');
    });

    test('skips a matching element that has no day buttons', async () => {
      const page = fakePage({ roots: { [CALENDAR]: [0, 31] } });
      const root = await getCalendarRoot(page, 0);

      assert.equal(root.selector, CALENDAR);
      assert.equal(root.index, 1);
    });
  });

  describe('waits for a slow render before giving up', () => {
    test('retries until the deadline', async () => {
      let waits = 0;
      const page = fakePage({ roots: {}, onWait: () => (waits += 1) });

      await assert.rejects(() => getCalendarRoot(page, 300));
      assert.ok(waits > 0, 'should have polled at least once');
    });

    test('returns as soon as the calendar appears', async () => {
      const roots = {};
      const page = fakePage({
        roots,
        onWait: () => {
          roots[CALENDAR] = [28];
        },
      });

      const root = await getCalendarRoot(page, 1000);
      assert.equal(root.selector, CALENDAR);
    });
  });
});
