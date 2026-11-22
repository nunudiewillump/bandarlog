import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import './home-quick-actions.css';

/** Confirmation gesture only. The parent owns authorization, mutation and receipts. */
export function HomeTaskAction({
  title,
  status,
  version,
  disabled,
  queued = false,
  onStart,
  onFinish,
}: {
  title: string;
  status: string;
  version?: string;
  disabled: boolean;
  queued?: boolean;
  onStart: () => void;
  onFinish: () => void;
}) {
  const track = useRef<HTMLDivElement>(null),
    handle = useRef<HTMLButtonElement>(null);
  const gesture = useRef<{
    pointer: number;
    x: number;
    y: number;
    travel: number;
    dx: number;
  } | null>(null);
  const submitted = useRef(false);
  const [position, setPosition] = useState(0),
    [dragging, setDragging] = useState(false);
  const [slow, setSlow] = useState(false);
  const cancel = () => {
    const previous = gesture.current;
    gesture.current = null;
    if (previous && handle.current?.hasPointerCapture(previous.pointer))
      handle.current.releasePointerCapture(previous.pointer);
    setPosition(0);
    setDragging(false);
  };
  useEffect(() => {
    submitted.current = false;
    cancel();
  }, [status, version, disabled, queued]);
  useEffect(() => {
    if (!disabled || queued) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), 450);
    return () => clearTimeout(timer);
  }, [disabled, queued]);
  useEffect(() => {
    const abort = () => cancel();
    const resize = new ResizeObserver(abort);
    if (track.current) resize.observe(track.current);
    window.addEventListener('orientationchange', abort);
    window.addEventListener('blur', abort);
    const visibility = () => {
      if (document.hidden) abort();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      resize.disconnect();
      window.removeEventListener('orientationchange', abort);
      window.removeEventListener('blur', abort);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [status]);
  const start = () => {
    if (disabled || submitted.current) return;
    submitted.current = true;
    onStart();
  };
  const finish = () => {
    if (disabled || submitted.current) return;
    submitted.current = true;
    onFinish();
  };
  const down = (e: PointerEvent<HTMLButtonElement>) => {
    if (disabled || submitted.current || !e.isPrimary || e.button !== 0) return;
    const travel = (track.current?.clientWidth || 0) - e.currentTarget.offsetWidth - 8;
    if (travel <= 0) return;
    gesture.current = { pointer: e.pointerId, x: e.clientX, y: e.clientY, travel, dx: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    const dx = e.clientX - g.x,
      dy = Math.abs(e.clientY - g.y);
    if (dy > 12 && dy > Math.abs(dx)) {
      cancel();
      return;
    }
    g.dx = Math.max(0, Math.min(g.travel, dx));
    setPosition(g.dx);
  };
  const up = (e: PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    const ready = g.dx >= g.travel * 0.83 && g.dx >= 12;
    cancel();
    if (ready) start();
  };
  if (!['pending', 'in_progress'].includes(status)) return null;
  const waiting = queued ? 'Pendiente de sincronizar' : slow ? 'Guardando…' : null;
  if (status === 'in_progress')
    return (
      <button
        type="button"
        className="home-finish"
        disabled={disabled}
        aria-label={`Finalizar tarea: ${title}`}
        onClick={finish}
      >
        <Check size={18} aria-hidden="true" />
        {waiting || 'Finalizar tarea'}
      </button>
    );
  const ready = !!gesture.current && position >= gesture.current.travel * 0.83;
  return (
    <div className="home-start-action">
      <div
        ref={track}
        className={`home-slide ${dragging ? 'dragging' : ''} ${ready ? 'ready' : ''} ${disabled ? 'disabled' : ''}`}
        style={{ '--slide-x': `${position}px` } as CSSProperties}
      >
        <span className="home-slide-fill" aria-hidden="true" />
        <span className="home-slide-label" aria-hidden="true">
          {waiting || (ready ? 'Suelta para empezar' : 'Desliza para empezar')}
        </span>
        <button
          ref={handle}
          type="button"
          className="home-slide-handle"
          disabled={disabled}
          tabIndex={-1}
          aria-hidden="true"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={cancel}
          onLostPointerCapture={cancel}
        >
          <ArrowRight size={24} aria-hidden="true" />
        </button>
      </div>
      <button
        type="button"
        className="home-start-accessible"
        disabled={disabled}
        aria-label={`Empezar tarea: ${title}`}
        onClick={start}
      >
        <ArrowRight size={18} aria-hidden="true" />
        {waiting || 'Empezar tarea'}
      </button>
    </div>
  );
}
