import { useMutation, useQueryClient } from "@tanstack/react-query";
import { libraryQueryKeys } from "../../library/queries/queryKeys";
import { useLearningItemsCommandClient } from "../commands/LearningItemsCommandClientProvider";
import { learningItemsQueryKeys } from "../queries/queryKeys";

export function useCreateLearningItemMutation(folderId: number) {
  const client = useLearningItemsCommandClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: learningItemsQueryKeys.create(folderId),
    mutationFn: (request: { title: string }) => client.createLearningItem({ ...request, folderId }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: libraryQueryKeys.folderView(folderId) }),
  });
}
