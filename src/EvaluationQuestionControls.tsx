import { useEffect, useRef, type PointerEvent } from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';

export function QuestionHandle({
  position,
  count,
  onMove,
}: {
  position: number;
  count: number;
  onMove: (position: number) => void;
}) {
  const drag = useRef<{
    pointer: number;
    x: number;
    y: number;
    list: HTMLElement;
    target: HTMLElement | null;
    scroll: HTMLElement;
    frame: number;
  } | null>(null);

  function stop() {
    if (!drag.current) return;
    cancelAnimationFrame(drag.current.frame);
    drag.current.target?.removeAttribute('data-drop-target');
    drag.current = null;
  }
  useEffect(() => stop, []);

  function targetAt(list: HTMLElement, x: number, y: number) {
    const target = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>('[data-question-position]');
    return target?.closest('[data-question-list]') === list ? target : null;
  }

  function track() {
    const active = drag.current;
    if (!active) return;
    const top =
      active.scroll === document.scrollingElement ? 0 : active.scroll.getBoundingClientRect().top;
    const bottom =
      active.scroll === document.scrollingElement
        ? window.innerHeight
        : Math.min(window.innerHeight, active.scroll.getBoundingClientRect().bottom);
    if (active.y < top + 48) active.scroll.scrollTop -= 14;
    else if (active.y > bottom - 48) active.scroll.scrollTop += 14;
    const target = targetAt(active.list, active.x, active.y);
    if (target !== active.target) {
      active.target?.removeAttribute('data-drop-target');
      target?.setAttribute('data-drop-target', '');
      active.target = target;
    }
    active.frame = requestAnimationFrame(track);
  }

  function start(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || count < 2 || drag.current) return;
    const list = event.currentTarget.closest<HTMLElement>('[data-question-list]');
    if (!list || !(document.scrollingElement instanceof HTMLElement)) return;
    let scroll = list.parentElement;
    while (scroll && !/auto|scroll/.test(getComputedStyle(scroll).overflowY))
      scroll = scroll.parentElement;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      list,
      target: null,
      scroll: scroll ?? document.scrollingElement,
      frame: requestAnimationFrame(track),
    };
  }

  return (
    <button
      type="button"
      className="evaluation-icon evaluation-grip"
      aria-label={'Mover pregunta ' + (position + 1) + ' con las flechas arriba y abajo'}
      title="Arrastra para mover o usa las flechas arriba y abajo"
      disabled={count < 2}
      onPointerDown={start}
      onPointerMove={(event) => {
        if (drag.current?.pointer !== event.pointerId) return;
        drag.current.x = event.clientX;
        drag.current.y = event.clientY;
      }}
      onPointerUp={(event) => {
        if (drag.current?.pointer !== event.pointerId) return;
        const target = targetAt(drag.current.list, event.clientX, event.clientY);
        stop();
        if (target) onMove(Number(target.dataset.questionPosition));
      }}
      onLostPointerCapture={stop}
      onPointerCancel={stop}
      onKeyDown={(event) => {
        const offset = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
        if (!offset) return;
        event.preventDefault();
        const handle = event.currentTarget;
        onMove(position + offset);
        requestAnimationFrame(() => handle.focus({ preventScroll: true }));
      }}
    >
      <GripVertical size={20} aria-hidden="true" />
    </button>
  );
}

export function QuestionOptions({
  options,
  onChange,
}: {
  options: string[];
  onChange: (options: string[]) => void;
}) {
  const fields = useRef<HTMLDivElement>(null);
  function focus(index: number) {
    requestAnimationFrame(() => fields.current?.querySelectorAll('input')[index]?.focus());
  }
  function add() {
    if (options.length === 20) return;
    onChange([...options, '']);
    focus(options.length);
  }
  return (
    <fieldset className="evaluation-choice-options">
      <legend>Opciones de respuesta</legend>
      <div ref={fields} className="evaluation-choice-list">
        {options.map((value, index) => (
          <div className="evaluation-choice-row" key={index}>
            <input
              type="text"
              aria-label={'Opción ' + (index + 1)}
              required
              maxLength={160}
              value={value}
              onChange={(event) =>
                onChange(options.map((item, i) => (i === index ? event.target.value : item)))
              }
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
                event.preventDefault();
                if (index + 1 < options.length) focus(index + 1);
                else add();
              }}
            />
            {options.length > 1 && (
              <button
                type="button"
                className="secondary evaluation-icon evaluation-delete"
                aria-label={'Eliminar opción ' + (index + 1)}
                onClick={() => {
                  onChange(options.filter((_, i) => i !== index));
                  focus(Math.min(index, options.length - 2));
                }}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="evaluation-icon evaluation-green-icon"
        aria-label="Añadir opción"
        title="Añadir opción"
        disabled={options.length >= 20}
        onClick={add}
      >
        <Plus size={21} aria-hidden="true" />
      </button>
    </fieldset>
  );
}
