import { Button } from "../../../components/ui/button";
import type { LearningItemDetail } from "../commands/types";

export function LearningItemDetailPage({
  detail,
  onEdit,
  onReturnToFolder,
}: {
  detail: LearningItemDetail;
  onEdit: () => void;
  onReturnToFolder: () => void;
}) {
  return (
    <section className="learning-item-detail" aria-labelledby="learning-item-detail-heading">
      <p className="eyebrow">Learning Item</p>
      <h1 id="learning-item-detail-heading">{detail.title}</h1>
      <p className="learning-item-path">
        <span>Folder</span>
        {[...detail.folder.ancestors, detail.folder].map((folder) => folder.name).join(" / ")}
      </p>
      <div className="learning-item-detail-actions">
        <Button variant="secondary" onClick={onReturnToFolder}>
          Back to Folder
        </Button>
        <Button variant="secondary" onClick={onEdit}>
          Edit
        </Button>
      </div>
    </section>
  );
}
