import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "Overview", end: true },
  { to: "/standings", label: "Standings" },
  { to: "/matches", label: "Matches" },
  { to: "/teams", label: "Teams" },
];

export default function Nav() {
  return (
    <nav className="nav">
      <span className="brand">⚽ Futbol</span>
      <div className="nav-links">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
          >
            {link.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
