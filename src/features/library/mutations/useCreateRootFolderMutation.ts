import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLibraryCommandClient } from "../commands/LibraryCommandClientProvider";
import { libraryQueryKeys } from "../queries/queryKeys";

export function useCreateFolderMutation(parentId: number | null) {
  const client = useLibraryCommandClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: { name: string }) =>
      client.createFolder(parentId === null ? request : { ...request, parentId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey:
          parentId === null
            ? libraryQueryKeys.rootFolders()
            : libraryQueryKeys.folderView(parentId),
      });
    },
  });
}
