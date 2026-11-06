// Show the small SSR poster immediately; decode the local animation before swapping.
// Stop decorative work offscreen/hidden and preserve a complete no-JS experience.
(() => {
  const header = document.querySelector('.public-header');
  if (header) {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let timer = 0,
      end = 0;
    const visible = () => !document.hidden && header.getBoundingClientRect().width > 0;
    const schedule = () => {
      clearTimeout(timer);
      if (reduced.matches || !visible()) return;
      timer = setTimeout(
        () => {
          if (!reduced.matches && visible()) {
            header.classList.add('has-canopy-breeze');
            end = setTimeout(() => header.classList.remove('has-canopy-breeze'), 4000);
          }
          schedule();
        },
        5000 + Math.random() * 10000,
      );
    };
    const changed = () => {
      clearTimeout(timer);
      clearTimeout(end);
      header.classList.remove('has-canopy-breeze');
      schedule();
    };
    document.addEventListener('visibilitychange', changed);
    window.addEventListener('resize', changed, { passive: true });
    reduced.addEventListener('change', changed);
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
