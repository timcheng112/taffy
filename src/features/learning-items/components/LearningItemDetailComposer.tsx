import { useState } from "react";
import { Button } from "../../../components/ui/button";
import { useLearningItemDetailQuery } from "../queries/useLearningItemDetailQuery";
import { EditLearningItemPage } from "./EditLearningItemPage";
import { LearningItemDetailPage } from "./LearningItemDetailPage";

type DetailMode = "detail" | "edit";

export function LearningItemDetailComposer({
  learningItemId,
  onReturnToFolder,
}: {
  learningItemId: number;
  onReturnToFolder: () => void;
}) {
  const detailQuery = useLearningItemDetailQuery(learningItemId);
  const [mode, setMode] = useState<DetailMode>("detail");

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

  if (mode === "edit") {
    return (
      <EditLearningItemPage
        learningItemId={detailQuery.data.id}
        savedTitle={detailQuery.data.title}
        folder={detailQuery.data.folder}
        onCancel={() => setMode("detail")}
        onSaved={() => setMode("detail")}
        onReturnToFolder={onReturnToFolder}
      />
    );
  }

  return (
    <LearningItemDetailPage
      detail={detailQuery.data}
      onEdit={() => setMode("edit")}
      onReturnToFolder={onReturnToFolder}
    />
  );
}
