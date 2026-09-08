import { zodResolver } from "@hookform/resolvers/zod";
import { Folder as FolderIcon } from "lucide-react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { Input } from "../../../components/ui/input";

const folderSchema = z.object({
  name: z.string().trim().min(1, "Enter a Folder name."),
});

export type FolderFormValues = z.infer<typeof folderSchema>;

export function useFolderCreationForm() {
  return useForm<FolderFormValues>({
    resolver: zodResolver(folderSchema),
    defaultValues: { name: "" },
  });
}

export function InlineFolderCreationForm({
  form,
  failure,
  onSubmit,
}: {
  form: UseFormReturn<FolderFormValues>;
  failure: string | null;
  onSubmit: (values: FolderFormValues) => void;
}) {
  const { formState, handleSubmit, register } = form;

  return (
    <form className="library-row create-folder-row" onSubmit={handleSubmit(onSubmit)} noValidate>
      <FolderIcon size={18} aria-hidden="true" />
      <div className="create-folder-field">
        <label className="sr-only" htmlFor="folder-name">
          Folder name
        </label>
        <Input
          className="compact-folder-input"
          id="folder-name"
          autoFocus
          aria-invalid={Boolean(formState.errors.name)}
          aria-describedby="folder-name-error"
          {...register("name")}
        />
        <p className="field-error" id="folder-name-error" role="alert">
          {formState.errors.name?.message}
        </p>
        {failure && (
          <p className="field-error" role="alert">
            {failure}
          </p>
        )}
      </div>
    </form>
  );
}
