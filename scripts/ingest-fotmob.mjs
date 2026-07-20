// Team-level advanced match stats from FotMob's public JSON API — xG, shots,
// possession, duels won, touches in the opposition box (field-tilt proxy),
// passing, defensive actions. football-data.org has none of this; ESPN's
// scoreboard (Phase 3) only carries live status/scores, not box-score stats.
//
// Why FotMob and not FBref (the more obvious source for this class of data)?
// FBref sits behind Cloudflare's managed challenge, which a CI runner on a
// datacenter IP can't reliably pass — world-cup hit this exact wall and
// routed around it via FotMob; same call here, no need to relitigate it.
//
// Scope: TEAM-level stats only, attached to each finished match's
// homeTeam/awayTeam in matches.json. Deliberately NOT player-level stats
// (xG/xA per player, a Stats leaderboard page) — that needs a second name-
// matching layer (FotMob player -> our player, per squad) plus season-long
// accumulation state that can't be meaningfully verified until real matches
// are actually being played (0 finished anywhere as of 2026-07-20). Tracked
// as a follow-up in PLAN.md rather than shipped half-verified.
//
// FotMob and football-data.org don't share match IDs, so matches are joined
// by competition + calendar day + normalized team name, same approach as
// Phase 3's ESPN layer — but FotMob's own naming differs from ESPN's (e.g.
// "Inter" vs ESPN's "Internazionale", "Bayern München" vs ESPN's "Bayern
// Munich"), so this has its own ALIASES table, verified against FotMob's
// live fixture lists for all 9 competitions (2026-07-20).
//
// Incremental by design: only fetches matchDetails for finished matches that
// don't already have `stats` on disk, so a full season's worth of matches
// doesn't mean re-fetching all of them every run. ingest-football-data.mjs
// carries `stats` forward across its own rebuilds so this doesn't get wiped
// by the next football-data.org refresh (same reason world-cup's ingest-espn
// preserves FotMob fields across its rebuilds).
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { COMPETITIONS } from "./competitions.mjs";
import { normalizeTeamName } from "./name-match.mjs";

const DATA_DIR = fileURLToPath(new URL("../src/data/", import.meta.url));
const FOTMOB = "https://www.fotmob.com/api/data";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Referer: "https://www.fotmob.com/",
  Accept: "application/json",
};
const PAUSE_MS = 1500; // be polite between per-match requests, as world-cup does
const FETCH_TIMEOUT_MS = 15000;

const FOTMOB_LEAGUE_IDS = {
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
// regardless of which competition it's playing in.
const ALIASES = {
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
};

async function getJson(url, tries = 3) {
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return [];
  }
}

// Pulls a named "Top stats" entry's [home, away] pair out of FotMob's
// grouped stats blob, coercing to numbers (FotMob mixes plain numbers and
// "239 (76%)"-style strings — take the leading number either way).
function findStat(groups, key) {
  for (const group of groups) {
    const stat = group.stats.find((s) => s.key === key);
    if (stat) return stat.stats;
  }
  return undefined;
}

function toNumber(value) {
  if (value === null || value === undefined) return undefined;
  const match = String(value).match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

// Maps a FotMob matchDetails response to our MatchTeamStats shape for one
// side ("home" | "away").
function extractTeamStats(matchDetails, side) {
  const groups = matchDetails.content?.stats?.Periods?.All?.stats;
  if (!groups) return undefined;
  const idx = side === "home" ? 0 : 1;
  const at = (key) => toNumber(findStat(groups, key)?.[idx]);

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

async function ingestCompetition(code) {
  const leagueId = FOTMOB_LEAGUE_IDS[code];
  const matchesPath = `${DATA_DIR}leagues/${code}/matches.json`;
  const teamsPath = `${DATA_DIR}leagues/${code}/teams.json`;
  const matches = await readJson(matchesPath);
  const teams = await readJson(teamsPath);
  const teamById = new Map(teams.map((t) => [t.id, t]));

  const toFetch = matches.filter((m) => m.status === "finished" && !m.stats);
  if (toFetch.length === 0) {
    console.log(`[${code}] nothing new to fetch (${matches.length} matches, all finished ones already have stats).`);
    return;
  }
  console.log(`[${code}] ${toFetch.length} finished match(es) need FotMob stats...`);

  // Fetch the league's fixture list once per competition (cheap, one call),
  // reused to resolve every match's FotMob id below rather than one league
  // call per match.
  const league = await getJson(`${FOTMOB}/leagues?id=${leagueId}`);
  await sleep(PAUSE_MS);
  const fixtures = league.fixtures?.allMatches ?? [];

  let updated = 0;
  for (const match of toFetch) {
    const home = teamById.get(match.homeTeamId);
    const away = teamById.get(match.awayTeamId);
    if (!home || !away) continue;

    const homeNorm = normalizeTeamName(ALIASES[home.name] ?? home.name);
    const awayNorm = normalizeTeamName(ALIASES[away.name] ?? away.name);
    const dateStr = match.utcDate.slice(0, 10);

    const fixture = fixtures.find(
      (m) =>
        m.status.utcTime.slice(0, 10) === dateStr &&
        normalizeTeamName(m.home.name) === homeNorm &&
        normalizeTeamName(m.away.name) === awayNorm,
    );
    if (!fixture) {
      console.warn(`[${code}] no FotMob match found for ${home.name} vs ${away.name} on ${dateStr}`);
      continue;
    }

    try {
      const details = await getJson(`${FOTMOB}/matchDetails?matchId=${fixture.id}`);
      const homeStats = extractTeamStats(details, "home");
      const awayStats = extractTeamStats(details, "away");
      if (homeStats && awayStats) {
        match.stats = { home: homeStats, away: awayStats };
        updated++;
      }
    } catch (err) {
      console.warn(`[${code}] FotMob matchDetails fetch failed for match ${fixture.id}: ${err.message}`);
    }
    await sleep(PAUSE_MS);
  }

  await writeFile(matchesPath, JSON.stringify(matches, null, 2) + "\n");
  console.log(`[${code}] wrote stats for ${updated}/${toFetch.length} matches.`);
}

// Maintenance mode: `node scripts/ingest-fotmob.mjs --check` verifies every
// team in every competition's teams.json resolves to a FotMob team via
// ALIASES + normalizeTeamName, independent of any match being finished.
async function checkAliases() {
  let unmatchedTotal = 0;
  for (const { code } of COMPETITIONS) {
    const leagueId = FOTMOB_LEAGUE_IDS[code];
    const teams = await readJson(`${DATA_DIR}leagues/${code}/teams.json`);
    const league = await getJson(`${FOTMOB}/leagues?id=${leagueId}`);
    await sleep(PAUSE_MS);
    const fmNames = new Set(
      (league.fixtures?.allMatches ?? []).flatMap((m) => [m.home.name, m.away.name]),
    );
    const fmNorm = new Set([...fmNames].map(normalizeTeamName));
    const unmatched = teams.filter((t) => !fmNorm.has(normalizeTeamName(ALIASES[t.name] ?? t.name)));
    unmatchedTotal += unmatched.length;
    console.log(`[${code}] ${unmatched.length}/${teams.length} unmatched`);
    for (const t of unmatched) console.log(`  ${t.name}`);
  }
  console.log(unmatchedTotal === 0 ? "All teams matched." : `${unmatchedTotal} unmatched total.`);
  if (unmatchedTotal > 0) process.exitCode = 1;
}

async function main() {
  if (process.argv.includes("--check")) return checkAliases();

  for (const { code } of COMPETITIONS) {
    try {
      await ingestCompetition(code);
    } catch (err) {
      console.error(`[${code}] FotMob ingest failed (non-fatal):`, err.message);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
