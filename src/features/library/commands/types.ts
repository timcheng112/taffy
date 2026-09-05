export type Folder = { id: number; name: string };
export type FolderView = {
  folder: Folder;
  ancestors: Folder[];
  childFolders: Folder[];
};

export type LibraryCommandClient = {
  getRootFolders(): Promise<Folder[]>;
  getFolderView(folderId: number): Promise<FolderView>;
  createFolder(request: { name: string; parentId?: number }): Promise<Folder>;
};
