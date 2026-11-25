import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, Music, Plus, Scale, Search, X } from 'lucide-react';
import { AlbumReview, AlbumSource, CatalogAlbumResult } from '../types';
import { AlbumCover } from './AlbumCover';
import { RatingStars } from './RatingStars';
import { SmartRater } from './SmartRater';

interface AddAlbumModalProps {
  initialAlbum: CatalogAlbumResult | null;
  existingAlbums: AlbumReview[];
  onClose: () => void;
  onSubmit: (payload: {
    externalId: string;
    source: AlbumSource;
    title: string;
    artist: string;
    releaseYear: string;
    coverUrl: string;
    rating: number;
    thoughts: string;
    favoriteSongs: string[];
    tracklist: string[];
    genres: string[];
  }) => Promise<void>;
}

export function AddAlbumModal({
  initialAlbum,
  existingAlbums,
  onClose,
  onSubmit,
}: AddAlbumModalProps) {
  const [selected, setSelected] = useState<CatalogAlbumResult | null>(initialAlbum);
  const [manualMode, setManualMode] = useState(!initialAlbum);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogAlbumResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const [title, setTitle] = useState(initialAlbum?.title ?? '');
  const [artist, setArtist] = useState(initialAlbum?.artist ?? '');
  const [releaseYear, setReleaseYear] = useState(initialAlbum?.releaseYear ?? '');
  const [coverUrl, setCoverUrl] = useState(initialAlbum?.coverUrl ?? '');

  const [tracklist, setTracklist] = useState<string[]>([]);
  const [genres, setGenres] = useState<string[]>(initialAlbum?.genres ?? []);
  const [genreText, setGenreText] = useState('');
  const [loadingTracks, setLoadingTracks] = useState(false);

  const [ratingInput, setRatingInput] = useState('85');
  const [smartRaterOpen, setSmartRaterOpen] = useState(false);
  const [thoughts, setThoughts] = useState('');
  const [favoriteSongs, setFavoriteSongs] = useState<string[]>([]);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [songInput, setSongInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const numericRating = Math.max(0, Math.min(100, Math.round(Number(ratingInput) || 0)));

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !smartRaterOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, smartRaterOpen]);

  useEffect(() => {
    if (!selected) return;
    setTitle(selected.title);
    setArtist(selected.artist);
    setReleaseYear(selected.releaseYear);
    setCoverUrl(selected.coverUrl);
    setGenres(selected.genres ?? []);
    setManualMode(false);

    let cancelled = false;
    setLoadingTracks(true);
    fetch(`/api/spotify/album/${selected.source}/${encodeURIComponent(selected.externalId)}/tracks`)
      .then((res) => (res.ok ? res.json() : { tracks: [], genres: [] }))
      .then((data: { tracks?: string[]; genres?: string[] }) => {
        if (!cancelled) {
          setTracklist(Array.isArray(data.tracks) ? data.tracks : []);
          if (Array.isArray(data.genres) && data.genres.length > 0) {
            setGenres(data.genres);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTracklist([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingTracks(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    if (selected || !query.trim()) {
      setResults([]);
      setSearchError('');
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError('');
      try {
        const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(query.trim())}`);
        if (!res.ok) {
          throw new Error('Album search failed.');
        }
        const data = (await res.json()) as { albums?: CatalogAlbumResult[] };
        setResults(data.albums ?? []);
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : 'Unable to search albums.');
      } finally {
        setSearching(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [query, selected]);

  const handleRatingChange = (raw: string) => {
    const digitsOnly = raw.replace(/[^0-9]/g, '');
    if (digitsOnly === '') {
      setRatingInput('');
      return;
    }
    const clamped = Math.min(100, Number(digitsOnly));
    setRatingInput(String(clamped));
  };

  const toggleSong = (song: string) => {
    setFavoriteSongs((prev) => {
      if (prev.includes(song)) {
        return prev.filter((item) => item !== song);
      }
      if (prev.length >= 20) {
        return prev;
      }
      return [...prev, song];
    });
  };

  const addCustomSong = () => {
    const trimmed = songInput.trim().slice(0, 160);
    if (!trimmed) return;
    if (!favoriteSongs.includes(trimmed) && favoriteSongs.length < 20) {
      setFavoriteSongs((prev) => [...prev, trimmed]);
    }
    setSongInput('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    if (!title.trim() || !artist.trim()) {
      setSubmitError('Album title and artist are required.');
      return;
    }
    if (!coverUrl.trim().startsWith('https://')) {
      setSubmitError('Cover artwork URL must begin with https://');
      return;
    }
    if (ratingInput.trim() === '') {
      setSubmitError('Enter a rating between 0 and 100.');
      return;
    }

    const finalGenres = selected
      ? genres
      : genreText
          .split(',')
          .map((g) => g.trim().slice(0, 60))
          .filter(Boolean)
          .slice(0, 10);

    setSaving(true);
    try {
      await onSubmit({
        externalId: selected?.externalId ?? `manual_${Date.now()}`,
        source: selected?.source ?? 'manual',
        title: title.trim(),
        artist: artist.trim(),
        releaseYear: releaseYear.trim(),
        coverUrl: coverUrl.trim(),
        rating: numericRating,
        thoughts,
        favoriteSongs,
        tracklist,
        genres: finalGenres,
      });
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save album review.');
      setSaving(false);
    }
  };

  const showDetailsForm = Boolean(selected) || manualMode;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-album-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 12 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${
          showDetailsForm ? 'max-w-4xl' : 'max-w-xl'
        } bg-zinc-950 border border-zinc-800 rounded-3xl p-6 sm:p-7 max-h-[92vh] overflow-y-auto`}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="add-album-title" className="text-lg font-semibold tracking-tight text-white">
            Add Album Review
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!selected && (
          <div className="mt-5">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setManualMode(false);
                }}
                placeholder="Search albums or artists..."
                autoFocus
                className="w-full bg-black border border-zinc-800 rounded-full pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-white"
              />
            </div>

            {searching && <p className="mt-3 text-xs text-zinc-500">Searching...</p>}
            {searchError && <p className="mt-3 text-xs text-red-400">{searchError}</p>}

            {results.length > 0 && (
              <ul className="mt-3 max-h-60 overflow-y-auto rounded-2xl border border-zinc-800 bg-black divide-y divide-zinc-900">
                {results.map((item) => (
                  <li key={`${item.source}-${item.externalId}`}>
                    <button
                      type="button"
                      onClick={() => setSelected(item)}
                      className="w-full p-2.5 flex items-center gap-3 text-left hover:bg-zinc-900 transition-colors cursor-pointer"
                    >
                      <div className="w-10 h-10 shrink-0 rounded-full overflow-hidden ring-1 ring-zinc-800">
                        <AlbumCover src={item.coverUrl} alt={item.title} title={item.title} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white truncate">{item.title}</p>
                        <p className="text-xs text-zinc-400 truncate">
                          {item.artist}
                          {item.releaseYear ? ` · ${item.releaseYear}` : ''}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
              <span>Select an album above to auto-fill cover and tracks.</span>
              {!manualMode && (
                <button
                  type="button"
                  onClick={() => setManualMode(true)}
                  className="text-zinc-300 hover:text-white underline underline-offset-4 shrink-0 ml-2 cursor-pointer"
                >
                  Enter manually
                </button>
              )}
            </div>
          </div>
        )}

        <AnimatePresence>
          {showDetailsForm && (
            <motion.form
              key="details-form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              onSubmit={handleSubmit}
              className="mt-5 border-t border-zinc-900 pt-5 grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 items-start"
            >
              {/* Left Column: Album Identity & Score + Smart Rate */}
              <div className="md:col-span-5 space-y-4 md:border-r md:border-zinc-900 md:pr-7">
                {selected ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-16 h-16 shrink-0 rounded-full overflow-hidden ring-1 ring-zinc-800">
                        <AlbumCover src={coverUrl} alt={title} title={title} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-white truncate">{title}</p>
                        <p className="text-xs text-zinc-400 truncate">
                          {artist}
                          {releaseYear ? ` · ${releaseYear}` : ''}
                        </p>
                        {genres.length > 0 && (
                          <p className="mt-0.5 text-[11px] text-zinc-500 truncate">
                            {genres.slice(0, 3).join(' · ')}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(null);
                        setTracklist([]);
                        setGenres([]);
                        setTitle('');
                        setArtist('');
                        setReleaseYear('');
                        setCoverUrl('');
                      }}
                      className="px-3 py-1.5 rounded-full border border-zinc-800 text-xs text-zinc-300 hover:text-white hover:border-zinc-600 transition-colors shrink-0 cursor-pointer"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="manual-title" className="block text-xs text-zinc-400">
                        Album Title
                      </label>
                      <input
                        id="manual-title"
                        type="text"
                        required
                        maxLength={200}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="mt-1 w-full bg-black border border-zinc-800 rounded-xl px-3 py-1.5 text-sm text-white focus:outline-none focus:border-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="manual-artist" className="block text-xs text-zinc-400">
                        Artist
                      </label>
                      <input
                        id="manual-artist"
                        type="text"
                        required
                        maxLength={200}
                        value={artist}
                        onChange={(e) => setArtist(e.target.value)}
                        className="mt-1 w-full bg-black border border-zinc-800 rounded-xl px-3 py-1.5 text-sm text-white focus:outline-none focus:border-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="manual-year" className="block text-xs text-zinc-400">
                        Year
                      </label>
                      <input
                        id="manual-year"
                        type="text"
                        maxLength={4}
                        placeholder="2024"
                        value={releaseYear}
                        onChange={(e) => setReleaseYear(e.target.value)}
                        className="mt-1 w-full bg-black border border-zinc-800 rounded-xl px-3 py-1.5 text-sm text-white placeholder:text-zinc-700 focus:outline-none focus:border-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="manual-cover" className="block text-xs text-zinc-400">
                        Cover URL (https://)
                      </label>
                      <input
                        id="manual-cover"
                        type="url"
                        required
                        maxLength={500}
                        placeholder="https://..."
                        value={coverUrl}
                        onChange={(e) => setCoverUrl(e.target.value)}
                        className="mt-1 w-full bg-black border border-zinc-800 rounded-xl px-3 py-1.5 text-sm text-white placeholder:text-zinc-700 focus:outline-none focus:border-white"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor="manual-genres" className="block text-xs text-zinc-400">
                        Genres (Optional)
                      </label>
                      <input
                        id="manual-genres"
                        type="text"
                        maxLength={300}
                        placeholder="Hip Hop, Neo-Soul"
                        value={genreText}
                        onChange={(e) => setGenreText(e.target.value)}
                        className="mt-1 w-full bg-black border border-zinc-800 rounded-xl px-3 py-1.5 text-sm text-white placeholder:text-zinc-700 focus:outline-none focus:border-white"
                      />
                    </div>
                  </div>
                )}

                <div className="rounded-2xl border border-zinc-800/80 bg-black/50 p-4 flex flex-col items-start gap-3">
                  <div className="flex flex-wrap items-center gap-2.5 w-full justify-between">
                    <div className="inline-flex items-center bg-black border border-zinc-800 focus-within:border-white rounded-full px-4 py-1.5 gap-1.5 transition-colors">
                      <input
                        id="add-rating"
                        aria-label="Score out of 100"
                        type="text"
                        inputMode="numeric"
                        value={ratingInput}
                        onChange={(e) => handleRatingChange(e.target.value)}
                        placeholder="0–100"
                        className="w-12 bg-transparent text-center font-mono tabular-nums text-xl font-semibold text-white placeholder:text-zinc-700 focus:outline-none"
                      />
                      <span className="font-mono text-sm text-zinc-500">/ 100</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSmartRaterOpen((prev) => !prev)}
                      aria-expanded={smartRaterOpen}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                        smartRaterOpen
                          ? 'bg-white text-black border-white'
                          : 'bg-zinc-950 text-zinc-200 border-zinc-800 hover:border-zinc-500 hover:text-white'
                      }`}
                    >
                      <Scale className="w-3.5 h-3.5" />
                      <span>Smart Rate</span>
                    </button>
                  </div>

                  <RatingStars rating={numericRating} size="lg" />
                </div>
              </div>

              {/* Right Column: Written Thoughts, Favorite Songs, Submit */}
              <div className="md:col-span-7 space-y-4">
                <div>
                  <label htmlFor="add-thoughts" className="block text-xs font-medium text-zinc-400">
                    Written Thoughts
                  </label>
                  <textarea
                    id="add-thoughts"
                    rows={4}
                    maxLength={2000}
                    value={thoughts}
                    onChange={(e) => setThoughts(e.target.value)}
                    placeholder="Short review or initial impression..."
                    className="mt-1.5 w-full bg-black border border-zinc-800 rounded-2xl p-3.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-white resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setFavoritesOpen((prev) => !prev)}
                    aria-expanded={favoritesOpen}
                    className="w-full rounded-full border border-zinc-800 bg-black hover:border-zinc-600 px-4 py-2.5 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-2 text-xs font-medium text-zinc-200">
                      <Music className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      Favorite Songs (Optional)
                    </span>
                    <span className="inline-flex items-center gap-2 text-xs text-zinc-400">
                      {favoriteSongs.length > 0 && (
                        <span className="font-mono tabular-nums text-white">
                          {favoriteSongs.length} selected
                        </span>
                      )}
                      <ChevronDown
                        className={`w-4 h-4 transition-transform duration-200 ${
                          favoritesOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </span>
                  </button>

                  <AnimatePresence initial={false}>
                    {favoritesOpen && (
                      <motion.div
                        key="favorites-drawer"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="rounded-2xl border border-zinc-800 bg-black p-3 space-y-2.5">
                          {loadingTracks && (
                            <p className="text-xs text-zinc-500 px-1">Loading tracklist...</p>
                          )}

                          {tracklist.length > 0 && (
                            <div className="max-h-36 overflow-y-auto rounded-xl border border-zinc-900 divide-y divide-zinc-900">
                              {tracklist.map((track, idx) => {
                                const isFav = favoriteSongs.includes(track);
                                return (
                                  <button
                                    key={`${track}-${idx}`}
                                    type="button"
                                    onClick={() => toggleSong(track)}
                                    className={`w-full px-3.5 py-2 text-left text-xs flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                                      isFav
                                        ? 'bg-zinc-900 text-white'
                                        : 'text-zinc-400 hover:text-white hover:bg-zinc-950'
                                    }`}
                                  >
                                    <span className="truncate">
                                      <span className="font-mono tabular-nums text-zinc-600 mr-2">
                                        {String(idx + 1).padStart(2, '0')}
                                      </span>
                                      {track}
                                    </span>
                                    <span className="font-mono text-[11px] shrink-0">
                                      {isFav ? 'Selected' : 'Select'}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          <div className="flex gap-2">
                            <input
                              type="text"
                              maxLength={160}
                              value={songInput}
                              onChange={(e) => setSongInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  addCustomSong();
                                }
                              }}
                              placeholder="Type a favorite song..."
                              className="flex-1 min-w-0 bg-zinc-950 border border-zinc-800 rounded-full px-4 py-1.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-white"
                            />
                            <button
                              type="button"
                              onClick={addCustomSong}
                              className="px-4 py-1.5 rounded-full border border-zinc-800 bg-zinc-900 text-white hover:bg-zinc-800 text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Add
                            </button>
                          </div>

                          {favoriteSongs.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {favoriteSongs.map((song, idx) => (
                                <button
                                  key={`${song}-${idx}`}
                                  type="button"
                                  onClick={() => toggleSong(song)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 hover:border-zinc-600 text-xs text-zinc-200 transition-colors cursor-pointer"
                                >
                                  <span className="truncate max-w-[160px]">{song}</span>
                                  <X className="w-3 h-3 text-zinc-500 shrink-0" />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {submitError && <p className="text-sm text-red-400">{submitError}</p>}

                <div className="flex items-center justify-end gap-3 pt-1">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={onClose}
                    className="px-5 py-2.5 rounded-full border border-zinc-800 text-sm text-zinc-300 hover:text-white hover:border-zinc-600 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2.5 rounded-full text-sm font-medium bg-white text-black hover:bg-zinc-200 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {saving ? 'Saving...' : 'Save Album'}
                  </button>
                </div>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence>
        {smartRaterOpen && (
          <SmartRater
            key="add-smart-rater-popup"
            currentTitle={title}
            currentArtist={artist}
            currentCoverUrl={coverUrl}
            comparableAlbums={existingAlbums}
            onApplyRating={(val) => setRatingInput(String(val))}
            onClose={() => setSmartRaterOpen(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
