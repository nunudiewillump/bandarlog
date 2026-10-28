import type { ReactNode } from 'react';
export function ForestHeader({
  avatar,
  onHome,
  onProfile,
  className = '',
}: {
  avatar?: ReactNode;
  onHome?: () => void;
  onProfile?: () => void;
  className?: string;
}) {
  return (
    <header className={`forest-canopy ${className}`}>
      <svg
        className="forest-canopy-depth"
        viewBox="0 0 390 64"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M0 0H390V16C367 3 348 18 323 10C297 30 274 9 250 7C224 32 198 14 174 3C148 25 126 10 102 7C79 21 52 9 32 4C18 10 9 7 0 3Z"
          fill="#103b2d"
          opacity=".42"
        />
      </svg>
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
      <svg
        className="forest-canopy-edge"
        viewBox="0 0 390 16"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M0 0H390V5C376 13 364 6 352 12C337 17 327 14 315 11C301 18 283 16 270 9C256 17 243 15 230 6C215 18 198 17 184 11C168 18 152 17 139 8C125 16 107 16 94 6C77 17 58 18 42 9C27 18 12 16 0 9Z" />
      </svg>
    </header>
  );
}
