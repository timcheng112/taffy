import type { CompleteDueReviewRequest, ReviewSessionCommandClient } from "./types";

export function fakeReviewSessionCommandClient(
  complete: (request: CompleteDueReviewRequest) => Promise<void>,
): ReviewSessionCommandClient {
  return { completeDueReview: complete };
}
