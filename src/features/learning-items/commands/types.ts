import type { Folder } from "../../library/commands/types";

export type LearningItem = { id: number; folderId: number; title: string };

export type LearningItemDetail = {
  id: number;
  title: string;
  folder: { id: number; name: string; ancestors: Folder[] };
  reviewDate: string;
  hasReviewHistory: false;
};

export type LearningItemsCommandError = {
  code: string;
  field?: "title" | "folderId";
  message: string;
};

export function learningItemsCommandError(error: unknown): LearningItemsCommandError | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return {
      code: error.code,
      field:
        "field" in error && (error.field === "title" || error.field === "folderId")
          ? error.field
          : undefined,
      message: error.message,
    };
  }
  return null;
}

export type LearningItemsCommandClient = {
  createLearningItem(request: { folderId: number; title: string }): Promise<LearningItem>;
  getLearningItemDetail(learningItemId: number): Promise<LearningItemDetail>;
  updateLearningItemTitle(request: {
    learningItemId: number;
    title: string;
  }): Promise<LearningItemDetail>;
};
