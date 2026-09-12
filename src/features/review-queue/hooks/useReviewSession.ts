import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { completeDueReviewCommandError, type RecallRating } from "../commands/types";
import { useCompleteDueReviewMutation } from "../mutations/useCompleteDueReviewMutation";
import { reviewQueueQueryKeys } from "../queries/queryKeys";
import { useHomeReviewQueueQuery } from "../queries/useHomeReviewQueueQuery";

type RefreshRecovery = "completion" | "stale";

export function useReviewSession({
  learningItemId,
  onCompleted,
}: {
  learningItemId: number;
  onCompleted: () => void;
}) {
  const queue = useHomeReviewQueueQuery();
  const mutation = useCompleteDueReviewMutation();
  const queryClient = useQueryClient();
  const [refreshRecovery, setRefreshRecovery] = useState<RefreshRecovery | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const entry = queue.data?.find((item) => item.learningItemId === learningItemId);
  const commandError = completeDueReviewCommandError(mutation.error);
  const isStale = commandError?.code === "review_not_eligible";

  async function refreshHomeQueue(recovery: RefreshRecovery) {
    setIsRefreshing(true);
    try {
      await queryClient.refetchQueries(
        { queryKey: reviewQueueQueryKeys.home() },
        { throwOnError: true },
      );
      setRefreshRecovery(null);
      if (recovery === "completion") onCompleted();
    } catch {
      setRefreshRecovery(recovery);
    } finally {
      setIsRefreshing(false);
    }
  }

  function completeReview(rating: RecallRating) {
    if (mutation.isPending) return;
    mutation.mutate(
      { learningItemId, rating },
      {
        onSuccess: () => void refreshHomeQueue("completion"),
        onError: (error) => {
          if (completeDueReviewCommandError(error)?.code === "review_not_eligible") {
            void refreshHomeQueue("stale");
          }
        },
      },
    );
  }

  return {
    entry,
    isMissingEntry: queue.isFetched && !entry,
    isPending: mutation.isPending,
    isSaveError: mutation.isError,
    isStale,
    refreshRecovery,
    isRefreshing,
    completeReview,
    retryHomeRefresh: () => void refreshHomeQueue(refreshRecovery ?? "completion"),
  };
}
