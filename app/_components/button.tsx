import Link from "next/link";

const VARIANT_CLASSES = {
  // Primary action on a screen (Save, Add, Submit).
  primary: "bg-slate text-card hover:brightness-110",
  // Accent/highlight action (Share, Print, Export) -- gold is reserved for
  // this and active-state accents, not general-purpose primary actions.
  highlight: "bg-gold text-navy hover:brightness-110",
  // Secondary/lower-emphasis action -- outline, not a second filled color.
  secondary: "border border-line bg-card text-ink hover:bg-slate-light",
  danger: "bg-danger text-card hover:brightness-110",
} as const;

const SIZE_CLASSES = {
  md: "px-4 py-2 text-sm",
  sm: "px-3 py-1.5 text-xs",
} as const;

type ButtonVariant = keyof typeof VARIANT_CLASSES;
type ButtonSize = keyof typeof SIZE_CLASSES;

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
};

type ButtonAsButton = CommonProps & {
  href?: undefined;
  type?: "button" | "submit";
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  autoFocus?: boolean;
};

type ButtonAsLink = CommonProps & {
  href: string;
  type?: undefined;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  target?: "_blank";
  // Forces a plain <a> instead of next/link's <Link> -- needed for hrefs
  // that aren't app pages (e.g. an API route streaming a file download),
  // where Link's client-side navigation attempt can interfere.
  external?: boolean;
};

export default function Button({
  variant = "primary",
  size = "md",
  disabled = false,
  className = "",
  children,
  href,
  ...rest
}: ButtonAsButton | ButtonAsLink) {
  const classes = `inline-flex shrink-0 items-center justify-center gap-1 rounded-sm font-medium transition disabled:opacity-60 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`;

  if (href) {
    const { onClick, target, external } = rest as ButtonAsLink;
    if (external) {
      return (
        <a
          href={href}
          onClick={onClick}
          target={target}
          rel={target === "_blank" ? "noopener noreferrer" : undefined}
          className={classes}
        >
          {children}
        </a>
      );
    }
    return (
      <Link href={href} onClick={onClick} target={target} className={classes}>
        {children}
      </Link>
    );
  }

  const { type = "button", onClick, autoFocus } = rest as ButtonAsButton;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      autoFocus={autoFocus}
      className={classes}
    >
      {children}
    </button>
  );
}
