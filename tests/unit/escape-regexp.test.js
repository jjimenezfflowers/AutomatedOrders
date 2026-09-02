const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { escapeRegExp } = require('../helpers/product-form');

// Regression: option labels came straight from products.json (editable through the
// products UI) into `new RegExp(\`^\\s*${option.label}\\s*$\`, 'i')`. Metacharacters
// either made the pattern silently stop matching or threw a SyntaxError.
describe('escapeRegExp', () => {
  const LABELS_WITH_METACHARACTERS = [
    'Choose Color (Premium)',
    'Size [Large]',
    'Stems: 100+',
    'Ribbon? Yes',
    'Price $449.99',
    'Bunch {2}',
    'Roses | Carnations',
    'Back\\Slash',
    'Wildcard * everything',
    'Anchored ^start',
  ];

  for (const label of LABELS_WITH_METACHARACTERS) {
    test(`an escaped "${label}" matches itself literally`, () => {
      const pattern = new RegExp(`^\\s*${escapeRegExp(label)}\\s*$`, 'i');

      assert.ok(pattern.test(label), 'should match the literal label');
      assert.ok(pattern.test(`  ${label}  `), 'should tolerate surrounding whitespace');
    });

    test(`building a pattern from "${label}" does not throw`, () => {
      assert.doesNotThrow(() => new RegExp(`^${escapeRegExp(label)}$`));
    });
  }

  test('unescaped metacharacters are what used to break matching', () => {
    const label = 'Choose Color (Premium)';

    // The old behaviour: parentheses became a capture group, so the pattern
    // matched "Choose Color Premium" and not the literal label.
    const unescaped = new RegExp(`^\\s*${label}\\s*$`, 'i');
    assert.equal(unescaped.test(label), false);
    assert.equal(unescaped.test('Choose Color Premium'), true);

    assert.equal(new RegExp(`^\\s*${escapeRegExp(label)}\\s*$`, 'i').test(label), true);
  });

  test('an unclosed bracket used to throw a SyntaxError', () => {
    const label = 'Size [Large';

    assert.throws(() => new RegExp(`^${label}$`), SyntaxError);
    assert.doesNotThrow(() => new RegExp(`^${escapeRegExp(label)}$`));
    assert.ok(new RegExp(`^${escapeRegExp(label)}$`).test(label));
  });

  test('plain labels are returned unchanged', () => {
    assert.equal(escapeRegExp('20 stems 2 Bunches'), '20 stems 2 Bunches');
    assert.equal(escapeRegExp('September'), 'September');
  });

  test('tolerates empty input', () => {
    assert.equal(escapeRegExp(''), '');
    assert.equal(escapeRegExp(null), '');
    assert.equal(escapeRegExp(undefined), '');
  });
});
