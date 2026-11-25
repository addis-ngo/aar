import { useState } from 'react';
import { Disc } from 'lucide-react';

interface AlbumCoverProps {
  src: string;
  alt: string;
  title: string;
  shape?: 'circle' | 'rounded';
  className?: string;
}

export function AlbumCover({
  src,
  alt,
  title,
  shape = 'circle',
  className = '',
}: AlbumCoverProps) {
  const [failed, setFailed] = useState(false);
  const radiusClass = shape === 'rounded' ? 'rounded-2xl' : 'rounded-full';

  if (failed || !src) {
    return (
      <div
        className={`w-full h-full ${radiusClass} bg-zinc-900 flex flex-col items-center justify-center p-3 text-center ${className}`}
        aria-label={alt}
      >
        <Disc className="w-6 h-6 text-zinc-600 mb-1 shrink-0" />
        <span className="text-[11px] text-zinc-400 line-clamp-2 leading-tight">{title}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
      className={`w-full h-full ${radiusClass} object-cover block select-none ${className}`}
    />
  );
}
