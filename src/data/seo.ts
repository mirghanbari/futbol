import { useEffect } from "react";
import { useLocation } from "react-router-dom";

interface SeoOptions {
  title: string;
  description?: string;
  jsonLd?: Record<string, unknown>;
  // Overview's title IS the site name — everything else gets " · Futbol"
  // appended so browser tabs/search results read e.g. "Premier League
  // Standings · Futbol" rather than a bare page name.
  suffixSiteName?: boolean;
}

const JSON_LD_ID = "route-json-ld";

// Matches index.html's static default — used whenever a page doesn't supply
// its own description, so a previous route's description can never linger.
const DEFAULT_DESCRIPTION =
  "Standings, matches, teams, players and stats for Europe's top 8 leagues and the UEFA Champions League.";

// Per-route <title>/<meta description>/JSON-LD for this client-only SPA (no
// SSR) — index.html only carries static site-wide defaults. Google and Bing
// both execute JS before indexing, so updating these client-side is enough
// at this site's scale; no server-rendering investment needed.
export function useSeo({ title, description, jsonLd, suffixSiteName = true }: SeoOptions): void {
  const jsonLdStr = jsonLd ? JSON.stringify(jsonLd) : undefined;
  // Tracked explicitly (not just inferred from title/description changing)
  // so the effect — and the GA4 pageview below — fires on every navigation,
  // even the rare case where two different routes compute identical title/
  // description/jsonLd (e.g. two not-yet-loaded MatchDetail pages both
  // showing the generic "Match" placeholder).
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = suffixSiteName ? `${title} · Futbol` : title;

    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = description ?? DEFAULT_DESCRIPTION;

    let script = document.getElementById(JSON_LD_ID) as HTMLScriptElement | null;
    if (jsonLdStr) {
      if (!script) {
        script = document.createElement("script");
        script.id = JSON_LD_ID;
        script.type = "application/ld+json";
        document.head.appendChild(script);
      }
      script.textContent = jsonLdStr;
    } else if (script) {
      script.remove();
    }

    // Manual GA4 pageview — see the send_page_view:false note in index.html.
    // Production only, so dev/localhost sessions never get counted.
    if (import.meta.env.PROD && window.gtag) {
      window.gtag("event", "page_view", {
        page_title: document.title,
        page_location: window.location.href,
        page_path: window.location.pathname,
      });
    }
  }, [title, description, jsonLdStr, suffixSiteName, pathname]);
}
