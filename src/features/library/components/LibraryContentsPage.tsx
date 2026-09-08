import { ArrowUp, ChevronRight, FilePlus2, FolderPlus } from "lucide-react";
import { Button } from "../../../components/ui/button";
import type { Folder, FolderView, LibraryContent } from "../commands/types";
import { FolderList } from "./FolderList";
import type { LearningItemCue } from "./LearningItemMotion";

type FolderContext = Pick<FolderView, "folder" | "ancestors">;
type LearningItem = Extract<LibraryContent, { type: "learningItem" }>["value"];

export function LibraryContentsPage({
  contents,
  folderId,
  folderContext,
  isRoot,
  isPending,
  isError,
  isOpeningFolder,
  isCreatingFolder,
  createFolderTriggerRef,
  learningItemCue,
  onOpenRoot,
  onOpenKnownFolder,
  onOpenFolder,
  onOpenLearningItem,
  onLearningItemCuePresented,
  onCreateLearningItem,
  onCreatingFolderChange,
}: {
  contents: LibraryContent[] | undefined;
  folderId: number | null;
  folderContext: FolderContext | null;
  isRoot: boolean;
  isPending: boolean;
  isError: boolean;
  isOpeningFolder: boolean;
  isCreatingFolder: boolean;
  createFolderTriggerRef: React.RefObject<HTMLButtonElement | null>;
  learningItemCue: { id: number; type: LearningItemCue } | null;
  onOpenRoot: () => void;
  onOpenKnownFolder: (folder: Folder, ancestors: Folder[]) => void;
  onOpenFolder: (folder: Folder) => void;
  onOpenLearningItem: (learningItem: LearningItem) => void;
  onLearningItemCuePresented: (learningItemId: number) => void;
  onCreateLearningItem: () => void;
  onCreatingFolderChange: (isCreating: boolean) => void;
}) {
  return (
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
                <button type="button" disabled={isOpeningFolder} onClick={onOpenRoot}>
                  Library
                </button>
                {folderContext.ancestors.map((ancestor, index) => (
                  <span key={ancestor.id}>
                    <ChevronRight size={16} aria-hidden="true" />
                    <button
                      type="button"
                      disabled={isOpeningFolder}
                      onClick={() =>
                        onOpenKnownFolder(ancestor, folderContext.ancestors.slice(0, index))
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
                  if (!parent) onOpenRoot();
                  else onOpenKnownFolder(parent, folderContext.ancestors.slice(0, -1));
                }}
              >
                <ArrowUp size={17} aria-hidden="true" />
                Up
              </Button>
              <Button
                className="new-learning-item-button"
                disabled={isOpeningFolder}
                onClick={onCreateLearningItem}
              >
                <FilePlus2 size={17} aria-hidden="true" />
                New Learning Item
              </Button>
              <Button
                className="folder-create-button"
                ref={createFolderTriggerRef}
                variant="secondary"
                disabled={isOpeningFolder}
                onClick={() => onCreatingFolderChange(true)}
              >
                <FolderPlus size={17} aria-hidden="true" />
                Create Folder
              </Button>
            </div>
          </div>
        ) : (
          <div className="library-commands library-root-commands">
            <Button ref={createFolderTriggerRef} onClick={() => onCreatingFolderChange(true)}>
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
          onLearningItemCuePresented={onLearningItemCuePresented}
          parentId={folderId}
          onOpen={onOpenFolder}
          onOpenLearningItem={onOpenLearningItem}
          isCreatingFolder={isCreatingFolder}
          onCreatingFolderChange={onCreatingFolderChange}
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
  );
}
