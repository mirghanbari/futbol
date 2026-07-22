import { NavLink, useNavigate, useParams } from "react-router-dom";
import { competitionById, competitions } from "../data";
import { CompetitionLogo } from "./CompetitionLogo";

export default function Nav() {
  const { competitionId } = useParams();
  const navigate = useNavigate();
  // Falls back to the first competition in the manifest (currently PL) so the
  // tabs and switcher are always usable, even from the competition-less "/".
  const active = competitionId ?? competitions[0]?.id ?? "PL";
  // The brand icon only shows a competition's crest once a competition is
  // actually in the URL — on "/" itself (no competitionId), it falls back to
  // a neutral soccer ball rather than defaulting to PL's crest.
  const brandCompetition = competitionId ? competitionById(competitionId) : undefined;

  return (
    <nav className="nav">
      <NavLink to="/" end className="brand">
        {brandCompetition ? (
          <CompetitionLogo competition={brandCompetition} />
        ) : (
          <span className="league-logo brand-ball" aria-hidden="true">
            ⚽
          </span>
        )}
        Futbol
      </NavLink>

      {competitions.length > 0 && (
        <select
          className="competition-select"
          value={active}
          onChange={(e) => navigate(`/standings/${e.target.value}`)}
          aria-label="Switch competition"
        >
          {competitions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}

      <div className="nav-links">
        <NavLink
          to={`/standings/${active}`}
          className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
        >
          Standings
        </NavLink>
        <NavLink
          to={`/matches/${active}`}
          className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
        >
          Matches
        </NavLink>
        <NavLink
          to={`/teams/${active}`}
          className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
        >
          Teams
        </NavLink>
        <NavLink
          to={`/players/${active}`}
          className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
        >
          Players
        </NavLink>
        <NavLink
          to={`/stats/${active}`}
          className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
        >
          Stats
        </NavLink>
        <NavLink
          to={`/knockout/${active}`}
          className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
        >
          Knockout
        </NavLink>
        <NavLink
          to={`/table-races/${active}`}
          className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
        >
          Table Races
        </NavLink>
        <NavLink to="/favorites" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          ★ Your Teams
        </NavLink>
      </div>
    </nav>
  );
}
