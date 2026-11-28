export function Footer() {
  return (
    <footer className="border-border mt-auto border-t">
      <div className="text-muted mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1 sm:px-6">
        <span>Made with ❤️ and ☕</span>
        <span aria-hidden className="hidden sm:inline">
          ·
        </span>
        <span>
          Data by{" "}
          <a
            href="https://github.com/olbauday/FPL-Core-Insights"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground underline"
          >
            FPL-Core-Insights
          </a>{" "}
          — official FPL data fused with match stats and ClubElo ratings
        </span>
        <span aria-hidden className="hidden sm:inline">
          ·
        </span>
        <span>
          Photos © Premier League (
          <a
            href="https://www.premierleague.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground underline"
          >
            premierleague.com
          </a>
          )
        </span>
      </div>
    </footer>
  );
}
