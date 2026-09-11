import { createContext, useContext } from "react";
import type { ReviewQueueCommandClient } from "./types";

const ReviewQueueCommandClientContext = createContext<ReviewQueueCommandClient | null>(null);

export function ReviewQueueCommandClientProvider({
  client,
  children,
}: {
  client: ReviewQueueCommandClient;
  children: React.ReactNode;
}) {
  return (
    <ReviewQueueCommandClientContext.Provider value={client}>
      {children}
    </ReviewQueueCommandClientContext.Provider>
  );
}

export function useReviewQueueCommandClient() {
  const client = useContext(ReviewQueueCommandClientContext);
  if (!client) throw new Error("ReviewQueueCommandClientProvider is required.");
  return client;
}
