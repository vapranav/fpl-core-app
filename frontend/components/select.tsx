const controlClass =
  "rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground";

export const inputClass = controlClass;

export function Select({
  name,
  defaultValue,
  children,
}: {
  name: string;
  defaultValue: string;
  children: React.ReactNode;
}) {
  return (
    <span className="relative inline-block">
      <select
        name={name}
        defaultValue={defaultValue}
        className={`${controlClass} appearance-none pr-9`}
      >
        {children}
      </select>
      <svg
        className="text-muted pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  );
}
