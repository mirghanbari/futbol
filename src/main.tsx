import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import Overview from "./pages/Overview";
import Standings from "./pages/Standings";
import Matches from "./pages/Matches";
import MatchDetail from "./pages/MatchDetail";
import Teams from "./pages/Teams";
import TeamDetail from "./pages/TeamDetail";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename="/futbol">
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Overview />} />
          <Route path="standings" element={<Standings />} />
          <Route path="matches" element={<Matches />} />
          <Route path="matches/:matchId" element={<MatchDetail />} />
          <Route path="teams" element={<Teams />} />
          <Route path="teams/:teamId" element={<TeamDetail />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
