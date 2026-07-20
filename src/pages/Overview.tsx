import { Link } from "react-router-dom";
import { competitions } from "../data";

export default function Overview() {
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
