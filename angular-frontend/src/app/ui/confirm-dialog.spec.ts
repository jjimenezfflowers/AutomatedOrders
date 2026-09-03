import { Component, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UiConfirmDialogComponent } from './confirm-dialog';

@Component({
  standalone: true,
  imports: [UiConfirmDialogComponent],
  template: `
    <ui-confirm-dialog
      [open]="open"
      title="Delete this product?"
      confirmLabel="Delete product"
      testId="confirm"
      (confirm)="confirmed = confirmed + 1"
      (cancelled)="cancelled = cancelled + 1"
    >
      Roses will be removed.
    </ui-confirm-dialog>
  `,
})
class HostComponent {
  open = false;
  confirmed = 0;
  cancelled = 0;
}

describe('UiConfirmDialogComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  function detect() {
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  }

  function query<T extends HTMLElement>(selector: string): T | null {
    return fixture.nativeElement.querySelector(selector);
  }

  function dialog(): HTMLElement | null {
    return query('[data-testid="confirm"]');
  }

  function open() {
    host.open = true;
    detect();
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

  describe('closed', () => {
    it('renders nothing', () => {
      expect(dialog()).toBeNull();
      expect(query('[data-testid="confirm-confirm"]')).toBeNull();
    });

    it('ignores Escape', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      detect();

      expect(host.cancelled).toBe(0);
    });
  });

  describe('open', () => {
    beforeEach(() => open());

    it('renders the title, the body and both actions', () => {
      const text = dialog()!.textContent ?? '';

      expect(text).toContain('Delete this product?');
      expect(text).toContain('Roses will be removed.');
      expect(query('button[data-testid="confirm-confirm"]')!.textContent).toContain(
        'Delete product',
      );
      expect(query('button[data-testid="confirm-cancel"]')!.textContent).toContain('Cancel');
    });

    it('is an alertdialog, not a plain dialog — it interrupts to confirm', () => {
      expect(dialog()!.getAttribute('role')).toBe('alertdialog');
      expect(dialog()!.getAttribute('aria-modal')).toBe('true');
    });

    it('labels itself with its own title and body', () => {
      const labelledBy = dialog()!.getAttribute('aria-labelledby');
      const describedBy = dialog()!.getAttribute('aria-describedby');

      expect(fixture.nativeElement.querySelector(`#${labelledBy}`).textContent).toContain(
        'Delete this product?',
      );
      expect(fixture.nativeElement.querySelector(`#${describedBy}`).textContent).toContain(
        'Roses will be removed.',
      );
    });

    it('defaults the confirm action to destructive styling', () => {
      expect(query('button[data-testid="confirm-confirm"]')!.className).toContain('destructive');
    });

    it('starts focus on Cancel, so a stray Enter cannot delete', () => {
      expect(document.activeElement).toBe(query('button[data-testid="confirm-cancel"]'));
    });

    describe('dismissing', () => {
      it('confirms when the confirm action is clicked', () => {
        query<HTMLButtonElement>('button[data-testid="confirm-confirm"]')!.click();

        expect(host.confirmed).toBe(1);
        expect(host.cancelled).toBe(0);
      });

      it('cancels when the cancel action is clicked', () => {
        query<HTMLButtonElement>('button[data-testid="confirm-cancel"]')!.click();

        expect(host.cancelled).toBe(1);
        expect(host.confirmed).toBe(0);
      });

      it('cancels on Escape', () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        detect();

        expect(host.cancelled).toBe(1);
        expect(host.confirmed).toBe(0);
      });

      it('cancels when the backdrop is clicked', () => {
        query<HTMLElement>('[aria-hidden="true"]')!.click();

        expect(host.cancelled).toBe(1);
        expect(host.confirmed).toBe(0);
      });

      it('never confirms by accident — no dismissal path emits confirm', () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        query<HTMLElement>('[aria-hidden="true"]')!.click();
        query<HTMLButtonElement>('button[data-testid="confirm-cancel"]')!.click();
        detect();

        expect(host.confirmed).toBe(0);
      });
    });
  });
});
