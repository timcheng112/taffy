import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileText, FolderPlus, Folder as FolderIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { useCreateFolderMutation } from "../mutations/useCreateRootFolderMutation";
import type { LibraryContent } from "../commands/types";
import { LibraryEmptyState } from "./LibraryEmptyState";
import { LearningItemMotion, type LearningItemCue } from "./LearningItemMotion";

const folderSchema = z.object({
  name: z.string().trim().min(1, "Enter a Folder name."),
});
type FolderFormValues = z.infer<typeof folderSchema>;

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
  onOpenLearningItem: (learningItem: { id: number; folderId: number; title: string }) => void;
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
  const [shouldRestoreFocus, setShouldRestoreFocus] = useState(false);
  const isCreating = controlledIsCreatingFolder ?? uncontrolledIsCreating;
  const [failure, setFailure] = useState<string | null>(null);
  const form = useForm<FolderFormValues>({
    resolver: zodResolver(folderSchema),
    defaultValues: { name: "" },
  });
  const createFolder = useCreateFolderMutation(parentId);
  function setIsCreating(next: boolean) {
    if (onCreatingFolderChange) onCreatingFolderChange(next);
    else setUncontrolledIsCreating(next);
  }
  const cancel = useCallback(() => {
    form.reset();
    setFailure(null);
    setIsCreating(false);
    setShouldRestoreFocus(true);
  }, [form]);

  useLayoutEffect(() => {
    if (!shouldRestoreFocus || isCreating) return;
    (focusReturnRef?.current ?? localCreateFolderTriggerRef.current)?.focus();
    setShouldRestoreFocus(false);
  }, [focusReturnRef, isCreating, shouldRestoreFocus]);

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

  return (
    <div className="library-list" aria-label="Library Folders">
      {isCreating && (
        <form
          className="library-row create-folder-row"
          onSubmit={form.handleSubmit((values) => {
            setFailure(null);
            createFolder.mutate(values, {
              onSuccess: () => cancel(),
              onError: (error) => setFailure(creationFailure(error)),
            });
          })}
          noValidate
        >
          <FolderIcon size={18} aria-hidden="true" />
          <div className="create-folder-field">
            <label className="sr-only" htmlFor="folder-name">
              Folder name
            </label>
            <Input
              className="compact-folder-input"
              id="folder-name"
              autoFocus
              aria-invalid={Boolean(form.formState.errors.name)}
              aria-describedby="folder-name-error"
              {...form.register("name")}
            />
            <p className="field-error" id="folder-name-error" role="alert">
              {form.formState.errors.name?.message}
            </p>
            {failure && (
              <p className="field-error" role="alert">
                {failure}
              </p>
            )}
          </div>
        </form>
      )}
      {contents.map((content) => (
        <Fragment key={`${content.type}-${content.value.id}`}>
          {content.type === "folder" ? (
            <button
              className="library-row folder-row"
              type="button"
              onClick={() => onOpen(content.value)}
            >
              <FolderIcon size={18} aria-hidden="true" />
              <span>{content.value.name}</span>
            </button>
          ) : (
            <LearningItemRow
              item={content.value}
              onOpen={onOpenLearningItem}
              cue={content.value.id === learningItemCue?.id ? learningItemCue.type : undefined}
              onCuePresented={() => onLearningItemCuePresented?.(content.value.id)}
            />
          )}
        </Fragment>
      ))}
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
              <Button
                className="create-folder-button"
                type="button"
                ref={localCreateFolderTriggerRef}
                onClick={() => setIsCreating(true)}
              >
                <FolderPlus size={17} aria-hidden="true" />
                Create Folder
              </Button>
            )
          }
        />
      )}
      {!hideCreateFolderAction && !isCreating && contents.length > 0 && (
        <Button
          className="create-folder-button"
          ref={localCreateFolderTriggerRef}
          onClick={() => setIsCreating(true)}
        >
          <FolderPlus size={17} aria-hidden="true" />
          Create Folder
        </Button>
      )}
    </div>
  );
}

function LearningItemRow({
  item,
  onOpen,
  cue,
  onCuePresented,
}: {
  item: LearningItem;
  onOpen: (learningItem: LearningItem) => void;
  cue?: LearningItemCue;
  onCuePresented?: () => void;
}) {
  return (
    <LearningItemMotion cue={cue} onPresented={onCuePresented}>
      <button
        className="library-row learning-item-row"
        type="button"
        onClick={() => onOpen(item)}
        title={item.title}
      >
        <FileText className="learning-item-row-icon" size={18} aria-hidden="true" />
        <span className="learning-item-row-title">{item.title}</span>
      </button>
    </LearningItemMotion>
  );
}
