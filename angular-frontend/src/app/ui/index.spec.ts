import * as ui from './index';

describe('ui barrel', () => {
  it('re-exports every primitive and helper', () => {
    const exported = [
      'cx',
      'variants',
      'UiAlertComponent',
      'alertVariants',
      'UiBadgeComponent',
      'badgeVariants',
      'UiButtonComponent',
      'buttonVariants',
      'UiCardComponent',
      'UiCardHeaderComponent',
      'UiCardTitleComponent',
      'UiCardDescriptionComponent',
      'UiCardContentComponent',
      'UiCardFooterComponent',
      'UI_CARD',
      'UiCheckboxComponent',
      'checkboxClassName',
      'UiInputComponent',
      'inputClassName',
      'UiLabelComponent',
      'labelClassName',
      'UiSelectComponent',
      'selectVariants',
      'UiTextareaComponent',
      'textareaClassName'
    ];

    for (const name of exported) {
      expect(Object.keys(ui)).toContain(name);
    }
  });
});
