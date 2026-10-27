import { useEffect, useState } from 'react';
export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => setReduced(media.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  return reduced;
}
/** Announce only the current value; outgoing digits are purely visual. */
export function AnimatedCounter({ value }: { value: number }) {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  const reduced = useReducedMotion();
  const [frame, setFrame] = useState({
    value: safe,
    from: safe,
    revision: 0,
    moving: false,
    digits: String(safe).length,
  });
  if (frame.value !== safe)
    setFrame({
      value: safe,
      from: frame.value,
      revision: frame.revision + 1,
      moving: true,
      digits: Math.max(frame.digits, String(safe).length),
    });
  useEffect(() => {
    if (!frame.moving) return;
    const timer = setTimeout(
      () =>
        setFrame((current) =>
          current.revision === frame.revision ? { ...current, moving: false } : current,
        ),
      350,
    );
    return () => clearTimeout(timer);
  }, [frame.revision, frame.moving]);
  const moving = frame.moving && !reduced;
  return (
    <span
      className={`animated-counter ${moving ? (frame.value < frame.from ? 'counter-down' : 'counter-up') : ''}`}
      data-value={safe}
      data-animating={moving}
      style={{ minWidth: `${Math.max(2, frame.digits)}ch` }}
    >
      <span className="sr-only">{safe}</span>
      <span className="counter-window" aria-hidden="true" key={frame.revision}>
        {moving && <span className="counter-outgoing">{frame.from}</span>}
        <span className="counter-current">{safe}</span>
      </span>
    </span>
  );
}
