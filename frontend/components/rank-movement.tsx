/** ▲/▼/= indicator comparing a current rank against last week's rank. */
export function RankMovement({
  rank,
  lastRank,
}: {
  rank: number | null;
  lastRank: number | null;
}) {
  // last_rank 0 means "no previous rank" in the FPL API (new entries)
  if (rank === null || !lastRank || rank === lastRank) {
    return <span className="text-muted text-xs">=</span>;
  }
  if (rank < lastRank) {
    return (
      <span
        className="text-xs text-green-600 dark:text-green-400"
        title={`Up from ${lastRank}`}
      >
        ▲
      </span>
    );
  }
  return (
    <span
      className="text-xs text-red-600 dark:text-red-400"
      title={`Down from ${lastRank}`}
    >
      ▼
    </span>
  );
}
