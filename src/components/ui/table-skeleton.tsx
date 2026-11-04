import React from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export interface TableSkeletonProps {
  rows?: number;
  cols?: number;
  title?: string;
  className?: string;
}

export function TableSkeleton({
  rows = 8,
  cols = 7,
  title,
  className = "",
}: TableSkeletonProps) {
  return (
    <div className={cn("w-full space-y-4 rounded-xl border border-white/10 bg-zinc-950/70 p-4 backdrop-blur-md", className)}>
      {title && (
        <div className="flex items-center justify-between pb-2 border-b border-white/5">
          <Skeleton className="h-5 w-44 bg-white/10" />
          <Skeleton className="h-4 w-24 bg-white/5" />
        </div>
      )}
      
      {/* Table Header skeleton */}
      <div className="grid gap-3 py-2 border-b border-white/10" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={`th-${i}`} className="h-4 w-full bg-white/10 rounded" />
        ))}
      </div>

      {/* Table Rows skeleton */}
      <div className="space-y-2.5 pt-1">
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={`row-${r}`}
            className="grid gap-3 py-2 items-center border-b border-white/5 last:border-0"
            style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
          >
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton
                key={`cell-${r}-${c}`}
                className={cn(
                  "h-4 rounded bg-white/5",
                  c === 0 ? "w-3/4" : c === Math.floor(cols / 2) ? "w-5/6 bg-cyan-500/10" : "w-2/3"
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MetricCardSkeleton({
  count = 4,
  className = "",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3 grid-cols-2 md:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={`card-skel-${i}`}
          className="rounded-xl border border-white/5 bg-zinc-950/70 p-4 space-y-2 backdrop-blur-sm"
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-20 bg-white/10" />
            <Skeleton className="h-4 w-4 rounded-full bg-white/5" />
          </div>
          <Skeleton className="h-7 w-28 bg-white/10" />
          <Skeleton className="h-3 w-16 bg-white/5" />
        </div>
      ))}
    </div>
  );
}
