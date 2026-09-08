import type { LearningItem, LearningItemDetail, LearningItemsCommandClient } from "./types";
import { learningItemTitleLength, maxLearningItemTitleLength } from "../titleValidation";

export function fakeLearningItemsCommandClient(
  create: (request: { folderId: number; title: string }) => Promise<LearningItem> = async ({
    folderId,
    title,
  }) => ({ id: 1, folderId, title: title.trim() }),
  initialDetails: LearningItemDetail[] = [],
): LearningItemsCommandClient {
  let details = initialDetails.map((detail) => ({
    ...detail,
    folder: { ...detail.folder, ancestors: [...detail.folder.ancestors] },
  }));

  return {
    createLearningItem: create,
    getLearningItemDetail: async (learningItemId) => {
      const detail = details.find((candidate) => candidate.id === learningItemId);
      if (!detail) {
        throw { code: "learning_item_not_found", message: "This Learning Item no longer exists." };
      }
      return detail;
    },
    updateLearningItemTitle: async ({ learningItemId, title }) => {
      const detail = details.find((candidate) => candidate.id === learningItemId);
      if (!detail) {
        throw { code: "learning_item_not_found", message: "This Learning Item no longer exists." };
      }
      const normalizedTitle = title.trim();
      if (!normalizedTitle) {
        throw {
          code: "blank_learning_item_title",
          field: "title",
          message: "Enter a Learning Item title.",
        };
      }
      if (learningItemTitleLength(normalizedTitle) > maxLearningItemTitleLength) {
        throw {
          code: "learning_item_title_too_long",
          field: "title",
          message: `Keep Learning Item titles to ${maxLearningItemTitleLength} characters or fewer.`,
        };
      }
      if (
        details.some(
          (candidate) =>
            candidate.id !== learningItemId &&
            candidate.folder.id === detail.folder.id &&
            candidate.title.toLocaleLowerCase() === normalizedTitle.toLocaleLowerCase(),
        )
      ) {
        throw {
          code: "duplicate_learning_item_title",
          field: "title",
          message: "A Learning Item with that title already exists in this Folder.",
        };
      }
      const refreshedDetail = { ...detail, title: normalizedTitle };
      details = details.map((candidate) =>
        candidate.id === learningItemId ? refreshedDetail : candidate,
      );
      return refreshedDetail;
    },
  };
}
