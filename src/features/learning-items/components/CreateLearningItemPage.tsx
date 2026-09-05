import { zodResolver } from "@hookform/resolvers/zod";
import { FilePlus2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import type { Folder } from "../../library";
import { useCreateLearningItemMutation } from "../mutations/useCreateLearningItemMutation";
import { learningItemsCommandError, type LearningItem } from "../commands/types";

const learningItemSchema = z.object({
  title: z.string().trim().min(1, "Enter a Learning Item title."),
});
type LearningItemFormValues = z.infer<typeof learningItemSchema>;

export function CreateLearningItemPage({
  folder,
  ancestors,
  onCancel,
  onCreated,
}: {
  folder: Folder;
  ancestors: Folder[];
  onCancel: () => void;
  onCreated: (learningItem: LearningItem) => void;
}) {
  const form = useForm<LearningItemFormValues>({
    resolver: zodResolver(learningItemSchema),
    defaultValues: { title: "" },
  });
  const createLearningItem = useCreateLearningItemMutation(folder.id);
  const [formError, setFormError] = useState<string | null>(null);
  const folderPath = ["Library", ...ancestors.map((ancestor) => ancestor.name), folder.name].join(
    " / ",
  );

  return (
    <section className="learning-item-create" aria-labelledby="create-learning-item-heading">
      <p className="eyebrow">New Learning Item</p>
      <h1 id="create-learning-item-heading">Add something to retain</h1>
      <p className="learning-item-path">
        <span>Folder</span>
        {folderPath}
      </p>
      <form
        className="learning-item-form"
        noValidate
        onSubmit={form.handleSubmit((values) => {
          setFormError(null);
          createLearningItem.mutate(values, {
            onSuccess: onCreated,
            onError: (error) => {
              const commandError = learningItemsCommandError(error);
              const message =
                commandError?.message ??
                "Taffy could not save this Learning Item. Your title is still here—please try again.";
              if (commandError?.field === "title") form.setError("title", { message });
              else setFormError(message);
            },
          });
        })}
      >
        <label htmlFor="learning-item-title">Title</label>
        <Input
          id="learning-item-title"
          autoFocus
          aria-describedby="learning-item-title-error"
          aria-invalid={Boolean(form.formState.errors.title)}
          disabled={createLearningItem.isPending}
          placeholder="e.g. Binary Search"
          {...form.register("title")}
        />
        <p className="field-error" id="learning-item-title-error" role="alert">
          {form.formState.errors.title?.message}
        </p>
        {formError && (
          <p className="field-error" role="alert">
            {formError}
          </p>
        )}
        <div className="learning-item-form-actions">
          <Button variant="secondary" disabled={createLearningItem.isPending} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={createLearningItem.isPending}>
            <FilePlus2 size={17} aria-hidden="true" />
            {createLearningItem.isPending ? "Saving…" : "Save Learning Item"}
          </Button>
        </div>
      </form>
    </section>
  );
}
