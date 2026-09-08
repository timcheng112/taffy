import type { ReactNode } from "react";
import { LibraryBig, Settings } from "lucide-react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <main className="app-shell">
      <aside>
        <p className="wordmark">taffy</p>
        <nav aria-label="Primary">
          <a className="active" href="#library">
            <LibraryBig size={18} />
            Library
          </a>
        </nav>
        <a className="settings" href="#settings">
          <Settings size={18} />
          Settings
        </a>
      </aside>
      <section className="app-workspace">{children}</section>
    </main>
  );
}
