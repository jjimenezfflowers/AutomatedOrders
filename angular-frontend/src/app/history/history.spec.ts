import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { HistoryComponent } from './history';

describe('HistoryComponent', () => {
  let component: HistoryComponent;
  let fixture: ComponentFixture<HistoryComponent>;
  let httpMock: HttpTestingController;

  /** Zoneless TestBed: state mutated outside CD must be marked dirty before rendering. */
  function detect() {
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HistoryComponent],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();

    fixture = TestBed.createComponent(HistoryComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    detect();
  });

  afterEach(() => {
    httpMock.verify(); 
  });

  it('should create', () => {
    httpMock.match(() => true).forEach(r => r.flush([]));
    expect(component).toBeTruthy();
  });

  describe('entries without a captured order number', () => {
    // place-order.spec.js used to store the confirmation heading verbatim
    // ("Your order is confirmed", "Order summary"). It now records null when the
    // page exposes nothing usable, so the list has to render that case.
    function flushHistory(entries: unknown[]) {
      httpMock.match(() => true).forEach(r => r.flush(entries));
      detect();
    }

    const entry = (orderNumber: string | null) => ({
      orderNumber,
      date: '2026-09-02T19:55:34.826Z',
      environment: 'dev',
      products: [{ productId: 'floreana-white-spray-roses', quantity: 1 }],
      customer: 'jose@fiftyflowers.com',
      total: 'N/A'
    });

    it('renders a placeholder instead of a bare hash', () => {
      flushHistory([entry(null)]);

      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text).toContain('order number not captured');
      expect(text).not.toContain('#null');
    });

    it('still renders a real order number', () => {
      flushHistory([entry('DEV-BB-50F2327')]);

      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text).toContain('#DEV-BB-50F2327');
      expect(text).not.toContain('order number not captured');
    });

    it('keeps both kinds of entry in the list', () => {
      flushHistory([entry(null), entry('DEV-BB-50F2328')]);

      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text).toContain('order number not captured');
      expect(text).toContain('#DEV-BB-50F2328');
    });
  });

  describe('design-system migration', () => {
    function html(): string {
      return (fixture.nativeElement as HTMLElement).innerHTML;
    }

    function flushHistory(entries: unknown[]) {
      httpMock.match(() => true).forEach(r => r.flush(entries));
      detect();
    }

    const entry = (environment: string) => ({
      orderNumber: 'DEV-BB-50F2327',
      date: '2026-09-02T19:55:34.826Z',
      environment,
      products: [{ productId: 'floreana-white-spray-roses', quantity: 1 }],
      customer: 'jose@fiftyflowers.com',
      total: 'N/A'
    });

    it('drops the hardcoded surfaces that would stay light in dark mode', () => {
      flushHistory([entry('dev')]);

      expect(html()).not.toContain('bg-white');
      expect(html()).not.toContain('bg-green-100');
      expect(html()).not.toContain('bg-yellow-100');
    });

    it('marks a dev entry with the success token', () => {
      flushHistory([entry('dev')]);

      const badge = fixture.nativeElement.querySelector('ui-badge span, ui-badge div');
      expect(badge.className).toContain('success');
    });

    it('marks a staging entry with the warning token', () => {
      flushHistory([entry('staging')]);

      const badge = fixture.nativeElement.querySelector('ui-badge span, ui-badge div');
      expect(badge.className).toContain('warning');
    });

    it('shows a real empty state rather than a bare sentence', () => {
      flushHistory([]);

      expect(html()).toContain('No orders placed yet');
      expect(fixture.nativeElement.querySelector('lucide-angular')).not.toBeNull();
    });
  });
});
