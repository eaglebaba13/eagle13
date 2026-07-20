import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ErrorStateProps {
  readonly title?: string;
  readonly description?: string;
  readonly retryLabel?: string;
  readonly onRetry?: () => void;
  readonly diagnosticsHref?: string;
  readonly lastGoodAt?: string;
  readonly className?: string;
}

/**
 * Presentational error card. Never shows raw provider error text — callers
 * translate raw errors into a friendly title/description upstream.
 */
export function ErrorState({
  title = "This module is temporarily unavailable.",
  description,
  retryLabel = "Retry",
  onRetry,
  diagnosticsHref,
  lastGoodAt,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/[0.06] p-4 text-sm",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-300"
          aria-hidden
        />
        <div className="min-w-0 space-y-1">
          <p className="font-medium text-foreground">{title}</p>
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
          {lastGoodAt ? (
            <p className="text-[11px] text-muted-foreground">
              Last successful snapshot: <span className="font-mono">{lastGoodAt}</span>
            </p>
          ) : null}
        </div>
      </div>
      {(onRetry || diagnosticsHref) ? (
        <div className="flex flex-wrap gap-2">
          {onRetry ? (
            <Button size="sm" variant="outline" onClick={onRetry}>
              {retryLabel}
            </Button>
          ) : null}
          {diagnosticsHref ? (
            <Button size="sm" variant="ghost" asChild>
              <a href={diagnosticsHref}>View diagnostics</a>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}