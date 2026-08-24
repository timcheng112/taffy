export type Folder = { id: number; name: string };

export type LibraryCommandClient = {
  getRootFolders(): Promise<Folder[]>;
  createRootFolder(request: { name: string }): Promise<Folder>;
};
