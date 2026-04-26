import clsx from "clsx";

type IconProps = { className?: string; strokeWidth?: number };

export function RunningIcon({ className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={clsx("h-5 w-5", className)}
    >
      <circle cx="13" cy="4.5" r="2" />
      <path d="M14 12.5l-2.5 3-3.5 1" />
      <path d="M9.5 9.5l3.5-2 3 2 2 3" />
      <path d="M7 21l3-5.5 3 1.5L11 21" />
      <path d="M16.5 14.5l1.5 3-1 3.5" />
    </svg>
  );
}

export function JarIcon({ className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={clsx("h-5 w-5", className)}
    >
      <path d="M8 4.5h8" />
      <path d="M8.5 4.5v2.2c0 .5-.2.9-.5 1.2-.6.5-1 1.2-1 2v9.6a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-9.6c0-.8-.4-1.5-1-2-.3-.3-.5-.7-.5-1.2V4.5" />
      <path d="M7 12.5h10" />
    </svg>
  );
}

export function BoxIcon({ className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={clsx("h-5 w-5", className)}
    >
      <path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z" />
      <path d="M3.5 7.5L12 12l8.5-4.5" />
      <path d="M12 12v9" />
    </svg>
  );
}

export function PersonIcon({ className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={clsx("h-5 w-5", className)}
    >
      <circle cx="12" cy="5" r="2.5" />
      <path d="M12 8v6" />
      <path d="M9 11l3 3 3-3" />
      <path d="M9 21l3-7 3 7" />
    </svg>
  );
}

export function CameraDotIcon({ className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={clsx("h-5 w-5", className)}
    >
      <rect x="3" y="7" width="14" height="10" rx="2" />
      <path d="M17 11l4-2v6l-4-2" />
    </svg>
  );
}
