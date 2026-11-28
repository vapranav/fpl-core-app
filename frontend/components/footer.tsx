export function Footer() {
  return (
    <footer className="border-border mt-auto border-t">
      <div className="text-muted mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-4 text-xs sm:px-6">
        <span>Made with ❤️ and ☕</span>
        <span aria-hidden>·</span>
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
        <span aria-hidden>·</span>
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
