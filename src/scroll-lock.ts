type ScrollLock = { count: number; overflow: string; priority: string };
const locks = new WeakMap<HTMLElement, ScrollLock>();

/** Dialogs can overlap during save/navigation and close in either order. */
export function lockBodyScroll(body = document.body) {
  let lock = locks.get(body);
  if (!lock) {
    lock = {
      count: 0,
      overflow: body.style.getPropertyValue('overflow'),
      priority: body.style.getPropertyPriority('overflow'),
    };
    locks.set(body, lock);
    body.style.setProperty('overflow', 'hidden');
  }
  lock.count++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--lock.count) return;
    if (lock.overflow) body.style.setProperty('overflow', lock.overflow, lock.priority);
    else body.style.removeProperty('overflow');
    locks.delete(body);
  };
}
