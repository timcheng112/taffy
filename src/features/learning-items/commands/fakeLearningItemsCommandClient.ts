import type { LearningItem, LearningItemsCommandClient } from "./types";

export function fakeLearningItemsCommandClient(
  create: (request: { folderId: number; title: string }) => Promise<LearningItem> = async ({
    folderId,
    title,
  }) => ({ id: 1, folderId, title: title.trim() }),
): LearningItemsCommandClient {
  return { createLearningItem: create };
}
