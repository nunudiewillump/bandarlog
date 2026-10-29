import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Settings, X } from 'lucide-react';
import './entity-settings.css';

/** Native top-layer popover escapes scrolling cards and closes on Escape/outside click. */
export function EntitySettings({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const restore = useRef(false);
  useEffect(() => {
    const close = () => panel.current?.hidePopover();
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !panel.current?.matches(':popover-open')) return;
      // Let an open nested selector consume the first Escape itself.
      if (panel.current.querySelector('[role="listbox"]')) return;
      event.preventDefault();
      event.stopPropagation();
      restore.current = true;
      close();
    };
    window.addEventListener('resize', close);
    document.addEventListener('keydown', escape, true);
    return () => {
      window.removeEventListener('resize', close);
      document.removeEventListener('keydown', escape, true);
    };
  }, []);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 16, top: 80, maxHeight: 500 });
  return (
    <span className="entity-settings">
      <button
        type="button"
        ref={trigger}
        className="entity-settings-trigger icon-button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        popoverTarget={id}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const top = Math.min(rect.bottom + 8, Math.max(16, innerHeight - 240));
          setPosition({
            left: Math.max(16, Math.min(rect.right - 380, innerWidth - 396)),
            top,
            maxHeight: innerHeight - top - 16,
          });
        }}
      >
        <Settings size={21} aria-hidden="true" />
      </button>
      <div
        id={id}
        ref={panel}
        popover="auto"
        className="entity-settings-panel"
        role="region"
        aria-label={label}
        style={position}
        onBeforeToggle={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.newState === 'open') restore.current = false;
        }}
        onToggle={(event) => {
          if (event.target !== event.currentTarget) return;
          setOpen(event.newState === 'open');
          if (event.newState === 'closed' && restore.current)
            requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
        }}
      >
        <div className="entity-settings-heading">
          <strong>{label}</strong>
          <button
            className="icon-button"
            aria-label="Cerrar ajustes"
            onClick={() => {
              restore.current = true;
            }}
            popoverTarget={id}
            popoverTargetAction="hide"
          >
            <X size={18} />
          </button>
        </div>
        {open && children}
      </div>
    </span>
  );
}
