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
