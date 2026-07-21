import { Link } from "react-router-dom";
import { competitions } from "../data";
import { useSeo } from "../data/seo";

export default function Overview() {
  useSeo({
    title: "Futbol — Europe's Top Leagues Dashboard",
    suffixSiteName: false,
    description: "Standings, matches, teams, players and stats for Europe's top 8 leagues and the UEFA Champions League.",
    // No jsonLd here — index.html already hard-codes this exact WebSite
    // schema statically (so it's present even without JS), and useSeo only
    // manages its own id-tagged script tag, so this would just duplicate it.
  });

  return (
    <div>
      <h1>Futbol</h1>
      <p>Europe's top 8 leagues, plus the UEFA Champions League.</p>

      {competitions.length === 0 && (
        <p>No competition data yet — run `npm run ingest`.</p>
      )}

      <div className="team-grid">
        {competitions.map((c) => (
          <Link className="team-card" to={`/standings/${c.id}`} key={c.id}>
            <strong>{c.name}</strong>
            <br />
            <span style={{ opacity: 0.7 }}>
              {c.country}
              {c.season ? ` · ${c.season}` : ""}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
