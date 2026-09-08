import { useCallback, useRef, useState } from "react";
import { ArrowUp, ChevronRight, FilePlus2, FolderPlus, LibraryBig, Settings } from "lucide-react";
import { Button } from "../components/ui/button";
import { CreateLearningItemPage } from "../features/learning-items/components/CreateLearningItemPage";
import { LearningItemDetailPage } from "../features/learning-items/components/LearningItemDetailPage";
import type { Folder, FolderView, LibraryContent } from "../features/library/commands/types";
import { FolderList } from "../features/library/components/RootFolderList";
import type { LearningItemCue } from "../features/library/components/LearningItemMotion";
import {
  useFolderViewQuery,
  useRootFoldersQuery,
} from "../features/library/queries/useRootFoldersQuery";

type LibraryPageMode = "contents" | "create-learning-item" | "learning-item-detail";

export function LibraryPage() {
  const [folderId, setFolderId] = useState<number | null>(null);
  const [pendingFolderContext, setPendingFolderContext] = useState<Pick<
    FolderView,
    "folder" | "ancestors"
  > | null>(null);
  const [pageMode, setPageMode] = useState<LibraryPageMode>("contents");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const createFolderTriggerRef = useRef<HTMLButtonElement>(null);
  const [learningItemCue, setLearningItemCue] = useState<{
    id: number;
    type: LearningItemCue;
  } | null>(null);
  const [detailOrigin, setDetailOrigin] = useState<{
    folder: Folder;
    ancestors: Folder[];
    learningItemId: number;
  } | null>(null);
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
    setPageMode("contents");
    setIsCreatingFolder(false);
    setLearningItemCue(null);
    setPendingFolderContext(null);
    setFolderId(null);
    setDetailOrigin(null);
  }

  function openFolder(folder: Folder) {
    setPageMode("contents");
    setIsCreatingFolder(false);
    setLearningItemCue(null);
    setPendingFolderContext({
      folder,
      ancestors: view ? [...view.ancestors, view.folder] : [],
    });
    setFolderId(folder.id);
    setDetailOrigin(null);
  }

  function openKnownFolder(folder: Folder, ancestors: Folder[]) {
    setPageMode("contents");
    setIsCreatingFolder(false);
    setLearningItemCue(null);
    setPendingFolderContext({ folder, ancestors });
    setFolderId(folder.id);
    setDetailOrigin(null);
  }

  function returnToDetailOrigin() {
    if (!detailOrigin) return;
    setPageMode("contents");
    setIsCreatingFolder(false);
    setLearningItemCue({ id: detailOrigin.learningItemId, type: "return" });
    setPendingFolderContext({ folder: detailOrigin.folder, ancestors: detailOrigin.ancestors });
    setFolderId(detailOrigin.folder.id);
    setDetailOrigin(null);
  }

  const clearLearningItemCue = useCallback((learningItemId: number) => {
    setLearningItemCue((current) => (current?.id === learningItemId ? null : current));
  }, []);

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
        {pageMode === "create-learning-item" && view ? (
          <CreateLearningItemPage
            ancestors={view.ancestors}
            folder={view.folder}
            onCancel={() => setPageMode("contents")}
            onCreated={(learningItem) => {
              setPageMode("contents");
              setLearningItemCue({ id: learningItem.id, type: "insertion" });
            }}
          />
        ) : pageMode === "learning-item-detail" && detailOrigin ? (
          <LearningItemDetailPage
            learningItemId={detailOrigin.learningItemId}
            onReturnToFolder={returnToDetailOrigin}
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
                    <Button
                      className="up-button"
                      type="button"
                      variant="secondary"
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
                    </Button>
                    <Button
                      className="new-learning-item-button"
                      disabled={isOpeningFolder}
                      onClick={() => setPageMode("create-learning-item")}
                    >
                      <FilePlus2 size={17} aria-hidden="true" />
                      New Learning Item
                    </Button>
                    <Button
                      className="folder-create-button"
                      ref={createFolderTriggerRef}
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
                  <Button ref={createFolderTriggerRef} onClick={() => setIsCreatingFolder(true)}>
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
                learningItemCue={learningItemCue}
                onLearningItemCuePresented={clearLearningItemCue}
                parentId={folderId}
                onOpen={openFolder}
                onOpenLearningItem={(learningItem) => {
                  if (!view) return;
                  setDetailOrigin({
                    folder: view.folder,
                    ancestors: view.ancestors,
                    learningItemId: learningItem.id,
                  });
                  setPageMode("learning-item-detail");
                }}
                isCreatingFolder={isCreatingFolder}
                onCreatingFolderChange={setIsCreatingFolder}
                focusReturnRef={createFolderTriggerRef}
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
