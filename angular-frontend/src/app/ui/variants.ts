/*
 * A minimal stand-in for class-variance-authority, which the admin (bb-remix)
 * uses to keep a component's Tailwind strings in one place instead of scattered
 * across templates. Adding the real package would pull in a React-oriented
 * dependency for ~30 lines of string joining, so this is the same idea, typed.
 */

export type VariantOptions = Record<string, Record<string, string>>;

type Selected<V extends VariantOptions> = { [K in keyof V]?: keyof V[K] };

interface Config<V extends VariantOptions> {
  variants: V;
  defaultVariants?: Selected<V>;
}

/** Joins truthy class fragments, collapsing whitespace. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Builds a class-string resolver from a base string plus named variant maps.
 *
 *   const button = variants('inline-flex rounded-md', {
 *     variants: { variant: { default: 'bg-primary-900', ghost: '' } },
 *     defaultVariants: { variant: 'default' },
 *   });
 *   button({ variant: 'ghost' })
 */
export function variants<V extends VariantOptions>(base: string, config: Config<V>) {
  return (selected: Selected<V> = {}, extra?: string): string => {
    const chosen = { ...config.defaultVariants, ...selected };

    const fragments = Object.keys(config.variants).map((group) => {
      const key = chosen[group as keyof V];
      return key === undefined ? '' : (config.variants[group][key as string] ?? '');
    });

    return cx(base, ...fragments, extra);
  };
}
