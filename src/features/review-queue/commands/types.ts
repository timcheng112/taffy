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

export function reviewQueueCommandError(error: unknown): ReviewQueueCommandError | null {
  if (typeof error !== "object" || error === null) return null;
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code !== "database_unavailable" || typeof candidate.message !== "string") {
    return null;
  }
  return { code: "database_unavailable", message: candidate.message };
}
