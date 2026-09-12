import { describe, expect, it, vi } from "vitest";
import { tauriReviewSessionCommandClient } from "./tauriReviewSessionCommandClient";

const invoke = vi.hoisted(() => vi.fn<(command: string, args?: unknown) => Promise<unknown>>());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

it("wraps the completion request for Tauri and preserves the result", async () => {
  const result = {
    learningItemId: 4,
    reviewEventId: 8,
    rating: "good",
    eventKind: "scheduled",
    completedOn: "2026-09-11",
    nextReviewDate: "2026-09-13",
  };
  invoke.mockResolvedValueOnce(result);
  await expect(
    tauriReviewSessionCommandClient.completeDueReview({ learningItemId: 4, rating: "good" }),
  ).resolves.toEqual(result);
  expect(invoke).toHaveBeenCalledWith("complete_due_review", {
    request: { learningItemId: 4, rating: "good" },
  });
});

describe("stable completion errors", () => {
  it("preserves retryable database errors", async () => {
    invoke.mockRejectedValueOnce({ code: "database_unavailable", field: null, message: "locked" });
    await expect(
      tauriReviewSessionCommandClient.completeDueReview({ learningItemId: 4, rating: "again" }),
    ).rejects.toMatchObject({ code: "database_unavailable" });
  });

  it("maps unknown adapter failures without exposing native text", async () => {
    invoke.mockRejectedValueOnce(new Error("sqlite internals"));
    await expect(
      tauriReviewSessionCommandClient.completeDueReview({ learningItemId: 4, rating: "easy" }),
    ).rejects.toEqual({
      code: "database_unavailable",
      field: null,
      message: "Taffy could not save this review. Please try again.",
    });
  });
});
