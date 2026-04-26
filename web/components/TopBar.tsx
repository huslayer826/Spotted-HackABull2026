import { Bell, Search, ChevronDown } from "lucide-react";

export function TopBar() {
  return (
    <header className="sticky top-0 z-20 bg-paper-100/85 backdrop-blur border-b border-ink-900/5">
      <div className="flex items-center gap-6 px-8 lg:px-12 py-4">
        {/* Search */}
        <div className="flex-1 max-w-[640px]">
          <label className="relative block">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
            <input
              type="text"
              placeholder="Search cameras, events..."
              className="w-full rounded-xl bg-paper-50 border border-ink-900/5 py-2.5 pl-11 pr-4 text-[14px] text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-rust-300 focus:ring-2 focus:ring-rust-300/20 transition"
            />
          </label>
        </div>

        <div className="flex-1" />

        {/* Right cluster */}
        <div className="flex items-center gap-5">
          <button
            aria-label="Notifications"
            className="relative grid place-items-center h-10 w-10 rounded-full hover:bg-paper-200 transition-colors"
          >
            <Bell className="h-5 w-5 text-ink-700" strokeWidth={1.8} />
            <span className="absolute top-1.5 right-1.5 grid place-items-center h-4 w-4 rounded-full bg-rust-500 text-[10px] font-semibold text-paper-50">
              3
            </span>
          </button>

          <div className="flex items-center gap-3 pr-1">
            <div className="text-right leading-tight">
              <div className="text-[14px] font-semibold text-ink-900">
                Admin
              </div>
              <div className="text-[12px] text-ink-500">admin@spotter.ai</div>
            </div>
            <button className="flex items-center gap-1.5">
              <span
                className="h-9 w-9 rounded-full bg-cover bg-center ring-2 ring-paper-50"
                style={{
                  backgroundImage:
                    "linear-gradient(135deg, #BD6A47 0%, #8B3F22 100%)",
                }}
              >
                <span className="grid h-full w-full place-items-center text-[13px] font-semibold text-paper-50">
                  K
                </span>
              </span>
              <ChevronDown
                className="h-4 w-4 text-ink-500"
                strokeWidth={2}
              />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
