export function Skeleton({
  className = "",
  width,
  height,
}: {
  className?: string;
  width?: string | number;
  height?: string | number;
}) {
  const style: React.CSSProperties = {};
  if (width !== undefined) style.width = typeof width === "number" ? `${width}px` : width;
  if (height !== undefined) style.height = typeof height === "number" ? `${height}px` : height;

  return (
    <span
      aria-hidden="true"
      className={`inline-block animate-pulse rounded-[4px] bg-[var(--color-bg-muted)] ${className}`}
      style={style}
    />
  );
}
