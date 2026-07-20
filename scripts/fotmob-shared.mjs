// Shared FotMob API helpers + team/player stat extraction, used by both
// ingest-fotmob.mjs (current season, incremental) and
// ingest-fotmob-fallback.mjs (last season, one-time backfill for domestic
// leagues whose current season hasn't started yet — see Competition.hasFinishedMatches).
import { readFile } from "node:fs/promises";
import { normalizeTeamName, normalizePersonName } from "./name-match.mjs";

export const FOTMOB = "https://www.fotmob.com/api/data";
export const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Referer: "https://www.fotmob.com/",
  Accept: "application/json",
};
export const PAUSE_MS = 1500; // be polite between per-match requests, as world-cup does
export const FETCH_TIMEOUT_MS = 15000;

export const FOTMOB_LEAGUE_IDS = {
  PL: 47,
  ELC: 48,
  PD: 87,
  BL1: 54,
  SA: 55,
  FL1: 53,
  DED: 57,
  PPL: 61,
  CL: 42,
};

// football-data.org name -> FotMob displayName, for clubs normalization
// alone can't bridge. Global (not per-competition), same club identity
// regardless of which competition it's playing in. Verified against
// FotMob's live fixture lists for all 9 competitions (2026-07-20).
export const ALIASES = {
  // La Liga
  "Real Racing Club de Santander": "Racing Santander",
  "RCD Espanyol de Barcelona": "Espanyol",
  "Rayo Vallecano de Madrid": "Rayo Vallecano",
  "RC Deportivo La Coruña": "Deportivo A Coruña",
  "CA Osasuna": "Osasuna",
  "Real Betis Balompié": "Real Betis",
  // Bundesliga
  "1. FSV Mainz 05": "Mainz 05",
  "SC Paderborn 07": "Paderborn",
  "1. FC Union Berlin": "Union Berlin",
  "SV 07 Elversberg": "Elversberg",
  "Bayer 04 Leverkusen": "Bayer Leverkusen",
  "TSG 1899 Hoffenheim": "Hoffenheim",
  // Serie A
  "Como 1907": "Como",
  "FC Internazionale Milano": "Inter",
  "Genoa CFC": "Genoa",
  "Parma Calcio 1913": "Parma",
  "US Lecce": "Lecce",
  "Atalanta BC": "Atalanta",
  "US Sassuolo Calcio": "Sassuolo",
  "Bologna FC 1909": "Bologna",
  "ACF Fiorentina": "Fiorentina",
  // Ligue 1
  "AJ Auxerre": "Auxerre",
  "Angers SCO": "Angers",
  "ES Troyes AC": "Troyes",
  "Lille OSC": "Lille",
  "OGC Nice": "Nice",
  "Olympique Lyonnais": "Lyon",
  "Olympique de Marseille": "Marseille",
  "RC Strasbourg Alsace": "Strasbourg",
  "Racing Club de Lens": "Lens",
  "Stade Brestois 29": "Brest",
  "Stade Rennais FC 1901": "Rennes",
  // Eredivisie
  "AZ": "AZ Alkmaar",
  "FC Twente '65": "FC Twente",
  "Feyenoord Rotterdam": "Feyenoord",
  "NEC": "NEC Nijmegen",
  "PSV": "PSV Eindhoven",
  "SBV Excelsior": "Excelsior",
  "SC Cambuur-Leeuwarden": "Cambuur",
  "Telstar 1963": "Telstar",
  "Willem II Tilburg": "Willem II",
  // Primeira Liga
  "Vitória SC": "Vitoria de Guimaraes",
  "Sporting Clube de Braga": "Braga",
  "Sporting Clube de Portugal": "Sporting CP",
  "Sport Lisboa e Benfica": "Benfica",
  "CS Marítimo": "Maritimo",
  "GD Estoril Praia": "Estoril",
  // Champions League only (clubs outside our 8 domestic leagues)
  "PAE Olympiakos SFP": "Olympiacos",
  "Club Brugge KV": "Club Brugge",
  "Galatasaray SK": "Galatasaray",
  "Qarabağ Ağdam FK": "Qarabag FK",
  "FK Bodø/Glimt": "Bodø/Glimt",
  "Paphos FC": "Pafos FC",
  "Royale Union Saint-Gilloise": "Union St.Gilloise",
  "SK Slavia Praha": "Slavia Prague",
  "FK Kairat": "Kairat Almaty",
  // Last-season-only clubs (relegated/promoted since, so absent from the
  // current-season team lists ingest-fotmob.mjs's --check validates against
  // — found running ingest-fotmob-fallback.mjs for 2025-26 domestic data).
  "RCD Mallorca": "Mallorca",
  "FC St. Pauli 1910": "St. Pauli",
  "1. FC Heidenheim 1846": "FC Heidenheim",
  "US Cremonese": "Cremonese",
  "AC Pisa 1909": "Pisa",
  "Heracles Almelo": "Heracles",
  "AVS": "AVS Futebol SAD",
};

export async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === tries - 1) throw err;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function readJson(path, fallback = []) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

function toNumber(value) {
  if (value === null || value === undefined) return undefined;
  const match = String(value).match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

// Pulls a named "Top stats" entry's [home, away] pair out of FotMob's
// grouped TEAM stats blob (array of {key, stats: [home, away]} groups).
function findTeamStat(groups, key) {
  for (const group of groups) {
    const stat = group.stats.find((s) => s.key === key);
    if (stat) return stat.stats;
  }
  return undefined;
}

// Maps a FotMob matchDetails response to our MatchAdvancedStats shape for
// one side ("home" | "away").
export function extractTeamStats(matchDetails, side) {
  const groups = matchDetails.content?.stats?.Periods?.All?.stats;
  if (!groups) return undefined;
  const idx = side === "home" ? 0 : 1;
  const at = (key) => toNumber(findTeamStat(groups, key)?.[idx]);

  return {
    possession: at("BallPossesion"),
    xg: at("expected_goals"),
    shots: at("total_shots"),
    shotsOnTarget: at("ShotsOnTarget"),
    accuratePasses: at("accurate_passes"),
    duelsWon: at("duel_won"),
    boxTouches: at("touches_opp_box"),
    fouls: at("fouls"),
    corners: at("corners"),
    offsides: at("Offsides"),
    saves: at("keeper_saves"),
  };
}

// Pulls a named stat out of one PLAYER's grouped stats — a different shape
// than team stats: an array of groups, each group.stats is an OBJECT keyed
// by display title -> {key, stat: {value, type}}.
function findPlayerStat(groups, key) {
  for (const group of groups ?? []) {
    const entry = Object.values(group.stats).find((s) => s.key === key);
    if (entry) return entry.stat?.value;
  }
  return undefined;
}

export function extractPlayerStats(entry) {
  const at = (key) => {
    const v = findPlayerStat(entry.stats, key);
    return typeof v === "number" ? v : undefined;
  };
  return {
    minutes: at("minutes_played"),
    goals: at("goals"),
    assists: at("assists"),
    xg: at("expected_goals"),
    xa: at("expected_assists"),
    shots: at("total_shots"),
    shotsOnTarget: at("ShotsOnTarget"),
    tackles: at("matchstats.headers.tackles"),
    interceptions: at("interceptions"),
    clearances: at("clearances"),
    duelsWon: at("duel_won"),
    rating: at("rating_title"),
  };
}

// Finds a competition's FotMob fixture (from a leagues?id=... fixtures list)
// matching one of our matches by team name + calendar day.
export function findFixture(fixtures, homeName, awayName, dateStr) {
  const homeNorm = normalizeTeamName(ALIASES[homeName] ?? homeName);
  const awayNorm = normalizeTeamName(ALIASES[awayName] ?? awayName);
  return fixtures.find(
    (m) =>
      m.status.utcTime.slice(0, 10) === dateStr &&
      normalizeTeamName(m.home.name) === homeNorm &&
      normalizeTeamName(m.away.name) === awayNorm,
  );
}

// football-data.org often lists a player by their short "known as" name
// (e.g. "Martinelli", "Gabriel") where FotMob uses a fuller one ("Gabriel
// Martinelli") — confirmed on real data (Arsenal's Gabriel Martinelli listed
// as just "Martinelli" on football-data). Exact normalized-name equality
// alone misses these. Falls back to "one name's words are a subset of the
// other's" (order-independent), but ONLY when exactly one squad candidate
// qualifies — e.g. Arsenal also has a "Gabriel Jesus" and a "Gabriel
// Magalhães", so a bare FotMob "Gabriel" matches both and is correctly left
// unmatched rather than guessed. A wrong match would silently corrupt a
// player's stats, which is worse than a missing one.
function findPlayerMatch(entryName, candidates) {
  const entryNorm = normalizePersonName(entryName);
  const exact = candidates.filter((p) => normalizePersonName(p.name) === entryNorm);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return undefined; // shouldn't happen (dup names on a squad), be safe

  const entryWords = new Set(entryNorm.split(" ").filter(Boolean));
  if (entryWords.size === 0) return undefined;

  const subsetMatches = candidates.filter((p) => {
    const pWords = new Set(normalizePersonName(p.name).split(" ").filter(Boolean));
    if (pWords.size === 0) return false;
    const [smaller, larger] = entryWords.size <= pWords.size ? [entryWords, pWords] : [pWords, entryWords];
    return [...smaller].every((w) => larger.has(w));
  });
  return subsetMatches.length === 1 ? subsetMatches[0] : undefined;
}

// Matches every FotMob playerStats entry in a matchDetails response to one
// of our players, scoped per-team (small candidate pool: one squad, ~22-40
// players). Returns {ourPlayerId: PlayerMatchStats}; entries with no
// unambiguous name match are skipped, not guessed at.
export function extractMatchPlayerStats(matchDetails, homeTeamId, awayTeamId, playersByTeam, onUnmatched) {
  const fmTeams = matchDetails.header?.teams ?? [];
  const fmTeamToOurTeam = new Map();
  if (fmTeams[0]) fmTeamToOurTeam.set(fmTeams[0].id, homeTeamId);
  if (fmTeams[1]) fmTeamToOurTeam.set(fmTeams[1].id, awayTeamId);

  const result = {};
  for (const entry of Object.values(matchDetails.content?.playerStats ?? {})) {
    const ourTeamId = fmTeamToOurTeam.get(entry.teamId);
    if (!ourTeamId) continue;
    const candidates = playersByTeam.get(ourTeamId) ?? [];
    const match = findPlayerMatch(entry.name, candidates);
    if (!match) {
      onUnmatched?.(entry.name, ourTeamId);
      continue;
    }
    result[match.id] = extractPlayerStats(entry);
  }
  return result;
}

// Sums PlayerMatchStats across a season (playerMatchStats: {matchId:
// {playerId: PlayerMatchStats}}) into PlayerSeasonStats — a fresh sum every
// time, not an incrementally-updated total (see types.ts PlayerMatchStats
// doc comment for why that matters across a season rollover).
export function rollupSeasonStats(playerMatchStats, season) {
  const totals = new Map();
  const SUM_FIELDS = [
    "minutes", "goals", "assists", "xg", "xa", "shots", "shotsOnTarget",
    "tackles", "interceptions", "clearances", "duelsWon",
  ];

  for (const byPlayer of Object.values(playerMatchStats)) {
    for (const [playerId, stats] of Object.entries(byPlayer)) {
      if (!totals.has(playerId)) {
        const zeroed = Object.fromEntries(SUM_FIELDS.map((k) => [k, 0]));
        totals.set(playerId, { playerId, matchesPlayed: 0, ratingSum: 0, ratingCount: 0, ...zeroed });
      }
      const t = totals.get(playerId);
      t.matchesPlayed += 1;
      for (const key of SUM_FIELDS) {
        if (typeof stats[key] === "number") t[key] += stats[key];
      }
      if (typeof stats.rating === "number") {
        t.ratingSum += stats.rating;
        t.ratingCount += 1;
      }
    }
  }

  const round2 = (n) => Math.round(n * 100) / 100;
  return [...totals.values()].map((t) => ({
    playerId: t.playerId,
    season,
    matchesPlayed: t.matchesPlayed,
    minutes: t.minutes,
    goals: t.goals,
    assists: t.assists,
    xg: round2(t.xg),
    xa: round2(t.xa),
    shots: t.shots,
    shotsOnTarget: t.shotsOnTarget,
    tackles: t.tackles,
    interceptions: t.interceptions,
    clearances: t.clearances,
    duelsWon: t.duelsWon,
    avgRating: t.ratingCount > 0 ? round2(t.ratingSum / t.ratingCount) : null,
  }));
}

export function playersByTeamMap(players) {
  const map = new Map();
  for (const p of players) {
    if (!map.has(p.teamId)) map.set(p.teamId, []);
    map.get(p.teamId).push(p);
  }
  return map;
}
