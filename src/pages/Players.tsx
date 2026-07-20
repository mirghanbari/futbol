import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { competitionById, teamById } from "../data";
import { useLeague } from "../data/useLeague";

export default function Players() {
  const { competitionId } = useParams();
  const competition = competitionId ? competitionById(competitionId) : undefined;
  const { data, error, loading } = useLeague(competitionId);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const players = data
    ? [...data.players]
        .filter((p) => !q || p.name.toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  return (
    <div>
      <h1>{competition?.name ?? competitionId} players</h1>

      {error && <p>Couldn't load this competition: {error.message}</p>}
      {loading && !error && <p>Loading…</p>}

      {data && (
        <input
          type="search"
          placeholder="Search players…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search players"
          style={{ margin: "0.5rem 0 1rem", padding: "0.4rem 0.6rem", width: "100%", maxWidth: 320 }}
        />
      )}

      {data && players.length === 0 && (
        <p>{data.players.length === 0 ? "No player data yet — run `npm run ingest`." : "No players match your search."}</p>
      )}

      {players.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Team</th>
              <th>Position</th>
              <th>Nationality</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const team = teamById(data!, p.teamId);
              return (
                <tr key={p.id}>
                  <td>
                    <Link to={`/players/${competitionId}/${p.id}`}>{p.name}</Link>
                  </td>
                  <td>{team?.shortName ?? p.teamId}</td>
                  <td>{p.position ?? "—"}</td>
                  <td>{p.nationality}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
