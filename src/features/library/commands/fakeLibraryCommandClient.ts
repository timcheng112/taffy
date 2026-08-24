import type { Folder, LibraryCommandClient } from "./types";

export function fakeLibraryCommandClient(initialFolders: Folder[] = []): LibraryCommandClient {
  let folders = initialFolders;
  let nextId = Math.max(0, ...folders.map((folder) => folder.id)) + 1;
  return {
    getRootFolders: async () => folders,
    createRootFolder: async ({ name }) => {
      const trimmedName = name.trim();
      if (!trimmedName) throw new Error("blank_folder_name");
      if (
        folders.some(
          (folder) => folder.name.toLocaleLowerCase() === trimmedName.toLocaleLowerCase(),
        )
      ) {
        throw new Error("duplicate_folder_name");
      }
      const folder = { id: nextId, name: trimmedName };
      nextId += 1;
      folders = [...folders, folder];
      return folder;
    },
  };
}
