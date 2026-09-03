import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { UI_CARD, UiCardComponent } from './card';

@Component({
  standalone: true,
  imports: [UI_CARD],
  template: `
    <ui-card testId="order-card" class="max-w-md">
      <ui-card-header>
        <ui-card-title>Orders</ui-card-title>
        <ui-card-description>Queued for submission</ui-card-description>
      </ui-card-header>
      <ui-card-content>Two items</ui-card-content>
      <ui-card-footer>Submit</ui-card-footer>
    </ui-card>
  `
})
class CardHostComponent {}

describe('UiCardComponent', () => {
  /** Angular sorts the tokens of a [class] binding, so compare sets, not strings. */
  function tokens(value: string | HTMLElement): string[] {
    const raw = typeof value === 'string' ? value : value.className;
    return raw.split(' ').filter(Boolean).sort();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiCardComponent, CardHostComponent],
      providers: [provideZonelessChangeDetection()]
    }).compileComponents();
  });

  it('renders the card surface classes', () => {
    const fixture = TestBed.createComponent(UiCardComponent);
    fixture.detectChanges();

    const card: HTMLElement = fixture.nativeElement.querySelector('div');
    expect(tokens(card)).toEqual(tokens('rounded-xl border bg-card text-card-foreground shadow-sm'));
  });

  it('merges the class input instead of replacing the base classes', () => {
    const fixture = TestBed.createComponent(UiCardComponent);
    fixture.componentRef.setInput('class', 'mb-6');
    fixture.detectChanges();

    const card: HTMLElement = fixture.nativeElement.querySelector('div');
    expect(card.className).toContain('mb-6');
    expect(card.className).toContain('rounded-xl');
  });

  it('exposes testId on the card element', () => {
    const fixture = TestBed.createComponent(CardHostComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="order-card"]')).toBeTruthy();
  });

  it('projects each part with its own classes', () => {
    const fixture = TestBed.createComponent(CardHostComponent);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    const header: HTMLElement = element.querySelector('ui-card-header > div')!;
    const title: HTMLElement = element.querySelector('ui-card-title > h3')!;
    const description: HTMLElement = element.querySelector('ui-card-description > p')!;
    const content: HTMLElement = element.querySelector('ui-card-content > div')!;
    const footer: HTMLElement = element.querySelector('ui-card-footer > div')!;

    expect(tokens(header)).toEqual(tokens('flex flex-col space-y-1.5 p-6'));
    expect(tokens(title)).toEqual(tokens('leading-none font-semibold tracking-tight'));
    expect(tokens(description)).toEqual(tokens('text-sm text-muted-foreground'));
    expect(tokens(content)).toEqual(tokens('p-6'));
    expect(tokens(footer)).toEqual(tokens('flex items-center p-6 pt-0'));

    expect(title.textContent?.trim()).toBe('Orders');
    expect(description.textContent?.trim()).toBe('Queued for submission');
    expect(content.textContent?.trim()).toBe('Two items');
    expect(footer.textContent?.trim()).toBe('Submit');
  });

  it('nests the parts inside the card surface', () => {
    const fixture = TestBed.createComponent(CardHostComponent);
    fixture.detectChanges();

    const card: HTMLElement = fixture.nativeElement.querySelector('ui-card > div');
    expect(card.querySelector('ui-card-header')).toBeTruthy();
    expect(card.querySelector('ui-card-footer')).toBeTruthy();
  });
});
