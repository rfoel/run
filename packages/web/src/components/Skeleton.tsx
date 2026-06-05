export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-ink/10 ${className}`} />;
}

// Six stat boxes + a list of rows — mirrors the Activities layout so the
// transition to real data doesn't shift anything.
export function ActivitiesSkeleton() {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-4">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-6 w-40" />
      </div>
      <div className="grid grid-cols-3 gap-px bg-line border border-line rounded-lg overflow-hidden mb-10">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-card px-5 py-4">
            <Skeleton className="h-3 w-16 mb-2" />
            <Skeleton className="h-7 w-12" />
          </div>
        ))}
      </div>
      <Skeleton className="h-4 w-20 mb-3" />
      <ListSkeleton rows={6} />
    </section>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul className="border border-line rounded-lg divide-y divide-line bg-card overflow-hidden">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="px-5 py-4 flex items-center justify-between gap-6">
          <div className="flex-1 min-w-0">
            <Skeleton className="h-4 w-2/3 mb-2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <div className="text-right shrink-0">
            <Skeleton className="h-4 w-16 mb-2 ml-auto" />
            <Skeleton className="h-3 w-24 ml-auto" />
          </div>
        </li>
      ))}
    </ul>
  );
}

