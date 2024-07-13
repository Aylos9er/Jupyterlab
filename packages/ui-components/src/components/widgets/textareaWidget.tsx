import React from 'react';
import { ChangeEvent, FocusEvent, useCallback } from 'react';
import { ariaDescribedByIds, FormContextType, RJSFSchema, StrictRJSFSchema, WidgetProps } from '@rjsf/utils';
import { TextArea } from '@jupyter/react-components';

/** The `TextareaWidget` is a widget for rendering input fields as textarea.
 *
 * @param props - The `WidgetProps` for this component
 */
function TextareaWidget<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>({
  id,
  options,
  placeholder,
  value,
  required,
  disabled,
  readonly,
  autofocus = false,
  onChange,
  onBlur,
  onFocus,
}: WidgetProps<T, S, F>) {
  const handleChange = useCallback(
    ({ target: { value } }: ChangeEvent<HTMLTextAreaElement>) => onChange(value === '' ? options.emptyValue : value),
    [onChange, options.emptyValue]
  );

  const handleBlur = useCallback(
    ({ target }: FocusEvent<HTMLTextAreaElement>) => onBlur(id, target && target.value),
    [onBlur, id]
  );

  const handleFocus = useCallback(
    ({ target }: FocusEvent<HTMLTextAreaElement>) => onFocus(id, target && target.value),
    [id, onFocus]
  );

  return (
    <TextArea
      id={id}
      name={id}
      className='form-control'
      value={value || ''}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      readOnly={readonly}
      autoFocus={autofocus}
      onBlur={handleBlur}
      onFocus={handleFocus}
      onChange={handleChange}
      aria-describedby={ariaDescribedByIds<T>(id)}
    />
  );
}

export default TextareaWidget;
