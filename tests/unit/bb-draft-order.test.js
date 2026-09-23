const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  applyAddressSuggestions,
  customerOptionPattern,
  customerSearchTerms,
  optionNamePattern,
  variantSearchText,
  waitForDeliveryDateAvailability,
} = require('../helpers/bb-draft-order');

describe('BB option matching', () => {
  it('searches by the stable variant label while matching the full configured value', () => {
    const configured = '20 Stems (2 Bunches) - $104.99';

    assert.equal(variantSearchText(configured), '20 Stems');
    assert.match('20 Stems - $94.99', optionNamePattern(configured));
  });

  it('matches the configured variant when BB appends its price', () => {
    const pattern = optionNamePattern('20 stems (2 Bunches)');

    assert.match('20 stems (2 Bunches)', pattern);
    assert.match('20 stems (2 Bunches) - $119.99', pattern);
  });

  it('matches by quantity when the saved variant already contains an older price', () => {
    const pattern = optionNamePattern('100 Stems (10 Bunches) - $244.99');

    assert.match('100 Stems (10 Bunches) - $249.99', pattern);
  });

  it('matches BB variants that omit the configured bunch count', () => {
    const pattern = optionNamePattern('20 Stems (2 Bunches)');

    assert.match('20 Stems - $94.99', pattern);
  });

  it('matches saved prices whether or not the configured value uses a dash', () => {
    const pattern = optionNamePattern('Medium Package 230 Stems $449.99');

    assert.match('Medium Package 230 Stems - $449.99', pattern);
    assert.match('Medium Package 230 Stems $449.99', pattern);
  });

  it('does not match a different stem or bunch quantity', () => {
    const pattern = optionNamePattern('20 stems (2 Bunches)');

    assert.doesNotMatch('50 stems (5 Bunches) - $159.99', pattern);
    assert.doesNotMatch('20 stems (3 Bunches) - $94.99', pattern);
    assert.doesNotMatch('200 stems (20 Bunches) - $464.99', pattern);
  });
});

describe('BB customer matching', () => {
  const customer = {
    firstName: 'Jose',
    lastName: 'Jimenez',
    email: 'jose@fiftyflowers.com',
  };

  it('searches by unique email before falling back to names', () => {
    assert.deepEqual(customerSearchTerms(customer), [
      'jose@fiftyflowers.com',
      'Jose',
      'Jose Jimenez',
    ]);
  });

  it('matches the BB customer despite accents and an extra middle name', () => {
    const pattern = customerOptionPattern(customer);

    assert.match('José Luis Jiménez (jose@fiftyflowers.com)', pattern);
    assert.doesNotMatch('Jose Contreras Jr (jckc030120@gmail.com)', pattern);
  });
});

describe('BB address validation', () => {
  function suggestionDialog({ visible }) {
    const clicks = [];
    const dialog = {
      clicks,
      async waitFor({ state }) {
        if (state === 'hidden' && !visible) return;
        throw new Error('dialog state not reached');
      },
      getByRole(_role, { name }) {
        const label = String(name);
        return {
          async waitFor({ state }) {
            if (state === 'visible' && /Apply all/i.test(label) && visible) return;
            throw new Error('button state not reached');
          },
          async click() {
            clicks.push(label);
          },
        };
      },
    };
    return dialog;
  }

  it('applies every suggestion and re-checks the address', async () => {
    const dialog = suggestionDialog({ visible: true });

    assert.equal(await applyAddressSuggestions(dialog), true);
    assert.equal(dialog.clicks.length, 2);
    assert.match(dialog.clicks[0], /Apply all/i);
    assert.match(dialog.clicks[1], /Re-check & Save/i);
  });

  it('does nothing when BB accepts the address immediately', async () => {
    const dialog = suggestionDialog({ visible: false });

    assert.equal(await applyAddressSuggestions(dialog), false);
    assert.deepEqual(dialog.clicks, []);
  });
});

describe('BB delivery-date availability', () => {
  function availabilitySequence(values) {
    let calls = 0;
    return {
      get calls() {
        return calls;
      },
      async isEnabled() {
        const value = values[Math.min(calls, values.length - 1)];
        calls += 1;
        return value;
      },
    };
  }

  it('waits while a newly opened month is still loading', async () => {
    const date = availabilitySequence([false, false, true]);

    assert.equal(await waitForDeliveryDateAvailability(date, 100, 0), true);
    assert.equal(date.calls, 3);
  });

  it('reports a date that remains unavailable', async () => {
    const date = availabilitySequence([false]);

    assert.equal(await waitForDeliveryDateAvailability(date, 0, 0), false);
    assert.equal(date.calls, 1);
  });
});
