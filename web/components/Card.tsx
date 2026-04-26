import clsx from "clsx";

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "rounded-2xl bg-paper-50 border border-ink-900/5 shadow-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  action,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex items-start justify-between px-6 pt-5", className)}>
      <h3 className="text-[18px] font-semibold text-ink-900">{title}</h3>
      {action}
    </div>
  );
}
