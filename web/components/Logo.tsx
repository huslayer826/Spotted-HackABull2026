import clsx from "clsx";

export function Logo({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: { dot: "h-4 w-4", ring: "h-4 w-4", text: "text-base" },
    md: { dot: "h-5 w-5", ring: "h-5 w-5", text: "text-lg" },
    lg: { dot: "h-6 w-6", ring: "h-6 w-6", text: "text-xl" },
  } as const;
  const s = sizes[size];
  return (
    <div className={clsx("flex items-center gap-2.5 select-none", className)}>
      <span className="relative inline-flex items-center justify-center">
        <span
          className={clsx(
            "rounded-full border-2 border-rust-500",
            s.ring,
          )}
        />
        <span
          className={clsx(
            "absolute rounded-full bg-rust-500",
            "h-2 w-2",
          )}
        />
      </span>
      <span
        className={clsx(
          "font-semibold tracking-[0.18em] text-ink-900",
          s.text,
        )}
      >
        SPOTTER
      </span>
    </div>
  );
}
