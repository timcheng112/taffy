import { useState } from "react";
import { ArrowUp, ChevronRight, LibraryBig, Settings } from "lucide-react";
import { FolderList, useFolderViewQuery, useRootFoldersQuery } from "../features/library";

export function LibraryPage() {
  const [folderId, setFolderId] = useState<number | null>(null);
  const rootFoldersQuery = useRootFoldersQuery();
  const folderViewQuery = useFolderViewQuery(folderId);
  const isRoot = folderId === null;
  const folders = isRoot ? rootFoldersQuery.data : folderViewQuery.data?.childFolders;
  const isPending = isRoot ? rootFoldersQuery.isPending : folderViewQuery.isPending;
  const isError = isRoot ? rootFoldersQuery.isError : folderViewQuery.isError;
  const view = folderViewQuery.data;
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
          <h1>{view?.folder.name ?? "Library"}</h1>
          <p className="library-description">Organize saved learning into Folders.</p>
          {view && (
            <div className="folder-context">
              <div className="library-navigation">
                <nav className="breadcrumbs" aria-label="Folder path">
                  <button type="button" onClick={() => setFolderId(null)}>
                    Library
                  </button>
                  {view.ancestors.map((ancestor) => (
                    <span key={ancestor.id}>
                      <ChevronRight size={16} aria-hidden="true" />
                      <button type="button" onClick={() => setFolderId(ancestor.id)}>
                        {ancestor.name}
                      </button>
                    </span>
                  ))}
                  <span aria-current="page">
                    <ChevronRight size={16} aria-hidden="true" />
                    {view.folder.name}
                  </span>
                </nav>
              </div>
              <div className="library-commands">
                <button
                  className="up-button"
                  type="button"
                  onClick={() => setFolderId(view.ancestors.at(-1)?.id ?? null)}
                >
                  <ArrowUp size={17} aria-hidden="true" />
                  Up
                </button>
              </div>
            </div>
          )}
        </header>
        {isPending && <p className="library-state">Opening your Library…</p>}
        {isError && (
          <p className="library-state failure" role="alert">
            Taffy could not load your Library. Restart taffy and try again.
          </p>
        )}
        {folders && <FolderList folders={folders} parentId={folderId} onOpen={setFolderId} />}
      </section>
    </main>
  );
}
