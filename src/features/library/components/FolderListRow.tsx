import { FileText, Folder as FolderIcon } from "lucide-react";
import type { LibraryContent } from "../commands/types";
import { LearningItemMotion, type LearningItemCue } from "./LearningItemMotion";

type Folder = Extract<LibraryContent, { type: "folder" }>["value"];
type LearningItem = Extract<LibraryContent, { type: "learningItem" }>["value"];

export function FolderRow({
  folder,
  onOpen,
}: {
  folder: Folder;
  onOpen: (folder: Folder) => void;
}) {
  return (
    <button className="library-row folder-row" type="button" onClick={() => onOpen(folder)}>
      <FolderIcon size={18} aria-hidden="true" />
      <span>{folder.name}</span>
    </button>
  );
}

export function LearningItemRow({
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
