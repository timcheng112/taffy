export type Folder = { id: number; name: string };
export type FolderView = {
  folder: Folder;
  ancestors: Folder[];
  contents: LibraryContent[];
};

export type LibraryContent =
  | { type: "folder"; value: Folder }
  | { type: "learningItem"; value: { id: number; folderId: number; title: string } };

export type LibraryCommandClient = {
  getRootFolders(): Promise<Folder[]>;
  getFolderView(folderId: number): Promise<FolderView>;
  createFolder(request: { name: string; parentId?: number }): Promise<Folder>;
};
