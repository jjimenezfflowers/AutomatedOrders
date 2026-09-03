import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  ViewChild,
  booleanAttribute,
} from '@angular/core';

import { UiButtonComponent, ButtonVariant } from './button';

/*
 * Class strings from the admin's alert dialog
 * (bb-remix app/shared/components/ui/alert-dialog.tsx):
 *
 *   overlay  fixed inset-0 z-50 backdrop-blur-xs
 *   content  fixed top-[50%] left-[50%] z-50 grid w-full max-w-lg translate-x-[-50%]
 *            translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg sm:rounded-lg
 *   header   flex flex-col space-y-2 text-center sm:text-left
 *   footer   flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2
 *   title    text-lg font-semibold
 *   body     text-sm text-muted-foreground
 *
 * An alert dialog, not a plain dialog: it interrupts to confirm something
 * destructive, so Escape and the backdrop cancel, and focus starts on the
 * cancel action rather than the destructive one.
 */
@Component({
  selector: 'ui-confirm-dialog',
  standalone: true,
  imports: [UiButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open) {
      <div
        class="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-xs"
        (click)="cancel()"
        aria-hidden="true"
      ></div>

      <div
        class="fixed top-[50%] left-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg sm:rounded-lg"
        role="alertdialog"
        aria-modal="true"
        [attr.aria-labelledby]="titleId"
        [attr.aria-describedby]="bodyId"
        [attr.data-testid]="testId"
      >
        <div class="flex flex-col space-y-2 text-center sm:text-left">
          <h2 [id]="titleId" class="text-lg font-semibold">{{ title }}</h2>
          <p [id]="bodyId" class="text-sm text-muted-foreground">
            <ng-content />
          </p>
        </div>

        <div class="flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-2">
          <ui-button
            #cancelButton
            variant="outline"
            (click)="cancel()"
            [testId]="testId ? testId + '-cancel' : undefined"
          >
            {{ cancelLabel }}
          </ui-button>
          <ui-button
            [variant]="confirmVariant"
            (click)="confirm.emit()"
            [testId]="testId ? testId + '-confirm' : undefined"
          >
            {{ confirmLabel }}
          </ui-button>
        </div>
      </div>
    }
  `,
})
export class UiConfirmDialogComponent {
  private static nextId = 0;

  @Input({ transform: booleanAttribute }) open = false;
  @Input({ required: true }) title!: string;
  @Input() confirmLabel = 'Confirm';
  @Input() cancelLabel = 'Cancel';
  @Input() confirmVariant: ButtonVariant = 'destructive';
  @Input() testId?: string;

  @Output() confirm = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  private readonly instance = UiConfirmDialogComponent.nextId++;
  protected readonly titleId = `ui-confirm-title-${this.instance}`;
  protected readonly bodyId = `ui-confirm-body-${this.instance}`;

  /** Focus starts on Cancel, so a stray Enter does not confirm a destructive action. */
  @ViewChild('cancelButton', { read: ElementRef })
  private set cancelButton(ref: ElementRef<HTMLElement> | undefined) {
    ref?.nativeElement.querySelector('button')?.focus();
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.open) this.cancel();
  }

  protected cancel(): void {
    this.cancelled.emit();
  }
}
