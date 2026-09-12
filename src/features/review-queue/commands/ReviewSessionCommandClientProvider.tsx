import { createContext, useContext } from "react";
import type { ReviewSessionCommandClient } from "./types";

const ReviewSessionCommandClientContext = createContext<ReviewSessionCommandClient | null>(null);

export function ReviewSessionCommandClientProvider({
  client,
  children,
}: {
  client: ReviewSessionCommandClient;
  children: React.ReactNode;
}) {
  return (
    <ReviewSessionCommandClientContext.Provider value={client}>
      {children}
    </ReviewSessionCommandClientContext.Provider>
  );
}

export function useReviewSessionCommandClient() {
  const client = useContext(ReviewSessionCommandClientContext);
  if (!client) throw new Error("ReviewSessionCommandClientProvider is required.");
  return client;
}
