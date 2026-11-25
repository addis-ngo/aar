import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { AlbumReview } from '../types';
import { AlbumCover } from './AlbumCover';
import { RatingStars } from './RatingStars';

interface AnalyzePageProps {
  albums: AlbumReview[];
  canEdit: boolean;
  onSelectAlbum: (album: AlbumReview) => void;
  onSyncGenres: (updates: Array<{ albumId: string; genres: string[] }>) => Promise<void>;
  onBackToMap: () => void;
}

interface StatSummary {
  count: number;
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  q1: number;
  q3: number;
}

function computeStats(values: number[]): StatSummary {
  if (values.length === 0) {
    return { count: 0, mean: 0, median: 0, stdDev: 0, min: 0, max: 0, q1: 0, q3: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / n;
  const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  const percentile = (p: number) => {
    if (n === 1) return sorted[0];
    const idx = p * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };

  return {
    count: n,
    mean,
    median: percentile(0.5),
    stdDev,
    min: sorted[0],
    max: sorted[n - 1],
    q1: percentile(0.25),
    q3: percentile(0.75),
  };
}

function parseReleaseYear(yearStr: string, maxYear: number): number | null {
  const num = Number(yearStr);
  if (!Number.isInteger(num) || num < 1900 || num > maxYear + 1) {
    return null;
  }
  return num;
}

export function AnalyzePage({
  albums,
  canEdit,
  onSelectAlbum,
  onSyncGenres,
  onBackToMap,
}: AnalyzePageProps) {
  const currentYear = new Date().getFullYear();

  const [resolvedGenresMap, setResolvedGenresMap] = useState<Record<string, string[]>>({});
  const [lookingUpGenres, setLookingUpGenres] = useState(false);
  const [syncingGenres, setSyncingGenres] = useState(false);
  const attemptedLookupIdsRef = useRef<Set<string>>(new Set());

  const [hoveredBinIdx, setHoveredBinIdx] = useState<number | null>(null);
  const [hoveredScatterId, setHoveredScatterId] = useState<string | null>(null);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);

  // Automatically resolve genres for existing albums missing stored genres
  useEffect(() => {
    const missing = albums.filter(
      (a) =>
        a.genres.length === 0 &&
        !resolvedGenresMap[a.id] &&
        !attemptedLookupIdsRef.current.has(a.id)
    );
    if (missing.length === 0) return;

    let cancelled = false;
    setLookingUpGenres(true);

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
      if (!cancelled) {
        setLookingUpGenres(false);
      }
    };

    void runBatch();
    return () => {
      cancelled = true;
    };
  }, [albums, resolvedGenresMap]);

  const unsavedGenreUpdates = useMemo(() => {
    return albums
      .filter((a) => a.genres.length === 0 && (resolvedGenresMap[a.id]?.length ?? 0) > 0)
      .map((a) => ({ albumId: a.id, genres: resolvedGenresMap[a.id] }));
  }, [albums, resolvedGenresMap]);

  const handleSaveGenresToLibrary = async () => {
    if (!canEdit || unsavedGenreUpdates.length === 0) return;
    setSyncingGenres(true);
    try {
      await onSyncGenres(unsavedGenreUpdates);
    } finally {
      setSyncingGenres(false);
    }
  };

  const analytics = useMemo(() => {
    const ratings = albums.map((a) => a.rating);
    const ratingStats = computeStats(ratings);
    const acclaimedCount = albums.filter((a) => a.rating >= 80).length;

    // 10 bins of 10 points (0-9, 10-19, ..., 90-100)
    const ratingBins = Array.from({ length: 10 }, (_, idx) => {
      const min = idx * 10;
      const max = idx === 9 ? 100 : idx * 10 + 9;
      const binAlbums = albums.filter((a) => a.rating >= min && a.rating <= max);
      return {
        label: idx === 9 ? '90–100' : `${min}–${max}`,
        shortLabel: `${min}`,
        min,
        max,
        count: binAlbums.length,
        albums: binAlbums,
        isAcclaimedTier: min >= 80,
      };
    });
    const maxBinCount = Math.max(1, ...ratingBins.map((b) => b.count));

    // Release Year & Age calculations
    const albumsWithYear = albums
      .map((a) => {
        const year = parseReleaseYear(a.releaseYear, currentYear);
        if (year === null) return null;
        return {
          album: a,
          year,
          age: Math.max(0, currentYear - year),
        };
      })
      .filter((item): item is { album: AlbumReview; year: number; age: number } => item !== null);

    const ageStats = computeStats(albumsWithYear.map((item) => item.age));
    const yearStats = computeStats(albumsWithYear.map((item) => item.year));

    const sortedByYear = [...albumsWithYear].sort((a, b) => a.year - b.year);
    const oldestEntry = sortedByYear[0] ?? null;
    const newestEntry = sortedByYear[sortedByYear.length - 1] ?? null;

    const ageBuckets = [
      { label: '0–1 yrs', sub: 'New releases', min: 0, max: 1 },
      { label: '2–5 yrs', sub: 'Recent years', min: 2, max: 5 },
      { label: '6–10 yrs', sub: 'Last decade', min: 6, max: 10 },
      { label: '11–20 yrs', sub: 'Modern catalog', min: 11, max: 20 },
      { label: '21–35 yrs', sub: 'Classic era', min: 21, max: 35 },
      { label: '36+ yrs', sub: 'Heritage', min: 36, max: 500 },
    ].map((bucket) => {
      const matched = albumsWithYear.filter(
        (item) => item.age >= bucket.min && item.age <= bucket.max
      );
      const avg =
        matched.length > 0
          ? matched.reduce((acc, m) => acc + m.album.rating, 0) / matched.length
          : 0;
      return {
        ...bucket,
        count: matched.length,
        avgRating: avg,
        albums: matched.map((m) => m.album),
      };
    });
    const maxAgeBucketCount = Math.max(1, ...ageBuckets.map((b) => b.count));

    // Decades breakdown
    const decadeMap = new Map<number, AlbumReview[]>();
    for (const item of albumsWithYear) {
      const decade = Math.floor(item.year / 10) * 10;
      const list = decadeMap.get(decade) ?? [];
      list.push(item.album);
      decadeMap.set(decade, list);
    }
    const decades = Array.from(decadeMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([decade, list]) => ({
        decade,
        label: `${decade}s`,
        count: list.length,
        avgRating: list.reduce((acc, a) => acc + a.rating, 0) / list.length,
        albums: list,
      }));

    // Linear regression: Year -> Rating
    let trendSlope = 0;
    let trendIntercept = ratingStats.mean;
    let yearRatingCorrelation = 0;
    if (albumsWithYear.length >= 2 && yearStats.stdDev > 0 && ratingStats.stdDev > 0) {
      const n = albumsWithYear.length;
      let cov = 0;
      let varX = 0;
      for (const item of albumsWithYear) {
        const dx = item.year - yearStats.mean;
        const dy = item.album.rating - ratingStats.mean;
        cov += dx * dy;
        varX += dx * dx;
      }
      if (varX > 0) {
        trendSlope = cov / varX;
        trendIntercept = ratingStats.mean - trendSlope * yearStats.mean;
        yearRatingCorrelation = (cov / n) / (yearStats.stdDev * ratingStats.stdDev);
      }
    }

    // Genre aggregation (prefer stored genres, fallback to live resolved genres)
    const genreMap = new Map<string, AlbumReview[]>();
    let albumsWithGenresCount = 0;
    for (const album of albums) {
      const tags = album.genres.length > 0 ? album.genres : resolvedGenresMap[album.id] ?? [];
      if (tags.length > 0) {
        albumsWithGenresCount += 1;
      }
      for (const tag of tags) {
        const key = tag.trim();
        if (!key) continue;
        const list = genreMap.get(key) ?? [];
        list.push(album);
        genreMap.set(key, list);
      }
    }

    const genres = Array.from(genreMap.entries())
      .map(([name, list]) => {
        const stats = computeStats(list.map((a) => a.rating));
        return {
          name,
          count: list.length,
          sharePct: albums.length > 0 ? (list.length / albums.length) * 100 : 0,
          avgRating: stats.mean,
          stdDev: stats.stdDev,
          albums: [...list].sort((a, b) => b.rating - a.rating),
        };
      })
      .sort((a, b) => b.count - a.count || b.avgRating - a.avgRating);

    // Artist breakdown
    const artistMap = new Map<string, AlbumReview[]>();
    for (const album of albums) {
      const name = album.artist.trim();
      if (!name) continue;
      const list = artistMap.get(name) ?? [];
      list.push(album);
      artistMap.set(name, list);
    }
    const artists = Array.from(artistMap.entries())
      .map(([name, list]) => {
        const stats = computeStats(list.map((a) => a.rating));
        return {
          name,
          count: list.length,
          avgRating: stats.mean,
          minRating: stats.min,
          maxRating: stats.max,
          spread: stats.max - stats.min,
          albums: [...list].sort((a, b) => b.rating - a.rating),
        };
      })
      .sort((a, b) => b.count - a.count || b.avgRating - a.avgRating);

    // Z-score outliers & favorites depth
    const withZ = albums.map((a) => ({
      album: a,
      z: ratingStats.stdDev > 0 ? (a.rating - ratingStats.mean) / ratingStats.stdDev : 0,
    }));
    const topOutliers = [...withZ].sort((a, b) => b.album.rating - a.album.rating).slice(0, 3);
    const lowOutliers = [...withZ].sort((a, b) => a.album.rating - b.album.rating).slice(0, 3);

    const totalFavorites = albums.reduce((acc, a) => acc + a.favoriteSongs.length, 0);
    const avgFavorites = albums.length > 0 ? totalFavorites / albums.length : 0;
    const albumsWithTracks = albums.filter((a) => a.tracklist.length > 0);
    const avgFavRatioPct =
      albumsWithTracks.length > 0
        ? (albumsWithTracks.reduce(
            (acc, a) => acc + Math.min(1, a.favoriteSongs.length / a.tracklist.length),
            0
          ) /
            albumsWithTracks.length) *
          100
        : 0;
    const acclaimedFavAvg =
      acclaimedCount > 0
        ? albums.filter((a) => a.rating >= 80).reduce((acc, a) => acc + a.favoriteSongs.length, 0) /
          acclaimedCount
        : 0;
    const sub80Count = albums.length - acclaimedCount;
    const sub80FavAvg =
      sub80Count > 0
        ? albums.filter((a) => a.rating < 80).reduce((acc, a) => acc + a.favoriteSongs.length, 0) /
          sub80Count
        : 0;

    return {
      ratingStats,
      acclaimedCount,
      ratingBins,
      maxBinCount,
      albumsWithYear,
      ageStats,
      yearStats,
      oldestEntry,
      newestEntry,
      ageBuckets,
      maxAgeBucketCount,
      decades,
      trendSlope,
      trendIntercept,
      yearRatingCorrelation,
      genres,
      albumsWithGenresCount,
      artists,
      topOutliers,
      lowOutliers,
      totalFavorites,
      avgFavorites,
      avgFavRatioPct,
      acclaimedFavAvg,
      sub80FavAvg,
    };
  }, [albums, currentYear, resolvedGenresMap]);

  const activeGenreData = useMemo(() => {
    if (!selectedGenre) return null;
    return analytics.genres.find((g) => g.name === selectedGenre) ?? null;
  }, [analytics.genres, selectedGenre]);

  const hoveredScatter = useMemo(() => {
    if (!hoveredScatterId) return null;
    return analytics.albumsWithYear.find((item) => item.album.id === hoveredScatterId) ?? null;
  }, [analytics.albumsWithYear, hoveredScatterId]);

  if (albums.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto bg-black px-4 sm:px-8 py-16">
        <div className="max-w-xl mx-auto text-center space-y-4">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Collection Analysis</h1>
          <p className="text-sm text-zinc-400">
            Add albums to your map to generate rating deviation, era, and genre charts.
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

  // Histogram SVG geometry
  const histW = 640;
  const histH = 220;
  const histPad = { top: 20, right: 16, bottom: 28, left: 28 };
  const histPlotW = histW - histPad.left - histPad.right;
  const histPlotH = histH - histPad.top - histPad.bottom;
  const scoreToHistX = (score: number) =>
    histPad.left + (Math.max(0, Math.min(100, score)) / 100) * histPlotW;

  const meanX = scoreToHistX(analytics.ratingStats.mean);
  const lowSigmaX = scoreToHistX(analytics.ratingStats.mean - analytics.ratingStats.stdDev);
  const highSigmaX = scoreToHistX(analytics.ratingStats.mean + analytics.ratingStats.stdDev);

  // Scatter SVG geometry
  const scatW = 640;
  const scatH = 240;
  const scatPad = { top: 18, right: 20, bottom: 30, left: 36 };
  const scatPlotW = scatW - scatPad.left - scatPad.right;
  const scatPlotH = scatH - scatPad.top - scatPad.bottom;

  const minYearDomain =
    analytics.albumsWithYear.length > 0
      ? Math.max(1940, analytics.yearStats.min - 2)
      : currentYear - 20;
  const maxYearDomain =
    analytics.albumsWithYear.length > 0
      ? Math.max(minYearDomain + 4, analytics.yearStats.max + 1)
      : currentYear;
  const yearToScatX = (year: number) =>
    scatPad.left + ((year - minYearDomain) / Math.max(1, maxYearDomain - minYearDomain)) * scatPlotW;
  const ratingToScatY = (rating: number) =>
    scatPad.top + ((100 - Math.max(0, Math.min(100, rating))) / 100) * scatPlotH;

  const spreadLabel =
    analytics.ratingStats.stdDev < 7
      ? 'Tightly clustered'
      : analytics.ratingStats.stdDev < 14
        ? 'Balanced spread'
        : 'Wide polarization';

  const eraBiasLabel =
    analytics.yearRatingCorrelation > 0.15
      ? 'Leans toward newer releases'
      : analytics.yearRatingCorrelation < -0.15
        ? 'Leans toward older classics'
        : 'Steady across release eras';

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
              Collection Analysis
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-zinc-400">
              Live statistical breakdown across {albums.length} reviewed{' '}
              {albums.length === 1 ? 'album' : 'albums'} · {analytics.artists.length} artists ·{' '}
              {analytics.genres.length} genres
            </p>
          </div>

          <button
            type="button"
            onClick={onBackToMap}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-zinc-800 bg-zinc-950 text-xs font-medium text-zinc-200 hover:text-white hover:border-zinc-600 transition-colors cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Map
          </button>
        </div>

        {/* Top 4-Column KPI Strip */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-zinc-950 border border-zinc-800/80 rounded-3xl p-5">
            <p className="text-xs text-zinc-400">Mean Score &amp; Deviation</p>
            <div className="mt-2 flex items-baseline gap-2.5 font-mono tabular-nums">
              <span className="text-3xl font-semibold text-white">
                {analytics.ratingStats.mean.toFixed(1)}
              </span>
              <span className="text-sm text-zinc-400">
                ± {analytics.ratingStats.stdDev.toFixed(1)} σ
              </span>
            </div>
            <p className="mt-2 text-xs text-zinc-500 font-mono tabular-nums">
              Median {analytics.ratingStats.median.toFixed(0)} · Range {analytics.ratingStats.min}–
              {analytics.ratingStats.max} · {spreadLabel}
            </p>
          </div>

          <div className="bg-zinc-950 border border-zinc-800/80 rounded-3xl p-5">
            <p className="text-xs text-zinc-400">Acclaimed Tier (80+)</p>
            <div className="mt-2 flex items-baseline gap-2.5 font-mono tabular-nums">
              <span className="text-3xl font-semibold text-amber-300">
                {analytics.acclaimedCount}
              </span>
              <span className="text-sm text-zinc-400">
                ({Math.round((analytics.acclaimedCount / albums.length) * 100)}%)
              </span>
            </div>
            <p className="mt-2 text-xs text-zinc-500 font-mono tabular-nums">
              IQR {analytics.ratingStats.q1.toFixed(0)}–{analytics.ratingStats.q3.toFixed(0)} ·{' '}
              {albums.length - analytics.acclaimedCount} below 80
            </p>
          </div>

          <div className="bg-zinc-950 border border-zinc-800/80 rounded-3xl p-5">
            <p className="text-xs text-zinc-400">Average Album Age &amp; Deviation</p>
            <div className="mt-2 flex items-baseline gap-2.5 font-mono tabular-nums">
              <span className="text-3xl font-semibold text-white">
                {analytics.albumsWithYear.length > 0
                  ? `${analytics.ageStats.mean.toFixed(1)}y`
                  : '—'}
              </span>
              {analytics.albumsWithYear.length > 0 && (
                <span className="text-sm text-zinc-400">
                  ± {analytics.ageStats.stdDev.toFixed(1)}y σ
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-zinc-500 font-mono tabular-nums">
              {analytics.oldestEntry && analytics.newestEntry
                ? `Span ${analytics.oldestEntry.year}–${analytics.newestEntry.year} · Mean ${Math.round(
                    analytics.yearStats.mean
                  )}`
                : 'No release years recorded'}
            </p>
          </div>

          <div className="bg-zinc-950 border border-zinc-800/80 rounded-3xl p-5">
            <p className="text-xs text-zinc-400">Top Genre &amp; Favorites</p>
            <div className="mt-2 flex items-baseline gap-2 min-w-0">
              <span className="text-2xl font-semibold text-white truncate">
                {analytics.genres[0]?.name ?? (lookingUpGenres ? 'Scanning...' : 'Unclassified')}
              </span>
            </div>
            <p className="mt-2 text-xs text-zinc-500 font-mono tabular-nums">
              {analytics.genres[0]
                ? `${analytics.genres[0].count} albums · avg ${analytics.genres[0].avgRating.toFixed(1)}`
                : `${analytics.totalFavorites} favorite songs picked`}
              {analytics.genres[0] ? ` · ${analytics.avgFavorites.toFixed(1)} favs/album` : ''}
            </p>
          </div>
        </section>

        {/* Row 1: Rating Deviation Histogram + Genre Breakdown */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Rating Distribution & Deviation */}
          <div className="lg:col-span-7 bg-zinc-950 border border-zinc-800/80 rounded-3xl p-6 flex flex-col justify-between">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">
                  Rating Distribution &amp; Deviation
                </h2>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Score histogram with mean line and ±1σ standard deviation band
                </p>
              </div>
              <div className="text-right font-mono tabular-nums text-xs text-zinc-400">
                <span>μ {analytics.ratingStats.mean.toFixed(1)}</span>
                <span className="mx-1.5 text-zinc-700">·</span>
                <span>σ {analytics.ratingStats.stdDev.toFixed(1)}</span>
              </div>
            </div>

            <div className="mt-5 relative">
              <svg
                viewBox={`0 0 ${histW} ${histH}`}
                className="w-full h-auto overflow-visible select-none"
                role="img"
                aria-label="Rating score distribution and standard deviation chart"
              >
                {/* ±1 sigma shaded band */}
                {analytics.ratingStats.stdDev > 0 && (
                  <rect
                    x={lowSigmaX}
                    y={histPad.top}
                    width={Math.max(2, highSigmaX - lowSigmaX)}
                    height={histPlotH}
                    fill="rgba(255,255,255,0.05)"
                    rx={4}
                  />
                )}

                {/* Horizontal baseline & gridlines */}
                {[0, 0.5, 1].map((frac) => {
                  const y = histPad.top + histPlotH * (1 - frac);
                  const val = Math.round(analytics.maxBinCount * frac);
                  return (
                    <g key={frac}>
                      <line
                        x1={histPad.left}
                        x2={histW - histPad.right}
                        y1={y}
                        y2={y}
                        stroke="rgba(255,255,255,0.07)"
                        strokeDasharray={frac === 0 ? undefined : '3 3'}
                      />
                      <text
                        x={histPad.left - 8}
                        y={y + 3}
                        textAnchor="end"
                        className="fill-zinc-600 text-[10px] font-mono"
                      >
                        {val}
                      </text>
                    </g>
                  );
                })}

                {/* Bars */}
                {analytics.ratingBins.map((bin, idx) => {
                  const slotW = histPlotW / 10;
                  const barW = Math.max(12, slotW - 10);
                  const x = histPad.left + idx * slotW + (slotW - barW) / 2;
                  const barH = (bin.count / analytics.maxBinCount) * histPlotH;
                  const y = histPad.top + histPlotH - barH;
                  const isHovered = hoveredBinIdx === idx;

                  return (
                    <g
                      key={bin.label}
                      onMouseEnter={() => setHoveredBinIdx(idx)}
                      onMouseLeave={() => setHoveredBinIdx(null)}
                      className="cursor-pointer"
                    >
                      <rect
                        x={histPad.left + idx * slotW}
                        y={histPad.top}
                        width={slotW}
                        height={histPlotH + histPad.bottom}
                        fill="transparent"
                      />
                      <rect
                        x={x}
                        y={bin.count > 0 ? y : histPad.top + histPlotH - 2}
                        width={barW}
                        height={bin.count > 0 ? Math.max(4, barH) : 2}
                        rx={4}
                        fill={
                          bin.count === 0
                            ? 'rgba(255,255,255,0.08)'
                            : bin.isAcclaimedTier
                              ? isHovered
                                ? '#fde68a'
                                : '#fcd34d'
                              : isHovered
                                ? '#ffffff'
                                : '#a1a1aa'
                        }
                      />
                      {bin.count > 0 && (
                        <text
                          x={x + barW / 2}
                          y={y - 6}
                          textAnchor="middle"
                          className="fill-zinc-300 text-[10px] font-mono"
                        >
                          {bin.count}
                        </text>
                      )}
                      <text
                        x={x + barW / 2}
                        y={histH - 8}
                        textAnchor="middle"
                        className="fill-zinc-500 text-[10px] font-mono"
                      >
                        {bin.label}
                      </text>
                    </g>
                  );
                })}

                {/* Mean vertical dashed marker */}
                <line
                  x1={meanX}
                  x2={meanX}
                  y1={histPad.top - 4}
                  y2={histPad.top + histPlotH}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
                <text
                  x={meanX}
                  y={histPad.top - 8}
                  textAnchor="middle"
                  className="fill-white text-[10px] font-mono"
                >
                  Mean {analytics.ratingStats.mean.toFixed(1)}
                </text>
              </svg>
            </div>

            {/* Interactive bin preview or quartile summary */}
            <div className="mt-4 pt-4 border-t border-zinc-900 min-h-[44px] flex flex-wrap items-center justify-between gap-3 text-xs">
              {hoveredBinIdx !== null && analytics.ratingBins[hoveredBinIdx] ? (
                <div className="flex flex-wrap items-center gap-2 text-zinc-300">
                  <span className="font-mono text-white font-medium">
                    {analytics.ratingBins[hoveredBinIdx].label} pts:
                  </span>
                  {analytics.ratingBins[hoveredBinIdx].albums.length > 0 ? (
                    <span>
                      {analytics.ratingBins[hoveredBinIdx].albums
                        .slice(0, 4)
                        .map((a) => `${a.title} (${a.rating})`)
                        .join(' · ')}
                      {analytics.ratingBins[hoveredBinIdx].albums.length > 4
                        ? ` +${analytics.ratingBins[hoveredBinIdx].albums.length - 4} more`
                        : ''}
                    </span>
                  ) : (
                    <span className="text-zinc-500">No albums in this score range</span>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-zinc-400 font-mono tabular-nums">
                  <span>1σ Band: {Math.max(0, analytics.ratingStats.mean - analytics.ratingStats.stdDev).toFixed(1)}–{Math.min(100, analytics.ratingStats.mean + analytics.ratingStats.stdDev).toFixed(1)}</span>
                  <span>Q1: {analytics.ratingStats.q1.toFixed(0)}</span>
                  <span>Median: {analytics.ratingStats.median.toFixed(0)}</span>
                  <span>Q3: {analytics.ratingStats.q3.toFixed(0)}</span>
                </div>
              )}
              <span className="text-zinc-500">Gold bars = 80+ sparkle tier</span>
            </div>
          </div>

          {/* Genre Breakdown */}
          <div className="lg:col-span-5 bg-zinc-950 border border-zinc-800/80 rounded-3xl p-6 flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">Genre Breakdown</h2>
                <p className="mt-0.5 text-xs text-zinc-400">
                  {analytics.albumsWithGenresCount} of {albums.length} albums tagged
                  {lookingUpGenres ? ' · fetching Spotify & catalog genres...' : ''}
                </p>
              </div>

              {canEdit && unsavedGenreUpdates.length > 0 && (
                <button
                  type="button"
                  disabled={syncingGenres}
                  onClick={handleSaveGenresToLibrary}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-black text-xs font-medium hover:bg-zinc-200 disabled:opacity-50 transition-colors cursor-pointer shrink-0"
                >
                  <RefreshCw className={`w-3 h-3 ${syncingGenres ? 'animate-spin' : ''}`} />
                  {syncingGenres ? 'Saving...' : `Save ${unsavedGenreUpdates.length} to Library`}
                </button>
              )}
            </div>

            {analytics.genres.length === 0 ? (
              <div className="flex-1 flex items-center justify-center py-12 text-center">
                <p className="text-xs text-zinc-500 max-w-xs">
                  {lookingUpGenres
                    ? 'Resolving Spotify and catalog genres for your albums...'
                    : 'No genre metadata found yet. Edit an album review to auto-fill or add genres.'}
                </p>
              </div>
            ) : (
              <div className="mt-5 space-y-3 flex-1">
                {analytics.genres.slice(0, 8).map((genre) => {
                  const maxGenreCount = analytics.genres[0]?.count || 1;
                  const widthPct = Math.max(8, (genre.count / maxGenreCount) * 100);
                  const isSelected = selectedGenre === genre.name;
                  const isAcclaimedAvg = genre.avgRating >= 80;

                  return (
                    <button
                      key={genre.name}
                      type="button"
                      onClick={() =>
                        setSelectedGenre((prev) => (prev === genre.name ? null : genre.name))
                      }
                      className={`w-full text-left rounded-xl p-2 -mx-2 transition-colors cursor-pointer ${
                        isSelected ? 'bg-zinc-900' : 'hover:bg-zinc-900/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-white truncate">{genre.name}</span>
                        <span className="font-mono tabular-nums text-zinc-400 shrink-0">
                          {genre.count} {genre.count === 1 ? 'album' : 'albums'} · avg{' '}
                          <span className={isAcclaimedAvg ? 'text-amber-300' : 'text-zinc-200'}>
                            {genre.avgRating.toFixed(1)}
                          </span>
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 rounded-full bg-zinc-900 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isAcclaimedAvg ? 'bg-amber-300' : 'bg-white'
                          }`}
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {activeGenreData && (
              <div className="mt-4 pt-4 border-t border-zinc-900 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-300 font-medium">
                    {activeGenreData.name} ({activeGenreData.count})
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedGenre(null)}
                    className="text-zinc-500 hover:text-white cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {activeGenreData.albums.slice(0, 6).map((alb) => (
                    <button
                      key={alb.id}
                      type="button"
                      onClick={() => onSelectAlbum(alb)}
                      className="inline-flex items-center gap-2 pr-2.5 pl-1 py-1 rounded-full border border-zinc-800 bg-black hover:border-zinc-500 text-xs text-zinc-200 transition-colors cursor-pointer"
                    >
                      <span className="w-5 h-5 rounded-full overflow-hidden shrink-0">
                        <AlbumCover src={alb.coverUrl} alt={alb.title} title={alb.title} />
                      </span>
                      <span className="truncate max-w-[130px]">{alb.title}</span>
                      <span className="font-mono tabular-nums text-zinc-400">{alb.rating}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Row 2: Album Age Deviation + Release Year vs Rating Scatter */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Album Age Deviation */}
          <div className="lg:col-span-5 bg-zinc-950 border border-zinc-800/80 rounded-3xl p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-white">
                    Album Age &amp; Era Spread
                  </h2>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    Years elapsed since release (as of {currentYear})
                  </p>
                </div>
                {analytics.albumsWithYear.length > 0 && (
                  <span className="font-mono tabular-nums text-xs text-zinc-400 shrink-0">
                    μ {analytics.ageStats.mean.toFixed(1)}y ± {analytics.ageStats.stdDev.toFixed(1)}y
                  </span>
                )}
              </div>

              {analytics.albumsWithYear.length === 0 ? (
                <p className="py-12 text-center text-xs text-zinc-500">
                  No release years available for age analysis.
                </p>
              ) : (
                <div className="mt-5 space-y-3.5">
                  {analytics.ageBuckets.map((bucket) => {
                    const barPct =
                      bucket.count > 0
                        ? Math.max(6, (bucket.count / analytics.maxAgeBucketCount) * 100)
                        : 0;
                    return (
                      <div key={bucket.label} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-200">
                            <span className="font-mono tabular-nums font-medium">{bucket.label}</span>
                            <span className="text-zinc-500 ml-2">{bucket.sub}</span>
                          </span>
                          <span className="font-mono tabular-nums text-zinc-400">
                            {bucket.count}
                            {bucket.count > 0 ? ` · avg ${bucket.avgRating.toFixed(1)}` : ''}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-zinc-900 overflow-hidden">
                          {barPct > 0 && (
                            <div
                              className={`h-full rounded-full ${
                                bucket.avgRating >= 80 ? 'bg-amber-300' : 'bg-zinc-300'
                              }`}
                              style={{ width: `${barPct}%` }}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {analytics.oldestEntry && analytics.newestEntry && (
              <div className="mt-5 pt-4 border-t border-zinc-900 grid grid-cols-2 gap-4 text-xs">
                <button
                  type="button"
                  onClick={() => onSelectAlbum(analytics.oldestEntry!.album)}
                  className="text-left hover:opacity-80 transition-opacity cursor-pointer min-w-0"
                >
                  <p className="text-zinc-500">Oldest Reviewed</p>
                  <p className="mt-0.5 font-medium text-white truncate">
                    {analytics.oldestEntry.album.title}
                  </p>
                  <p className="font-mono tabular-nums text-zinc-400">
                    {analytics.oldestEntry.year} ({analytics.oldestEntry.age}y ago)
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectAlbum(analytics.newestEntry!.album)}
                  className="text-left hover:opacity-80 transition-opacity cursor-pointer min-w-0"
                >
                  <p className="text-zinc-500">Newest Release</p>
                  <p className="mt-0.5 font-medium text-white truncate">
                    {analytics.newestEntry.album.title}
                  </p>
                  <p className="font-mono tabular-nums text-zinc-400">
                    {analytics.newestEntry.year} ({analytics.newestEntry.age}y ago)
                  </p>
                </button>
              </div>
            )}
          </div>

          {/* Release Year vs Rating Scatter Plot */}
          <div className="lg:col-span-7 bg-zinc-950 border border-zinc-800/80 rounded-3xl p-6 flex flex-col justify-between">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">
                  Release Year vs. Rating
                </h2>
                <p className="mt-0.5 text-xs text-zinc-400">
                  {eraBiasLabel} · Click any dot to open the album review
                </p>
              </div>
              {analytics.albumsWithYear.length >= 2 && (
                <span className="font-mono tabular-nums text-xs text-zinc-400">
                  r = {analytics.yearRatingCorrelation.toFixed(2)}
                </span>
              )}
            </div>

            {analytics.albumsWithYear.length === 0 ? (
              <p className="py-12 text-center text-xs text-zinc-500">
                Add release years to plot timeline ratings.
              </p>
            ) : (
              <div className="mt-5">
                <svg
                  viewBox={`0 0 ${scatW} ${scatH}`}
                  className="w-full h-auto overflow-visible select-none"
                  role="img"
                  aria-label="Scatter plot comparing album release year to rating score"
                >
                  {/* Horizontal score grid lines */}
                  {[0, 25, 50, 75, 80, 100].map((score) => {
                    const y = ratingToScatY(score);
                    const is80 = score === 80;
                    return (
                      <g key={score}>
                        <line
                          x1={scatPad.left}
                          x2={scatW - scatPad.right}
                          y1={y}
                          y2={y}
                          stroke={is80 ? 'rgba(252,211,77,0.3)' : 'rgba(255,255,255,0.07)'}
                          strokeDasharray={is80 ? '4 4' : undefined}
                        />
                        {score !== 75 && (
                          <text
                            x={scatPad.left - 8}
                            y={y + 3}
                            textAnchor="end"
                            className={`text-[10px] font-mono ${
                              is80 ? 'fill-amber-300/80' : 'fill-zinc-600'
                            }`}
                          >
                            {score}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* X-axis year ticks */}
                  {[
                    minYearDomain,
                    Math.round((minYearDomain + maxYearDomain) / 2),
                    maxYearDomain,
                  ].map((yr, idx) => (
                    <text
                      key={`${yr}-${idx}`}
                      x={yearToScatX(yr)}
                      y={scatH - 8}
                      textAnchor="middle"
                      className="fill-zinc-500 text-[10px] font-mono"
                    >
                      {yr}
                    </text>
                  ))}

                  {/* Linear regression trend line */}
                  {analytics.albumsWithYear.length >= 2 && (
                    <line
                      x1={yearToScatX(minYearDomain)}
                      y1={ratingToScatY(analytics.trendSlope * minYearDomain + analytics.trendIntercept)}
                      x2={yearToScatX(maxYearDomain)}
                      y2={ratingToScatY(analytics.trendSlope * maxYearDomain + analytics.trendIntercept)}
                      stroke="rgba(255,255,255,0.28)"
                      strokeWidth={1.5}
                      strokeDasharray="5 4"
                    />
                  )}

                  {/* Album points */}
                  {analytics.albumsWithYear.map(({ album, year }) => {
                    const cx = yearToScatX(year);
                    const cy = ratingToScatY(album.rating);
                    const isHovered = hoveredScatterId === album.id;
                    const isHigh = album.rating >= 80;
                    return (
                      <circle
                        key={album.id}
                        cx={cx}
                        cy={cy}
                        r={isHovered ? 7.5 : 5}
                        fill={isHigh ? '#fcd34d' : '#ffffff'}
                        fillOpacity={isHovered ? 1 : 0.85}
                        stroke="#000000"
                        strokeWidth={1.5}
                        onMouseEnter={() => setHoveredScatterId(album.id)}
                        onMouseLeave={() => setHoveredScatterId(null)}
                        onClick={() => onSelectAlbum(album)}
                        className="cursor-pointer transition-all duration-150"
                      />
                    );
                  })}
                </svg>
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-zinc-900 min-h-[44px] flex items-center justify-between gap-3 text-xs">
              {hoveredScatter ? (
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 ring-1 ring-zinc-700">
                    <AlbumCover
                      src={hoveredScatter.album.coverUrl}
                      alt={hoveredScatter.album.title}
                      title={hoveredScatter.album.title}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-medium truncate">
                      {hoveredScatter.album.title} · {hoveredScatter.album.artist}
                    </p>
                    <p className="text-zinc-400 font-mono tabular-nums">
                      {hoveredScatter.year} ({hoveredScatter.age}y ago) · {hoveredScatter.album.rating}/100
                    </p>
                  </div>
                </div>
              ) : (
                <span className="text-zinc-500">
                  Dashed white line shows trend across years · Amber dashed line marks 80+ threshold
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Row 3: Decades, Top Artists, Outliers & Track Depth */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Decade Performance */}
          <div className="lg:col-span-4 bg-zinc-950 border border-zinc-800/80 rounded-3xl p-6">
            <h2 className="text-base font-semibold text-white">Decade Performance</h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              Volume and average rating by release decade
            </p>

            {analytics.decades.length === 0 ? (
              <p className="py-10 text-center text-xs text-zinc-500">No decade data yet.</p>
            ) : (
              <div className="mt-5 divide-y divide-zinc-900">
                {analytics.decades.map((d) => (
                  <div key={d.decade} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <span className="font-mono tabular-nums text-sm font-semibold text-white">
                        {d.label}
                      </span>
                      <span className="ml-2 text-xs text-zinc-500">
                        {d.count} {d.count === 1 ? 'album' : 'albums'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`font-mono tabular-nums text-sm font-semibold ${
                          d.avgRating >= 80 ? 'text-amber-300' : 'text-zinc-200'
                        }`}
                      >
                        {d.avgRating.toFixed(1)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Artists & Consistency */}
          <div className="lg:col-span-4 bg-zinc-950 border border-zinc-800/80 rounded-3xl p-6">
            <h2 className="text-base font-semibold text-white">Artists &amp; Consistency</h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              Most reviewed artists and rating spread across releases
            </p>

            <div className="mt-5 divide-y divide-zinc-900">
              {analytics.artists.slice(0, 6).map((artist) => (
                <div key={artist.name} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{artist.name}</p>
                    <p className="text-xs text-zinc-500 font-mono tabular-nums">
                      {artist.count} {artist.count === 1 ? 'album' : 'albums'}
                      {artist.count > 1 ? ` · spread ${artist.minRating}–${artist.maxRating}` : ''}
                    </p>
                  </div>
                  <span
                    className={`font-mono tabular-nums text-sm font-semibold shrink-0 ${
                      artist.avgRating >= 80 ? 'text-amber-300' : 'text-white'
                    }`}
                  >
                    {artist.avgRating.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Extremes & Track Highlights */}
          <div className="lg:col-span-4 bg-zinc-950 border border-zinc-800/80 rounded-3xl p-6 space-y-6">
            <div>
              <h2 className="text-base font-semibold text-white">Rating Extremes</h2>
              <p className="mt-0.5 text-xs text-zinc-400">
                Highest and lowest deviations from your {analytics.ratingStats.mean.toFixed(1)} mean
              </p>

              <div className="mt-4 space-y-2.5">
                {analytics.topOutliers.slice(0, 2).map(({ album, z }) => (
                  <button
                    key={album.id}
                    type="button"
                    onClick={() => onSelectAlbum(album)}
                    className="w-full flex items-center justify-between gap-3 text-left hover:bg-zinc-900/70 rounded-xl p-1.5 -mx-1.5 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 ring-1 ring-zinc-800">
                        <AlbumCover src={album.coverUrl} alt={album.title} title={album.title} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-white truncate">{album.title}</p>
                        <p className="text-[11px] text-zinc-500 truncate">{album.artist}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-mono tabular-nums text-xs font-semibold text-amber-300 block">
                        {album.rating}
                      </span>
                      <span className="font-mono tabular-nums text-[10px] text-zinc-500">
                        {z >= 0 ? `+${z.toFixed(1)}σ` : `${z.toFixed(1)}σ`}
                      </span>
                    </div>
                  </button>
                ))}

                {albums.length > 2 &&
                  analytics.lowOutliers.slice(0, 1).map(({ album, z }) => (
                    <button
                      key={`low-${album.id}`}
                      type="button"
                      onClick={() => onSelectAlbum(album)}
                      className="w-full flex items-center justify-between gap-3 text-left hover:bg-zinc-900/70 rounded-xl p-1.5 -mx-1.5 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 ring-1 ring-zinc-800">
                          <AlbumCover src={album.coverUrl} alt={album.title} title={album.title} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-white truncate">{album.title}</p>
                          <p className="text-[11px] text-zinc-500 truncate">{album.artist}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono tabular-nums text-xs font-semibold text-zinc-300 block">
                          {album.rating}
                        </span>
                        <span className="font-mono tabular-nums text-[10px] text-zinc-500">
                          {z >= 0 ? `+${z.toFixed(1)}σ` : `${z.toFixed(1)}σ`}
                        </span>
                      </div>
                    </button>
                  ))}
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-900 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Favorite Track Hit Rate</span>
                <span className="font-mono tabular-nums text-white font-medium">
                  {analytics.avgFavRatioPct.toFixed(0)}% of tracklist
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">80+ vs &lt;80 Avg Favorites</span>
                <span className="font-mono tabular-nums text-zinc-300">
                  {analytics.acclaimedFavAvg.toFixed(1)} vs {analytics.sub80FavAvg.toFixed(1)} tracks
                </span>
              </div>
              <div className="pt-2 flex items-center justify-between">
                <span className="text-xs text-zinc-500">Collection Avg Stars</span>
                <RatingStars rating={analytics.ratingStats.mean} size="sm" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </motion.div>
  );
}
