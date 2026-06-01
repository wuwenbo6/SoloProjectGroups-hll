export default function SkeletonPanel() {
  return (
    <div className="animate-pulse rounded-xl border border-slate-700/50 bg-slate-800/60 p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-slate-600" />
        <div className="h-3 w-24 rounded bg-slate-700" />
      </div>
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="h-3 w-20 rounded bg-slate-700" />
            <div className="h-3 w-16 rounded bg-slate-700" />
          </div>
        ))}
      </div>
    </div>
  );
}
