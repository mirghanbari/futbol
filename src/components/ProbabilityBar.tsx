function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

interface ProbabilityBarProps {
  home: number; // 0..1
  draw: number;
  away: number;
  homeLabel: string;
  awayLabel: string;
  size?: "sm" | "md";
}

// Pre-match win/draw/loss odds — src/data/ratings.ts's Poisson model, not
// bookmaker odds (see Notes.md item 2 / PROGRESS.md for that distinction).
// A compact 3-segment stacked bar, same visual family as this app's other
// proportional bars (zone chips, source badges) rather than a new pattern.
export function ProbabilityBar({ home, draw, away, homeLabel, awayLabel, size = "sm" }: ProbabilityBarProps) {
  return (
    <div className={`prob-bar-wrap prob-${size}`}>
      <div
        className="prob-bar"
        role="img"
        aria-label={`${homeLabel} ${pct(home)} to win, draw ${pct(draw)}, ${awayLabel} ${pct(away)} to win`}
      >
        <span className="prob-seg prob-home" style={{ width: `${home * 100}%` }} />
        <span className="prob-seg prob-draw" style={{ width: `${draw * 100}%` }} />
        <span className="prob-seg prob-away" style={{ width: `${away * 100}%` }} />
      </div>
      <div className="prob-labels">
        <span>{pct(home)}</span>
        <span className="prob-draw-label">{pct(draw)} draw</span>
        <span>{pct(away)}</span>
      </div>
    </div>
  );
}
