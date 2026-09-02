import { cx, variants } from './variants';

describe('cx', () => {
  it('joins truthy fragments', () => {
    expect(cx('a', 'b', 'c')).toBe('a b c');
  });

  it('drops falsy fragments so conditionals read inline', () => {
    expect(cx('a', false, null, undefined, 'b')).toBe('a b');
  });

  it('collapses whitespace introduced by multi-line strings', () => {
    expect(cx('a   b', '  c  ')).toBe('a b c');
  });

  it('returns an empty string when nothing is truthy', () => {
    expect(cx(false, null, undefined)).toBe('');
  });
});

describe('variants', () => {
  const button = variants('base', {
    variants: {
      variant: { default: 'bg-primary', ghost: 'bg-transparent' },
      size: { sm: 'h-8', lg: 'h-10' },
    },
    defaultVariants: { variant: 'default', size: 'sm' },
  });

  it('applies the defaults when nothing is selected', () => {
    expect(button()).toBe('base bg-primary h-8');
  });

  it('overrides a single group and keeps the other default', () => {
    expect(button({ variant: 'ghost' })).toBe('base bg-transparent h-8');
  });

  it('overrides every group', () => {
    expect(button({ variant: 'ghost', size: 'lg' })).toBe('base bg-transparent h-10');
  });

  it('appends extra classes last so callers can add layout utilities', () => {
    expect(button({}, 'w-full')).toBe('base bg-primary h-8 w-full');
  });

  it('ignores an unknown variant value rather than emitting undefined', () => {
    expect(button({ variant: 'nope' as never })).toBe('base h-8');
  });

  it('produces a distinct string per variant', () => {
    const rendered = (['default', 'ghost'] as const).map((variant) => button({ variant }));

    expect(new Set(rendered).size).toBe(rendered.length);
  });

  it('works with no defaultVariants configured', () => {
    const plain = variants('base', { variants: { tone: { a: 'x', b: 'y' } } });

    expect(plain()).toBe('base');
    expect(plain({ tone: 'b' })).toBe('base y');
  });
});
