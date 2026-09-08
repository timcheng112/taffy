import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { learningItemsCommandError } from "../commands/types";
import { useUpdateLearningItemTitleMutation } from "../mutations/useUpdateLearningItemTitleMutation";
import { useLearningItemDetailQuery } from "../queries/useLearningItemDetailQuery";
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
    return {
      field: "title",
      message: commandError.message,
    };
  }
  return {
    field: null,
    message: "Taffy could not save this Learning Item. Your title is still here—please try again.",
    returnToFolder: false,
  };
}

export function LearningItemDetailPage({
  learningItemId,
  onReturnToFolder,
}: {
  learningItemId: number;
  onReturnToFolder: () => void;
}) {
  const detailQuery = useLearningItemDetailQuery(learningItemId);
  const [isEditing, setIsEditing] = useState(false);

  if (detailQuery.isPending) {
    return (
      <section className="learning-item-detail-state" aria-busy="true">
        <p>Opening Learning Item…</p>
      </section>
    );
  }
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <section className="learning-item-detail-state">
        <p className="failure" role="alert">
          Taffy could not load this Learning Item. Return to the Folder and try again.
        </p>
        <Button variant="secondary" onClick={onReturnToFolder}>
          Back to Folder
        </Button>
      </section>
    );
  }

  return isEditing ? (
    <EditLearningItemPage
      learningItemId={detailQuery.data.id}
      savedTitle={detailQuery.data.title}
      folder={detailQuery.data.folder}
      onCancel={() => setIsEditing(false)}
      onSaved={() => setIsEditing(false)}
      onReturnToFolder={onReturnToFolder}
    />
  ) : (
    <section className="learning-item-detail" aria-labelledby="learning-item-detail-heading">
      <p className="eyebrow">Learning Item</p>
      <h1 id="learning-item-detail-heading">{detailQuery.data.title}</h1>
      <p className="learning-item-path">
        <span>Folder</span>
        {[...detailQuery.data.folder.ancestors, detailQuery.data.folder]
          .map((folder) => folder.name)
          .join(" / ")}
      </p>
      <div className="learning-item-detail-actions">
        <Button variant="secondary" onClick={onReturnToFolder}>
          Back to Folder
        </Button>
        <Button variant="secondary" onClick={() => setIsEditing(true)}>
          Edit
        </Button>
      </div>
    </section>
  );
}

function EditLearningItemPage({
  learningItemId,
  savedTitle,
  folder,
  onCancel,
  onSaved,
  onReturnToFolder,
}: {
  learningItemId: number;
  savedTitle: string;
  folder: { name: string; ancestors: Array<{ name: string }> };
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
