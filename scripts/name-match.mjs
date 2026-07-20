// Shared team-name normalization for joining football-data.org records
// (canonical, full legal names) against other providers (ESPN, FotMob — both
// use short common names). Not a general fuzzy matcher: normalization alone
// closes some of the gap, but real naming differences ("Real Racing Club de
// Santander" vs "Racing Santander") need an explicit alias table per
// provider — see ALIASES in ingest-espn-live.mjs and ingest-fotmob.mjs.
const STRIP_WORDS = new Set([
  "fc", "afc", "cf", "cd", "sc", "ac", "as", "ss", "ssc", "ud", "rc", "sv",
  "vfl", "vfb", "tsg", "sd", "calcio", "club", "de", "futbol",
]);

export function normalizeTeamName(name) {
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

// For person names: no club-suffix stripping, just diacritic folding + case.
export function normalizePersonName(name) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ")
    .trim();
}
