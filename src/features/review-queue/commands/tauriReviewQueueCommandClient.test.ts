import { vi } from "vitest";

const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { tauriReviewQueueCommandClient } from "./tauriReviewQueueCommandClient";

const entries = [
  {
    learningItemId: 4,
    title: "TypeScript generics",
    folder: { id: 2, name: "TypeScript", ancestors: [{ id: 1, name: "Web Foundations" }] },
    kind: "dueReview" as const,
  },
];

it("invokes the no-argument command and preserves camelCase rows", async () => {
  invoke.mockResolvedValue(entries);

  await expect(tauriReviewQueueCommandClient.getHomeReviewQueue()).resolves.toEqual(entries);
  expect(invoke).toHaveBeenCalledWith("get_home_review_queue");
});

it("preserves a structured database_unavailable failure", async () => {
  const error = { code: "database_unavailable", message: "Database is locked." };
  invoke.mockRejectedValueOnce(error);

  await expect(tauriReviewQueueCommandClient.getHomeReviewQueue()).rejects.toEqual(error);
});

it("maps an unstructured invoke failure to the stable error", async () => {
  invoke.mockRejectedValueOnce(new Error("offline"));

  await expect(tauriReviewQueueCommandClient.getHomeReviewQueue()).rejects.toEqual({
    code: "database_unavailable",
    message: "Taffy could not load your Review Queue. Please try again.",
  });
});
