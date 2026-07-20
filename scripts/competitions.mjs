// Canonical list of the 9 competitions this project tracks, keyed by their
// football-data.org competition code. Shared source of truth for the ingest
// scripts; src/data/competitions.ts mirrors this for the app (kept in sync by
// hand — small, stable list, not worth a build-time codegen step for 9 rows).
export const COMPETITIONS = [
  { code: "PL", name: "Premier League", country: "England", tier: 1 },
  { code: "ELC", name: "Championship", country: "England", tier: 2 },
  { code: "PD", name: "La Liga", country: "Spain", tier: 1 },
  { code: "BL1", name: "Bundesliga", country: "Germany", tier: 1 },
  { code: "SA", name: "Serie A", country: "Italy", tier: 1 },
  { code: "FL1", name: "Ligue 1", country: "France", tier: 1 },
  { code: "DED", name: "Eredivisie", country: "Netherlands", tier: 1 },
  { code: "PPL", name: "Primeira Liga", country: "Portugal", tier: 1 },
  { code: "CL", name: "UEFA Champions League", country: "Europe", tier: 0 },
];
