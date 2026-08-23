import { BookOpen, LibraryBig, Settings } from "lucide-react";
import { RootFolderList, useRootFoldersQuery } from "../features/library";

export function LibraryPage() {
  const rootFoldersQuery = useRootFoldersQuery();
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
          <div>
            <h1>Library</h1>
            <p className="library-description">Organize saved learning into Folders.</p>
          </div>
          <BookOpen size={22} aria-hidden="true" />
        </header>
        {rootFoldersQuery.isPending && <p className="library-state">Opening your Library…</p>}
        {rootFoldersQuery.isError && (
          <p className="library-state failure" role="alert">
            Taffy could not load your Library. Restart taffy and try again.
          </p>
        )}
        {rootFoldersQuery.data && <RootFolderList folders={rootFoldersQuery.data} />}
      </section>
    </main>
  );
}
