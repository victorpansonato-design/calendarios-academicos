import * as React from "react";
import { cn } from "@/lib/utils";

export interface SectionHeadingProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title: React.ReactNode;
  /** Texto auxiliar abaixo do título. */
  hint?: React.ReactNode;
  /** Ação(ões) alinhadas à direita. */
  actions?: React.ReactNode;
  /** Borda inferior separando da seção. */
  divider?: boolean;
}

const SectionHeading = React.forwardRef<HTMLElement, SectionHeadingProps>(
  ({ title, hint, actions, divider = false, className, ...props }, ref) => (
    <header
      ref={ref}
      className={cn(
        "flex items-end justify-between gap-4",
        divider && "mb-6 border-b border-border pb-4",
        className
      )}
      {...props}
    >
      <div className="min-w-0">
        <h2 className="font-display text-[15px] font-medium leading-tight text-foreground">
          {title}
        </h2>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </header>
  )
);
SectionHeading.displayName = "SectionHeading";

export { SectionHeading };
