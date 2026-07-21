import { useSyncExternalStore } from "react";

// Teams a visitor has starred. Device-local only (no account/sync). Unlike a
// single-tournament app, futbol has 9 independent per-competition data sets,
// so each entry carries its competitionId too — that's what lets the
// Favorites page load() the right league for each starred team without
// guessing or eagerly loading all 9. A tiny external store backs a
// useSyncExternalStore hook so a star toggled anywhere (Teams grid, a team
// page) instantly updates every other view.
const KEY = "futbol-favorites";
const listeners = new Set<() => void>();

export interface FavoriteTeam {
  teamId: string;
  competitionId: string;
}

function isFavoriteTeam(x: unknown): x is FavoriteTeam {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as FavoriteTeam).teamId === "string" &&
    typeof (x as FavoriteTeam).competitionId === "string"
  );
}

function read(): FavoriteTeam[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(isFavoriteTeam) : [];
  } catch {
    return [];
  }
}

// getSnapshot must return a stable reference between changes, so cache the
// parsed array and only replace it when the store actually changes.
let cache: FavoriteTeam[] = read();

function emit() {
  cache = read();
  listeners.forEach((l) => l());
}

// Keep tabs/windows in sync — storage events fire only in *other* documents.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) emit();
  });
}

// Scoped by BOTH teamId and competitionId: the same real-world club appears
// under the same team id in more than one competition's data set (e.g. Real
// Madrid is "86" in both La Liga and the Champions League), so teamId alone
// isn't a unique key — starring a team from one competition's page must not
// affect (or be conflated with) starring it from another's.
function matches(f: FavoriteTeam, teamId: string, competitionId: string): boolean {
  return f.teamId === teamId && f.competitionId === competitionId;
}

export function isFavorite(teamId: string, competitionId: string): boolean {
  return cache.some((f) => matches(f, teamId, competitionId));
}

export function toggleFavorite(teamId: string, competitionId: string): void {
  const next = cache.some((f) => matches(f, teamId, competitionId))
    ? cache.filter((f) => !matches(f, teamId, competitionId))
    : [...cache, { teamId, competitionId }];
  localStorage.setItem(KEY, JSON.stringify(next));
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Reactive list of starred teams, in the order they were added. */
export function useFavorites(): FavoriteTeam[] {
  return useSyncExternalStore(subscribe, () => cache, () => cache);
}
