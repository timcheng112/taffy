import { useMutation } from "@tanstack/react-query";
import { useReviewSessionCommandClient } from "../commands/ReviewSessionCommandClientProvider";
import type { CompleteDueReviewRequest } from "../commands/types";

export function useCompleteDueReviewMutation() {
  const client = useReviewSessionCommandClient();
  return useMutation({
    mutationFn: (request: CompleteDueReviewRequest) => client.completeDueReview(request),
  });
}
