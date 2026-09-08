import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { FolderPlus } from "lucide-react";
import { Button } from "../../../components/ui/button";
import type { LibraryContent } from "../commands/types";
import { useCreateFolderMutation } from "../mutations/useCreateRootFolderMutation";
import {
  InlineFolderCreationForm,
  type FolderFormValues,
  useFolderCreationForm,
} from "./InlineFolderCreationForm";
import { FolderRow, LearningItemRow } from "./FolderListRow";
import { LibraryEmptyState } from "./LibraryEmptyState";
import type { LearningItemCue } from "./LearningItemMotion";

type LearningItem = Extract<LibraryContent, { type: "learningItem" }>["value"];

function creationFailure(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String(error.message)
        : String(error);
  if (message.includes("duplicate_folder_name") || message.includes("already exists here")) {
    return "A Folder with that name already exists here.";
  }
  if (message.includes("invalid_parent") || message.includes("parent Folder no longer exists")) {
    return "That parent Folder no longer exists. Return to the Library and try again.";
  }
  return "Taffy could not save this Folder. Your entry is still here—please try again.";
}

export function FolderList({
  contents,
  parentId,
  onOpen,
  onOpenLearningItem,
  learningItemCue,
  onLearningItemCuePresented,
  isCreatingFolder: controlledIsCreatingFolder,
  onCreatingFolderChange,
  focusReturnRef,
  hideCreateFolderAction = false,
}: {
  contents: LibraryContent[];
  parentId: number | null;
  onOpen: (folder: { id: number; name: string }) => void;
  onOpenLearningItem: (learningItem: LearningItem) => void;
  learningItemCue?: { id: number; type: LearningItemCue } | null;
  onLearningItemCuePresented?: (learningItemId: number) => void;
  isCreatingFolder?: boolean;
  onCreatingFolderChange?: (isCreating: boolean) => void;
  /** The control that opened the inline form when it lives outside this list. */
  focusReturnRef?: RefObject<HTMLButtonElement | null>;
  hideCreateFolderAction?: boolean;
}) {
  const [uncontrolledIsCreating, setUncontrolledIsCreating] = useState(false);
  const localCreateFolderTriggerRef = useRef<HTMLButtonElement>(null);
  const shouldRestoreFocusRef = useRef(false);
  const isCreating = controlledIsCreatingFolder ?? uncontrolledIsCreating;
  const [failure, setFailure] = useState<string | null>(null);
  const form = useFolderCreationForm();
  const { reset } = form;
  const createFolder = useCreateFolderMutation(parentId);
  const setIsCreating = useCallback(
    (next: boolean) => {
      if (onCreatingFolderChange) onCreatingFolderChange(next);
      else setUncontrolledIsCreating(next);
    },
    [onCreatingFolderChange],
  );
  const close = useCallback(() => {
    reset();
    setFailure(null);
    setIsCreating(false);
  }, [reset, setIsCreating]);
  const cancel = useCallback(() => {
    close();
    shouldRestoreFocusRef.current = true;
  }, [close]);

  useLayoutEffect(() => {
    if (!shouldRestoreFocusRef.current || isCreating) return;
    (focusReturnRef?.current ?? localCreateFolderTriggerRef.current)?.focus();
    shouldRestoreFocusRef.current = false;
  }, [focusReturnRef, isCreating]);

  useEffect(() => {
    if (!isCreating) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      cancel();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [cancel, isCreating]);

  const submitFolder = useCallback(
    (values: FolderFormValues) => {
      setFailure(null);
      createFolder.mutate(values, {
        onSuccess: close,
        onError: (error) => setFailure(creationFailure(error)),
      });
    },
    [close, createFolder],
  );

  return (
    <div className="library-list" aria-label="Library Folders">
      {isCreating && (
        <InlineFolderCreationForm form={form} failure={failure} onSubmit={submitFolder} />
      )}
      {contents.map((content) =>
        content.type === "folder" ? (
          <FolderRow key={`folder-${content.value.id}`} folder={content.value} onOpen={onOpen} />
        ) : (
          <LearningItemRow
            key={`learningItem-${content.value.id}`}
            item={content.value}
            onOpen={onOpenLearningItem}
            cue={content.value.id === learningItemCue?.id ? learningItemCue.type : undefined}
            onCuePresented={() => onLearningItemCuePresented?.(content.value.id)}
          />
        ),
      )}
      {contents.length === 0 && !isCreating && (
        <LibraryEmptyState
          title={parentId === null ? "No folders yet." : "No Learning Items or Folders yet."}
          description={
            parentId === null
              ? "Create your first Folder to start adding Learning Items."
              : "Create a Learning Item or child Folder to start organizing what you retain."
          }
          action={
            !hideCreateFolderAction && (
              <FolderCreateAction
                triggerRef={localCreateFolderTriggerRef}
                onCreate={() => setIsCreating(true)}
              />
            )
          }
        />
      )}
      {!hideCreateFolderAction && !isCreating && contents.length > 0 && (
        <FolderCreateAction
          triggerRef={localCreateFolderTriggerRef}
          onCreate={() => setIsCreating(true)}
        />
      )}
    </div>
  );
}

function FolderCreateAction({
  triggerRef,
  onCreate,
}: {
  triggerRef: RefObject<HTMLButtonElement | null>;
  onCreate: () => void;
}) {
  return (
    <Button className="create-folder-button" type="button" ref={triggerRef} onClick={onCreate}>
      <FolderPlus size={17} aria-hidden="true" />
      Create Folder
    </Button>
  );
}
