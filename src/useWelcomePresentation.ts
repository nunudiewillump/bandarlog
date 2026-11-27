import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { WelcomeAction, WelcomeProgress } from '../shared/welcome-presentation';
import { api } from './api';

type Origin = 'home' | 'profile';

export function useWelcomePresentation(scope: string) {
  const [progress, setProgress] = useState<{ scope: string; value: WelcomeProgress }>();
  const [opened, setOpened] = useState<{ scope: string; origin: Origin }>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const trigger = useRef<HTMLButtonElement | null>(null);
  const operation = useRef(0);
  const writing = useRef(false);
  const latestScope = useRef(scope);
  latestScope.current = scope;
  useEffect(() => {
    writing.current = false;
    setPending(false);
    setError('');
    setProgress(undefined);
    setOpened(undefined);
    trigger.current = null;
    if (!scope) return;
    let active = true;
    const refresh = () => {
      if (writing.current || !navigator.onLine) return;
      const current = operation.current;
      void api('/welcome-presentation')
        .then((value: WelcomeProgress) => {
          if (active && latestScope.current === scope && operation.current === current)
            setProgress({ scope, value });
        })
        .catch(() => {});
    };
    refresh();
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      operation.current++;
      window.removeEventListener('online', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [scope]);

  const origin = opened?.scope === scope ? opened.origin : undefined;
  const history = progress?.scope === scope ? progress.value : undefined;

  async function save(action: WelcomeAction) {
    if (writing.current) return false;
    writing.current = true;
    const current = ++operation.current;
    setError('');
    setPending(true);
    try {
      const value: WelcomeProgress = await api('/welcome-presentation', 'POST', { action });
      if (latestScope.current !== scope || operation.current !== current) return false;
      setProgress({ scope, value });
      return true;
    } catch {
      if (latestScope.current === scope && operation.current === current)
        setError('No se ha podido guardar. Vuelve a intentarlo cuando tengas conexión.');
      return false;
    } finally {
      if (latestScope.current === scope && operation.current === current) {
        writing.current = false;
        setPending(false);
      }
    }
  }

  function open(from: Origin, event: MouseEvent<HTMLButtonElement>) {
    trigger.current = event.currentTarget;
    setOpened({ scope, origin: from });
    void save(from === 'home' ? 'view' : 'reopen');
  }

  function close() {
    setOpened(undefined);
    setError('');
    requestAnimationFrame(() => {
      if (trigger.current?.isConnected) trigger.current.focus();
      else
        Array.from(
          document.querySelectorAll<HTMLElement>('.forest-brand, .mobile-brand, .sidebar-brand'),
        )
          .find((element) => element.getClientRects().length)
          ?.focus();
    });
  }

  async function finish(action: 'complete' | 'skip') {
    if (pending) return;
    if (await save(action)) close();
  }

  function dismiss() {
    if (origin === 'profile' || error) close();
    else void finish('skip');
  }

  return {
    visible: !!history && !history.completedAt && !history.skippedAt,
    origin,
    pending,
    error,
    open,
    finish,
    dismiss,
    skip: () => void save('skip'),
  };
}
