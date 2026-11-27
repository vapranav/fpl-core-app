export function BadgePlaceholder({ size = 4 }: { size?: number }) {
  return (
    <span
      className="bg-border text-muted inline-flex items-center justify-center rounded-sm"
      style={{ width: size * 4, height: size * 4 }}
      aria-label="No badge available"
    >
      <svg
        width={size * 2.5}
        height={size * 2.5}
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5z" />
      </svg>
    </span>
  );
}
