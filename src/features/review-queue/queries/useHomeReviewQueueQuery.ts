import { useQuery } from "@tanstack/react-query";
import { useReviewQueueCommandClient } from "../commands/ReviewQueueCommandClientProvider";
import { reviewQueueQueryKeys } from "./queryKeys";

export function useHomeReviewQueueQuery() {
  const client = useReviewQueueCommandClient();
  return useQuery({
    queryKey: reviewQueueQueryKeys.home(),
    queryFn: () => client.getHomeReviewQueue(),
    retry: false,
  });
}
