import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLibraryCommandClient } from "../commands/LibraryCommandClientProvider";
import type { Folder } from "../commands/types";
import { libraryQueryKeys } from "../queries/queryKeys";

export function useCreateRootFolderMutation() {
  const client = useLibraryCommandClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: { name: string }) => client.createRootFolder(request),
    onSuccess: (folder: Folder) => {
      queryClient.setQueryData<Folder[]>(libraryQueryKeys.rootFolders(), (folders = []) => [
        ...folders,
        folder,
      ]);
    },
  });
}
