// Shared "couldn't load" / "loading" copy for :competitionId pages — was
// copy-pasted verbatim across ~9 pages and had already drifted once
// (Favorites.tsx's card used shorter wording). Drop-in for both the
// inline-render pattern (rendered alongside other page content) and the
// early-return pattern (`if (error || loading) return <LeagueStatus ... />`).
export function LeagueStatus({ error, loading }: { error: Error | null; loading: boolean }) {
  if (error) return <p>Couldn't load this competition: {error.message}</p>;
  if (loading) return <p>Loading…</p>;
  return null;
}
