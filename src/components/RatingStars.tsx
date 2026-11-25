import { motion } from 'motion/react';

interface RatingStarsProps {
  rating: number;
  size?: 'sm' | 'md' | 'lg';
}

const SPARKLE_POSITIONS = [
  { x: -6, y: -7, delay: 0, size: 11 },
  { x: 19, y: -9, delay: 0.35, size: 10 },
  { x: 45, y: 18, delay: 0.7, size: 9 },
  { x: 71, y: -8, delay: 0.2, size: 11 },
  { x: 96, y: 16, delay: 0.55, size: 10 },
];

export function RatingStars({ rating, size = 'md' }: RatingStarsProps) {
  const clamped = Math.max(0, Math.min(100, rating));
  const starValue = clamped / 20;
  const isSparkling = clamped >= 80;
  const starSize = size === 'sm' ? 14 : size === 'lg' ? 26 : 20;

  return (
    <div
      className={`relative inline-flex items-center gap-1.5 ${
        isSparkling ? 'drop-shadow-[0_0_8px_rgba(252,211,77,0.45)]' : ''
      }`}
      aria-label={`${starValue.toFixed(1)} out of 5 stars`}
    >
      {Array.from({ length: 5 }).map((_, index) => {
        const fill = Math.max(0, Math.min(1, starValue - index));
        const fillPct = Math.round(fill * 100);
        const isFilledEnough = fill > 0.05;

        return (
          <motion.span
            key={index}
            animate={
              isSparkling && isFilledEnough
                ? { scale: [1, 1.1, 1] }
                : { scale: 1 }
            }
            transition={
              isSparkling && isFilledEnough
                ? {
                    duration: 1.8,
                    repeat: Infinity,
                    delay: index * 0.14,
                    ease: 'easeInOut',
                  }
                : { duration: 0.15 }
            }
            style={{ width: starSize, height: starSize }}
            className="relative inline-block shrink-0"
          >
            <svg
              viewBox="0 0 24 24"
              width={starSize}
              height={starSize}
              className="text-zinc-800 block"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>

            {fillPct > 0 && (
              <span
                className="absolute inset-y-0 left-0 overflow-hidden block"
                style={{ width: `${fillPct}%` }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width={starSize}
                  height={starSize}
                  className={`${isSparkling ? 'text-amber-300' : 'text-white'} block`}
                  fill="currentColor"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </span>
            )}
          </motion.span>
        );
      })}

      {isSparkling &&
        SPARKLE_POSITIONS.map((sp, idx) => (
          <motion.svg
            key={`sparkle-${idx}`}
            viewBox="0 0 16 16"
            width={size === 'sm' ? sp.size - 3 : size === 'lg' ? sp.size + 1 : sp.size}
            height={size === 'sm' ? sp.size - 3 : size === 'lg' ? sp.size + 1 : sp.size}
            style={{
              left: `${sp.x}%`,
              top: `${size === 'sm' ? sp.y * 0.65 : size === 'lg' ? sp.y * 1.15 : sp.y}px`,
            }}
            initial={{ opacity: 0.15, scale: 0.5, rotate: 0 }}
            animate={{
              opacity: [0.15, 1, 0.15],
              scale: [0.5, 1.25, 0.5],
              rotate: [0, 45, 90],
            }}
            transition={{
              duration: 1.4,
              repeat: Infinity,
              delay: sp.delay,
              ease: 'easeInOut',
            }}
            className="absolute pointer-events-none text-amber-200"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 0L9.7 6.3L16 8L9.7 9.7L8 16L6.3 9.7L0 8L6.3 6.3L8 0Z" />
          </motion.svg>
        ))}
    </div>
  );
}
