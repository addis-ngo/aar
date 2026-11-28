import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, Search, X } from 'lucide-react';
import { AlbumReview } from '../types';
import { AlbumCover } from './AlbumCover';

interface ListPageProps {
  albums: AlbumReview[];
  onSelectAlbum: (album: AlbumReview) => void;
  onBackToMap: () => void;
}

type ListSortField = 'rating' | 'title' | 'artist' | 'year' | 'genre' | 'recent';
type SortDirection = 'asc' | 'desc';

const SORT_OPTIONS: Array<{
  field: ListSortField;
  label: string;
  defaultDir: SortDirection;
}> = [
  { field: 'rating', label: 'Rating', defaultDir: 'desc' },
  { field: 'title', label: 'A–Z', defaultDir: 'asc' },
  { field: 'artist', label: 'Artist', defaultDir: 'asc' },
  { field: 'year', label: 'Year', defaultDir: 'desc' },
  { field: 'genre', label: 'Genre', defaultDir: 'asc' },
  { field: 'recent', label: 'Added', defaultDir: 'desc' },
];

function parseYearNum(yearStr: string): number {
  const num = Number(yearStr);
  return Number.isInteger(num) && num >= 1900 && num <= 2100 ? num : -1;
}

export function ListPage({ albums, onSelectAlbum, onBackToMap }: ListPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  const [sortField, setSortField] = useState<ListSortField>('rating');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');
  const [resolvedGenresMap, setResolvedGenresMap] = useState<Record<string, string[]>>({});
  const attemptedLookupIdsRef = useRef<Set<string>>(new Set());

  // Resolve genres client-side for any albums missing saved genres
  useEffect(() => {
    const missing = albums.filter(
      (a) =>
        a.genres.length === 0 &&
        !resolvedGenresMap[a.id] &&
        !attemptedLookupIdsRef.current.has(a.id)
    );
    if (missing.length === 0) return;

    let cancelled = false;

    const runBatch = async () => {
      const queue = [...missing];
      const concurrency = 3;
      const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
        while (queue.length > 0 && !cancelled) {
          const item = queue.shift();
          if (!item) break;
          attemptedLookupIdsRef.current.add(item.id);
          try {
            const params = new URLSearchParams({
              source: item.source,
              externalId: item.externalId,
              title: item.title,
              artist: item.artist,
            });
            const res = await fetch(`/api/catalog/genres?${params.toString()}`);
            if (res.ok && !cancelled) {
              const data = (await res.json()) as { genres?: string[] };
              const found = Array.isArray(data.genres) ? data.genres : [];
              if (found.length > 0) {
                setResolvedGenresMap((prev) => ({ ...prev, [item.id]: found }));
              }
            }
          } catch {
            // Keep silent on individual lookup failure
          }
        }
      });

      await Promise.all(workers);
    };

    void runBatch();
    return () => {
      cancelled = true;
    };
  }, [albums, resolvedGenresMap]);

  const albumsWithGenres = useMemo(() => {
    return albums.map((album) => {
      const genres =
        album.genres.length > 0 ? album.genres : resolvedGenresMap[album.id] ?? [];
      return { album, genres };
    });
  }, [albums, resolvedGenresMap]);

  const availableGenres = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { genres } of albumsWithGenres) {
      for (const g of genres) {
        const clean = g.trim();
        if (!clean) continue;
        counts.set(clean, (counts.get(clean) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }));
  }, [albumsWithGenres]);

  const handleSortChange = (field: ListSortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      const option = SORT_OPTIONS.find((o) => o.field === field);
      setSortField(field);
      setSortDir(option?.defaultDir ?? 'asc');
    }
  };

  const filteredAndSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = albumsWithGenres.filter(({ album, genres }) => {
      if (selectedGenre !== 'all' && !genres.includes(selectedGenre)) {
        return false;
      }
      if (!q) return true;
      return (
        album.title.toLowerCase().includes(q) ||
        album.artist.toLowerCase().includes(q) ||
        album.releaseYear.toLowerCase().includes(q) ||
        genres.some((g) => g.toLowerCase().includes(q))
      );
    });

    const mult = sortDir === 'asc' ? 1 : -1;

    return [...filtered].sort((a, b) => {
      if (sortField === 'rating') {
        const diff = (a.album.rating - b.album.rating) * mult;
        return diff !== 0 ? diff : a.album.title.localeCompare(b.album.title);
      }
      if (sortField === 'title') {
        const cmp = a.album.title.localeCompare(b.album.title, undefined, { sensitivity: 'base' }) * mult;
        return cmp !== 0 ? cmp : b.album.rating - a.album.rating;
      }
      if (sortField === 'artist') {
        const cmp = a.album.artist.localeCompare(b.album.artist, undefined, { sensitivity: 'base' }) * mult;
        return cmp !== 0 ? cmp : a.album.title.localeCompare(b.album.title);
      }
      if (sortField === 'year') {
        const yA = parseYearNum(a.album.releaseYear);
        const yB = parseYearNum(b.album.releaseYear);
        if (yA === -1 && yB === -1) return a.album.title.localeCompare(b.album.title);
        if (yA === -1) return 1;
        if (yB === -1) return -1;
        const diff = (yA - yB) * mult;
        return diff !== 0 ? diff : b.album.rating - a.album.rating;
      }
      if (sortField === 'genre') {
        const gA = a.genres[0] ?? '';
        const gB = b.genres[0] ?? '';
        if (!gA && !gB) return a.album.title.localeCompare(b.album.title);
        if (!gA) return 1;
        if (!gB) return -1;
        const cmp = gA.localeCompare(gB, undefined, { sensitivity: 'base' }) * mult;
        return cmp !== 0 ? cmp : a.album.title.localeCompare(b.album.title);
      }
      // recent (added order)
      const diff = (a.album.createdAtMs - b.album.createdAtMs) * mult;
      return diff !== 0 ? diff : a.album.title.localeCompare(b.album.title);
    });
  }, [albumsWithGenres, searchQuery, selectedGenre, sortField, sortDir]);

  const renderSortIcon = (field: ListSortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-zinc-600 shrink-0" />;
    }
    return sortDir === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-white shrink-0" />
    ) : (
      <ArrowDown className="w-3 h-3 text-white shrink-0" />
    );
  };

  if (albums.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto bg-black px-4 sm:px-8 py-16">
        <div className="max-w-xl mx-auto text-center space-y-4">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Album List</h1>
          <p className="text-sm text-zinc-400">
            Add albums to your map to browse and sort them in a list.
          </p>
          <button
            type="button"
            onClick={onBackToMap}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-black text-xs font-medium hover:bg-zinc-200 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Map
          </button>
        </div>
      </div>
    );
  }

  const hasActiveFilter = searchQuery.trim().length > 0 || selectedGenre !== 'all';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="flex-1 overflow-y-auto bg-black"
    >
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-8 pb-20 space-y-6">
        {/* Page Header */}
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-900 pb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white text-balance">
              Album List
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-zinc-400 font-mono tabular-nums">
              Showing {filteredAndSorted.length} of {albums.length}{' '}
              {albums.length === 1 ? 'album' : 'albums'} · Click an album name to view full review
            </p>
          </div>

          <button
            type="button"
            onClick={onBackToMap}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-zinc-800 bg-zinc-950 text-xs font-medium text-zinc-200 hover:text-white hover:border-zinc-600 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Map
          </button>
        </div>

        {/* Filter & Sort Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by album, artist, year, or genre..."
                aria-label="Filter albums"
                className="w-full h-9 pl-9 pr-8 rounded-full border border-zinc-800 bg-zinc-950 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear filter"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {availableGenres.length > 0 && (
              <select
                value={selectedGenre}
                onChange={(e) => setSelectedGenre(e.target.value)}
                aria-label="Filter by genre"
                className="h-9 px-3.5 rounded-full border border-zinc-800 bg-zinc-950 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500 cursor-pointer"
              >
                <option value="all">All genres ({availableGenres.length})</option>
                {availableGenres.map((g) => (
                  <option key={g.name} value={g.name}>
                    {g.name} ({g.count})
                  </option>
                ))}
              </select>
            )}

            {hasActiveFilter && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedGenre('all');
                }}
                className="text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Reset
              </button>
            )}
          </div>

          {/* Sort Mode Buttons */}
          <div
            role="group"
            aria-label="Sort albums"
            className="flex flex-wrap items-center gap-1.5"
          >
            <span className="text-[11px] text-zinc-500 mr-1 whitespace-nowrap">Sort:</span>
            {SORT_OPTIONS.map((opt) => {
              const isActive = sortField === opt.field;
              const displayLabel =
                opt.field === 'title' && isActive && sortDir === 'desc' ? 'Z–A' : opt.label;
              return (
                <button
                  key={opt.field}
                  type="button"
                  onClick={() => handleSortChange(opt.field)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0 border ${
                    isActive
                      ? 'bg-zinc-900 border-zinc-600 text-white font-medium'
                      : 'bg-zinc-950 border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                  }`}
                >
                  <span>{displayLabel}</span>
                  {isActive &&
                    (sortDir === 'asc' ? (
                      <ArrowUp className="w-3 h-3 text-zinc-200" />
                    ) : (
                      <ArrowDown className="w-3 h-3 text-zinc-200" />
                    ))}
                </button>
              );
            })}
          </div>
        </div>

        {/* List Table */}
        {filteredAndSorted.length === 0 ? (
          <div className="border border-zinc-900 bg-zinc-950/60 rounded-2xl px-6 py-12 text-center space-y-3">
            <p className="text-sm text-zinc-400">No albums match your current filter.</p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedGenre('all');
              }}
              className="px-4 py-2 rounded-full border border-zinc-800 bg-zinc-900 text-xs text-white hover:border-zinc-600 transition-colors cursor-pointer"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="border border-zinc-900 bg-zinc-950/50 rounded-2xl overflow-hidden">
            {/* Desktop Column Headers */}
            <div className="hidden md:grid md:grid-cols-[3rem_minmax(0,2.2fr)_minmax(0,1.4fr)_minmax(0,1.4fr)_5.5rem_5.5rem] items-center gap-4 px-5 py-3 border-b border-zinc-900 text-xs text-zinc-500">
              <span className="font-mono tabular-nums text-zinc-600">#</span>

              <button
                type="button"
                onClick={() => handleSortChange('title')}
                className="inline-flex items-center gap-1.5 text-left hover:text-zinc-200 transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>Album</span>
                {renderSortIcon('title')}
              </button>

              <button
                type="button"
                onClick={() => handleSortChange('artist')}
                className="inline-flex items-center gap-1.5 text-left hover:text-zinc-200 transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>Artist</span>
                {renderSortIcon('artist')}
              </button>

              <button
                type="button"
                onClick={() => handleSortChange('genre')}
                className="inline-flex items-center gap-1.5 text-left hover:text-zinc-200 transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>Genre</span>
                {renderSortIcon('genre')}
              </button>

              <button
                type="button"
                onClick={() => handleSortChange('year')}
                className="inline-flex items-center justify-end gap-1.5 text-right hover:text-zinc-200 transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>Year</span>
                {renderSortIcon('year')}
              </button>

              <button
                type="button"
                onClick={() => handleSortChange('rating')}
                className="inline-flex items-center justify-end gap-1.5 text-right hover:text-zinc-200 transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>Rating</span>
                {renderSortIcon('rating')}
              </button>
            </div>

            {/* Rows */}
            <ul className="divide-y divide-zinc-900/90">
              {filteredAndSorted.map(({ album, genres }, index) => {
                const isAcclaimed = album.rating >= 80;
                const genreText = genres.length > 0 ? genres.join(' · ') : '—';

                return (
                  <li
                    key={album.id}
                    className="px-4 sm:px-5 py-3 hover:bg-zinc-900/45 transition-colors"
                  >
                    {/* Desktop Row */}
                    <div className="hidden md:grid md:grid-cols-[3rem_minmax(0,2.2fr)_minmax(0,1.4fr)_minmax(0,1.4fr)_5.5rem_5.5rem] items-center gap-4">
                      <span className="text-xs font-mono tabular-nums text-zinc-600">
                        {index + 1}
                      </span>

                      <div className="flex items-center gap-3.5 min-w-0">
                        <button
                          type="button"
                          onClick={() => onSelectAlbum(album)}
                          aria-label={`Open review for ${album.title}`}
                          className="w-11 h-11 rounded-lg overflow-hidden ring-1 ring-zinc-800 shrink-0 cursor-pointer hover:ring-zinc-500 transition-all"
                        >
                          <AlbumCover
                            src={album.coverUrl}
                            alt={`${album.title} by ${album.artist}`}
                            title={album.title}
                            shape="rounded"
                            className="!rounded-lg"
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectAlbum(album)}
                          className="text-left text-sm font-medium text-white hover:text-amber-300 hover:underline underline-offset-4 decoration-zinc-600 hover:decoration-amber-300/70 transition-colors cursor-pointer truncate min-w-0"
                        >
                          {album.title}
                        </button>
                      </div>

                      <span className="text-sm text-zinc-300 truncate">{album.artist}</span>

                      <span className="text-xs text-zinc-400 truncate" title={genreText}>
                        {genreText}
                      </span>

                      <span className="text-xs font-mono tabular-nums text-zinc-400 text-right">
                        {album.releaseYear || '—'}
                      </span>

                      <div className="text-right font-mono tabular-nums whitespace-nowrap">
                        <span
                          className={`text-sm font-semibold ${
                            isAcclaimed ? 'text-amber-300' : 'text-white'
                          }`}
                        >
                          {album.rating}
                        </span>
                        <span className="text-[11px] text-zinc-600">/100</span>
                      </div>
                    </div>

                    {/* Mobile Row */}
                    <div className="flex md:hidden items-center gap-3">
                      <button
                        type="button"
                        onClick={() => onSelectAlbum(album)}
                        aria-label={`Open review for ${album.title}`}
                        className="w-12 h-12 rounded-lg overflow-hidden ring-1 ring-zinc-800 shrink-0 cursor-pointer"
                      >
                        <AlbumCover
                          src={album.coverUrl}
                          alt={`${album.title} by ${album.artist}`}
                          title={album.title}
                          shape="rounded"
                          className="!rounded-lg"
                        />
                      </button>

                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => onSelectAlbum(album)}
                          className="text-left text-sm font-medium text-white hover:text-amber-300 hover:underline underline-offset-4 transition-colors cursor-pointer truncate block max-w-full"
                        >
                          {album.title}
                        </button>
                        <p className="text-xs text-zinc-300 truncate">{album.artist}</p>
                        <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                          <span className="font-mono tabular-nums">
                            {album.releaseYear || '—'}
                          </span>
                          <span aria-hidden="true"> · </span>
                          <span>{genreText}</span>
                        </p>
                      </div>

                      <div className="text-right font-mono tabular-nums shrink-0 pl-2">
                        <span
                          className={`text-sm font-semibold ${
                            isAcclaimed ? 'text-amber-300' : 'text-white'
                          }`}
                        >
                          {album.rating}
                        </span>
                        <span className="text-[11px] text-zinc-600">/100</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </motion.div>
  );
}
