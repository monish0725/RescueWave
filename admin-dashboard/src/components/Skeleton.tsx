export default function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`animate-pulse bg-black/6 rounded-xl ${className}`} style={style} />;
}

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-black/5 p-5 space-y-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-5 py-4 border-b border-black/5 last:border-0">
      <Skeleton className="h-9 w-9 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="h-3 w-28" />
      </div>
      <Skeleton className="h-5 w-16 rounded-full" />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
      <div className="px-5 py-3 border-b border-black/5 flex gap-4">
        {[80, 120, 90, 60, 70].map((w, i) => (
          <Skeleton key={i} className="h-3 rounded" style={{ width: w }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => <SkeletonRow key={i} />)}
    </div>
  );
}
