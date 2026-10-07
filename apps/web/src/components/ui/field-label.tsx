import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface FieldLabelProps
  extends React.ComponentPropsWithoutRef<typeof Label> {
  /** Anexa um asterisco indicando campo obrigatório. */
  required?: boolean;
}

const FieldLabel = React.forwardRef<
  React.ElementRef<typeof Label>,
  FieldLabelProps
>(({ required, children, className, ...props }, ref) => (
  <Label
    ref={ref}
    className={cn(
      "gap-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground",
      className
    )}
    {...props}
  >
    {children}
    {required ? (
      <span className="text-warning" aria-hidden>
        *
      </span>
    ) : null}
  </Label>
));
FieldLabel.displayName = "FieldLabel";

export { FieldLabel };
