import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { competitionById, statsForPlayer, teamById } from "../data";
import { useLeague } from "../data/useLeague";

type SortKey = "name" | "goals" | "assists" | "minutes";

export default function Players() {
  const { competitionId } = useParams();
  const competition = competitionId ? competitionById(competitionId) : undefined;
  const { data, error, loading } = useLeague(competitionId);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name");

  const q = query.trim().toLowerCase();
  const players = data
    ? [...data.players]
        .filter((p) => !q || p.name.toLowerCase().includes(q))
        .sort((a, b) => {
          if (sort === "name") return a.name.localeCompare(b.name);
          const statA = statsForPlayer(data, a.id)?.[sort] ?? 0;
          const statB = statsForPlayer(data, b.id)?.[sort] ?? 0;
          return statB - statA;
        })
    : [];

  return (
    <div>
      <h1>{competition?.name ?? competitionId} players</h1>

      {error && <p>Couldn't load this competition: {error.message}</p>}
      {loading && !error && <p>Loading…</p>}

      {data?.isFallbackStats && (
        <p className="season-banner">
          Showing the {data.statsSeason ?? "last"}–{data.statsSeason ? Number(data.statsSeason) + 1 : ""}{" "}
          season — {competition?.name ?? "this competition"}'s current season hasn't kicked off yet.
        </p>
      )}

      {data && (
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", margin: "0.5rem 0 1rem" }}>
          <input
            type="search"
            placeholder="Search players…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search players"
            style={{ padding: "0.4rem 0.6rem", width: "100%", maxWidth: 320 }}
          />
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort by">
            <option value="name">Sort: Name</option>
            <option value="goals">Sort: Goals</option>
            <option value="assists">Sort: Assists</option>
            <option value="minutes">Sort: Minutes</option>
          </select>
        </div>
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
              <th>Apps</th>
              <th>Goals</th>
              <th>Assists</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const team = teamById(data!, p.teamId);
              const stats = statsForPlayer(data!, p.id);
              return (
                <tr key={p.id}>
                  <td>
                    <Link to={`/players/${competitionId}/${p.id}`}>{p.name}</Link>
                  </td>
                  <td>{team?.shortName ?? p.teamId}</td>
                  <td>{p.position ?? "—"}</td>
                  <td>{p.nationality}</td>
                  <td>{stats?.matchesPlayed ?? "—"}</td>
                  <td>{stats?.goals ?? "—"}</td>
                  <td>{stats?.assists ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
