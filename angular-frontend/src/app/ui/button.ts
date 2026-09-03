import { ChangeDetectionStrategy, Component, Input, booleanAttribute } from '@angular/core';
import { LucideAngularModule, Loader2 } from 'lucide-angular';

import { variants } from './variants';

export type ButtonVariant =
  | 'default'
  | 'destructive'
  | 'outline'
  | 'secondary'
  | 'elevated'
  | 'ghost'
  | 'warning'
  | 'link';
export type ButtonSize = 'xs' | 'sm' | 'default' | 'md' | 'lg' | 'icon';

/*
 * Variant and size strings are taken from the admin's Button
 * (bb-remix app/shared/components/ui/button.tsx). Its 15 variants are trimmed to
 * the 7 this app actually renders; the rest can be added when something needs them.
 *
 * The admin's base string ends in `outline-none` with no focus-visible rule, so
 * keyboard focus is invisible there. That omission is not carried over — the global
 * :focus-visible ring in styles.css applies here.
 *
 * The admin's `bg-primary-900` is swapped for `bg-primary`. The two are byte-identical
 * in :root, but .dark only remaps the `--primary` alias and leaves the numbered scale
 * alone — so primary-900 would stay dark-on-dark under the theme toggle.
 *
 * The `elevated` and `destructive` variants are also re-expressed against tokens.
 * Upstream they hardcode bg-white / bg-red-50 / border-gray-200, which render the
 * same in light mode but do not adapt in dark mode — and this app ships a theme
 * toggle. Light-mode appearance is unchanged.
 */
export const buttonVariants = variants(
  'group/button inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent ' +
    'bg-clip-padding text-sm font-medium whitespace-nowrap ' +
    'transition-[background-color,color,transform,box-shadow,border-color] duration-140 ease-[cubic-bezier(0.23,1,0.32,1)] ' +
    'select-none active:scale-[0.97] active:duration-75 ' +
    'disabled:pointer-events-none disabled:opacity-50 ' +
    'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 ' +
    'motion-reduce:transition-none motion-reduce:active:scale-100 ' +
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-primary/50 disabled:text-primary-foreground',
        destructive:
          'border border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:border-border disabled:bg-muted disabled:text-muted-foreground',
        outline: 'border border-input bg-transparent hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
        elevated: 'border border-border bg-card hover:bg-accent disabled:text-muted-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        // The staging actions are warning-toned; without this variant callers had to
        // layer class overrides on top of ghost, which left the hover state undefined.
        warning: 'bg-warning text-warning-foreground hover:bg-warning/90 disabled:bg-warning/50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        xs: 'h-min px-2 py-1.5 text-xs',
        sm: 'h-min px-4 py-2 text-xs',
        default: 'h-9 rounded-md px-3 text-xs',
        md: 'h-9 px-4 py-2',
        lg: 'h-10 rounded-md px-8',
        icon: 'size-9 rounded-sm',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

@Component({
  selector: 'ui-button',
  standalone: true,
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      [type]="type"
      [class]="classes"
      [disabled]="disabled || loading"
      [attr.aria-busy]="loading ? 'true' : null"
      [attr.aria-invalid]="invalid ? 'true' : null"
      [attr.aria-label]="ariaLabel"
      [attr.aria-expanded]="ariaExpanded"
      [attr.aria-haspopup]="ariaHasPopup"
      [attr.aria-selected]="ariaSelected"
      [attr.aria-current]="ariaCurrent"
      [attr.role]="role"
      [attr.title]="title"
      [attr.data-testid]="testId"
    >
      @if (loading) {
        <lucide-angular [img]="spinner" class="size-4 animate-spin" aria-hidden="true" />
      }
      <ng-content />
    </button>
  `,
})
export class UiButtonComponent {
  @Input() variant: ButtonVariant = 'default';
  @Input() size: ButtonSize = 'default';
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input({ transform: booleanAttribute }) disabled = false;
  @Input({ transform: booleanAttribute }) loading = false;
  @Input({ transform: booleanAttribute }) invalid = false;
  @Input() testId?: string;
  /*
   * ARIA passthroughs. The host element is <ui-button>, so an attribute written
   * there would land on the wrapper rather than the button assistive tech reads;
   * these forward onto the real control. Only the ones this app needs.
   */
  @Input() ariaLabel?: string;
  @Input() ariaExpanded?: boolean | null;
  @Input() ariaHasPopup?: string | null;
  @Input() ariaSelected?: boolean | null;
  @Input() ariaCurrent?: string | null;
  @Input() role?: string;
  @Input() title?: string;
  /** Extra utilities merged after the variant classes, for layout only. */
  @Input() class = '';

  protected readonly spinner = Loader2;

  get classes(): string {
    return buttonVariants({ variant: this.variant, size: this.size }, this.class);
  }
}
