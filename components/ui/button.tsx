import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
};

// Solid variants (primary/danger) use a fixed accent/danger fill in both
// themes, dark enough that white text stays readable — see app/globals.css.
const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-pressed",
  secondary: "bg-surface text-text ring-1 ring-border hover:bg-border/40",
  ghost: "bg-transparent text-text hover:bg-border/30",
  danger: "bg-danger text-white hover:opacity-90",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      loading = false,
      className = "",
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold transition disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
        {...props}
      >
        {loading && (
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
          />
        )}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
