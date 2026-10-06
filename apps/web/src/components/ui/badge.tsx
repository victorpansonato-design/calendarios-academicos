import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  {
    variants: {
      tone: {
        neutral: "",
        primary: "",
        success: "",
        warning: "",
        danger: "",
      },
      variant: {
        soft: "",
        solid: "",
        outline: "border bg-transparent",
      },
      size: {
        sm: "px-2 py-0.5 text-[11px]",
        md: "px-2.5 py-1 text-xs",
      },
    },
    compoundVariants: [
      // soft (default): fundo tintado + texto na cor do tom
      { variant: "soft", tone: "neutral", class: "bg-muted text-muted-foreground" },
      { variant: "soft", tone: "primary", class: "bg-primary-soft text-primary" },
      { variant: "soft", tone: "success", class: "bg-success-soft text-success" },
      { variant: "soft", tone: "warning", class: "bg-warning-soft text-warning-foreground" },
      { variant: "soft", tone: "danger", class: "bg-destructive-soft text-destructive" },
      // solid: preenchido
      { variant: "solid", tone: "neutral", class: "bg-secondary text-secondary-foreground" },
      { variant: "solid", tone: "primary", class: "bg-primary text-primary-foreground" },
      { variant: "solid", tone: "success", class: "bg-success text-success-foreground" },
      { variant: "solid", tone: "warning", class: "bg-warning text-warning-foreground" },
      { variant: "solid", tone: "danger", class: "bg-destructive text-destructive-foreground" },
      // outline: borda + texto na cor do tom
      { variant: "outline", tone: "neutral", class: "border-border text-foreground" },
      { variant: "outline", tone: "primary", class: "border-primary/40 text-primary" },
      { variant: "outline", tone: "success", class: "border-success/40 text-success" },
      { variant: "outline", tone: "warning", class: "border-warning/50 text-warning-foreground" },
      { variant: "outline", tone: "danger", class: "border-destructive/40 text-destructive" },
    ],
    defaultVariants: {
      tone: "neutral",
      variant: "soft",
      size: "md",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Marcador circular antes do texto. Reforça o status sem depender só da cor (a11y). */
  dot?: boolean;
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone, variant, size, dot = false, children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(badgeVariants({ tone, variant, size }), className)}
        {...props}
      >
        {dot ? (
          <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden />
        ) : null}
        {children}
      </span>
    );
  }
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
