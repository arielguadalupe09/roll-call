import Link from "next/link";

type IconName = "edit" | "delete" | "reset" | "record" | "transfer";

const ICON_PATHS: Record<IconName, React.ReactNode> = {
  edit: (
    <path
      d="M11.5 3.5l2 2M3 13l.6-2.6L10.4 3.6a1 1 0 0 1 1.4 0l1.6 1.6a1 1 0 0 1 0 1.4L6.6 13.4 4 14l-1-1z"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  ),
  delete: (
    <path
      d="M4 5h9M7 5V3.6c0-.3.3-.6.6-.6h1.8c.3 0 .6.3.6.6V5m-6.5 0 .6 8.4c0 .6.5 1.1 1.1 1.1h5.6c.6 0 1.1-.5 1.1-1.1L13.5 5"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  ),
  reset: (
    <path
      d="M13 8a5 5 0 1 1-1.6-3.7M13 3v3h-3"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  ),
  record: (
    <path
      d="M4 2.5h6l2.5 2.5V13a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5zM9.5 2.5V5h2.5M6 8h4M6 10.5h4"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  ),
  transfer: (
    <path
      d="M2.5 5.5h9m0 0L8.5 2.5m3 3L8.5 8.5M13.5 10.5h-9m0 0L7.5 13.5m-3-3L7.5 7.5"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  ),
};

const COLOR_CLASSES = {
  brass: "bg-brass/15 text-brass hover:bg-brass/25",
  teal: "bg-teal/15 text-teal hover:bg-teal/25",
  danger: "bg-danger/15 text-danger hover:bg-danger/25",
  ink: "bg-ink/10 text-ink hover:bg-ink/20",
};

export default function IconButton({
  icon,
  color,
  label,
  onClick,
  href,
  disabled = false,
}: {
  icon: IconName;
  color: keyof typeof COLOR_CLASSES;
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
}) {
  const className = `flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition disabled:opacity-40 ${COLOR_CLASSES[color]}`;
  const svg = (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {ICON_PATHS[icon]}
    </svg>
  );

  if (href) {
    return (
      <Link href={href} title={label} aria-label={label} className={className}>
        {svg}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={className}
    >
      {svg}
    </button>
  );
}
