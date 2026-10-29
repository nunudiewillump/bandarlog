/** Keep desktop/browser zoom unchanged; restrict page zoom only in installed mobile PWA. */
export function installMobilePwaZoom() {
  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!viewport) return () => {};
  const original = viewport.content;
  const mobile = matchMedia(
    '(max-width: 767px), (orientation: landscape) and (max-height: 599px) and (max-width: 1023px)',
  );
  const standalone = matchMedia('(display-mode: standalone)');
  let active = false;
  const update = () => {
    active =
      mobile.matches &&
      (standalone.matches ||
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    viewport.content = active ? `${original},maximum-scale=1,user-scalable=no` : original;
    document.documentElement.classList.toggle('mobile-pwa-no-zoom', active);
  };
  const gesture = (event: Event) => {
    if (active && event.cancelable) event.preventDefault();
  };
  const touch = (event: TouchEvent) => {
    if (active && event.touches.length > 1 && event.cancelable) event.preventDefault();
  };
  mobile.addEventListener('change', update);
  standalone.addEventListener('change', update);
  document.addEventListener('gesturestart', gesture, { passive: false });
  document.addEventListener('gesturechange', gesture, { passive: false });
  document.addEventListener('touchstart', touch, { passive: false });
  document.addEventListener('touchmove', touch, { passive: false });
  update();
  return () => {
    mobile.removeEventListener('change', update);
    standalone.removeEventListener('change', update);
    document.removeEventListener('gesturestart', gesture);
    document.removeEventListener('gesturechange', gesture);
    document.removeEventListener('touchstart', touch);
    document.removeEventListener('touchmove', touch);
    viewport.content = original;
    document.documentElement.classList.remove('mobile-pwa-no-zoom');
  };
}
