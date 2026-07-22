import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { statsForPlayer, teamById } from "../data";
import { useCompetitionPage } from "../data/useCompetitionPage";
import { LeagueStatus } from "../components/LeagueStatus";
import { useSeo } from "../data/seo";

type SortKey = "name" | "goals" | "assists" | "minutes";

export default function Players() {
  const { competitionId } = useParams();
  const { competition, data, error, loading } = useCompetitionPage(competitionId);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name");

  useSeo({
    title: `${competition?.name ?? competitionId ?? "Players"} Players`,
    description: competition ? `Search and browse every player in ${competition.name}.` : undefined,
  });

  // Reset any search/sort left over from a previously-viewed competition —
  // otherwise switching leagues via the Nav dropdown keeps the old query
  // and can misreport a perfectly good new competition as "no players match".
  useEffect(() => {
    setQuery("");
    setSort("name");
  }, [competitionId]);

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

      <LeagueStatus error={error} loading={loading} />

      {data?.isFallbackStats && (
        <p className="season-banner">
          Showing the {data.statsSeason ?? "last"}–{data.statsSeason ? Number(data.statsSeason) + 1 : ""}{" "}
          season — {competition?.name ?? "this competition"}'s current season hasn't kicked off yet.
        </p>
      )}

      {data && (
        <div className="search-bar">
          <input
            className="search-input"
            type="search"
            placeholder="Search players…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search players"
          />
          <select className="sort-select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort by">
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
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Team</th>
                <th>Position</th>
                <th>Nationality</th>
                <th className="num">Apps</th>
                <th className="num">Goals</th>
                <th className="num">Assists</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => {
                const team = teamById(data!, p.teamId);
                const stats = statsForPlayer(data!, p.id);
                return (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/players/${competitionId}/${p.id}`} style={{ fontWeight: 700, textDecoration: "none" }}>
                        {p.name}
                      </Link>
                    </td>
                    <td>
                      <Link
                        to={`/teams/${competitionId}/${p.teamId}`}
                        style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", color: "inherit", textDecoration: "none" }}
                      >
                        {team?.crest && <img className="crest" src={team.crest} alt="" style={{ width: 18, height: 18 }} />}
                        {team?.shortName ?? p.teamId}
                      </Link>
                    </td>
                    <td>{p.position ?? "—"}</td>
                    <td>{p.nationality}</td>
                    <td className="num">{stats?.matchesPlayed ?? "—"}</td>
                    <td className="num">{stats?.goals ?? "—"}</td>
                    <td className="num">{stats?.assists ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
