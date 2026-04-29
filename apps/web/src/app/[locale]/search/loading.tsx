export default function SearchLoading() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="border-b border-[var(--color-border)] px-7 py-6">
        <div className="h-3 w-24 animate-pulse rounded bg-[var(--color-bg-elev)]" />
        <div className="mt-3 h-9 w-80 animate-pulse rounded bg-[var(--color-bg-elev)]" />
        <div className="mt-3 h-3 w-48 animate-pulse rounded bg-[var(--color-bg-elev)]" />
      </div>
      {[1,2,3,4,5,6,7,8].map((i) => (
        <div key={i} className="grid grid-cols-[90px_1fr_60px_24px] sm:grid-cols-[100px_1fr_100px_80px_110px_24px] items-center gap-3 sm:gap-5 border-b border-[var(--color-border)] px-7 py-4">
          <div className="h-5 w-20 animate-pulse rounded bg-[var(--color-bg-elev)]" />
          <div><div className="h-4 w-24 animate-pulse rounded bg-[var(--color-bg-elev)]" /><div className="mt-2 h-3 w-32 animate-pulse rounded bg-[var(--color-bg-elev)]" /></div>
          <div className="h-4 w-12 animate-pulse rounded bg-[var(--color-bg-elev)] ml-auto" />
          <div className="h-4 w-16 animate-pulse rounded bg-[var(--color-bg-elev)] ml-auto hidden sm:block" />
          <div className="h-4 w-20 animate-pulse rounded bg-[var(--color-bg-elev)] ml-auto hidden sm:block" />
          <div />
        </div>
      ))}
    </div>
  );
}
