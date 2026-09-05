import { useState } from "react";
import { ArrowUp, ChevronRight, FilePlus2, FolderPlus, LibraryBig, Settings } from "lucide-react";
import { Button } from "../components/ui/button";
import { CreateLearningItemPage } from "../features/learning-items";
import {
  FolderList,
  type Folder,
  type FolderView,
  type LibraryContent,
  useFolderViewQuery,
  useRootFoldersQuery,
} from "../features/library";

export function LibraryPage() {
  const [folderId, setFolderId] = useState<number | null>(null);
  const [pendingFolderContext, setPendingFolderContext] = useState<Pick<
    FolderView,
    "folder" | "ancestors"
  > | null>(null);
  const [isCreatingLearningItem, setIsCreatingLearningItem] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [highlightedLearningItemId, setHighlightedLearningItemId] = useState<number | null>(null);
  const rootFoldersQuery = useRootFoldersQuery();
  const folderViewQuery = useFolderViewQuery(folderId);
  const isRoot = folderId === null;
  const contents: LibraryContent[] | undefined = isRoot
    ? rootFoldersQuery.data?.map((folder) => ({ type: "folder", value: folder }))
    : folderViewQuery.data?.contents;
  const isPending = isRoot ? rootFoldersQuery.isPending : folderViewQuery.isPending;
  const isError = isRoot ? rootFoldersQuery.isError : folderViewQuery.isError;
  const view = folderViewQuery.data;
  const folderContext = view ?? pendingFolderContext;
  const isOpeningFolder = !isRoot && !view && folderViewQuery.isPending;

  function openRoot() {
    setIsCreatingLearningItem(false);
    setIsCreatingFolder(false);
    setHighlightedLearningItemId(null);
    setPendingFolderContext(null);
    setFolderId(null);
  }

  function openFolder(folder: Folder) {
    setIsCreatingLearningItem(false);
    setIsCreatingFolder(false);
    setHighlightedLearningItemId(null);
    setPendingFolderContext({
      folder,
      ancestors: view ? [...view.ancestors, view.folder] : [],
    });
    setFolderId(folder.id);
  }

  function openKnownFolder(folder: Folder, ancestors: Folder[]) {
    setIsCreatingLearningItem(false);
    setIsCreatingFolder(false);
    setHighlightedLearningItemId(null);
    setPendingFolderContext({ folder, ancestors });
    setFolderId(folder.id);
  }

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
        {isCreatingLearningItem && view ? (
          <CreateLearningItemPage
            ancestors={view.ancestors}
            folder={view.folder}
            onCancel={() => setIsCreatingLearningItem(false)}
            onCreated={(learningItem) => {
              setHighlightedLearningItemId(learningItem.id);
              setIsCreatingLearningItem(false);
            }}
          />
        ) : (
          <>
            <header>
              <h1>{folderContext?.folder.name ?? "Library"}</h1>
              {!folderContext && (
                <p className="library-description">Organize saved learning into Folders.</p>
              )}
              {folderContext ? (
                <div className="folder-context">
                  <div className="library-navigation">
                    <nav className="breadcrumbs" aria-label="Folder path">
                      <button type="button" disabled={isOpeningFolder} onClick={openRoot}>
                        Library
                      </button>
                      {folderContext.ancestors.map((ancestor, index) => (
                        <span key={ancestor.id}>
                          <ChevronRight size={16} aria-hidden="true" />
                          <button
                            type="button"
                            disabled={isOpeningFolder}
                            onClick={() =>
                              openKnownFolder(ancestor, folderContext.ancestors.slice(0, index))
                            }
                          >
                            {ancestor.name}
                          </button>
                        </span>
                      ))}
                      <span aria-current="page">
                        <ChevronRight size={16} aria-hidden="true" />
                        {folderContext.folder.name}
                      </span>
                    </nav>
                  </div>
                  <div className="library-commands">
                    <button
                      className="up-button"
                      type="button"
                      disabled={isOpeningFolder}
                      onClick={() => {
                        const parent = folderContext.ancestors.at(-1);
                        if (!parent) {
                          openRoot();
                        } else {
                          openKnownFolder(parent, folderContext.ancestors.slice(0, -1));
                        }
                      }}
                    >
                      <ArrowUp size={17} aria-hidden="true" />
                      Up
                    </button>
                    <Button
                      className="new-learning-item-button"
                      disabled={isOpeningFolder}
                      onClick={() => setIsCreatingLearningItem(true)}
                    >
                      <FilePlus2 size={17} aria-hidden="true" />
                      New Learning Item
                    </Button>
                    <Button
                      className="folder-create-button"
                      variant="secondary"
                      disabled={isOpeningFolder}
                      onClick={() => setIsCreatingFolder(true)}
                    >
                      <FolderPlus size={17} aria-hidden="true" />
                      Create Folder
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="library-commands library-root-commands">
                  <Button onClick={() => setIsCreatingFolder(true)}>
                    <FolderPlus size={17} aria-hidden="true" />
                    Create Folder
                  </Button>
                </div>
              )}
            </header>
            {isRoot && isPending && <p className="library-state">Opening your Library…</p>}
            {isError && (
              <p className="library-state failure" role="alert">
                Taffy could not load your Library. Restart taffy and try again.
              </p>
            )}
            {contents && (
              <FolderList
                contents={contents}
                highlightedLearningItemId={highlightedLearningItemId}
                parentId={folderId}
                onOpen={openFolder}
                isCreatingFolder={isCreatingFolder}
                onCreatingFolderChange={setIsCreatingFolder}
                hideCreateFolderAction
              />
            )}
            {isOpeningFolder && (
              <div
                className="library-list library-list-loading"
                aria-busy="true"
                aria-label="Opening Folder contents"
              >
                <span />
                <span />
                <span />
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
