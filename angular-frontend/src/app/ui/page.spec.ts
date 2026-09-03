import { Component, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UiPageComponent } from './page';

@Component({
  standalone: true,
  imports: [UiPageComponent],
  template: `
    <ui-page [title]="title" [description]="description">
      <button pageActions data-testid="page-action">Place Order</button>
      <p data-testid="page-body">content</p>
    </ui-page>
  `,
})
class HostComponent {
  title = 'Orders';
  description?: string = 'Build an order and place it.';
}

describe('UiPageComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  function detect() {
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  }

  function query(testId: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    detect();
  });

  it('renders the title as the page heading', () => {
    const heading: HTMLHeadingElement = fixture.nativeElement.querySelector('h1');

    expect(heading.textContent?.trim()).toBe('Orders');
  });

  it('uses the admin heading scale, not a larger one', () => {
    const heading: HTMLHeadingElement = fixture.nativeElement.querySelector('h1');

    expect(heading.className).toContain('text-xl');
    expect(heading.className).toContain('font-semibold');
  });

  it('renders exactly one h1, so the page has a single top-level heading', () => {
    expect(fixture.nativeElement.querySelectorAll('h1').length).toBe(1);
  });

  it('renders the description', () => {
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Build an order and place it.',
    );
  });

  it('omits the description paragraph when there is none', () => {
    host.description = undefined;
    detect();

    expect(fixture.nativeElement.querySelector('p.text-muted-foreground')).toBeNull();
  });

  it('projects page actions', () => {
    expect(query('page-action')).not.toBeNull();
  });

  it('projects the body content', () => {
    expect(query('page-body')).not.toBeNull();
  });

  it('keeps the actions on the description row, right-aligned', () => {
    const row = query('page-action')!.closest('div')!.parentElement!;

    expect(row.className).toContain('justify-between');
  });
});
