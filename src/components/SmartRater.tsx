import { useEffect, useMemo, useState } from 'react';
import {
  AnimatePresence,
  motion,
  PanInfo,
  useMotionValue,
  useTransform,
} from 'motion/react';
import { Equal, RotateCcw, Undo2, X } from 'lucide-react';
import { AlbumReview } from '../types';
import { AlbumCover } from './AlbumCover';
import { RatingStars } from './RatingStars';

interface SmartRaterProps {
  currentTitle: string;
  currentArtist: string;
  currentCoverUrl: string;
  comparableAlbums: AlbumReview[];
  onApplyRating: (rating: number) => void;
  onClose: () => void;
}

interface SearchStep {
  lowIdx: number;
  highIdx: number;
  minScore: number;
  maxScore: number;
}

type SwipeDirection = 'left' | 'right' | 'up';

const cardVariants = {
  enter: { opacity: 0, scale: 0.92, y: 10 },
  center: { opacity: 1, scale: 1, y: 0 },
  exit: (dir: SwipeDirection) => ({
    opacity: 0,
    x: dir === 'right' ? 280 : dir === 'left' ? -280 : 0,
    y: dir === 'up' ? -140 : 12,
    rotate: dir === 'right' ? 14 : dir === 'left' ? -14 : 0,
    scale: 0.92,
    transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

interface SwipeCardProps {
  pivot: AlbumReview;
  nextPreview: AlbumReview | null;
  direction: SwipeDirection;
  onSwipe: (choice: '<' | '=' | '>') => void;
}

function SwipeCard({ pivot, nextPreview, direction, onSwipe }: SwipeCardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-180, 0, 180], [-11, 0, 11]);
  const rightStampOpacity = useTransform(x, [24, 95], [0, 1]);
  const leftStampOpacity = useTransform(x, [-95, -24], [1, 0]);

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x > 85 || info.velocity.x > 420) {
      onSwipe('>');
      return;
    }
    if (info.offset.x < -85 || velocityOrOffsetLeft(info)) {
      onSwipe('<');
    }
  };

  return (
    <div className="relative w-full max-w-[290px] aspect-square mx-auto">
      {nextPreview && (
        <div className="absolute inset-0 scale-[0.94] translate-y-2.5 rounded-2xl overflow-hidden border border-zinc-800/80 bg-zinc-900 opacity-50 pointer-events-none">
          <AlbumCover
            src={nextPreview.coverUrl}
            alt={nextPreview.title}
            title={nextPreview.title}
            shape="rounded"
          />
        </div>
      )}

      <motion.div
        style={{ x, rotate }}
        custom={direction}
        variants={cardVariants}
        initial="enter"
        animate="center"
        exit="exit"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.85}
        onDragEnd={handleDragEnd}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="relative w-full h-full rounded-2xl overflow-hidden border border-zinc-700 bg-zinc-900 cursor-grab active:cursor-grabbing touch-pan-y select-none"
      >
        <AlbumCover
          src={pivot.coverUrl}
          alt={`${pivot.title} by ${pivot.artist}`}
          title={pivot.title}
          shape="rounded"
        />

        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/95 via-black/70 to-transparent pointer-events-none" />

        <div className="absolute inset-x-0 bottom-0 p-4 flex items-end justify-between gap-3 pointer-events-none">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{pivot.title}</p>
            <p className="text-xs text-zinc-300 truncate">
              {pivot.artist}
              {pivot.releaseYear ? ` · ${pivot.releaseYear}` : ''}
            </p>
          </div>
          <span className="font-mono tabular-nums text-xs font-semibold text-white bg-black/80 border border-zinc-700 rounded-full px-2.5 py-1 shrink-0">
            {pivot.rating}
          </span>
        </div>

        <motion.div
          style={{ opacity: rightStampOpacity }}
          className="absolute top-4 left-4 px-3 py-1 rounded-full border-2 border-emerald-400 bg-black/80 text-emerald-300 font-mono text-xs font-semibold tracking-wide pointer-events-none"
        >
          &gt; BETTER
        </motion.div>

        <motion.div
          style={{ opacity: leftStampOpacity }}
          className="absolute top-4 right-4 px-3 py-1 rounded-full border-2 border-rose-400 bg-black/80 text-rose-300 font-mono text-xs font-semibold tracking-wide pointer-events-none"
        >
          &lt; LOWER
        </motion.div>
      </motion.div>
    </div>
  );
}

function velocityOrOffsetLeft(info: PanInfo): boolean {
  return info.velocity.x < -420;
}

export function SmartRater({
  currentTitle,
  currentArtist,
  currentCoverUrl,
  comparableAlbums,
  onApplyRating,
  onClose,
}: SmartRaterProps) {
  const sorted = useMemo(
    () => [...comparableAlbums].sort((a, b) => a.rating - b.rating),
    [comparableAlbums]
  );

  const initialStep: SearchStep = {
    lowIdx: 0,
    highIdx: Math.max(0, sorted.length - 1),
    minScore: 0,
    maxScore: 100,
  };

  const [step, setStep] = useState<SearchStep>(initialStep);
  const [history, setHistory] = useState<SearchStep[]>([]);
  const [resolvedScore, setResolvedScore] = useState<number | null>(null);
  const [exitDirection, setExitDirection] = useState<SwipeDirection>('right');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  const midIdx = Math.floor((step.lowIdx + step.highIdx) / 2);
  const pivot = sorted[Math.max(0, Math.min(sorted.length - 1, midIdx))];

  const nextPreview = useMemo(() => {
    if (sorted.length <= 1) return null;
    const candidateIdx =
      midIdx + 1 <= step.highIdx ? midIdx + 1 : midIdx - 1 >= step.lowIdx ? midIdx - 1 : -1;
    return candidateIdx >= 0 ? sorted[candidateIdx] : null;
  }, [sorted, midIdx, step.lowIdx, step.highIdx]);

  const handleChoice = (choice: '<' | '=' | '>') => {
    if (!pivot) return;

    setExitDirection(choice === '>' ? 'right' : choice === '<' ? 'left' : 'up');

    if (choice === '=') {
      setHistory((prev) => [...prev, step]);
      setResolvedScore(pivot.rating);
      onApplyRating(pivot.rating);
      return;
    }

    let nextLow = step.lowIdx;
    let nextHigh = step.highIdx;
    let nextMin = step.minScore;
    let nextMax = step.maxScore;

    if (choice === '>') {
      nextMin = Math.min(100, Math.max(step.minScore, pivot.rating + 1));
      nextLow = midIdx + 1;
      while (nextLow <= nextHigh && sorted[nextLow].rating <= pivot.rating) {
        nextLow += 1;
      }
    } else {
      nextMax = Math.max(0, Math.min(step.maxScore, pivot.rating - 1));
      nextHigh = midIdx - 1;
      while (nextHigh >= nextLow && sorted[nextHigh].rating >= pivot.rating) {
        nextHigh -= 1;
      }
    }

    setHistory((prev) => [...prev, step]);

    if (nextLow > nextHigh) {
      const calculated = Math.max(0, Math.min(100, Math.round((nextMin + nextMax) / 2)));
      setResolvedScore(calculated);
      onApplyRating(calculated);
      return;
    }

    setStep({
      lowIdx: nextLow,
      highIdx: nextHigh,
      minScore: nextMin,
      maxScore: nextMax,
    });
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setStep(prev);
    setResolvedScore(null);
  };

  const handleReset = () => {
    setStep(initialStep);
    setHistory([]);
    setResolvedScore(null);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      onClick={onClose}
      className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="smart-rater-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 12 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-3xl p-6 space-y-5 overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 shrink-0 rounded-xl overflow-hidden ring-1 ring-zinc-800">
              <AlbumCover
                src={currentCoverUrl}
                alt={currentTitle || 'Current album'}
                title={currentTitle || 'Current Album'}
                shape="rounded"
              />
            </div>
            <div className="min-w-0">
              <h3 id="smart-rater-title" className="text-sm font-semibold text-white truncate">
                {currentTitle || 'Reviewing Album'}
              </h3>
              <p className="text-xs text-zinc-400 truncate">
                {currentArtist || 'Smart Rater'} · Range {step.minScore}–{step.maxScore}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {history.length > 0 && (
              <button
                type="button"
                onClick={handleUndo}
                aria-label="Undo last comparison"
                className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer"
              >
                <Undo2 className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close smart rater"
              className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="py-10 text-center space-y-4">
            <p className="text-sm text-zinc-400">
              Add at least one rated album first to compare against your list.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-full bg-white text-black text-xs font-medium hover:bg-zinc-200 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        ) : resolvedScore !== null ? (
          <motion.div
            key="resolved-view"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="py-4 flex flex-col items-center text-center space-y-4"
          >
            <div className="w-36 h-36 rounded-2xl overflow-hidden ring-1 ring-zinc-700">
              <AlbumCover
                src={currentCoverUrl}
                alt={currentTitle || 'Current album'}
                title={currentTitle || 'Current Album'}
                shape="rounded"
              />
            </div>

            <div className="space-y-1.5">
              <div className="font-mono tabular-nums">
                <span className="text-4xl font-semibold text-white">{resolvedScore}</span>
                <span className="text-sm text-zinc-500 ml-1">/ 100</span>
              </div>
              <div className="flex justify-center pt-1">
                <RatingStars rating={resolvedScore} size="lg" />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-zinc-800 text-xs text-zinc-300 hover:text-white hover:border-zinc-600 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Redo
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-full bg-white text-black text-xs font-medium hover:bg-zinc-200 transition-colors cursor-pointer"
              >
                Use Score
              </button>
            </div>
          </motion.div>
        ) : (
          <div className="space-y-5">
            <p className="text-center text-xs text-zinc-400">
              How does <span className="text-white font-medium">{currentTitle || 'this album'}</span>{' '}
              compare?
            </p>

            <AnimatePresence mode="popLayout" initial={false} custom={exitDirection}>
              <SwipeCard
                key={pivot.id}
                pivot={pivot}
                nextPreview={nextPreview}
                direction={exitDirection}
                onSwipe={handleChoice}
              />
            </AnimatePresence>

            <div className="flex items-center justify-center gap-4 pt-1">
              <button
                type="button"
                onClick={() => handleChoice('<')}
                aria-label="Lower than this album"
                className="w-12 h-12 rounded-full border border-zinc-800 bg-black hover:border-rose-400/70 hover:text-rose-300 text-zinc-200 flex items-center justify-center text-base font-mono transition-colors cursor-pointer"
              >
                &lt;
              </button>

              <button
                type="button"
                onClick={() => handleChoice('=')}
                aria-label="Equal to this album"
                className="w-12 h-12 rounded-full border border-zinc-800 bg-black hover:border-zinc-400 hover:text-white text-zinc-300 flex items-center justify-center transition-colors cursor-pointer"
              >
                <Equal className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => handleChoice('>')}
                aria-label="Better than this album"
                className="w-12 h-12 rounded-full border border-zinc-800 bg-black hover:border-emerald-400/70 hover:text-emerald-300 text-zinc-200 flex items-center justify-center text-base font-mono transition-colors cursor-pointer"
              >
                &gt;
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
