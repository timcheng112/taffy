import { BookOpen, LibraryBig, Settings } from "lucide-react";
import type { Learner } from "../features/onboarding";

export function EmptyLibraryPage({ learner }: { learner: Learner }) {
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
          <p className="eyebrow">Library</p>
          <h1>Your Library is ready, {learner.displayName}.</h1>
        </header>
        <div className="empty-library">
          <BookOpen size={28} aria-hidden="true" />
          <h2>Nothing here yet</h2>
          <p>Folders will give your saved learning a quiet home.</p>
        </div>
      </section>
    </main>
  );
}
