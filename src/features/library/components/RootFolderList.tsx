import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { FolderPlus, Folder as FolderIcon, LibraryBig } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useCreateFolderMutation } from "../mutations/useCreateRootFolderMutation";
import type { Folder } from "../commands/types";

const folderSchema = z.object({
  name: z.string().trim().min(1, "Enter a Folder name."),
});
type FolderFormValues = z.infer<typeof folderSchema>;

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
  folders,
  parentId,
  onOpen,
}: {
  folders: Folder[];
  parentId: number | null;
  onOpen: (folderId: number) => void;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const form = useForm<FolderFormValues>({
    resolver: zodResolver(folderSchema),
    defaultValues: { name: "" },
  });
  const createFolder = useCreateFolderMutation(parentId);

  function cancel() {
    form.reset();
    setFailure(null);
    setIsCreating(false);
  }

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
            <input
              id="folder-name"
              autoFocus
              aria-invalid={Boolean(form.formState.errors.name)}
              aria-describedby="folder-name-error"
              {...form.register("name")}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancel();
                }
              }}
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
      {folders.map((folder) => (
        <button
          className="library-row folder-row"
          key={folder.id}
          type="button"
          onClick={() => onOpen(folder.id)}
        >
          <FolderIcon size={18} aria-hidden="true" />
          <span>{folder.name}</span>
        </button>
      ))}
      {folders.length === 0 && !isCreating && (
        <div className="empty-library">
          <LibraryBig size={28} aria-hidden="true" />
          <p>No folders yet.</p>
          <p className="empty-library-copy">
            Create your first Folder to start adding Learning Items.
          </p>
          <button
            className="create-folder-button"
            type="button"
            onClick={() => setIsCreating(true)}
          >
            <FolderPlus size={17} aria-hidden="true" />
            Create Folder
          </button>
        </div>
      )}
      {!isCreating && folders.length > 0 && (
        <button className="create-folder-button" type="button" onClick={() => setIsCreating(true)}>
          <FolderPlus size={17} aria-hidden="true" />
          Create Folder
        </button>
      )}
    </div>
  );
}
