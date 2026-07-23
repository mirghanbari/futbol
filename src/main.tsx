import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import Overview from "./pages/Overview";
import LeagueOverview from "./pages/LeagueOverview";
import Standings from "./pages/Standings";
import Matches from "./pages/Matches";
import MatchDetail from "./pages/MatchDetail";
import Teams from "./pages/Teams";
import TeamDetail from "./pages/TeamDetail";
import Players from "./pages/Players";
import PlayerDetail from "./pages/PlayerDetail";
import Stats from "./pages/Stats";
import Knockout from "./pages/Knockout";
import TableRaces from "./pages/TableRaces";
import Predictions from "./pages/Predictions";
import Favorites from "./pages/Favorites";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename="/futbol">
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Overview />} />
          <Route path="overview/:competitionId" element={<LeagueOverview />} />
          <Route path="standings/:competitionId" element={<Standings />} />
          <Route path="matches/:competitionId" element={<Matches />} />
          <Route path="matches/:competitionId/:matchId" element={<MatchDetail />} />
          <Route path="teams/:competitionId" element={<Teams />} />
          <Route path="teams/:competitionId/:teamId" element={<TeamDetail />} />
          <Route path="players/:competitionId" element={<Players />} />
          <Route path="players/:competitionId/:playerId" element={<PlayerDetail />} />
          <Route path="stats/:competitionId" element={<Stats />} />
          <Route path="knockout/:competitionId" element={<Knockout />} />
          <Route path="table-races/:competitionId" element={<TableRaces />} />
          <Route path="predictions/:competitionId" element={<Predictions />} />
          <Route path="favorites" element={<Favorites />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
