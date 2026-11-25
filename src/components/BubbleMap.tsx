import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { LocateFixed, Minus, Plus } from 'lucide-react';
import { AlbumReview } from '../types';
import { AlbumCover } from './AlbumCover';
import { RatingStars } from './RatingStars';

interface BubbleMapProps {
  albums: AlbumReview[];
  onSelect: (album: AlbumReview) => void;
}

interface HexPoint {
  q: number;
  r: number;
  x: number;
  y: number;
  dist: number;
  angle: number;
}

interface ViewState {
  x: number;
  y: number;
  zoom: number;
}

const SQRT3_HALF = Math.sqrt(3) / 2;
const CELL_SIZE = 160;
const STEP = 176;
const MIN_ZOOM = 0.18;
const MAX_ZOOM = 2.5;

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

function generateIsotropicHexPoints(count: number): HexPoint[] {
  if (count <= 0) return [];

  const ringLimit = Math.ceil(Math.sqrt(count)) + 3;
  const candidates: HexPoint[] = [];

  for (let r = -ringLimit; r <= ringLimit; r++) {
    for (let q = -ringLimit; q <= ringLimit; q++) {
      const x = q + r * 0.5;
      const y = r * SQRT3_HALF;
      const dist = Math.hypot(x, y);
      let angle = Math.atan2(y, x) + Math.PI / 2;
      if (angle < 0) angle += Math.PI * 2;
      candidates.push({ q, r, x, y, dist, angle });
    }
  }

  candidates.sort((a, b) => {
    const distDiff = a.dist - b.dist;
    if (Math.abs(distDiff) > 1e-6) return distDiff;
    return a.angle - b.angle;
  });

  return candidates.slice(0, count);
}

export function BubbleMap({ albums, onSelect }: BubbleMapProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<ViewState>({ x: 0, y: 0, zoom: 1 });
  const [isInteracting, setIsInteracting] = useState(false);

  const viewRef = useRef(view);
  viewRef.current = view;

  const hasAutoFittedRef = useRef(false);
  const prevCountRef = useRef(0);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const dragDistanceRef = useRef(0);
  const suppressClickRef = useRef(false);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const updateSize = () => {
      setViewportSize({
        width: el.clientWidth,
        height: el.clientHeight,
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const worldLayout = useMemo(() => {
    const count = albums.length;
    if (count === 0) {
      return {
        worldWidth: 0,
        worldHeight: 0,
        positions: [] as Array<{ wx: number; wy: number }>,
      };
    }

    const points = generateIsotropicHexPoints(count);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const positions = points.map((p) => ({
      wx: (p.x - centerX) * STEP,
      wy: (p.y - centerY) * STEP,
    }));

    const worldWidth = (maxX - minX) * STEP + CELL_SIZE;
    const worldHeight = (maxY - minY) * STEP + CELL_SIZE;

    return { worldWidth, worldHeight, positions };
  }, [albums.length]);

  const computeFitView = useCallback((): ViewState => {
    const { width, height } = viewportSize;
    const { worldWidth, worldHeight } = worldLayout;
    if (width <= 0 || height <= 0 || worldWidth <= 0 || worldHeight <= 0) {
      return { x: width / 2, y: height / 2, zoom: 1 };
    }

    const padX = width < 640 ? 32 : 72;
    const padY = width < 640 ? 48 : 72;
    const availW = Math.max(120, width - padX);
    const availH = Math.max(120, height - padY);
    const fitZoom = clampZoom(Math.min(1, availW / worldWidth, availH / worldHeight));

    return {
      x: width / 2,
      y: height / 2,
      zoom: fitZoom,
    };
  }, [viewportSize, worldLayout]);

  useLayoutEffect(() => {
    if (viewportSize.width <= 0 || viewportSize.height <= 0 || albums.length === 0) return;

    if (!hasAutoFittedRef.current || prevCountRef.current !== albums.length) {
      setView(computeFitView());
      hasAutoFittedRef.current = true;
      prevCountRef.current = albums.length;
    }
  }, [viewportSize, albums.length, computeFitView]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const current = viewRef.current;
      const intensity = e.ctrlKey ? 0.01 : 0.0018;
      const nextZoom = clampZoom(current.zoom * Math.exp(-e.deltaY * intensity));
      if (Math.abs(nextZoom - current.zoom) < 1e-5) return;

      const wx = (mx - current.x) / current.zoom;
      const wy = (my - current.y) / current.zoom;

      setIsInteracting(true);
      setView({
        x: mx - wx * nextZoom,
        y: my - wy * nextZoom,
        zoom: nextZoom,
      });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  const zoomAtCenter = (factor: number) => {
    const { width, height } = viewportSize;
    const cx = width / 2;
    const cy = height / 2;
    const current = viewRef.current;
    const nextZoom = clampZoom(current.zoom * factor);
    const wx = (cx - current.x) / current.zoom;
    const wy = (cy - current.y) / current.zoom;

    setIsInteracting(false);
    setView({
      x: cx - wx * nextZoom,
      y: cy - wy * nextZoom,
      zoom: nextZoom,
    });
  };

  const handleResetView = () => {
    setIsInteracting(false);
    setView(computeFitView());
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if ((e.target as HTMLElement).closest('[data-zoom-control="true"]')) return;

    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 1) {
      dragDistanceRef.current = 0;
      suppressClickRef.current = false;
    }
    setIsInteracting(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;

    const prevMap = pointersRef.current;
    const prevPt = prevMap.get(e.pointerId)!;

    if (prevMap.size === 1) {
      const dx = e.clientX - prevPt.x;
      const dy = e.clientY - prevPt.y;
      dragDistanceRef.current += Math.hypot(dx, dy);
      if (dragDistanceRef.current > 6) {
        suppressClickRef.current = true;
      }
      prevMap.set(e.pointerId, { x: e.clientX, y: e.clientY });

      setView((curr) => ({
        ...curr,
        x: curr.x + dx,
        y: curr.y + dy,
      }));
      return;
    }

    if (prevMap.size === 2) {
      const entries = Array.from(prevMap.entries());
      const otherEntry = entries.find(([id]) => id !== e.pointerId);
      if (!otherEntry) return;
      const [, otherPt] = otherEntry;

      const prevMidX = (prevPt.x + otherPt.x) / 2;
      const prevMidY = (prevPt.y + otherPt.y) / 2;
      const prevDist = Math.hypot(prevPt.x - otherPt.x, prevPt.y - otherPt.y);

      const nextPt = { x: e.clientX, y: e.clientY };
      prevMap.set(e.pointerId, nextPt);
      suppressClickRef.current = true;

      const currMidX = (nextPt.x + otherPt.x) / 2;
      const currMidY = (nextPt.y + otherPt.y) / 2;
      const currDist = Math.hypot(nextPt.x - otherPt.x, nextPt.y - otherPt.y);

      if (prevDist > 0 && currDist > 0 && viewportRef.current) {
        const rect = viewportRef.current.getBoundingClientRect();
        const pmx = prevMidX - rect.left;
        const pmy = prevMidY - rect.top;
        const cmx = currMidX - rect.left;
        const cmy = currMidY - rect.top;

        setView((curr) => {
          const nextZoom = clampZoom(curr.zoom * (currDist / prevDist));
          const wx = (pmx - curr.x) / curr.zoom;
          const wy = (pmy - curr.y) / curr.zoom;
          return {
            x: cmx - wx * nextZoom,
            y: cmy - wy * nextZoom,
            zoom: nextZoom,
          };
        });
      }
    }
  };

  const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 0) {
      setIsInteracting(false);
    }
  };

  return (
    <div
      ref={viewportRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUpOrCancel}
      onPointerCancel={handlePointerUpOrCancel}
      style={{ touchAction: 'none' }}
      className="relative w-full h-full overflow-hidden bg-black select-none cursor-grab active:cursor-grabbing"
    >
      <motion.div
        animate={{ x: view.x, y: view.y, scale: view.zoom }}
        transition={
          isInteracting
            ? { duration: 0 }
            : { duration: 0.18, ease: [0.16, 1, 0.3, 1] }
        }
        style={{ originX: 0, originY: 0 }}
        className="absolute top-0 left-0 will-change-transform"
      >
        <AnimatePresence mode="popLayout">
          {albums.map((album, index) => {
            const pos = worldLayout.positions[index];
            if (!pos) return null;

            const clampedRating = Math.max(0, Math.min(100, album.rating));
            const scaleFactor = 0.64 + (clampedRating / 100) * 0.36;
            const diameter = Math.round(CELL_SIZE * scaleFactor);
            const left = Math.round(pos.wx - diameter / 2);
            const top = Math.round(pos.wy - diameter / 2);

            return (
              <motion.div
                key={album.id}
                initial={{ opacity: 0, scale: 0.72, x: left, y: top }}
                animate={{ opacity: 1, scale: 1, x: left, y: top }}
                exit={{ opacity: 0, scale: 0.72 }}
                transition={{ type: 'spring', stiffness: 260, damping: 26, mass: 0.9 }}
                style={{ width: `${diameter}px`, height: `${diameter}px` }}
                className="absolute top-0 left-0"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (suppressClickRef.current) {
                      suppressClickRef.current = false;
                      return;
                    }
                    onSelect(album);
                  }}
                  aria-label={`${album.title} by ${album.artist}, rated ${album.rating} out of 100`}
                  className="group relative w-full h-full rounded-full overflow-hidden ring-1 ring-zinc-800 hover:ring-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white transition-transform duration-150 hover:scale-[1.04] active:scale-[0.98] cursor-pointer bg-zinc-950"
                >
                  <AlbumCover
                    src={album.coverUrl}
                    alt={`${album.title} by ${album.artist}`}
                    title={album.title}
                  />
                  <div className="absolute inset-0 rounded-full bg-black/80 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-150 flex flex-col items-center justify-center p-3 text-center">
                    <span className="font-mono tabular-nums text-xl font-semibold text-white leading-none">
                      {album.rating}
                    </span>
                    <div className="mt-1.5">
                      <RatingStars rating={album.rating} size="sm" />
                    </div>
                    <span className="mt-1.5 text-xs font-medium text-zinc-200 line-clamp-2 max-w-[85%] leading-tight">
                      {album.title}
                    </span>
                    <span className="mt-0.5 text-[11px] text-zinc-400 truncate max-w-[85%]">
                      {album.artist}
                    </span>
                  </div>
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>

      <div
        data-zoom-control="true"
        className="absolute bottom-5 right-4 sm:right-5 z-20 flex items-center gap-1 p-1 rounded-full border border-zinc-800 bg-zinc-950"
      >
        <button
          type="button"
          onClick={() => zoomAtCenter(1.25)}
          disabled={view.zoom >= MAX_ZOOM - 0.01}
          aria-label="Zoom in"
          className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-900 disabled:opacity-35 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => zoomAtCenter(0.8)}
          disabled={view.zoom <= MIN_ZOOM + 0.01}
          aria-label="Zoom out"
          className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-900 disabled:opacity-35 transition-colors cursor-pointer"
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleResetView}
          aria-label="Reset zoom and center"
          className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer"
        >
          <LocateFixed className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
