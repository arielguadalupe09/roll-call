import { forwardRef } from "react";

// Shared recipe (hairline border, 7px radius, 2px slate focus outline) --
// same recipe repeated independently across ~30 files before this existed.
// Defaults to w-full -- Tailwind's compiled stylesheet always puts w-full
// after w-auto (and after any fixed w-N), so a plain `className="w-auto"`
// override here silently loses the cascade regardless of prop order. Use
// `!w-auto` (or `!w-24`, etc) for a narrower field.
export const FIELD_CLASSES =
  "w-full rounded-[7px] border border-line bg-card px-3 py-2 text-sm text-ink outline-none transition placeholder:text-muted focus:border-slate focus:outline focus:outline-2 focus:outline-offset-0 focus:outline-slate disabled:cursor-not-allowed disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...props }, ref) {
    return <input ref={ref} className={`${FIELD_CLASSES} ${className}`} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = "", ...props }, ref) {
    return <select ref={ref} className={`${FIELD_CLASSES} ${className}`} {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = "", ...props }, ref) {
    return <textarea ref={ref} className={`${FIELD_CLASSES} ${className}`} {...props} />;
  },
);
