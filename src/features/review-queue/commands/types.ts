export type ReviewQueueFolder = {
  id: number;
  name: string;
  ancestors: Array<{ id: number; name: string }>;
};

export type HomeReviewQueueEntry = {
  learningItemId: number;
  title: string;
  folder: ReviewQueueFolder;
  kind: "dueReview";
};

export type ReviewQueueCommandError = {
  code: "database_unavailable";
  message: string;
};

export type ReviewQueueCommandClient = {
  getHomeReviewQueue(): Promise<HomeReviewQueueEntry[]>;
};

export type RecallRating = "again" | "hard" | "good" | "easy";

export type CompleteDueReviewRequest = {
  learningItemId: number;
  rating: RecallRating;
};

export type CompleteDueReviewError = {
  code: "invalid_recall_rating" | "review_not_eligible" | "database_unavailable";
  field: "rating" | null;
  message: string;
};

export type ReviewSessionCommandClient = {
  completeDueReview(request: CompleteDueReviewRequest): Promise<void>;
};

export function completeDueReviewCommandError(error: unknown): CompleteDueReviewError | null {
  if (typeof error !== "object" || error === null) return null;
  const candidate = error as { code?: unknown; field?: unknown; message?: unknown };
  if (
    !["invalid_recall_rating", "review_not_eligible", "database_unavailable"].includes(
      candidate.code as string,
    ) ||
    (candidate.field !== "rating" && candidate.field !== null) ||
    typeof candidate.message !== "string"
  ) {
    return null;
  }
  return {
    code: candidate.code as CompleteDueReviewError["code"],
    field: candidate.field,
    message: candidate.message,
  };
}

export function reviewQueueCommandError(error: unknown): ReviewQueueCommandError | null {
  if (typeof error !== "object" || error === null) return null;
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code !== "database_unavailable" || typeof candidate.message !== "string") {
    return null;
  }
  return { code: "database_unavailable", message: candidate.message };
}
