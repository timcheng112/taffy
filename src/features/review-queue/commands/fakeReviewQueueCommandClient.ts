import type { HomeReviewQueueEntry, ReviewQueueCommandClient } from "./types";

export function fakeReviewQueueCommandClient(
  initialEntries: HomeReviewQueueEntry[] = [],
): ReviewQueueCommandClient {
  const entries = initialEntries.map((entry) => ({
    ...entry,
    folder: {
      ...entry.folder,
      ancestors: entry.folder.ancestors.map((ancestor) => ({ ...ancestor })),
    },
  }));
  return {
    getHomeReviewQueue: async () => entries,
  };
}
