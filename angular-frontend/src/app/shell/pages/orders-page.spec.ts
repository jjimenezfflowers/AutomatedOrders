import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';

import { routes } from '../../app.routes';
import { OrdersPageComponent } from './orders-page';

describe('OrdersPageComponent', () => {
  let fixture: ComponentFixture<OrdersPageComponent>;
  let httpMock: HttpTestingController;
  let router: Router;

  function detect() {
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  }

  function button(testId: string): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector(`button[data-testid="${testId}"]`);
  }

  function flushAll() {
    httpMock.match(() => true).forEach((request) => request.flush([]));
  }

  async function render(url: string) {
    await router.navigateByUrl(url);
    fixture = TestBed.createComponent(OrdersPageComponent);
    detect();
    flushAll();
    detect();
    await fixture.whenStable();
    detect();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrdersPageComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter(routes),
      ],
    }).compileComponents();

    spyOn(window, 'alert');

    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  describe('on the dev route', () => {
    beforeEach(async () => {
      await render('/dev/orders');
    });

    it('renders the page heading once', () => {
      const headings = fixture.nativeElement.querySelectorAll('h1');

      expect(headings.length).toBe(1);
      expect(headings[0].textContent.trim()).toBe('Orders');
    });

    it('does not repeat the title inside the card', () => {
      // The card used to carry its own "Create Order" heading directly under the
      // page's "Orders", saying the same thing twice.
      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

      expect(text).not.toContain('Create Order');
    });

    it('mounts the dev orders component', () => {
      expect(fixture.nativeElement.querySelector('app-orders')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('app-staging-orders')).toBeNull();
    });

    describe('page header actions', () => {
      it('surfaces Save Order and Place Order without scrolling the form', () => {
        expect(button('page-save-order')).not.toBeNull();
        expect(button('page-place-order')).not.toBeNull();
      });

      it('drives the feature component rather than duplicating its logic', () => {
        const feature: any = (fixture.componentInstance as any).orders();
        const spy = spyOn(feature, 'runTest');

        button('page-place-order')!.click();

        expect(spy).toHaveBeenCalled();
      });

      it('Save Order in the header calls the same save as the one in the card', () => {
        const feature: any = (fixture.componentInstance as any).orders();
        const spy = spyOn(feature, 'saveOrder');

        button('page-save-order')!.click();

        expect(spy).toHaveBeenCalled();
      });

      it('disables Place Order while a run is in flight', async () => {
        const feature: any = (fixture.componentInstance as any).orders();

        expect(button('page-place-order')!.disabled).toBeFalse();

        feature.isPlacingOrder = true;
        detect();

        expect(button('page-place-order')!.disabled).toBeTrue();
      });

      it('disables Save Order while a save is in flight', () => {
        const feature: any = (fixture.componentInstance as any).orders();

        feature.isSavingOrder = true;
        detect();

        expect(button('page-save-order')!.disabled).toBeTrue();
      });

      it('does not render the staging actions', () => {
        expect(button('page-place-staging-order')).toBeNull();
      });
    });
  });

  describe('on the staging route', () => {
    beforeEach(async () => {
      await render('/staging/orders');
    });

    it('mounts the staging orders component', () => {
      expect(fixture.nativeElement.querySelector('app-staging-orders')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('app-orders')).toBeNull();
    });

    it('surfaces the staging actions instead of the dev ones', () => {
      expect(button('page-place-staging-order')).not.toBeNull();
      expect(button('page-place-order')).toBeNull();
    });

    it('keeps Place Staging Order disabled until a base URL is set', () => {
      const feature: any = (fixture.componentInstance as any).staging();
      feature.stagingBaseUrl = '';
      detect();

      expect(button('page-place-staging-order')!.disabled).toBeTrue();

      feature.stagingBaseUrl = 'https://bloom-brain-stage.myshopify.com/';
      detect();

      expect(button('page-place-staging-order')!.disabled).toBeFalse();
    });

    it('disables Place Staging Order while a run is in flight', () => {
      const feature: any = (fixture.componentInstance as any).staging();
      feature.stagingBaseUrl = 'https://bloom-brain-stage.myshopify.com/';
      feature.isRunning = true;
      detect();

      expect(button('page-place-staging-order')!.disabled).toBeTrue();
    });
  });
});
