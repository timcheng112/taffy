export const libraryQueryKeys = {
  rootFolders: () => ["library", "root-folders"] as const,
  folderView: (folderId: number) => ["library", "folder", folderId] as const,
};
