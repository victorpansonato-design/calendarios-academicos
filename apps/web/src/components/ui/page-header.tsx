import { cn } from "@/lib/utils";
import * as React from "react";

export interface PageHeaderProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  description?: React.ReactNode;
  /** Ação(ões) alinhadas à direita do título (ex.: botões). */
  actions?: React.ReactNode;
  /** Metadados secundários abaixo da descrição. */
  meta?: React.ReactNode;
}

const PageHeader = React.forwardRef<HTMLElement, PageHeaderProps>(
  ({ title, eyebrow, description, actions, meta, className, ...props }, ref) => (
    <header
      ref={ref}
      className={cn("border-b border-border pb-6 pt-2", className)}
      {...props}
    >
      <div className="flex items-end justify-between gap-6">
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {eyebrow}
            </div>
          ) : null}
          <h1 className="font-display text-[28px] font-medium leading-[1.05] text-foreground">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
          {meta ? (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {meta}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {/* Filete amarelo institucional - assinatura Anchieta */}
      <div className="mt-6 h-0.5 w-12 rounded-full bg-accent" aria-hidden />
    </header>
  )
);
PageHeader.displayName = "PageHeader";

export { PageHeader };

