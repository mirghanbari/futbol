import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Nav from "./components/Nav";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <div className="app">
      <ScrollToTop />
      <Nav />
      <main className="container">
        <Outlet />
      </main>
      <footer className="footer">
        Data: football-data.org · Built with React + Vite
      </footer>
    </div>
  );
}
