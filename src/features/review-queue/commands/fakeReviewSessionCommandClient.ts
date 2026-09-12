import type {
  CompleteDueReviewRequest,
  CompletedDueReview,
  ReviewSessionCommandClient,
} from "./types";

export function fakeReviewSessionCommandClient(
  complete: (request: CompleteDueReviewRequest) => Promise<CompletedDueReview>,
): ReviewSessionCommandClient {
  return { completeDueReview: complete };
}
