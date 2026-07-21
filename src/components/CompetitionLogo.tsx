import { useState } from "react";
import type { Competition } from "../data/types";

// football-data.org's crest CDN doesn't have every competition's emblem
// (Eredivisie 404s as of this writing) — falls back to a two-letter
// monogram instead of a broken image rather than special-casing which
// competitions have one.
export function CompetitionLogo({
  competition,
  className = "",
}: {
  competition: Competition;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const monogram = competition.name.slice(0, 2).toUpperCase();
  const noCrest = failed || !competition.logo;

  return (
    <span className={"league-logo" + (noCrest ? " no-crest" : "") + (className ? " " + className : "")}>
      {competition.logo && (
        <img
          key={competition.id}
          src={competition.logo}
          alt=""
          onError={() => setFailed(true)}
          onLoad={() => setFailed(false)}
        />
      )}
      <span className="league-logo-fallback">{monogram}</span>
    </span>
  );
}
