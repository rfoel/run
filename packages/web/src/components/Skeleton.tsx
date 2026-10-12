export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-foreground/10 ${className}`} />
  );
}

// Mirrors the Activities layout (heading + range toggle, the huge period km,
// the five-stat row, then the run list) so real data doesn't shift anything.
export function ActivitiesSkeleton() {
  return (
    <div className="flex flex-col gap-10 md:gap-12">
      <section className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="mr-auto h-7 w-24 md:h-8" />
          <Skeleton className="h-10 w-full rounded-full sm:w-72" />
        </div>
        <div>
          <Skeleton className="h-[5.5rem] w-64 sm:h-[7.5rem] sm:w-96 md:h-[9.5rem] md:w-[30rem]" />
          <Skeleton className="mt-3 h-4 w-8" />
        </div>
        <div className="grid grid-cols-3 gap-x-4 gap-y-6 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-9 w-20 md:h-11" />
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-4">
        <Skeleton className="h-7 w-32 md:h-8" />
        <ListSkeleton rows={6} />
      </section>
    </div>
  );
}

// Mirrors WorkoutDetail's hero: back pill, date line, name, the huge
// distance, the four-stat row, then the stat tiles and the chart.
export function WorkoutDetailSkeleton() {
  return (
    <section className="flex flex-col gap-8">
      <Skeleton className="size-9 rounded-full" />
      <div>
        <Skeleton className="mb-2 h-3 w-40" />
        <Skeleton className="mb-4 h-7 w-2/3 max-w-sm" />
        <Skeleton className="mb-5 h-24 w-56 md:h-36 md:w-80" />
        <div className="flex gap-6 md:gap-10">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-8 w-14 md:h-11 md:w-20" />
              <Skeleton className="h-3 w-10" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-card p-4">
            <Skeleton className="mb-3 h-3 w-16" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-2xl" />
    </section>
  );
}

// A list of run/plan tiles: small line, name, then a big number with stats.
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="rounded-2xl bg-card p-4 md:px-6 md:py-5">
          <Skeleton className="mb-2 h-3 w-32" />
          <Skeleton className="mb-4 h-5 w-2/3 max-w-xs" />
          <div className="flex items-end gap-6">
            <Skeleton className="h-11 w-28 md:h-14" />
            <Skeleton className="h-8 w-14" />
            <Skeleton className="h-8 w-14" />
          </div>
        </li>
      ))}
    </ul>
  );
}
