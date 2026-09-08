import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { FolderView } from "../../library/commands/types";
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
      const folderViewKey = libraryQueryKeys.folderView(detail.folder.id);
      queryClient.setQueryData<FolderView>(folderViewKey, (folderView) => {
        if (!folderView) return folderView;

        let patched = false;
        const contents = folderView.contents.map((content) => {
          if (content.type !== "learningItem" || content.value.id !== detail.id) return content;
          patched = true;
          return { ...content, value: { ...content.value, title: detail.title } };
        });

        return patched ? { ...folderView, contents } : folderView;
      });
      void queryClient.invalidateQueries({ queryKey: folderViewKey });
    },
  });
}
