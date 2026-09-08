import { vi } from "vitest";

const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn<(command: string, args: unknown) => Promise<unknown>>(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { tauriLearningItemsCommandClient } from "./tauriLearningItemsCommandClient";

it("uses the ratified detail and update command shapes", async () => {
  const detail = {
    id: 4,
    title: "Binary Search",
    folder: { id: 2, name: "Searching", ancestors: [] },
    reviewDate: "2026-09-08",
  };
  invoke.mockResolvedValue(detail);

  await expect(tauriLearningItemsCommandClient.getLearningItemDetail(4)).resolves.toEqual(detail);
  await expect(
    tauriLearningItemsCommandClient.updateLearningItemTitle({ learningItemId: 4, title: "Trees" }),
  ).resolves.toEqual(detail);
  expect(invoke).toHaveBeenNthCalledWith(1, "get_learning_item_detail", { learningItemId: 4 });
  expect(invoke).toHaveBeenNthCalledWith(2, "update_learning_item_title", {
    request: { learningItemId: 4, title: "Trees" },
  });
});

it("normalizes unexpected Tauri failures to the stable unavailable error", async () => {
  invoke.mockRejectedValueOnce(new Error("offline"));

  await expect(tauriLearningItemsCommandClient.getLearningItemDetail(4)).rejects.toEqual({
    code: "database_unavailable",
    message: "Taffy could not load this Learning Item. Please try again.",
  });
});
