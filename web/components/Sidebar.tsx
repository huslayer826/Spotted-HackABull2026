"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MonitorPlay,
  BellRing,
  CalendarRange,
  BarChart3,
  Settings,
  LogOut,
} from "lucide-react";
import clsx from "clsx";
import { Logo } from "./Logo";

const NAV = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Random Test Data", href: "/dashboard/cameras", icon: MonitorPlay },
  { label: "Alerts", href: "/dashboard/alerts", icon: BellRing },
  { label: "Events", href: "/dashboard/events", icon: CalendarRange },
  { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex flex-col w-[240px] shrink-0 bg-paper-100 border-r border-ink-900/5 h-screen sticky top-0">
      <div className="px-6 pt-7 pb-8">
        <Logo size="md" />
      </div>

      <nav className="px-4 flex-1">
        <ul className="space-y-1">
          {NAV.map(({ label, href, icon: Icon }) => {
            const active =
              href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={clsx(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] transition-colors",
                    active
                      ? "bg-paper-200/80 text-rust-500 font-medium"
                      : "text-ink-700 hover:bg-paper-200/50 hover:text-ink-900",
                  )}
                >
                  <Icon
                    className="h-[18px] w-[18px]"
                    strokeWidth={active ? 2.2 : 1.8}
                  />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="px-4 pb-6 pt-4 border-t border-ink-900/5">
        <button className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] text-ink-700 hover:bg-paper-200/50 hover:text-ink-900 transition-colors">
          <LogOut className="h-[18px] w-[18px]" strokeWidth={1.8} />
          Log out
        </button>
      </div>
    </aside>
  );
}
