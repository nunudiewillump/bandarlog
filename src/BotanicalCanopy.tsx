import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './botanical-canopy.css';
import { BananaArtwork } from './BananaLoader';
import { leafPaths as SHAPES } from '../shared/forest-art';

type LeafShape = 'beech' | 'oak';
type LeafColors = readonly [string, string];

const FRONT_COLORS: LeafColors[] = [
  ['#2b6642', '#87a36c'],
  ['#326b44', '#88a56e'],
  ['#275d3d', '#799660'],
];
// Both the attached leaves and the falling leaves use this exact artwork.
function BotanicalLeaf({
  shape,
  colors,
  veins = true,
}: {
  shape: LeafShape;
  colors: LeafColors;
  veins?: boolean;
}) {
  return (
    <g className="botanical-leaf" data-leaf-shape={shape}>
      <path className="botanical-leaf-silhouette" d={SHAPES[shape]} fill={colors[0]} />
      <path d="M0 0Q3-40 5-76C18-65 27-47 20-29C15-14 6-5 0 0Z" fill={colors[1]} opacity=".3" />
      {veins && (
        <>
          <path
            d={shape === 'oak' ? 'M0 0Q3-40 5-76' : 'M0 0Q-3-43-3-76'}
            stroke={colors[1]}
            strokeWidth="1.25"
            fill="none"
            opacity=".36"
          />
          <path
            d={
              shape === 'oak'
                ? 'M2-18L-13-27M3-32L20-42M4-45L-15-54M4-58L16-66'
                : 'M-1-20L-17-33M-2-34L16-46M-3-49L-17-59M-3-59L9-69'
            }
            stroke={colors[1]}
            strokeWidth=".9"
            fill="none"
            opacity=".22"
          />
        </>
      )}
    </g>
  );
}
/** A small pair of the existing leaves closes the opening above the brand's N. */
export function BrandCanopyFill() {
  return (
    <svg className="botanical-brand-fill" viewBox="0 0 96 76" aria-hidden="true" focusable="false">
      <g className="botanical-bough" data-depth="2">
        <g transform="translate(31 -4) rotate(150) scale(.65)">
          <BotanicalLeaf shape="beech" colors={FRONT_COLORS[0]} />
        </g>
        <g transform="translate(65 -12) rotate(211) scale(.66)">
          <BotanicalLeaf shape="oak" colors={FRONT_COLORS[2]} />
        </g>
      </g>
    </svg>
  );
}
const BRANCHES = [19, 18, 17].map((count, depth) =>
  Array.from({ length: count }, (_, index) => {
    const colors: LeafColors =
      depth === 0
        ? ['#133e2b', '#376346']
        : depth === 1
          ? ['#1c5135', '#5b8251']
          : FRONT_COLORS[index % 3];
    const angles = depth < 2 ? [111, 159, 211, 261] : index % 3 ? [127, 181, 236] : [137, 222];
    return {
      depth,
      index,
      colors,
      x:
        -60 +
        index * [109, 116, 124][depth] +
        (depth % 2) * 31 +
        Math.sin(index * 2.31 + depth) * 22,
      y: [-2, 21, 44][depth] + Math.sin(index * 1.77 + depth) * 13,
      leaves: angles.map((angle, j) => ({
        shape: ((index + j + depth) % 3 === 0 ? 'oak' : 'beech') as LeafShape,
        angle: angle + Math.sin(index * 1.67 + j) * 19,
        scale:
          ([1.08, 0.97, 0.88][depth] + Math.sin(index * 2.4 + j) * 0.16) *
          (depth === 2 && index % 4 === 1 ? 1.14 : 1),
        x: (j - 1.5) * 8,
        y: (j % 2) * 3,
      })),
    };
  }),
);
type FallingLeaf = {
  kind: 'leaf' | 'banana';
  shape: LeafShape;
  colors: LeafColors;
  x: number;
  top: number;
  size: number;
  drift: number;
  rotation: number;
};
// Mobile and desktop headers coexist; only one ambient fall batch may exist.
let activeLeafOwner: string | null = null;

export function BotanicalCanopy({ enabled = true }: { enabled?: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const surface = useRef<HTMLDivElement>(null);
  const [falling, setFalling] = useState<FallingLeaf[]>([]);
  const clearLeaf = useCallback(() => {
    if (activeLeafOwner === id) activeLeafOwner = null;
    setFalling([]);
  }, [id]);
  useEffect(() => {
    setFalling([]);
    if (!enabled || !surface.current) return;
    const decoration = surface.current;
    const header = decoration.closest('header');
    if (!header) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
    const boughs = [...header.querySelectorAll<SVGGElement>('.botanical-bough')];
    let timer = 0,
      breezeTimer = 0,
      breezeEnd = 0,
      frame = 0,
      pointer: { x: number; y: number } | null = null;
    let anchors: { x: number; y: number }[] = [];
    const visible = () => {
      const rect = header.getBoundingClientRect();
      return (
        !document.hidden &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.top < innerHeight
      );
    };
    const reset = () =>
      boughs.forEach((bough) => {
        bough.style.removeProperty('--bough-x');
        bough.style.removeProperty('--bough-y');
        bough.style.removeProperty('--bough-r');
      });
    const cacheAnchors = () => {
      anchors = boughs.map((bough) => {
        const rect = bough.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      });
    };
    const stop = () => {
      clearTimeout(timer);
      clearTimeout(breezeTimer);
      clearTimeout(breezeEnd);
      header.classList.remove('has-canopy-breeze');
      timer = 0;
      cancelAnimationFrame(frame);
      frame = 0;
      pointer = null;
      reset();
      clearLeaf();
    };
    const scheduleBreeze = () => {
      clearTimeout(breezeTimer);
      if (reduced.matches || !visible()) return;
      breezeTimer = window.setTimeout(
        () => {
          if (!reduced.matches && visible()) {
            header.classList.add('has-canopy-breeze');
            clearTimeout(breezeEnd);
            breezeEnd = window.setTimeout(() => header.classList.remove('has-canopy-breeze'), 4000);
          }
          scheduleBreeze();
        },
        5000 + Math.random() * 10000,
      );
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = 0;
      if (reduced.matches || !visible()) return;
      timer = window.setTimeout(
        () => {
          timer = 0;
          if (!reduced.matches && visible() && activeLeafOwner === null) {
            const rect = header.getBoundingClientRect();
            activeLeafOwner = id;
            const chance = Math.random();
            const banana = chance < 0.1;
            const count = !banana && chance < 0.25 ? 2 : 1;
            setFalling(
              Array.from({ length: count }, () => {
                const shape: LeafShape = Math.random() > 0.5 ? 'oak' : 'beech';
                return {
                  kind: banana ? 'banana' : 'leaf',
                  shape,
                  colors: FRONT_COLORS[Math.floor(Math.random() * FRONT_COLORS.length)],
                  x: Math.max(
                    18,
                    Math.min(innerWidth - 50, rect.left + rect.width * (0.1 + Math.random() * 0.8)),
                  ),
                  top: Math.max(0, rect.bottom - 34),
                  size: banana
                    ? 42
                    : shape === 'oak'
                      ? 27 + Math.random() * 5
                      : 33 + Math.random() * 5,
                  drift: -35 + Math.random() * 70,
                  rotation: -24 + Math.random() * 48,
                };
              }),
            );
          }
          schedule();
        },
        17000 + Math.random() * 33000,
      );
    };
    const pointerMove = (event: PointerEvent) => {
      if (reduced.matches || !finePointer.matches || event.pointerType !== 'mouse' || !visible())
        return;
      pointer = { x: event.clientX, y: event.clientY };
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!pointer || reduced.matches || !visible()) return;
        if (!anchors.length) cacheAnchors();
        boughs.forEach((bough, index) => {
          const dx = pointer!.x - anchors[index].x,
            dy = pointer!.y - anchors[index].y;
          const reach = Math.max(0, 1 - Math.abs(dx) / 240);
          const strength = (Number(bough.dataset.depth) + 1) / 3;
          // The earlier prototype's distance weighting made its nominal6px barely visible.
          // This force reaches about7px on nearby foreground branches, without moving controls.
          bough.style.setProperty(
            '--bough-x',
            `${Math.max(-12, Math.min(12, dx * 0.13)) * reach * strength}px`,
          );
          bough.style.setProperty(
            '--bough-y',
            `${Math.max(-5, Math.min(5, dy * 0.07)) * reach * strength}px`,
          );
          bough.style.setProperty(
            '--bough-r',
            `${Math.max(-3, Math.min(3, dx * 0.03)) * reach * strength}deg`,
          );
        });
      });
    };
    const leave = () => {
      pointer = null;
      cancelAnimationFrame(frame);
      frame = 0;
      reset();
    };
    const changed = () => {
      if (reduced.matches || !visible()) stop();
      else {
        schedule();
        scheduleBreeze();
      }
    };
    const resized = () => {
      anchors = [];
      reset();
      changed();
    };
    header.addEventListener('pointermove', pointerMove, { passive: true });
    header.addEventListener('pointerleave', leave, { passive: true });
    document.addEventListener('visibilitychange', changed);
    reduced.addEventListener('change', changed);
    const observer = new ResizeObserver(resized);
    observer.observe(header);
    const intersection = new IntersectionObserver(changed);
    intersection.observe(header);
    schedule();
    scheduleBreeze();
    return () => {
      clearTimeout(timer);
      clearTimeout(breezeTimer);
      clearTimeout(breezeEnd);
      header.classList.remove('has-canopy-breeze');
      cancelAnimationFrame(frame);
      reset();
      if (activeLeafOwner === id) activeLeafOwner = null;
      header.removeEventListener('pointermove', pointerMove);
      header.removeEventListener('pointerleave', leave);
      document.removeEventListener('visibilitychange', changed);
      reduced.removeEventListener('change', changed);
      observer.disconnect();
      intersection.disconnect();
    };
  }, [enabled, id, clearLeaf]);
  if (!enabled) return null;
  return (
    <>
      <div ref={surface} className="botanical-decoration" aria-hidden="true">
        <svg
          className="botanical-art"
          viewBox="0 0 1920 170"
          preserveAspectRatio="xMidYMax slice"
          focusable="false"
        >
          <defs>
            {BRANCHES.map((_, depth) => (
              <filter
                key={depth}
                id={`${id}-leaf-shadow-${depth}`}
                x="-30%"
                y="-30%"
                width="170%"
                height="180%"
              >
                <feDropShadow
                  dx="0"
                  dy={3 + depth}
                  stdDeviation={2 + depth * 0.4}
                  floodColor="#072719"
                  floodOpacity={0.35 + depth * 0.07}
                />
              </filter>
            ))}
          </defs>
          <path
            className="botanical-backing"
            d="M0 0H1920V71C1680 62 1510 74 1300 63C1030 73 830 59 590 69C390 56 180 74 0 66Z"
            fill="#103b2d"
          />
          <use
            className="botanical-mobile-fill"
            href={`#${id}-front-crown`}
            transform="translate(62 -34)"
          />
          {BRANCHES.map((branches, depth) => (
            <g
              key={depth}
              id={depth === 2 ? `${id}-front-crown` : undefined}
              filter={`url(#${id}-leaf-shadow-${depth})`}
            >
              {branches.map((branch) => (
                <g
                  key={branch.index}
                  transform={`translate(${branch.x.toFixed(1)} ${branch.y.toFixed(1)})`}
                >
                  <g className="botanical-bough" data-depth={depth}>
                    <path
                      d="M-27-12Q-3-2 20 9"
                      stroke={['#0e3021', '#173d27', '#294f2e'][depth]}
                      strokeWidth={3.2 - depth * 0.5}
                      fill="none"
                      strokeLinecap="round"
                    />
                    {branch.leaves.map((leaf, index) => (
                      <g
                        key={index}
                        transform={`translate(${leaf.x} ${leaf.y}) rotate(${leaf.angle}) scale(${leaf.scale})`}
                      >
                        <BotanicalLeaf
                          shape={leaf.shape}
                          colors={branch.colors}
                          veins={depth > 0}
                        />
                      </g>
                    ))}
                  </g>
                </g>
              ))}
            </g>
          ))}
          {/* Reuse the actual leaves above the controls, including the status area. */}
          <use
            className="botanical-upper-crown"
            href={`#${id}-front-crown`}
            transform="translate(0 -72)"
          />
        </svg>
      </div>
      {falling.length > 0 &&
        createPortal(
          <div className="ambient-leaf-layer" aria-hidden="true">
            {falling.map((particle, index) => (
              <span
                key={index}
                className={`ambient-leaf ${particle.kind === 'banana' ? 'ambient-banana' : ''}`}
                data-leaf-shape={particle.kind === 'leaf' ? particle.shape : undefined}
                data-falling-kind={particle.kind}
                onAnimationEnd={index === falling.length - 1 ? clearLeaf : undefined}
                style={
                  {
                    animationDelay: `${index * 0.35}s`,
                    left: particle.x,
                    top: particle.top,
                    width: particle.size,
                    height: particle.size * 1.1,
                    '--fall-drift': `${particle.drift}px`,
                    '--fall-rotation': `${particle.rotation}deg`,
                  } as React.CSSProperties
                }
              >
                {particle.kind === 'banana' ? (
                  <BananaArtwork />
                ) : (
                  <svg viewBox="-48 -98 100 105" focusable="false">
                    <BotanicalLeaf shape={particle.shape} colors={particle.colors} />
                  </svg>
                )}
              </span>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
