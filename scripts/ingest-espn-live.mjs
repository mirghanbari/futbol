// Fast, keyless live-score layer: cross-references each competition's ESPN
// scoreboard (today, UTC) against the football-data.org-sourced matches.json
// already on disk, and writes a slim public/live.json — {competitionId:
// {matchId: {status, minute, homeGoals, awayGoals}}} — for today's matches
// only. Client-side polling (src/data/live.ts) overlays this onto the static
// match data so scores update without a full data rebuild.
//
// ESPN and football-data.org don't share match IDs, so matches are joined by
// competition + calendar day + normalized team name (folding diacritics,
// stripping club-suffix words like FC/AFC/CF so "AFC Bournemouth" vs
// "Bournemouth" still match). That closes most of the gap, but a real check
// against every team in all 9 competitions (see ALIASES below) turned up ~50
// genuine naming mismatches beyond what normalization can fix — football-data
// uses full legal names ("Real Racing Club de Santander", "Sport Lisboa e
// Benfica"), ESPN uses short common ones ("Racing Santander", "Benfica").
// ALIASES maps football-data's exact name to ESPN's exact displayName for
// every club that needed it; anything still unmatched at runtime is logged,
// never guessed at.
//
// Deliberately NOT the full ESPN ingest world-cup uses (teams/rosters/full
// fixture list) — football-data.org already owns that here. This script only
// ever adds live status on top.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { COMPETITIONS } from "./competitions.mjs";

const DATA_DIR = fileURLToPath(new URL("../src/data/", import.meta.url));
const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));

const ESPN_SLUGS = {
  PL: "eng.1",
  ELC: "eng.2",
  PD: "esp.1",
  BL1: "ger.1",
  SA: "ita.1",
  FL1: "fra.1",
  DED: "ned.1",
  PPL: "por.1",
  CL: "uefa.champions",
};

// football-data.org name -> ESPN displayName, for clubs normalization alone
// can't bridge. Global (not per-competition) since the same club's
// football-data name is identical whether it's playing in its domestic
// league or the Champions League. Verified against ESPN's live team lists
// for all 9 competitions (2026-07-20).
const ALIASES = {
  // Bundesliga
  "FC Bayern München": "Bayern Munich",
  "1. FSV Mainz 05": "Mainz",
  "SV 07 Elversberg": "SV Elversberg",
  "Bayer 04 Leverkusen": "Bayer Leverkusen",
  "1. FC Köln": "FC Cologne",
  "TSG 1899 Hoffenheim": "TSG Hoffenheim",
  "Hamburger SV": "Hamburg SV",
  // La Liga
  "Real Racing Club de Santander": "Racing Santander",
  "RCD Espanyol de Barcelona": "Espanyol",
  "Rayo Vallecano de Madrid": "Rayo Vallecano",
  "Deportivo Alavés": "Alavés",
  "CA Osasuna": "Osasuna",
  "Real Betis Balompié": "Real Betis",
  // Serie A
  "Como 1907": "Como",
  "FC Internazionale Milano": "Internazionale",
  "Genoa CFC": "Genoa",
  "Parma Calcio 1913": "Parma",
  "US Lecce": "Lecce",
  "Atalanta BC": "Atalanta",
  "US Sassuolo Calcio": "Sassuolo",
  "Bologna FC 1909": "Bologna",
  "ACF Fiorentina": "Fiorentina",
  // Ligue 1
  "Angers SCO": "Angers",
  "ES Troyes AC": "Troyes",
  "Lille OSC": "Lille",
  "OGC Nice": "Nice",
  "Olympique Lyonnais": "Lyon",
  "Olympique de Marseille": "Marseille",
  "RC Strasbourg Alsace": "Strasbourg",
  "Racing Club de Lens": "Lens",
  "Stade Brestois 29": "Brest",
  "Stade Rennais FC 1901": "Stade Rennais",
  // Eredivisie
  "AFC Ajax": "Ajax Amsterdam",
  "AZ": "AZ Alkmaar",
  "FC Twente '65": "FC Twente",
  "NEC": "NEC Nijmegen",
  "PSV": "PSV Eindhoven",
  "SBV Excelsior": "Excelsior",
  "SC Cambuur-Leeuwarden": "SC Cambuur",
  "Telstar 1963": "Telstar",
  "Willem II Tilburg": "Willem II",
  // Primeira Liga
  "CD Nacional": "C.D. Nacional",
  "Vitória SC": "Vitória de Guimaraes",
  "Sporting Clube de Braga": "Braga",
  "CF Estrela da Amadora": "Estrela",
  "Sporting Clube de Portugal": "Sporting CP",
  "Sport Lisboa e Benfica": "Benfica",
  "CS Marítimo": "Maritimo",
  "GD Estoril Praia": "Estoril",
  // Champions League only (clubs outside our 8 domestic leagues)
  "PAE Olympiakos SFP": "Olympiacos",
  "Club Brugge KV": "Club Brugge",
  "Galatasaray SK": "Galatasaray",
  "Qarabağ Ağdam FK": "FK Qarabag",
  "FK Bodø/Glimt": "Bodo/Glimt",
  "Paphos FC": "Pafos",
  "Royale Union Saint-Gilloise": "Union St.-Gilloise",
  "FC København": "F.C. København",
  "SK Slavia Praha": "Slavia Prague",
  "FK Kairat": "Kairat Almaty",
};

const STRIP_WORDS = new Set([
  "fc", "afc", "cf", "cd", "sc", "ac", "as", "ss", "ssc", "ud", "rc", "sv",
  "vfl", "vfb", "tsg", "sd", "calcio", "club", "de", "futbol",
]);

function normalizeName(name) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // fold diacritics: münchen -> munchen
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word && !STRIP_WORDS.has(word))
    .join(" ")
    .trim();
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

async function fetchScoreboard(slug) {
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${todayUTC()}`,
    { signal: AbortSignal.timeout(15000) },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function toStatus(type) {
  if (type.name === "STATUS_HALFTIME") return "paused";
  if (type.name === "STATUS_POSTPONED") return "postponed";
  if (type.name === "STATUS_CANCELED" || type.name === "STATUS_ABANDONED") return "cancelled";
  if (type.state === "in") return "in-play";
  if (type.state === "post") return "finished";
  return "scheduled";
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return [];
  }
}

async function ingestLiveForCompetition(code) {
  const slug = ESPN_SLUGS[code];
  const matches = await readJson(`${DATA_DIR}leagues/${code}/matches.json`);
  const teams = await readJson(`${DATA_DIR}leagues/${code}/teams.json`);
  const teamById = new Map(teams.map((t) => [t.id, t]));

  const today = new Date().toISOString().slice(0, 10);
  const todaysMatches = matches.filter((m) => m.utcDate.slice(0, 10) === today);
  if (todaysMatches.length === 0) return {};

  let events;
  try {
    const sb = await fetchScoreboard(slug);
    events = sb.events ?? [];
  } catch (err) {
    console.warn(`[${code}] ESPN scoreboard fetch failed: ${err.message}`);
    return {};
  }

  const live = {};
  for (const match of todaysMatches) {
    const home = teamById.get(match.homeTeamId);
    const away = teamById.get(match.awayTeamId);
    if (!home || !away) continue;
    const homeNorm = normalizeName(ALIASES[home.name] ?? home.name);
    const awayNorm = normalizeName(ALIASES[away.name] ?? away.name);

    const event = events.find((e) => {
      const comps = e.competitions?.[0]?.competitors ?? [];
      const eHome = comps.find((c) => c.homeAway === "home");
      const eAway = comps.find((c) => c.homeAway === "away");
      if (!eHome || !eAway) return false;
      return (
        normalizeName(eHome.team?.displayName ?? "") === homeNorm &&
        normalizeName(eAway.team?.displayName ?? "") === awayNorm
      );
    });

    if (!event) {
      console.warn(`[${code}] no ESPN match found for ${home.name} vs ${away.name} today`);
      continue;
    }

    const comps = event.competitions[0].competitors;
    const eHome = comps.find((c) => c.homeAway === "home");
    const eAway = comps.find((c) => c.homeAway === "away");
    live[match.id] = {
      status: toStatus(event.status.type),
      minute: event.status.type.state === "in" ? (event.status.displayClock ?? null) : null,
      homeGoals: Number(eHome.score ?? 0),
      awayGoals: Number(eAway.score ?? 0),
    };
  }

  return live;
}

// Maintenance mode: `node scripts/ingest-espn-live.mjs --check` verifies
// every team in every competition's teams.json resolves to an ESPN team via
// ALIASES + normalizeName, independent of whether anything's playing today.
// Re-run this each preseason (promotions/relegations rotate the team lists)
// or whenever a competition starts throwing "no ESPN match found" warnings.
async function checkAliases() {
  let unmatchedTotal = 0;
  for (const { code } of COMPETITIONS) {
    const slug = ESPN_SLUGS[code];
    const teams = await readJson(`${DATA_DIR}leagues/${code}/teams.json`);
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/teams?limit=50`,
      { signal: AbortSignal.timeout(15000) },
    );
    const json = await res.json();
    const espnNames = (json.sports?.[0]?.leagues?.[0]?.teams ?? []).map(
      (t) => t.team.displayName,
    );
    const espnNorm = new Set(espnNames.map(normalizeName));
    const unmatched = teams.filter(
      (t) => !espnNorm.has(normalizeName(ALIASES[t.name] ?? t.name)),
    );
    unmatchedTotal += unmatched.length;
    console.log(`[${code}] ${unmatched.length}/${teams.length} unmatched`);
    for (const t of unmatched) console.log(`  ${t.name}`);
  }
  console.log(unmatchedTotal === 0 ? "All teams matched." : `${unmatchedTotal} unmatched total.`);
  if (unmatchedTotal > 0) process.exitCode = 1;
}

async function main() {
  if (process.argv.includes("--check")) return checkAliases();

  const live = {};
  for (const { code } of COMPETITIONS) {
    live[code] = await ingestLiveForCompetition(code);
  }
  await writeFile(`${PUBLIC_DIR}live.json`, JSON.stringify(live));
  const total = Object.values(live).reduce((sum, m) => sum + Object.keys(m).length, 0);
  console.log(`Wrote public/live.json (${total} live-tracked matches today).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
