import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { FolderPlus, Folder as FolderIcon, LibraryBig } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useCreateRootFolderMutation } from "../mutations/useCreateRootFolderMutation";
import type { Folder } from "../commands/types";

const rootFolderSchema = z.object({
  name: z.string().trim().min(1, "Enter a Folder name."),
});
type RootFolderFormValues = z.infer<typeof rootFolderSchema>;

export function RootFolderList({ folders }: { folders: Folder[] }) {
  const [isCreating, setIsCreating] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const form = useForm<RootFolderFormValues>({
    resolver: zodResolver(rootFolderSchema),
    defaultValues: { name: "" },
  });
  const createFolder = useCreateRootFolderMutation();

  function cancel() {
    form.reset();
    setFailure(null);
    setIsCreating(false);
  }

  return (
    <div className="library-list" aria-label="Library Folders">
      {folders.map((folder) => (
        <div className="library-row" key={folder.id}>
          <FolderIcon size={18} aria-hidden="true" />
          <span>{folder.name}</span>
        </div>
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
      {isCreating && (
        <form
          className="library-row create-folder-row"
          onSubmit={form.handleSubmit((values) => {
            setFailure(null);
            createFolder.mutate(values, {
              onSuccess: () => cancel(),
              onError: () =>
                setFailure(
                  "Taffy could not save this Folder. Your entry is still here—please try again.",
                ),
            });
          })}
          noValidate
        >
          <FolderIcon size={18} aria-hidden="true" />
          <div className="create-folder-field">
            <label className="sr-only" htmlFor="root-folder-name">
              Folder name
            </label>
            <input
              id="root-folder-name"
              autoFocus
              aria-invalid={Boolean(form.formState.errors.name)}
              aria-describedby="root-folder-name-error"
              {...form.register("name")}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancel();
                }
              }}
            />
            <p className="field-error" id="root-folder-name-error" role="alert">
              {form.formState.errors.name?.message}
            </p>
            {failure && (
              <p className="failure" role="alert">
                {failure}
              </p>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
