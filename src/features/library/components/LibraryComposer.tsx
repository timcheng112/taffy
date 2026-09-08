import { useCallback, useRef, useState } from "react";
import { CreateLearningItemPage } from "../../learning-items/components/CreateLearningItemPage";
import { LearningItemDetailComposer } from "../../learning-items/components/LearningItemDetailComposer";
import type { Folder, FolderView, LibraryContent } from "../commands/types";
import { useFolderViewQuery, useRootFoldersQuery } from "../queries/useRootFoldersQuery";
import { LibraryContentsPage } from "./LibraryContentsPage";
import type { LearningItemCue } from "./LearningItemMotion";

type LibraryMode = "contents" | "create-learning-item" | "learning-item-detail";

export function LibraryComposer() {
  const [folderId, setFolderId] = useState<number | null>(null);
  const [pendingFolderContext, setPendingFolderContext] = useState<Pick<
    FolderView,
    "folder" | "ancestors"
  > | null>(null);
  const [mode, setMode] = useState<LibraryMode>("contents");
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
    setMode("contents");
    setIsCreatingFolder(false);
    setLearningItemCue(null);
    setPendingFolderContext(null);
    setFolderId(null);
    setDetailOrigin(null);
  }

  function openFolder(folder: Folder) {
    setMode("contents");
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
    setMode("contents");
    setIsCreatingFolder(false);
    setLearningItemCue(null);
    setPendingFolderContext({ folder, ancestors });
    setFolderId(folder.id);
    setDetailOrigin(null);
  }

  function returnToDetailOrigin() {
    if (!detailOrigin) return;
    setMode("contents");
    setIsCreatingFolder(false);
    setLearningItemCue({ id: detailOrigin.learningItemId, type: "return" });
    setPendingFolderContext({ folder: detailOrigin.folder, ancestors: detailOrigin.ancestors });
    setFolderId(detailOrigin.folder.id);
    setDetailOrigin(null);
  }

  const clearLearningItemCue = useCallback((learningItemId: number) => {
    setLearningItemCue((current) => (current?.id === learningItemId ? null : current));
  }, []);

  if (mode === "create-learning-item" && view) {
    return (
      <CreateLearningItemPage
        ancestors={view.ancestors}
        folder={view.folder}
        onCancel={() => setMode("contents")}
        onCreated={(learningItem) => {
          setMode("contents");
          setLearningItemCue({ id: learningItem.id, type: "insertion" });
        }}
      />
    );
  }

  if (mode === "learning-item-detail" && detailOrigin) {
    return (
      <LearningItemDetailComposer
        learningItemId={detailOrigin.learningItemId}
        onReturnToFolder={returnToDetailOrigin}
      />
    );
  }

  return (
    <LibraryContentsPage
      contents={contents}
      folderId={folderId}
      folderContext={folderContext}
      isRoot={isRoot}
      isPending={isPending}
      isError={isError}
      isOpeningFolder={isOpeningFolder}
      isCreatingFolder={isCreatingFolder}
      createFolderTriggerRef={createFolderTriggerRef}
      learningItemCue={learningItemCue}
      onOpenRoot={openRoot}
      onOpenKnownFolder={openKnownFolder}
      onOpenFolder={openFolder}
      onOpenLearningItem={(learningItem) => {
        if (!view) return;
        setDetailOrigin({
          folder: view.folder,
          ancestors: view.ancestors,
          learningItemId: learningItem.id,
        });
        setMode("learning-item-detail");
      }}
      onLearningItemCuePresented={clearLearningItemCue}
      onCreateLearningItem={() => setMode("create-learning-item")}
      onCreatingFolderChange={setIsCreatingFolder}
    />
  );
}
