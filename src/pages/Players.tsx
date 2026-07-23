import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { statsForPlayer, teamById } from "../data";
import { useCompetitionPage } from "../data/useCompetitionPage";
import { LeagueStatus } from "../components/LeagueStatus";
import { useSeo } from "../data/seo";
import type { Position } from "../data/types";

type SortKey = "name" | "matchesPlayed" | "goals" | "assists" | "minutes";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "name", label: "Sort: Name" },
  { value: "matchesPlayed", label: "Sort: Apps" },
  { value: "goals", label: "Sort: Goals" },
  { value: "assists", label: "Sort: Assists" },
  { value: "minutes", label: "Sort: Minutes" },
];

const POSITIONS: { value: Position; abbr: string; badgeClass: string }[] = [
  { value: "Goalkeeper", abbr: "GK", badgeClass: "pos-gk" },
  { value: "Defender", abbr: "DEF", badgeClass: "pos-def" },
  { value: "Midfielder", abbr: "MID", badgeClass: "pos-mid" },
  { value: "Forward", abbr: "FWD", badgeClass: "pos-fwd" },
];

export default function Players() {
  const { competitionId } = useParams();
  const { competition, data, error, loading } = useCompetitionPage(competitionId);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [position, setPosition] = useState<Position | "all">("all");
  const [team, setTeam] = useState<string>("all");

  useSeo({
    title: `${competition?.name ?? competitionId ?? "Players"} Players`,
    description: competition ? `Search and browse every player in ${competition.name}.` : undefined,
  });

  // Reset any search/sort/filters left over from a previously-viewed
  // competition — otherwise switching leagues via the Nav dropdown keeps
  // e.g. a team filter whose id doesn't even exist in the new competition,
  // silently showing "no players match".
  useEffect(() => {
    setQuery("");
    setSort("name");
    setPosition("all");
    setTeam("all");
  }, [competitionId]);

  const q = query.trim().toLowerCase();
  const players = data
    ? [...data.players]
        .filter((p) => !q || p.name.toLowerCase().includes(q))
        .filter((p) => position === "all" || p.position === position)
        .filter((p) => team === "all" || p.teamId === team)
        .sort((a, b) => {
          if (sort === "name") return a.name.localeCompare(b.name);
          const statA = statsForPlayer(data, a.id)?.[sort] ?? 0;
          const statB = statsForPlayer(data, b.id)?.[sort] ?? 0;
          return statB - statA;
        })
    : [];

  const teams = data ? [...data.teams].sort((a, b) => a.name.localeCompare(b.name)) : [];

  function SortableHeader({ sortKey, label, numeric = true }: { sortKey: SortKey; label: string; numeric?: boolean }) {
    const active = sort === sortKey;
    // Name sorts A→Z (ascending); every stat column sorts highest-first
    // (descending) — see the comparator above.
    const direction = sortKey === "name" ? "ascending" : "descending";
    return (
      <th className={numeric ? "num" : undefined} aria-sort={active ? direction : "none"}>
        <button type="button" className={"sortable-header" + (active ? " sortable-active" : "")} onClick={() => setSort(sortKey)}>
          {label}
          {active ? " ▼" : ""}
        </button>
      </th>
    );
  }

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
        <>
          <div className="filter-chips">
            <button
              type="button"
              className={"tier-tab" + (position === "all" ? " active" : "")}
              onClick={() => setPosition("all")}
            >
              All positions
            </button>
            {POSITIONS.map((p) => (
              <button
                key={p.value}
                type="button"
                className={"tier-tab" + (position === p.value ? " active" : "")}
                onClick={() => setPosition(p.value)}
              >
                {p.abbr}
              </button>
            ))}
          </div>

          <div className="search-bar">
            <input
              className="search-input"
              type="search"
              placeholder="Search players…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search players"
            />
            <select className="sort-select" value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Filter by team">
              <option value="all">All teams</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select className="sort-select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort by">
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {data && players.length === 0 && (
        <p>{data.players.length === 0 ? "No player data yet — run `npm run ingest`." : "No players match your filters."}</p>
      )}

      {players.length > 0 && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <SortableHeader sortKey="name" label="Name" numeric={false} />
                <th>Team</th>
                <th>Position</th>
                <th>Nationality</th>
                <SortableHeader sortKey="matchesPlayed" label="Apps" />
                <SortableHeader sortKey="goals" label="Goals" />
                <SortableHeader sortKey="assists" label="Assists" />
                <SortableHeader sortKey="minutes" label="Min" />
              </tr>
            </thead>
            <tbody>
              {players.map((p) => {
                const team = teamById(data!, p.teamId);
                const stats = statsForPlayer(data!, p.id);
                const posInfo = p.position ? POSITIONS.find((x) => x.value === p.position) : undefined;
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
                    <td>
                      {posInfo ? <span className={"position-badge " + posInfo.badgeClass}>{posInfo.abbr}</span> : "—"}
                    </td>
                    <td>{p.nationality}</td>
                    <td className="num">{stats?.matchesPlayed ?? "—"}</td>
                    <td className="num">{stats?.goals ?? "—"}</td>
                    <td className="num">{stats?.assists ?? "—"}</td>
                    <td className="num">{stats?.minutes ?? "—"}</td>
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
