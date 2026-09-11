import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import { competitionById, competitions } from "../data";
import { CompetitionLogo } from "./CompetitionLogo";

export default function Nav() {
  const { competitionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // Falls back to the first competition in the manifest (currently PL) so the
  // tabs and switcher are always usable, even from the competition-less "/".
  const active = competitionId ?? competitions[0]?.id ?? "PL";
  // The brand icon only shows a competition's crest once a competition is
  // actually in the URL — on "/" itself (no competitionId), it falls back to
  // a neutral soccer ball rather than defaulting to PL's crest.
  const brandCompetition = competitionId ? competitionById(competitionId) : undefined;

  // Below 820px the ten tabs collapse into a hamburger panel (see index.css),
  // mirroring the World Cup dashboard's nav.
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  // Close on navigation. Tapping the tab you're already on doesn't change the
  // path, so the links close the panel themselves too.
  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // The panel is absolutely positioned over the page, so tapping "outside"
    // to dismiss — the usual mobile gesture, and the only one available on a
    // touch device with no Escape key — has to be handled here or the overlay
    // just swallows the tap.
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target instanceof Node) || !navRef.current?.contains(e.target)) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  // Above 820px the toggle is display:none, so an `open` left over from a
  // narrow viewport would strand aria-expanded="true" on a hidden button and
  // re-show the panel, already open, the moment the viewport narrows again.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 820px)");
    const onChange = () => {
      if (!mq.matches) setOpen(false);
    };
    // Safari < 14 exposes only the deprecated addListener/removeListener pair.
    // Nav renders on every route, so an unguarded addEventListener throwing
    // here would take down the whole app shell, not just the menu.
    if (mq.addEventListener) {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  const close = () => setOpen(false);
  const linkClass = ({ isActive }: { isActive: boolean }) => (isActive ? "nav-link active" : "nav-link");

  return (
    <nav className="nav" ref={navRef}>
      <NavLink to="/" end className="brand" onClick={close}>
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
          onChange={(e) => navigate(`/overview/${e.target.value}`)}
          aria-label="Switch competition"
        >
          {competitions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}

      <button
        type="button"
        className="nav-toggle"
        aria-label="Toggle navigation menu"
        aria-expanded={open}
        aria-controls="nav-menu"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "✕" : "☰"}
      </button>

      <div id="nav-menu" className={open ? "nav-links is-open" : "nav-links"}>
        <NavLink to={`/overview/${active}`} className={linkClass} onClick={close}>
          Overview
        </NavLink>
        <NavLink to={`/standings/${active}`} className={linkClass} onClick={close}>
          Standings
        </NavLink>
        <NavLink to={`/matches/${active}`} className={linkClass} onClick={close}>
          Matches
        </NavLink>
        <NavLink to={`/teams/${active}`} className={linkClass} onClick={close}>
          Teams
        </NavLink>
        <NavLink to={`/players/${active}`} className={linkClass} onClick={close}>
          Players
        </NavLink>
        <NavLink to={`/stats/${active}`} className={linkClass} onClick={close}>
          Stats
        </NavLink>
        <NavLink to={`/knockout/${active}`} className={linkClass} onClick={close}>
          Knockout
        </NavLink>
        <NavLink to={`/table-races/${active}`} className={linkClass} onClick={close}>
          Table Races
        </NavLink>
        <NavLink to={`/predictions/${active}`} className={linkClass} onClick={close}>
          Predictions
        </NavLink>
        <NavLink to="/favorites" className={linkClass} onClick={close}>
          ★ Your Teams
        </NavLink>
      </div>
    </nav>
  );
}
