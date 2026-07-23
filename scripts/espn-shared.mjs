// Shared ESPN soccer-scoreboard plumbing, used by both ingest-espn-live.mjs
// (today's live scores, 10-min cron) and ingest-espn-schedule.mjs
// (venue/broadcast enrichment for a whole season, run alongside the main
// data refresh). Keyless API (site.api.espn.com), no meaningful rate limit.
//
// ESPN and football-data.org don't share match IDs, so matches are joined by
// normalized team name (folding diacritics, stripping club-suffix words like
// FC/AFC/CF so "AFC Bournemouth" vs "Bournemouth" still match) — see
// findEspnEvent below for the join itself and why it doesn't also require an
// exact calendar-day match. That normalization closes most of the naming
// gap, but a real check against every team in all 9 competitions turned up
// ~50 genuine mismatches beyond what it can fix — football-data uses full
// legal names ("Real Racing Club de Santander", "Sport Lisboa e Benfica"),
// ESPN uses short common ones ("Racing Santander", "Benfica"). ALIASES maps
// football-data's exact name to ESPN's exact displayName for every club that
// needed it; anything still unmatched at runtime is logged, never guessed at.
import { normalizeTeamName } from "./name-match.mjs";

export const ESPN_SLUGS = {
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
export const ALIASES = {
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

export const normalizeName = normalizeTeamName;

// ESPN shortNames that read oddly verbatim — expanded to their real names.
// Falls back to the raw shortName for anything not listed here, so a new/
// unmapped network still renders, just less prettified.
const DISPLAY_NAMES = {
  "USA Net": "USA Network",
  "ESPN Unlmtd": "ESPN Unlimited",
};

export async function fetchScoreboard(slug, dateParam) {
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${dateParam}`,
    { signal: AbortSignal.timeout(15000) },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// One request for a whole competition's season — ESPN's scoreboard endpoint
// accepts a date range plus a limit override (default caps well under a
// season's match count). Confirmed against real data: a single
// fromDate-toDate request with limit=1000 returns all 380 Premier League /
// 189 Champions League matches for a season.
export async function fetchEspnRange(slug, fromDate, toDate) {
  const sb = await fetchScoreboard(slug, `${fromDate}-${toDate}&limit=1000`);
  return sb.events ?? [];
}

function espnName(team) {
  return normalizeName(ALIASES[team] ?? team);
}

// Same join used by both scripts: aliased, normalized (home, away) team
// names. Not a fuzzy matcher — relies on ALIASES for every real naming
// mismatch, logged (never guessed at) when nothing matches.
//
// Matches on the team pair alone, NOT calendar day: football-data.org and
// ESPN sometimes disagree by a day on placeholder dates for fixtures whose
// real kickoff time isn't confirmed yet (confirmed on real data — 9
// Eredivisie matches, same fixtures, football-data.org one day ahead of
// ESPN). Safe to ignore date because every one of our 9 competitions
// guarantees a unique ordered (home, away) pair per season: domestic
// leagues are a double round-robin (each ordered pair plays once), CL's
// Swiss-format league phase pairs each team with a distinct opponent set
// (no repeats), and CL's two-legged knockout ties reverse home/away each
// leg (still a distinct ordered pair). `dateStr` is only used to break a
// tie in the (should-never-happen) case of more than one ESPN event
// sharing the same pair — if that tie can't be broken either, this
// deliberately returns nothing rather than guessing, since a wrong match
// would silently corrupt venue/broadcast data for two different matches.
export function findEspnEvent(events, homeName, awayName, dateStr) {
  const homeNorm = espnName(homeName);
  const awayNorm = espnName(awayName);
  const pairEvents = events.filter((e) => {
    const comps = e.competitions?.[0]?.competitors ?? [];
    const eHome = comps.find((c) => c.homeAway === "home");
    const eAway = comps.find((c) => c.homeAway === "away");
    if (!eHome || !eAway) return false;
    return (
      normalizeName(eHome.team?.displayName ?? "") === homeNorm &&
      normalizeName(eAway.team?.displayName ?? "") === awayNorm
    );
  });
  if (pairEvents.length <= 1) return pairEvents[0];
  return dateStr ? pairEvents.find((e) => e.date?.slice(0, 10) === dateStr) : undefined;
}

// "Stadium, City" — no country, so a domestic league's cards don't repeat
// the same country on every match.
export function extractVenue(event) {
  const venue = event.competitions?.[0]?.venue;
  if (!venue?.fullName) return null;
  const city = venue.address?.city;
  return city ? `${venue.fullName}, ${city}` : venue.fullName;
}

// US TV/streaming rightsholders only (region: "us") — this app has no
// locale switcher, and the reference site's own broadcast treatment is
// US-market. Sparse for fixtures far in the future (ESPN assigns these
// closer to matchday), dense for decided/finished ones.
export function extractBroadcasts(event) {
  const geo = event.competitions?.[0]?.geoBroadcasts ?? [];
  return geo
    .filter((g) => g.region === "us" && g.media?.shortName)
    .map((g) => ({
      name: DISPLAY_NAMES[g.media.shortName] ?? g.media.shortName,
      kind: g.type?.shortName === "STREAMING" ? "streaming" : "tv",
    }));
}
