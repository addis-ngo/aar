import { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpDown, Search, X } from 'lucide-react';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  isOwnerUser,
  OperationType,
  sanitizeAlbumPayload,
  sanitizeGenresList,
} from './firebase';
import { writeBatch } from 'firebase/firestore';
import { AlbumReview, AlbumSource, AppView, CatalogAlbumResult, SortMode } from './types';
import { BubbleMap } from './components/BubbleMap';
import { AlbumDetailModal } from './components/AlbumDetailModal';
import { AddAlbumModal } from './components/AddAlbumModal';
import { AlbumCover } from './components/AlbumCover';
import { AnalyzePage } from './components/AnalyzePage';
import { ListPage } from './components/ListPage';

const SORT_ORDER: SortMode[] = ['rating-desc', 'recent', 'title-asc'];
const SORT_LABELS: Record<SortMode, string> = {
  'rating-desc': 'Highest Rated',
  recent: 'Newest',
  'title-asc': 'A–Z',
};

function getViewFromHash(): AppView {
  if (typeof window === 'undefined') return 'map';
  if (window.location.hash === '#analyze') return 'analyze';
  if (window.location.hash === '#list') return 'list';
  return 'map';
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState('');

  const [albums, setAlbums] = useState<AlbumReview[]>([]);
  const [loadingAlbums, setLoadingAlbums] = useState(true);
  const [snapshotError, setSnapshotError] = useState<Error | null>(null);

  const [sortMode, setSortMode] = useState<SortMode>('rating-desc');
  const [view, setView] = useState<AppView>(getViewFromHash);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [preselectedCatalogAlbum, setPreselectedCatalogAlbum] =
    useState<CatalogAlbumResult | null>(null);

  const [quickQuery, setQuickQuery] = useState('');
  const [quickResults, setQuickResults] = useState<CatalogAlbumResult[]>([]);
  const [quickSearching, setQuickSearching] = useState(false);
  const [quickSearchError, setQuickSearchError] = useState('');
  const [quickDropdownOpen, setQuickDropdownOpen] = useState(false);
  const [islandExpanded, setIslandExpanded] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  if (snapshotError) {
    throw snapshotError;
  }

  const canEdit = isOwnerUser(user);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady) return;

    const q = query(collection(db, 'albums'), where('isPublic', '==', true));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: AlbumReview[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const createdTs = data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : 0;
          const updatedTs = data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : 0;
          return {
            id: docSnap.id,
            ownerUid: String(data.ownerUid ?? ''),
            externalId: String(data.externalId ?? ''),
            source: (data.source as AlbumSource) ?? 'manual',
            title: String(data.title ?? ''),
            artist: String(data.artist ?? ''),
            releaseYear: String(data.releaseYear ?? ''),
            coverUrl: String(data.coverUrl ?? ''),
            rating: typeof data.rating === 'number' ? data.rating : 0,
            thoughts: String(data.thoughts ?? ''),
            favoriteSongs: Array.isArray(data.favoriteSongs)
              ? data.favoriteSongs.map(String)
              : [],
            tracklist: Array.isArray(data.tracklist) ? data.tracklist.map(String) : [],
            genres: Array.isArray(data.genres) ? data.genres.map(String) : [],
            isPublic: Boolean(data.isPublic),
            createdAtMs: createdTs,
            updatedAtMs: updatedTs,
          };
        });
        setAlbums(items);
        setLoadingAlbums(false);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'albums');
        } catch (wrapped) {
          setLoadingAlbums(false);
          setSnapshotError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    );

    return () => unsubscribe();
  }, [authReady]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) {
        setQuickDropdownOpen(false);
        if (!quickQuery.trim()) {
          setIslandExpanded(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [quickQuery]);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      setView(getViewFromHash());
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigateView = (nextView: AppView) => {
    setView(nextView);
    if (typeof window !== 'undefined') {
      const nextHash = nextView === 'analyze' ? '#analyze' : nextView === 'list' ? '#list' : '';
      if (window.location.hash !== nextHash) {
        window.history.replaceState(null, '', nextHash || window.location.pathname + window.location.search);
      }
    }
  };

  const handleMapSortClick = () => {
    if (view === 'map') {
      const nextIndex = (SORT_ORDER.indexOf(sortMode) + 1) % SORT_ORDER.length;
      setSortMode(SORT_ORDER[nextIndex]);
    } else {
      navigateView('map');
    }
  };

  const openSearchIsland = () => {
    setIslandExpanded(true);
    searchInputRef.current?.focus();
  };

  const closeSearchIsland = () => {
    setQuickQuery('');
    setQuickSearchError('');
    setQuickDropdownOpen(false);
    setIslandExpanded(false);
    searchInputRef.current?.blur();
  };

  useEffect(() => {
    if (!canEdit || !quickQuery.trim()) {
      setQuickResults([]);
      setQuickSearchError('');
      setQuickSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setQuickSearching(true);
      setQuickSearchError('');
      try {
        const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(quickQuery.trim())}`);
        if (res.ok) {
          const data = (await res.json()) as { albums?: CatalogAlbumResult[] };
          setQuickResults(data.albums ?? []);
          setQuickDropdownOpen(true);
        } else {
          let message = `Search failed (${res.status}).`;
          try {
            const errData = (await res.json()) as { error?: string };
            if (errData?.error) message = errData.error;
          } catch {
            // ignore non-JSON error body
          }
          setQuickResults([]);
          setQuickSearchError(message);
          setQuickDropdownOpen(true);
        }
      } catch {
        setQuickResults([]);
        setQuickSearchError('Could not reach the search service.');
        setQuickDropdownOpen(true);
      } finally {
        setQuickSearching(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [quickQuery, canEdit]);

  const sortedAlbums = useMemo(() => {
    const copy = [...albums];
    if (sortMode === 'rating-desc') {
      copy.sort((a, b) => b.rating - a.rating || b.createdAtMs - a.createdAtMs);
    } else if (sortMode === 'recent') {
      copy.sort((a, b) => b.createdAtMs - a.createdAtMs);
    } else {
      copy.sort((a, b) => a.title.localeCompare(b.title));
    }
    return copy;
  }, [albums, sortMode]);

  const selectedAlbum = useMemo(
    () => albums.find((a) => a.id === selectedAlbumId) ?? null,
    [albums, selectedAlbumId]
  );

  const handleSignIn = async () => {
    setAuthError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign-in failed.');
    }
  };

  const handleSignOut = async () => {
    setAuthError('');
    try {
      await signOut(auth);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign-out failed.');
    }
  };

  const handleCreateAlbum = async (payload: {
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
  }) => {
    if (!user || !canEdit) {
      throw new Error('Only Addis can add albums.');
    }

    const sanitized = sanitizeAlbumPayload({
      ...payload,
      ownerUid: user.uid,
    });

    try {
      await addDoc(collection(db, 'albums'), {
        ...sanitized,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'albums');
    }
  };

  const handleUpdateAlbum = async (
    albumId: string,
    updates: { rating: number; thoughts: string; favoriteSongs: string[]; genres: string[] }
  ) => {
    if (!user || !canEdit) {
      throw new Error('Only Addis can edit reviews.');
    }

    const cleanRating = Math.max(0, Math.min(100, Math.round(updates.rating)));
    const cleanThoughts = updates.thoughts.trim().slice(0, 2000);
    const cleanFavs = updates.favoriteSongs
      .map((s) => s.trim().slice(0, 160))
      .filter(Boolean)
      .slice(0, 20);
    const cleanGenres = sanitizeGenresList(updates.genres);

    try {
      await updateDoc(doc(db, 'albums', albumId), {
        rating: cleanRating,
        thoughts: cleanThoughts,
        favoriteSongs: cleanFavs,
        genres: cleanGenres,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `albums/${albumId}`);
    }
  };

  const handleSyncGenres = async (updates: Array<{ albumId: string; genres: string[] }>) => {
    if (!user || !canEdit || updates.length === 0) return;

    try {
      for (let i = 0; i < updates.length; i += 400) {
        const batch = writeBatch(db);
        const slice = updates.slice(i, i + 400);
        for (const item of slice) {
          const cleanGenres = sanitizeGenresList(item.genres);
          if (cleanGenres.length === 0) continue;
          batch.update(doc(db, 'albums', item.albumId), {
            genres: cleanGenres,
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'albums');
    }
  };

  const handleDeleteAlbum = async (albumId: string) => {
    if (!user || !canEdit) {
      throw new Error('Only Addis can remove albums.');
    }
    try {
      await deleteDoc(doc(db, 'albums', albumId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `albums/${albumId}`);
    }
  };

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-black text-white">
      <header className="shrink-0 border-b border-zinc-900">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-8">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigateView('map');
            }}
            className="text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            AAR
          </a>

          <nav
            aria-label="Primary navigation"
            className="flex items-center gap-4 sm:gap-7 text-xs sm:text-sm overflow-x-auto"
          >
            <button
              type="button"
              onClick={handleMapSortClick}
              title={
                view === 'map'
                  ? 'Click to switch between Highest Rated, Newest, and A–Z'
                  : 'Back to album map'
              }
              className={`py-1 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                view === 'map'
                  ? 'text-white border-b border-white font-medium'
                  : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              <span>{SORT_LABELS[sortMode]}</span>
              <ArrowUpDown className="w-3 h-3 opacity-70 shrink-0" />
            </button>
            <button
              type="button"
              onClick={() => navigateView('analyze')}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                view === 'analyze'
                  ? 'text-white border-b border-white font-medium'
                  : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              Analyze
            </button>
            <button
              type="button"
              onClick={() => navigateView('list')}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                view === 'list'
                  ? 'text-white border-b border-white font-medium'
                  : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              List
            </button>
          </nav>

          <div className="flex items-center gap-4 shrink-0">
            {authReady && canEdit && (
              <button
                type="button"
                onClick={handleSignOut}
                className="text-xs text-zinc-500 hover:text-white transition-colors whitespace-nowrap shrink-0"
              >
                Sign Out
              </button>
            )}

            {authReady && user && !canEdit && (
              <button
                type="button"
                onClick={handleSignOut}
                className="text-xs text-zinc-400 hover:text-white transition-colors whitespace-nowrap shrink-0"
              >
                Sign Out
              </button>
            )}

            {authReady && !user && (
              <button
                type="button"
                onClick={handleSignIn}
                className="px-4 py-2 text-xs font-medium border border-zinc-800 bg-zinc-950 text-white hover:bg-zinc-900 transition-colors whitespace-nowrap shrink-0"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="relative flex-1 overflow-hidden flex flex-col">
        {authError && (
          <div className="mx-auto mt-4 max-w-lg w-full px-4 z-20">
            <div className="border border-zinc-800 bg-zinc-950 px-4 py-3 text-xs text-red-400">
              {authError}
            </div>
          </div>
        )}

        {loadingAlbums ? (
          <div className="m-auto text-sm text-zinc-500">Loading albums...</div>
        ) : view === 'analyze' ? (
          <AnalyzePage
            albums={albums}
            canEdit={canEdit}
            onSelectAlbum={(album) => setSelectedAlbumId(album.id)}
            onSyncGenres={handleSyncGenres}
            onBackToMap={() => navigateView('map')}
          />
        ) : view === 'list' ? (
          <ListPage
            albums={albums}
            onSelectAlbum={(album) => setSelectedAlbumId(album.id)}
            onBackToMap={() => navigateView('map')}
          />
        ) : sortedAlbums.length === 0 ? (
          <div className="m-auto text-center space-y-3 px-4">
            <p className="text-sm text-zinc-400">No albums added yet.</p>
            {authReady && canEdit ? (
              <button
                type="button"
                onClick={openSearchIsland}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-full bg-white text-black hover:bg-zinc-200 transition-colors cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
                Search Albums
              </button>
            ) : (
              authReady &&
              !user && (
                <button
                  type="button"
                  onClick={handleSignIn}
                  className="px-4 py-2 text-xs font-medium border border-zinc-800 bg-zinc-950 text-white hover:bg-zinc-900 transition-colors"
                >
                  Sign In to Add Albums
                </button>
              )
            )}
          </div>
        ) : (
          <div className="flex-1 w-full h-full">
            <BubbleMap
              albums={sortedAlbums}
              onSelect={(album) => setSelectedAlbumId(album.id)}
            />
          </div>
        )}

        {authReady && canEdit && view === 'map' && (
          <div
            ref={searchBoxRef}
            className="absolute bottom-5 left-4 sm:left-1/2 sm:-translate-x-1/2 z-40"
          >
            <AnimatePresence>
              {islandExpanded && (quickDropdownOpen || quickQuery.trim().length > 0) && (
                <motion.div
                  key="search-results-panel"
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.98 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="mb-2 border border-zinc-800 bg-zinc-950 rounded-2xl overflow-hidden max-h-72 overflow-y-auto"
                >
                  {quickSearching && (
                    <p className="px-4 py-3 text-xs text-zinc-500">Searching...</p>
                  )}
                  {!quickSearching && quickResults.length > 0 && (
                    <ul className="divide-y divide-zinc-900">
                      {quickResults.map((item) => (
                        <li key={`${item.source}-${item.externalId}`}>
                          <button
                            type="button"
                            onClick={() => {
                              setPreselectedCatalogAlbum(item);
                              setAddModalOpen(true);
                              closeSearchIsland();
                            }}
                            className="w-full px-3.5 py-2.5 flex items-center gap-3 text-left hover:bg-zinc-900 transition-colors cursor-pointer"
                          >
                            <div className="w-9 h-9 shrink-0 rounded-full overflow-hidden ring-1 ring-zinc-800">
                              <AlbumCover
                                src={item.coverUrl}
                                alt={item.title}
                                title={item.title}
                              />
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
                  {!quickSearching && quickSearchError && (
                    <p className="px-4 py-3 text-xs text-red-400">{quickSearchError}</p>
                  )}
                  {!quickSearching &&
                    !quickSearchError &&
                    quickQuery.trim().length > 0 &&
                    quickResults.length === 0 && (
                      <p className="px-4 py-3 text-xs text-zinc-500">No matching albums found.</p>
                    )}
                  <div className="border-t border-zinc-900 px-3.5 py-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setPreselectedCatalogAlbum(null);
                        setAddModalOpen(true);
                        closeSearchIsland();
                      }}
                      className="text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
                    >
                      Enter manually
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div
              initial={false}
              animate={{
                width: islandExpanded ? Math.min(448, Math.max(240, viewportWidth - 32)) : 156,
                height: islandExpanded ? 44 : 40,
              }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              onClick={() => {
                if (!islandExpanded) {
                  openSearchIsland();
                }
              }}
              className={`rounded-full bg-zinc-950 border flex items-center px-3.5 gap-2 overflow-hidden transition-colors ${
                islandExpanded
                  ? 'border-zinc-700 focus-within:border-white'
                  : 'border-zinc-800 hover:border-zinc-500 cursor-pointer'
              }`}
            >
              <Search className="w-4 h-4 text-zinc-400 shrink-0 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={quickQuery}
                onFocus={() => {
                  setIslandExpanded(true);
                  if (quickResults.length > 0) setQuickDropdownOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    closeSearchIsland();
                  }
                }}
                onChange={(e) => setQuickQuery(e.target.value)}
                placeholder={islandExpanded ? 'Search Spotify albums...' : 'Search albums'}
                aria-label="Search albums to add"
                className={`flex-1 min-w-0 bg-transparent focus:outline-none ${
                  islandExpanded
                    ? 'text-sm text-white placeholder:text-zinc-600'
                    : 'text-xs font-medium text-zinc-200 placeholder:text-zinc-200 cursor-pointer'
                }`}
              />
              <AnimatePresence>
                {islandExpanded && (
                  <motion.button
                    key="island-close-btn"
                    type="button"
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.15 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeSearchIsland();
                    }}
                    aria-label="Close search"
                    className="p-1 rounded-full text-zinc-500 hover:text-white hover:bg-zinc-900 transition-colors shrink-0 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </motion.button>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        )}
      </main>

      <AnimatePresence>
        {selectedAlbum && (
          <AlbumDetailModal
            key={selectedAlbum.id}
            album={selectedAlbum}
            existingAlbums={albums}
            canEdit={canEdit}
            onClose={() => setSelectedAlbumId(null)}
            onSave={handleUpdateAlbum}
            onDelete={handleDeleteAlbum}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {addModalOpen && canEdit && (
          <AddAlbumModal
            key="add-album-modal"
            initialAlbum={preselectedCatalogAlbum}
            existingAlbums={albums}
            onClose={() => {
              setAddModalOpen(false);
              setPreselectedCatalogAlbum(null);
            }}
            onSubmit={handleCreateAlbum}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
