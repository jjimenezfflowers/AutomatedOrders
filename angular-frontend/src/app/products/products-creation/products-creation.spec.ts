import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { ProductsCreation, NewProduct } from './products-creation';

const EXISTING: NewProduct = {
  id: 'white-spray-roses',
  name: 'White Spray Roses',
  url: 'https://example.test/white-spray-roses',
  origin: ['US', 'EC'],
  type: 'product-options',
  variantSelector: '#option-0',
  variants: ['20 stems', '50 stems'],
  defaultVariant: '20 stems',
  quantitySelector: '#quantity-1',
  defaultQuantity: 3
};

/*
 * The two design-system classes that legitimately survive the migration: they come
 * from ui-field's "optional" marker and ui-checkbox's disabled border, not from this
 * template. Anything else on the slate/gray scale would be a hardcoded colour that
 * stays light when the theme flips.
 */
const DESIGN_SYSTEM_GRAYS = ['text-gray-400', 'border-gray-600'];

describe('ProductsCreation', () => {
  let component: ProductsCreation;
  let fixture: ComponentFixture<ProductsCreation>;
  let httpMock: HttpTestingController;

  /** Zoneless TestBed: state mutated outside CD must be marked dirty before rendering. */
  function detect() {
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  }

  /** ngModel writes into its control on a microtask, so the DOM lags one turn behind. */
  async function settle() {
    detect();
    await fixture.whenStable();
    detect();
  }

  async function create(productToEdit: NewProduct | null = null) {
    fixture = TestBed.createComponent(ProductsCreation);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('productToEdit', productToEdit);
    await settle();
  }

  function query<T extends HTMLElement>(selector: string): T {
    return fixture.nativeElement.querySelector(selector) as T;
  }

  function input(testId: string): HTMLInputElement {
    return query<HTMLInputElement>(`input[data-testid="${testId}"]`);
  }

  function button(testId: string): HTMLButtonElement {
    return query<HTMLButtonElement>(`button[data-testid="${testId}"]`);
  }

  function html(): string {
    return (fixture.nativeElement as HTMLElement).innerHTML;
  }

  /** Drives a control the way a user would, then lets ngModel push the value up. */
  async function type(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
    element.value = value;
    element.dispatchEvent(new Event('input'));
    await settle();
  }

  async function choose(element: HTMLSelectElement, value: string) {
    element.value = value;
    element.dispatchEvent(new Event('change'));
    await settle();
  }

  async function check(element: HTMLInputElement, checked: boolean) {
    element.checked = checked;
    element.dispatchEvent(new Event('change'));
    await settle();
  }

  async function click(testId: string) {
    button(testId).click();
    await settle();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductsCreation],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();

    spyOn(window, 'alert');

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', async () => {
    await create();
    expect(component).toBeTruthy();
  });

  // --- Every control survived the swap -------------------------------------------

  describe('rendering', () => {
    beforeEach(async () => await create());

    it('renders every text field through ui-input', () => {
      const ids = [
        'product-id', 'product-name', 'product-url', 'product-variant-selector',
        'product-default-variant', 'product-quantity-selector', 'product-default-quantity'
      ];

      for (const id of ids) {
        expect(input(id)).withContext(id).not.toBeNull();
      }
    });

    it('renders the type field through ui-select, keeping both options', () => {
      const select = query<HTMLSelectElement>('select[data-testid="product-type"]');

      expect(select).not.toBeNull();
      expect(Array.from(select.options).map(o => o.value)).toEqual(['', 'product-options']);
      expect(Array.from(select.options).map(o => o.text)).toEqual([
        'Simple Product',
        'Product with Options'
      ]);
    });

    it('renders the variants field through ui-textarea', () => {
      const textarea = query<HTMLTextAreaElement>('textarea[data-testid="product-variants"]');

      expect(textarea).not.toBeNull();
      expect(textarea.rows).toBe(3);
    });

    it('renders one ui-checkbox per origin option', () => {
      for (const origin of component.originOptions) {
        expect(input(`product-origin-${origin}`)).withContext(origin).not.toBeNull();
      }
    });

    it('renders the number field as a real number input, keeping its min', () => {
      expect(input('product-default-quantity').type).toBe('number');
      expect(input('product-default-quantity').min).toBe('1');
    });

    it('renders the shell through ui-card and the actions through ui-button', () => {
      expect(query('[data-testid="product-form-card"]')).not.toBeNull();
      expect(button('cancel-product-header')).not.toBeNull();
      expect(button('cancel-product')).not.toBeNull();
      expect(button('save-product')).not.toBeNull();
    });

    it('labels every control, so each ui-field label resolves to its input', () => {
      const labels = Array.from(
        fixture.nativeElement.querySelectorAll('label[for]')
      ) as HTMLLabelElement[];
      const labelled = labels.map(l => l.getAttribute('for'));

      expect(labelled).toContain('product-id');
      expect(labelled).toContain('product-name');
      expect(labelled).toContain('product-url');
      expect(labelled).toContain('product-type');
      expect(labelled).toContain('product-variants');
      expect(labelled).toContain('product-default-quantity');
    });
  });

  // --- [(ngModel)] still binds in both directions ----------------------------------

  describe('two-way binding', () => {
    it('pushes what the user types into the model', async () => {
      await create();

      await type(input('product-id'), 'yellow-tulips');
      await type(input('product-name'), 'Yellow Tulips');
      await type(input('product-url'), 'https://example.test/tulips');
      await type(input('product-variant-selector'), '#option-9');
      await type(input('product-default-variant'), '20 stems');
      await type(input('product-quantity-selector'), '#quantity-9');
      await type(input('product-default-quantity'), '7');
      await type(query<HTMLTextAreaElement>('textarea[data-testid="product-variants"]'), 'A\nB');
      await choose(query<HTMLSelectElement>('select[data-testid="product-type"]'), 'product-options');

      expect(component.product.id).toBe('yellow-tulips');
      expect(component.product.name).toBe('Yellow Tulips');
      expect(component.product.url).toBe('https://example.test/tulips');
      expect(component.product.variantSelector).toBe('#option-9');
      expect(component.product.defaultVariant).toBe('20 stems');
      expect(component.product.quantitySelector).toBe('#quantity-9');
      expect(component.product.defaultQuantity).toBe(7);
      expect(component.variantsText).toBe('A\nB');
      expect(component.product.type).toBe('product-options');
    });

    it('pushes a loaded product back down into the controls', async () => {
      await create(EXISTING);

      expect(input('product-id').value).toBe('white-spray-roses');
      expect(input('product-name').value).toBe('White Spray Roses');
      expect(input('product-url').value).toBe('https://example.test/white-spray-roses');
      expect(input('product-variant-selector').value).toBe('#option-0');
      expect(input('product-default-variant').value).toBe('20 stems');
      expect(input('product-quantity-selector').value).toBe('#quantity-1');
      expect(input('product-default-quantity').value).toBe('3');
      expect(query<HTMLTextAreaElement>('textarea[data-testid="product-variants"]').value)
        .toBe('20 stems\n50 stems');
      expect(query<HTMLSelectElement>('select[data-testid="product-type"]').value)
        .toBe('product-options');
      expect(input('product-origin-US').checked).toBeTrue();
      expect(input('product-origin-EC').checked).toBeTrue();
      expect(input('product-origin-CO').checked).toBeFalse();
    });
  });

  // --- Add vs edit mode -------------------------------------------------------------

  describe('add mode', () => {
    beforeEach(async () => await create());

    it('titles itself as a new product and leaves the id editable', () => {
      expect(html()).toContain('New Product');
      expect(html()).toContain('Fill in the details to add a new product');
      expect(component.isEditMode).toBeFalse();
      expect(input('product-id').disabled).toBeFalse();
    });

    it('does not apply the read-only surface to the id field', () => {
      expect(input('product-id').className).not.toContain('bg-muted');
    });
  });

  describe('edit mode', () => {
    beforeEach(async () => await create(EXISTING));

    it('titles itself as an edit and locks the id', () => {
      expect(html()).toContain('Edit Product');
      expect(html()).toContain('Modify the details of this product');
      expect(component.isEditMode).toBeTrue();
      // Readonly, not disabled: the id stays focusable and selectable in edit mode,
      // which is what the pre-migration [readonly] binding did.
      expect(input('product-id').readOnly).toBeTrue();
      expect(input('product-id').disabled).toBeFalse();
    });

    /*
     * This is the `[class.bg-slate-50]="isEditMode"` branch from the old template.
     * It has to be a token, or the locked field stays light-grey in dark mode.
     */
    it('marks the locked id field with a themed surface, not a hardcoded grey', () => {
      const className = input('product-id').className;

      expect(className).toContain('bg-muted');
      expect(className).not.toContain('bg-slate-50');
    });

    it('labels the save action as a change rather than a creation', () => {
      expect(button('save-product').textContent).toContain('Save Changes');
    });
  });

  // --- Save / cancel ----------------------------------------------------------------

  describe('actions', () => {
    async function fillRequired() {
      await type(input('product-id'), 'lilies');
      await type(input('product-name'), 'Lilies');
      await type(input('product-url'), 'https://example.test/lilies');
    }

    it('emits created from the save button in add mode', async () => {
      await create();
      const created: NewProduct[] = [];
      component.created.subscribe(p => created.push(p));

      await fillRequired();
      await click('save-product');

      expect(created.length).toBe(1);
      expect(created[0].id).toBe('lilies');
      expect(created[0].name).toBe('Lilies');
      expect(created[0].url).toBe('https://example.test/lilies');
    });

    it('emits updated instead of created when editing', async () => {
      await create(EXISTING);
      const created: NewProduct[] = [];
      const updated: NewProduct[] = [];
      component.created.subscribe(p => created.push(p));
      component.updated.subscribe(p => updated.push(p));

      await type(input('product-name'), 'White Roses');
      await click('save-product');

      expect(created.length).toBe(0);
      expect(updated.length).toBe(1);
      expect(updated[0].name).toBe('White Roses');
      expect(updated[0].id).toBe('white-spray-roses');
    });

    it('emits cancelled and resets the form from the footer button', async () => {
      await create();
      let cancelled = 0;
      component.cancelled.subscribe(() => cancelled++);

      await type(input('product-name'), 'Scratch');
      await click('cancel-product');

      expect(cancelled).toBe(1);
      expect(component.product.name).toBe('');
    });

    it('emits cancelled from the header button too', async () => {
      await create();
      let cancelled = 0;
      component.cancelled.subscribe(() => cancelled++);

      await click('cancel-product-header');

      expect(cancelled).toBe(1);
    });
  });

  // --- Variants and product options --------------------------------------------------

  describe('variants', () => {
    it('adds a variant by adding a line', async () => {
      await create();
      const created: NewProduct[] = [];
      component.created.subscribe(p => created.push(p));

      await type(input('product-id'), 'lilies');
      await type(input('product-name'), 'Lilies');
      await type(input('product-url'), 'https://example.test/lilies');
      const variants = query<HTMLTextAreaElement>('textarea[data-testid="product-variants"]');
      await type(variants, '20 stems');
      await type(variants, '20 stems\n50 stems');
      await click('save-product');

      expect(created[0].variants).toEqual(['20 stems', '50 stems']);
    });

    it('removes a variant by removing its line, ignoring blank lines', async () => {
      await create(EXISTING);
      const updated: NewProduct[] = [];
      component.updated.subscribe(p => updated.push(p));

      await type(
        query<HTMLTextAreaElement>('textarea[data-testid="product-variants"]'),
        '20 stems\n\n  \n'
      );
      await click('save-product');

      expect(updated[0].variants).toEqual(['20 stems']);
    });

    it('adds and removes an origin through the checkbox group', async () => {
      await create();
      const created: NewProduct[] = [];
      component.created.subscribe(p => created.push(p));

      await check(input('product-origin-US'), true);
      await check(input('product-origin-CO'), true);
      expect(component.product.origin).toEqual(['US', 'CO']);
      expect(input('product-origin-US').checked).toBeTrue();

      await check(input('product-origin-US'), false);
      expect(component.product.origin).toEqual(['CO']);
      expect(input('product-origin-US').checked).toBeFalse();

      await type(input('product-id'), 'lilies');
      await type(input('product-name'), 'Lilies');
      await type(input('product-url'), 'https://example.test/lilies');
      await click('save-product');

      expect(created[0].origin).toEqual(['CO']);
    });

    it('shows the product-options note only for that type', async () => {
      await create();
      expect(query('[data-testid="product-options-note"]')).toBeNull();

      await choose(query<HTMLSelectElement>('select[data-testid="product-type"]'), 'product-options');

      const note = query('[data-testid="product-options-note"]');
      expect(note).not.toBeNull();
      expect(note.textContent).toContain('products.json');
      expect(note.getAttribute('role')).toBe('alert');
    });
  });

  // --- Validation --------------------------------------------------------------------

  describe('validation', () => {
    it('blocks the save and renders a message per missing required field', async () => {
      await create();
      const created: NewProduct[] = [];
      component.created.subscribe(p => created.push(p));

      await click('save-product');

      expect(created.length).toBe(0);
      expect(component.errors['id']).toBe('Product ID is required.');
      expect(html()).toContain('Product ID is required.');
      expect(html()).toContain('Name is required.');
      expect(html()).toContain('URL is required.');
    });

    it('marks the offending controls invalid rather than colouring them by hand', async () => {
      await create();

      await click('save-product');

      expect(input('product-id').getAttribute('aria-invalid')).toBe('true');
      expect(input('product-name').getAttribute('aria-invalid')).toBe('true');
      expect(input('product-url').getAttribute('aria-invalid')).toBe('true');
      expect(input('product-quantity-selector').getAttribute('aria-invalid')).toBeNull();
      expect(html()).toContain('text-destructive');
    });

    it('clears the messages once the required fields are filled', async () => {
      await create();
      await click('save-product');

      await type(input('product-id'), 'lilies');
      await type(input('product-name'), 'Lilies');
      await type(input('product-url'), 'https://example.test/lilies');
      await click('save-product');

      expect(component.errors).toEqual({});
      expect(html()).not.toContain('Product ID is required.');
    });
  });

  // --- Theming ------------------------------------------------------------------------

  describe('design-system migration', () => {
    /*
     * bg-white and the slate/gray scale are what pinned this form to a light surface
     * regardless of the theme. Everything visual now has to come from a token.
     */
    it('renders no hardcoded surface or text colour', async () => {
      await create(EXISTING);

      expect(html()).not.toContain('bg-white');
      expect(html()).not.toContain('slate-');
      expect(html()).not.toContain('text-red-500');
      expect(html()).not.toContain('text-blue-600');
      expect(html()).not.toContain('border-gray-300');
    });

    it('leaves no grey outside the design system primitives own base classes', async () => {
      await create(EXISTING);

      const greys = html().match(/[a-z:-]*\b(?:slate|gray)-\d+/g) ?? [];
      const unexpected = greys.filter(
        g => !DESIGN_SYSTEM_GRAYS.some(allowed => g.endsWith(allowed))
      );

      expect(unexpected).toEqual([]);
    });

    it('paints the card and the muted chips from tokens', async () => {
      await create(EXISTING);

      expect(html()).toContain('bg-card');
      expect(html()).toContain('bg-muted');
      expect(html()).toContain('text-muted-foreground');
      expect(html()).toContain('border-border');
    });
  });
});
