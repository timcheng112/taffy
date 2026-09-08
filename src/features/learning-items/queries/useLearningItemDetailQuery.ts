import { useQuery } from "@tanstack/react-query";
import { useLearningItemsCommandClient } from "../commands/LearningItemsCommandClientProvider";
import { learningItemsQueryKeys } from "./queryKeys";

export function useLearningItemDetailQuery(learningItemId: number) {
  const client = useLearningItemsCommandClient();
  return useQuery({
    queryKey: learningItemsQueryKeys.detail(learningItemId),
    queryFn: () => client.getLearningItemDetail(learningItemId),
  });
}
