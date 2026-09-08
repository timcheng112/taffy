import { expect, it } from "vitest";
import { fakeLearningItemsCommandClient } from "./fakeLearningItemsCommandClient";

it("uses the native title-length error contract for updates", async () => {
  const client = fakeLearningItemsCommandClient(undefined, [
    {
      id: 4,
      title: "Binary Search",
      folder: { id: 2, name: "Searching", ancestors: [] },
      reviewDate: "2026-09-08",
    },
  ]);

  await expect(
    client.updateLearningItemTitle({ learningItemId: 4, title: "a".repeat(121) }),
  ).rejects.toEqual({
    code: "learning_item_title_too_long",
    field: "title",
    message: "Keep Learning Item titles to 120 characters or fewer.",
  });
});
