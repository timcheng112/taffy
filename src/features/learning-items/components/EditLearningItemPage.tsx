import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { learningItemsCommandError, type LearningItemDetail } from "../commands/types";
import { useUpdateLearningItemTitleMutation } from "../mutations/useUpdateLearningItemTitleMutation";
import { learningItemTitleSchema, type LearningItemTitleValues } from "../titleValidation";

type FormFailure = { field: null; message: string; returnToFolder: boolean };
type UpdateFailure = { field: "title"; message: string } | FormFailure;

function updateFailure(error: unknown): UpdateFailure {
  const commandError = learningItemsCommandError(error);
  if (commandError?.code === "learning_item_not_found") {
    return {
      field: null,
      message: "This Learning Item no longer exists.",
      returnToFolder: true,
    };
  }
  if (commandError?.field === "title") {
    return { field: "title", message: commandError.message };
  }
  return {
    field: null,
    message: "Taffy could not save this Learning Item. Your title is still here—please try again.",
    returnToFolder: false,
  };
}

export function EditLearningItemPage({
  learningItemId,
  savedTitle,
  folder,
  onCancel,
  onSaved,
  onReturnToFolder,
}: {
  learningItemId: number;
  savedTitle: string;
  folder: LearningItemDetail["folder"];
  onCancel: () => void;
  onSaved: () => void;
  onReturnToFolder: () => void;
}) {
  const form = useForm<LearningItemTitleValues>({
    resolver: zodResolver(learningItemTitleSchema),
    defaultValues: { title: savedTitle },
    mode: "onChange",
  });
  const updateLearningItemTitle = useUpdateLearningItemTitleMutation();
  const [formFailure, setFormFailure] = useState<FormFailure | null>(null);

  return (
    <section className="learning-item-create" aria-labelledby="edit-learning-item-heading">
      <p className="eyebrow">Edit Learning Item</p>
      <h1 id="edit-learning-item-heading">Rename Learning Item</h1>
      <p className="learning-item-path">
        <span>Folder</span>
        {[...folder.ancestors, folder].map((candidate) => candidate.name).join(" / ")}
      </p>
      <form
        className="learning-item-form"
        aria-label="Edit Learning Item"
        noValidate
        onSubmit={form.handleSubmit((values) => {
          setFormFailure(null);
          updateLearningItemTitle.mutate(
            { learningItemId, title: values.title },
            {
              onSuccess: onSaved,
              onError: (error) => {
                const failure = updateFailure(error);
                if (failure.field === "title") {
                  form.setError("title", { message: failure.message }, { shouldFocus: true });
                } else {
                  setFormFailure(failure);
                }
              },
            },
          );
        })}
      >
        <label htmlFor="learning-item-title">Title</label>
        <Input
          id="learning-item-title"
          autoFocus
          aria-describedby="learning-item-title-error"
          aria-invalid={Boolean(form.formState.errors.title)}
          disabled={updateLearningItemTitle.isPending}
          {...form.register("title")}
        />
        <p className="field-error" id="learning-item-title-error" role="alert">
          {form.formState.errors.title?.message}
        </p>
        {formFailure && (
          <p className="field-error" role="alert">
            {formFailure.message}
          </p>
        )}
        {formFailure?.returnToFolder && (
          <Button type="button" variant="secondary" onClick={onReturnToFolder}>
            Back to Folder
          </Button>
        )}
        <div className="learning-item-form-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={updateLearningItemTitle.isPending}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={updateLearningItemTitle.isPending}>
            {updateLearningItemTitle.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </section>
  );
}
