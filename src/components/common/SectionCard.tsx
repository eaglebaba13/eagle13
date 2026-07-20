import * as React from "react";
import { cn } from "@/lib/utils";

export interface SectionCardProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  readonly title?: React.ReactNode;
  readonly description?: React.ReactNode;
  readonly actions?: React.ReactNode;
  readonly footer?: React.ReactNode;
  readonly padded?: boolean;
}

/**
 * Standardised card container: unified radius, border, padding, header
 * and footer spacing across every page. Purely presentational.
 */
export function SectionCard({
  title,
  description,
  actions,
  footer,
  padded = true,
  className,
  children,
  ...rest
}: SectionCardProps) {
  return (
    <section
      {...rest}
      className={cn(
        "rounded-xl border border-border/60 bg-card text-card-foreground shadow-sm",
        className,
      )}
    >
      {(title || actions) ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0 space-y-0.5">
            {title ? (
              <h2 className="truncate text-sm font-semibold text-foreground sm:text-base">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn(padded && "px-4 py-4 sm:px-5 sm:py-5")}>{children}</div>
      {footer ? (
        <footer className="border-t border-border/50 px-4 py-3 sm:px-5 sm:py-3 text-xs text-muted-foreground">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}