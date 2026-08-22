import { BookOpen, LibraryBig, Settings } from "lucide-react";

export function EmptyLibraryPage() {
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
      <section className="library-workspace">
        <header>
          <h1>Library</h1>
        </header>
        <div className="empty-library">
          <BookOpen size={28} aria-hidden="true" />
          <p>No folders yet.</p>
        </div>
      </section>
    </main>
  );
}
