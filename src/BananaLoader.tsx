import { useId } from 'react';
export function BananaLoader({
  label = 'Cargando…',
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  const id = 'banana-' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const shape = 'M17 13 C18 38 45 63 85 45 C79 66 57 81 34 74 C11 67 2 39 12 14 Z';
  return (
    <span className={`banana-loader ${compact ? 'compact' : ''}`} role="status" aria-label={label}>
      <svg viewBox="0 0 96 96" aria-hidden="true">
        <defs>
          <clipPath id={id + '-fruit'}>
            <path d={shape} />
          </clipPath>
          <clipPath id={id + '-fill'}>
            <rect className="banana-fill-progress" x="0" y="0" width="96" height="96" />
          </clipPath>
        </defs>
        <path d={shape} fill="#f4f1e6" />
        <g clipPath={`url(#${id}-fruit)`}>
          <g clipPath={`url(#${id}-fill)`}>
            <rect width="96" height="96" fill="#f7c948" />
            <ellipse cx="20" cy="45" rx="4" ry="6" fill="#86522d" transform="rotate(-18 20 45)" />
            <ellipse cx="38" cy="65" rx="5" ry="3.5" fill="#86522d" transform="rotate(22 38 65)" />
            <ellipse
              cx="66"
              cy="61"
              rx="4.5"
              ry="3.5"
              fill="#86522d"
              transform="rotate(-20 66 61)"
            />
          </g>
        </g>
        <path d={shape} fill="none" stroke="#124d38" strokeWidth="3.5" strokeLinejoin="round" />
        <path
          d="M12 14 L13 7 L19 8 L17 15 M83 45 L88 42"
          fill="none"
          stroke="#124d38"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
      {label && <span>{label}</span>}
    </span>
  );
}
