import { useQuery } from "@tanstack/react-query";
import { useLibraryCommandClient } from "../commands/LibraryCommandClientProvider";
import { libraryQueryKeys } from "./queryKeys";

export function useRootFoldersQuery() {
  const client = useLibraryCommandClient();
  return useQuery({
    queryKey: libraryQueryKeys.rootFolders(),
    queryFn: () => client.getRootFolders(),
  });
}

export function useFolderViewQuery(folderId: number | null) {
  const client = useLibraryCommandClient();
  return useQuery({
    queryKey: libraryQueryKeys.folderView(folderId ?? 0),
    queryFn: () => client.getFolderView(folderId!),
    enabled: folderId !== null,
  });
}
