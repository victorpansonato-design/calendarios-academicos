import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const calloutVariants = cva("text-sm", {
  variants: {
    tone: {
      info: "",
      success: "",
      warning: "",
      danger: "",
    },
    variant: {
      banner: "flex items-start gap-3 rounded-lg border px-4 py-3",
      inline: "flex items-center gap-2 rounded-md border border-dashed px-3 py-2",
      compact: "inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.06em]",
    },
  },
  compoundVariants: [
    { variant: ["banner", "inline"], tone: "info", class: "border-primary/30 bg-primary-soft/60 text-primary" },
    { variant: ["banner", "inline"], tone: "success", class: "border-success/40 bg-success-soft text-success" },
    { variant: ["banner", "inline"], tone: "warning", class: "border-warning/40 bg-warning-soft text-warning-foreground" },
    { variant: ["banner", "inline"], tone: "danger", class: "border-destructive/40 bg-destructive-soft text-destructive" },
    { variant: "compact", tone: "info", class: "text-muted-foreground" },
    { variant: "compact", tone: "success", class: "text-success" },
    { variant: "compact", tone: "warning", class: "text-warning-foreground" },
    { variant: "compact", tone: "danger", class: "text-destructive" },
  ],
  defaultVariants: { tone: "info", variant: "banner" },
});

export interface CalloutProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title">,
    VariantProps<typeof calloutVariants> {
  /** Ícone (ex.: lucide-react). */
  icon?: React.ComponentType<{ className?: string }>;
  /** Título em negrito (variantes banner/inline). */
  title?: React.ReactNode;
}

const Callout = React.forwardRef<HTMLDivElement, CalloutProps>(
  ({ tone = "info", variant = "banner", icon: Icon, title, children, className, ...props }, ref) => {
    const isDanger = tone === "danger";

    if (variant === "compact") {
      return (
        <p
          ref={ref as React.Ref<HTMLParagraphElement>}
          className={cn(calloutVariants({ tone, variant }), className)}
          {...props}
        >
          {Icon ? <Icon className="size-3 shrink-0" /> : null}
          {title ?? children}
        </p>
      );
    }

    return (
      <div
        ref={ref}
        role={isDanger ? "alert" : "note"}
        className={cn(calloutVariants({ tone, variant }), className)}
        {...props}
      >
        {Icon ? (
          <span className="mt-0.5 shrink-0" aria-hidden>
            <Icon className={cn(variant === "banner" ? "size-4" : "size-3.5")} />
          </span>
        ) : null}
        <span className="flex min-w-0 flex-col gap-0.5 leading-snug">
          {title ? <strong className="font-semibold">{title}</strong> : null}
          {children ? <span>{children}</span> : null}
        </span>
      </div>
    );
  }
);
Callout.displayName = "Callout";

export { Callout, calloutVariants };
