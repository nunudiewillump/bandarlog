// Show the small SSR poster immediately; decode the local animation before swapping.
// Stop decorative work offscreen/hidden and preserve a complete no-JS experience.
(() => {
  // A finger has no browser hover/proximity sensor. Follow touch/pen coordinates
  // near the crown without cancelling the native page-scroll gesture.
  const header = document.querySelector('.public-header');
  if (header) {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const mobile = matchMedia(
      '(max-width: 767px), (orientation: landscape) and (max-height: 599px) and (max-width: 1023px)',
    );
    const twigs = [...header.querySelectorAll('.public-canopy-twig, .public-canopy-corner')];
    let timer = 0,
      end = 0,
      frame = 0,
      pointer = null,
      anchors = [];
    const visible = () => !document.hidden && header.getBoundingClientRect().width > 0;
    const reset = () => {
      pointer = null;
      cancelAnimationFrame(frame);
      frame = 0;
      for (const twig of twigs)
        for (const property of ['--bough-x', '--bough-y', '--bough-r'])
          twig.style.removeProperty(property);
    };
    const schedule = () => {
      clearTimeout(timer);
      if (!mobile.matches || reduced.matches || !visible()) return;
      timer = setTimeout(() => {
        if (!reduced.matches && mobile.matches && visible()) {
          header.classList.add('has-mobile-breeze');
          end = setTimeout(() => header.classList.remove('has-mobile-breeze'), 2400);
        }
        schedule();
      }, 15000);
    };
    const changed = () => {
      clearTimeout(timer);
      clearTimeout(end);
      header.classList.remove('has-mobile-breeze');
      reset();
      schedule();
    };
    const move = (event) => {
      if (
        !['touch', 'pen'].includes(event.pointerType) ||
        !mobile.matches ||
        reduced.matches ||
        !visible()
      )
        return;
      const rect = header.getBoundingClientRect();
      if (event.clientY < rect.top - 24 || event.clientY > rect.bottom + 64) {
        if (pointer) reset();
        return;
      }
      if (!pointer)
        anchors = twigs.map((twig) => {
          const box = twig.getBoundingClientRect();
          return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        });
      pointer = { x: event.clientX, y: event.clientY };
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!pointer) return;
        twigs.forEach((twig, i) => {
          const dx = pointer.x - anchors[i].x,
            dy = pointer.y - anchors[i].y;
          const reach = Math.max(0, 1 - Math.abs(dx) / 240);
          twig.style.setProperty(
            '--bough-x',
            Math.max(-12, Math.min(12, dx * 0.13)) * reach + 'px',
          );
          twig.style.setProperty('--bough-y', Math.max(-5, Math.min(5, dy * 0.07)) * reach + 'px');
          twig.style.setProperty('--bough-r', Math.max(-3, Math.min(3, dx * 0.03)) * reach + 'deg');
        });
      });
    };
    document.addEventListener('pointerdown', move, { passive: true });
    document.addEventListener('pointermove', move, { passive: true });
    for (const event of ['pointerup', 'pointercancel'])
      document.addEventListener(
        event,
        (e) => {
          if (pointer && ['touch', 'pen'].includes(e.pointerType)) reset();
        },
        { passive: true },
      );
    document.addEventListener('visibilitychange', changed);
    window.addEventListener('resize', changed, { passive: true });
    reduced.addEventListener('change', changed);
    mobile.addEventListener('change', changed);
    schedule();
  }
  const image = document.querySelector('.public-monkey-animation');
  const scene = document.querySelector('.public-keyboard-scene');
  if (!image || !scene) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 600px)');
  const loaded = new Map();
  let visible = true,
    version = 0;
  const update = async () => {
    const current = ++version;
    const active = visible && !document.hidden && !reduced.matches;
    document.body.toggleAttribute('data-motion-paused', !active);
    if (!active) {
      image.src = image.dataset.poster;
      return;
    }
    const next = mobile.matches ? image.dataset.animationMobile : image.dataset.animation;
    if (image.getAttribute('src') === next) return;
    if (!loaded.has(next)) {
      const frame = new Image();
      frame.src = next;
      loaded.set(next, frame.decode());
    }
    try {
      await loaded.get(next);
      if (version === current) image.src = next;
    } catch {
      loaded.delete(next);
    }
  };
  document.addEventListener('visibilitychange', update);
  reduced.addEventListener('change', update);
  mobile.addEventListener('change', update);
  if ('IntersectionObserver' in window)
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      void update();
    }).observe(scene);
  void update();
})();
