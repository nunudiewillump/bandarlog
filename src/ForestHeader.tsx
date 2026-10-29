import type { ReactNode } from 'react';
import { BotanicalCanopy } from './BotanicalCanopy';
export function ForestHeader({
  avatar,
  onHome,
  onProfile,
  className = '',
  effectsEnabled = true,
}: {
  avatar?: ReactNode;
  onHome?: () => void;
  onProfile?: () => void;
  className?: string;
  effectsEnabled?: boolean;
}) {
  return (
    <header
      className={`forest-canopy botanical-header ${effectsEnabled ? 'has-foliage' : ''} ${className}`}
    >
      <BotanicalCanopy enabled={effectsEnabled} />
      <div className="forest-canopy-inner">
        <button
          className="forest-brand"
          onClick={onHome}
          type="button"
          aria-label="Bandarlog, inicio"
        >
          <img src="/brand-mark.webp" alt="" width="32" height="32" />
          <span>Bandarlog</span>
        </button>
        {avatar && (
          <button
            type="button"
            className="forest-profile"
            aria-label="Mi perfil"
            onClick={onProfile}
          >
            {avatar}
          </button>
        )}
      </div>
    </header>
  );
}
