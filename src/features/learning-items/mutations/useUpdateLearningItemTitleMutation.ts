import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLearningItemsCommandClient } from "../commands/LearningItemsCommandClientProvider";
import { libraryQueryKeys } from "../../library/queries/queryKeys";
import { learningItemsQueryKeys } from "../queries/queryKeys";

export function useUpdateLearningItemTitleMutation() {
  const client = useLearningItemsCommandClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: { learningItemId: number; title: string }) =>
      client.updateLearningItemTitle(request),
    onSuccess: (detail) => {
      queryClient.setQueryData(learningItemsQueryKeys.detail(detail.id), detail);
      queryClient.invalidateQueries({ queryKey: libraryQueryKeys.folderView(detail.folder.id) });
    },
  });
}
