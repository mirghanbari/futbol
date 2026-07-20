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
import Players from "./pages/Players";
import PlayerDetail from "./pages/PlayerDetail";
import Stats from "./pages/Stats";
import Knockout from "./pages/Knockout";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename="/futbol">
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Overview />} />
          <Route path="standings/:competitionId" element={<Standings />} />
          <Route path="matches/:competitionId" element={<Matches />} />
          <Route path="matches/:competitionId/:matchId" element={<MatchDetail />} />
          <Route path="teams/:competitionId" element={<Teams />} />
          <Route path="teams/:competitionId/:teamId" element={<TeamDetail />} />
          <Route path="players/:competitionId" element={<Players />} />
          <Route path="players/:competitionId/:playerId" element={<PlayerDetail />} />
          <Route path="stats/:competitionId" element={<Stats />} />
          <Route path="knockout/:competitionId" element={<Knockout />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
