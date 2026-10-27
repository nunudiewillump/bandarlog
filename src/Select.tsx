import React, { useId, useRef, useState, useEffect } from 'react';
import * as SelectUI from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
type Props = React.SelectHTMLAttributes<HTMLSelectElement>;
function optionsOf(
  children: React.ReactNode,
): React.ReactElement<React.OptionHTMLAttributes<HTMLOptionElement>>[] {
  return React.Children.toArray(children).flatMap((child) => {
    if (!React.isValidElement(child)) return [];
    if (child.type === React.Fragment)
      return optionsOf((child.props as { children: React.ReactNode }).children);
    return child.type === 'option'
      ? [child as React.ReactElement<React.OptionHTMLAttributes<HTMLOptionElement>>]
      : [];
  });
}
export function Select({
  children,
  value,
  defaultValue,
  onChange,
  name,
  required,
  disabled,
  className = '',
  style,
  id,
  ...props
}: Props) {
  const options = optionsOf(children),
    autoId = useId(),
    ref = useRef<HTMLButtonElement>(null);
  const [internal, setInternal] = useState(String(defaultValue ?? options[0]?.props.value ?? '')),
    [open, setOpen] = useState(false);
  const current = String(value ?? internal),
    encode = (v: string) => (v === '' ? '__bandarlog_empty__' : v);
  useEffect(() => {
    const form = ref.current?.closest('form');
    if (!required || disabled || current) return;
    const validate = (event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      ref.current?.focus();
      setOpen(true);
    };
    form?.addEventListener('submit', validate, true);
    return () => form?.removeEventListener('submit', validate, true);
  }, [required, disabled, current]);
  return (
    <span className={`select-control ${className}`} style={style}>
      <SelectUI.Root
        open={open}
        onOpenChange={setOpen}
        disabled={disabled}
        value={encode(current)}
        onValueChange={(v) => {
          const next = v === '__bandarlog_empty__' ? '' : v;
          setInternal(next);
          onChange?.({
            target: { value: next },
            currentTarget: { value: next },
          } as React.ChangeEvent<HTMLSelectElement>);
        }}
      >
        <SelectUI.Trigger
          ref={ref}
          id={id || autoId}
          aria-label={props['aria-label']}
          aria-labelledby={props['aria-labelledby']}
          aria-required={required}
          className="select-trigger"
        >
          <SelectUI.Value />
          <SelectUI.Icon>
            <ChevronDown size={16} />
          </SelectUI.Icon>
        </SelectUI.Trigger>
        <SelectUI.Portal>
          <SelectUI.Content
            className="select-menu"
            position="popper"
            sideOffset={6}
            collisionPadding={12}
            onEscapeKeyDown={(e) => e.stopPropagation()}
          >
            <SelectUI.ScrollUpButton className="select-scroll">
              <ChevronUp size={16} />
            </SelectUI.ScrollUpButton>
            <SelectUI.Viewport className="select-options">
              {options.map((option, index) => {
                const raw = String(option.props.value ?? option.props.children ?? '');
                return (
                  <SelectUI.Item
                    className="select-option"
                    key={raw + '-' + index}
                    value={encode(raw)}
                    disabled={option.props.disabled}
                  >
                    <SelectUI.ItemText>{option.props.children}</SelectUI.ItemText>
                    <SelectUI.ItemIndicator>
                      <Check size={16} />
                    </SelectUI.ItemIndicator>
                  </SelectUI.Item>
                );
              })}
            </SelectUI.Viewport>
            <SelectUI.ScrollDownButton className="select-scroll">
              <ChevronDown size={16} />
            </SelectUI.ScrollDownButton>
          </SelectUI.Content>
        </SelectUI.Portal>
      </SelectUI.Root>
      {name && <input type="hidden" name={name} value={current} disabled={disabled} />}
    </span>
  );
}
