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

// FotMob's goalDescriptionKey -> the word we print in parentheses after a
// scorer. Only the descriptive ones: "penalty" and "owngoal" also turn up
// here but are carried as booleans on MatchEvent instead, since they change
// how the goal is READ rather than just how it was scored.
// Keys taken from real responses, not guessed: over 469 goals sampled across
// six competitions the only values seen were null, header, penalty, owngoal,
// direct_free_kick and overhead_kick. An earlier guess at "free_kick" never
// matched anything — FotMob spells it "direct_free_kick" — so free-kick
// goals, the most common descriptive method after headers, silently lost
// their qualifier.
const GOAL_METHODS = {
  header: "header",
  direct_free_kick: "free kick",
  overhead_kick: "overhead kick",
};

// The event's whole-minute clock, or null when it has none.
//
// The checks are explicit because Number(null) and Number("") are both 0 —
// finite, and therefore accepted by a bare Number.isFinite guard, which would
// file a clockless event at minute zero and sort it to the top of the
// timeline. The ESPN twin escapes this only because detail.clock?.value gives
// undefined, and Number(undefined) is NaN.
function minuteOf(event) {
  // null, undefined and "" all have to be rejected BEFORE Number(): the first
  // two give NaN but the empty string gives 0, which passes isFinite.
  if (event.time == null || event.time === "") return null;
  const base = Number(event.time);
  return Number.isFinite(base) ? base : null;
}

// "69'" or "45'+1'" — the same shape ESPN's displayClock produces, so the two
// event sources render identically and MatchEvent.minute has one format.
function eventMinute(event) {
  const base = minuteOf(event);
  if (base === null) return "";
  const extra = Number(event.overloadTime);
  return Number.isFinite(extra) && extra > 0 ? `${base}'+${extra}'` : `${base}'`;
}

// [minute, stoppage] for ordering. A missing clock sorts to the END, matching
// ingest-espn-live.mjs's sortKey and what MatchDetail's Timeline says happens
// — `Number(x) || 0` would instead file it at minute zero, opening the
// timeline with a row whose minute renders as a dash.
function eventSortKey(event) {
  const base = minuteOf(event);
  if (base === null) return [Number.MAX_SAFE_INTEGER, 0];
  const extra = Number(event.overloadTime);
  return [base, Number.isFinite(extra) ? extra : 0];
}

// Goals and cards from a matchDetails response, in OUR MatchEvent shape.
//
// Richer than the ESPN scoreboard's equivalent (ingest-espn-live.mjs toEvent),
// which is the entire reason this exists: ESPN names only the scorer, while
// this carries the assist and how the goal was scored. Same response the team
// stats come from, so it costs no extra request.
//
// Substitution/Half/AddedTime/VAR/Comment events are skipped — the timeline
// shows goals and cards. Shootout events are skipped too: they don't move the
// scoreline this app displays (Match.shootout is tracked separately), so
// including them would contradict the score beside them.
const CARD_TYPES = {
  Yellow: "yellow-card",
  Red: "red-card",
  YellowRed: "red-card",
};

export function extractMatchEvents(matchDetails, homeTeamId, awayTeamId) {
  const raw = matchDetails.content?.matchFacts?.events?.events;
  if (!Array.isArray(raw)) return [];

  const out = [];
  for (const event of raw) {
    if (event.isPenaltyShootoutEvent) continue;

    const teamId = event.isHome ? homeTeamId : awayTeamId;
    // Same fallback as ingest-espn-live.mjs's toEvent. Dropping the event
    // instead would take a goal off a timeline the badge presents as
    // complete, while the scoreline beside it still counts it.
    const playerName = event.fullName ?? event.nameStr ?? event.player?.name ?? "Unknown";

    if (event.type === "Goal") {
      // `penalty` shows up as the description on some goals and as the suffix
      // on others; either is authoritative.
      const penalty =
        event.goalDescriptionKey === "penalty" || event.suffixKey === "penalties_short";
      const ownGoal = Boolean(event.ownGoal) || event.suffixKey === "own_goal_short";
      const method = GOAL_METHODS[event.goalDescriptionKey];
      out.push({
        minute: eventMinute(event),
        type: "goal",
        teamId,
        playerName,
        ...(ownGoal ? { ownGoal: true } : {}),
        ...(penalty ? { penalty: true } : {}),
        ...(method ? { method } : {}),
        // assistInput is the bare name; assistStr is "assist by <name>".
        ...(event.assistInput ? { assist: event.assistInput } : {}),
        _sort: eventSortKey(event),
      });
    } else if (event.type === "Card") {
      // "YellowRed" is a second bookable offence, i.e. a sending-off, and is
      // FotMob's third card value (6 of 592 cards sampled — about one match
      // in 25). Dropping it didn't just lose the entry: because this list
      // REPLACES the ESPN one, a red card ESPN had reported vanished from the
      // page the moment a FotMob pass landed.
      const type = CARD_TYPES[event.card];
      if (!type) continue;
      out.push({
        minute: eventMinute(event),
        type,
        teamId,
        playerName,
        _sort: eventSortKey(event),
      });
    }
  }

  // Chronological, so the client can render in array order. Unlike ESPN's
  // clock this isn't clamped at the period boundary, but stoppage time still
  // needs its own key: 45+1 and 45+3 share a `time` of 45.
  out.sort((a, b) => a._sort[0] - b._sort[0] || a._sort[1] - b._sort[1]);
  for (const event of out) delete event._sort;
  return out;
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
