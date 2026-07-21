// Table-race zone bands per domestic league: standings-position ranges that
// map to a real-world consequence (Champions League qualification, relegation,
// etc). Standard/baseline allocations for the 2026-27 season — the exact
// Europa/Conference split can shift by one team depending on the FA/Copa del
// Rey/Coppa Italia/DFB-Pokal winner's own league finish and UEFA's
// coefficient-based association ranking (finalized each May), which this app
// doesn't model. Treated as a simplification, not an official rules feed —
// see the note rendered on the Table Races page.
//
// Champions League itself has no zones here: its 36-team league phase has its
// own top-8/playoff/eliminated bands, tracked as a separate open item, not
// part of this domestic-league race feature.
export interface Zone {
  id: string;
  label: string;
  className: string; // maps to a CSS row-highlight class
  from: number; // inclusive standings position
  to: number; // inclusive standings position
}

export const ZONES: Record<string, Zone[]> = {
  PL: [
    { id: "cl", label: "Champions League", className: "zone-cl", from: 1, to: 4 },
    { id: "europa", label: "Europa / Conference League", className: "zone-europa", from: 5, to: 6 },
    { id: "relegation", label: "Relegation", className: "zone-releg", from: 18, to: 20 },
  ],
  ELC: [
    { id: "promotion", label: "Automatic promotion", className: "zone-cl", from: 1, to: 2 },
    { id: "playoff", label: "Promotion playoff", className: "zone-europa", from: 3, to: 6 },
    { id: "relegation", label: "Relegation", className: "zone-releg", from: 22, to: 24 },
  ],
  PD: [
    { id: "cl", label: "Champions League", className: "zone-cl", from: 1, to: 4 },
    { id: "europa", label: "Europa / Conference League", className: "zone-europa", from: 5, to: 6 },
    { id: "relegation", label: "Relegation", className: "zone-releg", from: 18, to: 20 },
  ],
  BL1: [
    { id: "cl", label: "Champions League", className: "zone-cl", from: 1, to: 4 },
    { id: "europa", label: "Europa / Conference League", className: "zone-europa", from: 5, to: 6 },
    { id: "relegation-playoff", label: "Relegation playoff", className: "zone-releg-playoff", from: 16, to: 16 },
    { id: "relegation", label: "Relegation", className: "zone-releg", from: 17, to: 18 },
  ],
  SA: [
    { id: "cl", label: "Champions League", className: "zone-cl", from: 1, to: 4 },
    { id: "europa", label: "Europa / Conference League", className: "zone-europa", from: 5, to: 6 },
    { id: "relegation", label: "Relegation", className: "zone-releg", from: 18, to: 20 },
  ],
  FL1: [
    { id: "cl", label: "Champions League", className: "zone-cl", from: 1, to: 3 },
    { id: "europa", label: "Europa / Conference League", className: "zone-europa", from: 4, to: 5 },
    { id: "relegation-playoff", label: "Relegation playoff", className: "zone-releg-playoff", from: 16, to: 16 },
    { id: "relegation", label: "Relegation", className: "zone-releg", from: 17, to: 18 },
  ],
  DED: [
    { id: "cl", label: "Champions League", className: "zone-cl", from: 1, to: 1 },
    { id: "europa", label: "European qualification", className: "zone-europa", from: 2, to: 6 },
    { id: "relegation-playoff", label: "Relegation playoff", className: "zone-releg-playoff", from: 16, to: 17 },
    { id: "relegation", label: "Relegation", className: "zone-releg", from: 18, to: 18 },
  ],
  PPL: [
    { id: "cl", label: "Champions League", className: "zone-cl", from: 1, to: 2 },
    { id: "europa", label: "Europa / Conference League", className: "zone-europa", from: 3, to: 5 },
    { id: "relegation", label: "Relegation", className: "zone-releg", from: 17, to: 18 },
  ],
};

export function zonesFor(competitionId: string): Zone[] {
  return ZONES[competitionId] ?? [];
}

export function zoneAtPosition(competitionId: string, position: number): Zone | undefined {
  return zonesFor(competitionId).find((z) => position >= z.from && position <= z.to);
}

// Champions League's own 36-team league-phase bands — a separate concept
// from the domestic ZONES above (CL never appears in that record; see the
// module comment). Static position bands only, no clinch/elimination magic-
// number math like Table Races does for domestic leagues: the league phase
// is just 8 matchdays, over before the games-remaining math would meaningfully
// differ from the final table — not worth a second engine for that.
export const CL_LEAGUE_PHASE_ZONES: Zone[] = [
  { id: "r16", label: "Round of 16 (direct)", className: "zone-cl", from: 1, to: 8 },
  { id: "playoff", label: "Knockout playoff", className: "zone-europa", from: 9, to: 24 },
  { id: "eliminated", label: "Eliminated", className: "zone-releg", from: 25, to: 36 },
];

export function clZoneAtPosition(position: number): Zone | undefined {
  return CL_LEAGUE_PHASE_ZONES.find((z) => position >= z.from && position <= z.to);
}
