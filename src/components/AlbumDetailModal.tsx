import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, Music, Pencil, Plus, Scale, Trash2, X } from 'lucide-react';
import { AlbumReview } from '../types';
import { AlbumCover } from './AlbumCover';
import { RatingStars } from './RatingStars';
import { SmartRater } from './SmartRater';

interface AlbumDetailModalProps {
  album: AlbumReview;
  existingAlbums: AlbumReview[];
  canEdit: boolean;
  onClose: () => void;
  onSave: (
    albumId: string,
    updates: { rating: number; thoughts: string; favoriteSongs: string[]; genres: string[] }
  ) => Promise<void>;
  onDelete: (albumId: string) => Promise<void>;
}

export function AlbumDetailModal({
  album,
  existingAlbums,
  canEdit,
  onClose,
  onSave,
  onDelete,
}: AlbumDetailModalProps) {
  const [editing, setEditing] = useState(false);
  const [ratingInput, setRatingInput] = useState(String(album.rating));
  const [smartRaterOpen, setSmartRaterOpen] = useState(false);
  const [thoughts, setThoughts] = useState(album.thoughts);
  const [favoriteSongs, setFavoriteSongs] = useState<string[]>(album.favoriteSongs);
  const [genreText, setGenreText] = useState(album.genres.join(', '));
  const [fetchingGenres, setFetchingGenres] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [songInput, setSongInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState('');

  const numericRating = Math.max(0, Math.min(100, Math.round(Number(ratingInput) || 0)));
  const comparableAlbums = existingAlbums.filter((item) => item.id !== album.id);

  useEffect(() => {
    setRatingInput(String(album.rating));
    setThoughts(album.thoughts);
    setFavoriteSongs(album.favoriteSongs);
    setGenreText(album.genres.join(', '));
    setFavoritesOpen(false);
    setSmartRaterOpen(false);
    setEditing(false);
    setConfirmingDelete(false);
    setError('');
  }, [album]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !smartRaterOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, smartRaterOpen]);

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

  const handleFetchGenres = async () => {
    setFetchingGenres(true);
    try {
      const params = new URLSearchParams({
        source: album.source,
        externalId: album.externalId,
        title: album.title,
        artist: album.artist,
      });
      const res = await fetch(`/api/catalog/genres?${params.toString()}`);
      if (res.ok) {
        const data = (await res.json()) as { genres?: string[] };
        if (Array.isArray(data.genres) && data.genres.length > 0) {
          setGenreText(data.genres.join(', '));
        }
      }
    } finally {
      setFetchingGenres(false);
    }
  };

  const handleSave = async () => {
    if (ratingInput.trim() === '') {
      setError('Enter a rating between 0 and 100.');
      return;
    }
    const parsedGenres = genreText
      .split(',')
      .map((g) => g.trim().slice(0, 60))
      .filter(Boolean)
      .slice(0, 10);

    setSaving(true);
    setError('');
    try {
      await onSave(album.id, {
        rating: numericRating,
        thoughts: thoughts.trim().slice(0, 2000),
        favoriteSongs: favoriteSongs.slice(0, 20),
        genres: parsedGenres,
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    setError('');
    try {
      await onDelete(album.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete album.');
      setSaving(false);
    }
  };

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
      aria-labelledby="album-modal-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 12 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl bg-zinc-950 border border-zinc-800 rounded-3xl p-6 sm:p-7 max-h-[92vh] overflow-y-auto relative"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-5 right-5 z-10 p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <AnimatePresence mode="wait" initial={false}>
          {!editing ? (
            <motion.div
              key="view-mode"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 items-stretch"
            >
              {/* Left Column: Artwork, Album Info + Rating/Stars, Actions */}
              <div className="md:col-span-5 flex flex-col justify-between gap-5 md:border-r md:border-zinc-900 md:pr-7">
                <div className="space-y-5">
                  <div className="w-36 h-36 sm:w-44 sm:h-44 mx-auto rounded-full ring-1 ring-zinc-800 overflow-hidden">
                    <AlbumCover
                      src={album.coverUrl}
                      alt={`${album.title} by ${album.artist}`}
                      title={album.title}
                    />
                  </div>

                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h2
                        id="album-modal-title"
                        className="text-xl sm:text-2xl font-semibold tracking-tight text-white break-words"
                      >
                        {album.title}
                      </h2>
                      <p className="mt-1 text-sm text-zinc-400">
                        {album.artist}
                        {album.releaseYear ? ` · ${album.releaseYear}` : ''}
                      </p>
                      {album.genres.length > 0 && (
                        <p className="mt-1 text-xs text-zinc-500">
                          {album.genres.slice(0, 4).join(' · ')}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className="font-mono tabular-nums leading-none">
                        <span className="text-4xl font-semibold text-white">{album.rating}</span>
                        <span className="text-base text-zinc-500 ml-1">/ 100</span>
                      </div>
                      <RatingStars rating={album.rating} size="lg" />
                    </div>
                  </div>
                </div>

                {canEdit && (
                  <div className="pt-3 border-t border-zinc-900 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setEditing(true)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium bg-white text-black hover:bg-zinc-200 transition-colors cursor-pointer"
                    >
                      <Pencil className="w-4 h-4" />
                      Edit Review
                    </button>

                    {!confirmingDelete ? (
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(true)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm text-zinc-400 hover:text-red-400 hover:bg-zinc-900 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                        Remove
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={handleDelete}
                          className="px-4 py-2 rounded-full text-xs font-medium bg-red-600 text-white hover:bg-red-500 disabled:opacity-50 cursor-pointer"
                        >
                          {saving ? 'Removing...' : 'Confirm'}
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => setConfirmingDelete(false)}
                          className="px-3 py-2 rounded-full text-xs text-zinc-400 hover:text-white cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right Column: Thoughts & Favorite Songs */}
              <div className="md:col-span-7 flex flex-col justify-between gap-5 min-w-0 md:pt-1 md:pr-8">
                <div>
                  <h3 className="text-xs font-medium text-zinc-500">Thoughts</h3>
                  {album.thoughts ? (
                    <p className="mt-2 text-sm sm:text-[15px] leading-relaxed text-zinc-200 whitespace-pre-wrap break-words max-h-44 overflow-y-auto pr-1">
                      {album.thoughts}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-zinc-600">No written thoughts yet.</p>
                  )}
                </div>

                <div className="pt-4 border-t border-zinc-900">
                  <h3 className="text-xs font-medium text-zinc-500">Favorite Songs</h3>
                  {album.favoriteSongs.length > 0 ? (
                    <ul className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {album.favoriteSongs.map((song, idx) => (
                        <li
                          key={`${song}-${idx}`}
                          className="py-1.5 border-b border-zinc-900/80 flex items-baseline gap-2.5 text-sm text-zinc-200 min-w-0"
                        >
                          <span className="font-mono tabular-nums text-xs text-zinc-600 shrink-0">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <span className="truncate">{song}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-zinc-600">No favorite songs listed.</p>
                  )}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="edit-mode"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 items-start"
            >
              {/* Left Column: Album Identity, Rating + Smart Rate, Genres */}
              <div className="md:col-span-5 space-y-4 md:border-r md:border-zinc-900 md:pr-7">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 shrink-0 rounded-full ring-1 ring-zinc-800 overflow-hidden">
                    <AlbumCover
                      src={album.coverUrl}
                      alt={`${album.title} by ${album.artist}`}
                      title={album.title}
                    />
                  </div>
                  <div className="min-w-0">
                    <h2
                      id="album-modal-title"
                      className="text-lg font-semibold tracking-tight text-white truncate"
                    >
                      {album.title}
                    </h2>
                    <p className="text-xs text-zinc-400 truncate">
                      {album.artist}
                      {album.releaseYear ? ` · ${album.releaseYear}` : ''}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-800/80 bg-black/50 p-4 flex flex-col items-start gap-3">
                  <div className="flex flex-wrap items-center gap-2.5 w-full justify-between">
                    <div className="inline-flex items-center bg-black border border-zinc-800 focus-within:border-white rounded-full px-4 py-1.5 gap-1.5 transition-colors">
                      <input
                        id="edit-rating"
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

                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="edit-genres" className="block text-xs font-medium text-zinc-400">
                      Genres
                    </label>
                    <button
                      type="button"
                      disabled={fetchingGenres}
                      onClick={handleFetchGenres}
                      className="text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {fetchingGenres ? 'Looking up...' : 'Auto-fill'}
                    </button>
                  </div>
                  <input
                    id="edit-genres"
                    type="text"
                    maxLength={300}
                    value={genreText}
                    onChange={(e) => setGenreText(e.target.value)}
                    placeholder="Hip Hop, Alternative R&B"
                    className="mt-1.5 w-full bg-black border border-zinc-800 rounded-full px-4 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-white"
                  />
                </div>
              </div>

              {/* Right Column: Thoughts, Favorite Songs, Actions */}
              <div className="md:col-span-7 space-y-4 md:pr-8">
                <div>
                  <label htmlFor="edit-thoughts" className="block text-xs font-medium text-zinc-400">
                    Written Thoughts
                  </label>
                  <textarea
                    id="edit-thoughts"
                    rows={4}
                    maxLength={2000}
                    value={thoughts}
                    onChange={(e) => setThoughts(e.target.value)}
                    placeholder="Write your thoughts on the album..."
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
                        key="edit-favorites-drawer"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="rounded-2xl border border-zinc-800 bg-black p-3 space-y-2.5">
                          {album.tracklist.length > 0 && (
                            <div className="max-h-36 overflow-y-auto rounded-xl border border-zinc-900 divide-y divide-zinc-900">
                              {album.tracklist.map((track, idx) => {
                                const selected = favoriteSongs.includes(track);
                                return (
                                  <button
                                    key={`${track}-${idx}`}
                                    type="button"
                                    onClick={() => toggleSong(track)}
                                    className={`w-full px-3.5 py-2 text-left text-xs flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                                      selected
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
                                      {selected ? 'Selected' : 'Select'}
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

                {error && <p className="text-sm text-red-400">{error}</p>}

                <div className="flex items-center justify-end gap-3 pt-1">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      setEditing(false);
                      setRatingInput(String(album.rating));
                      setThoughts(album.thoughts);
                      setFavoriteSongs(album.favoriteSongs);
                      setGenreText(album.genres.join(', '));
                      setFavoritesOpen(false);
                    }}
                    className="px-5 py-2.5 rounded-full border border-zinc-800 text-sm text-zinc-300 hover:text-white hover:border-zinc-600 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSave}
                    className="px-5 py-2.5 rounded-full text-sm font-medium bg-white text-black hover:bg-zinc-200 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence>
        {smartRaterOpen && (
          <SmartRater
            key="edit-smart-rater-popup"
            currentTitle={album.title}
            currentArtist={album.artist}
            currentCoverUrl={album.coverUrl}
            comparableAlbums={comparableAlbums}
            onApplyRating={(val) => setRatingInput(String(val))}
            onClose={() => setSmartRaterOpen(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
