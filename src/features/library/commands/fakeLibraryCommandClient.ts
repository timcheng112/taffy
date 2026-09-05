import type { Folder, FolderView, LibraryCommandClient } from "./types";

export function fakeLibraryCommandClient(
  initialFolders: Array<Folder & { parentId?: number }> = [],
): LibraryCommandClient {
  let folders = initialFolders.map((folder) => ({ ...folder }));
  let nextId = Math.max(0, ...folders.map((folder) => folder.id)) + 1;
  return {
    getRootFolders: async () =>
      folders
        .filter((folder) => folder.parentId === undefined)
        .map(({ id, name }) => ({ id, name }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    getFolderView: async (folderId): Promise<FolderView> => {
      const folder = folders.find((candidate) => candidate.id === folderId);
      if (!folder) throw new Error("folder_not_found");
      const ancestors: Folder[] = [];
      let parentId = folder.parentId;
      while (parentId !== undefined) {
        const parent = folders.find((candidate) => candidate.id === parentId);
        if (!parent) throw new Error("folder_not_found");
        ancestors.unshift({ id: parent.id, name: parent.name });
        parentId = parent.parentId;
      }
      return {
        folder: { id: folder.id, name: folder.name },
        ancestors,
        contents: folders
          .filter((candidate) => candidate.parentId === folderId)
          .map(({ id, name }) => ({ id, name }))
          .sort((left, right) => left.name.localeCompare(right.name))
          .map((childFolder) => ({ type: "folder" as const, value: childFolder })),
      };
    },
    createFolder: async ({ name, parentId }) => {
      const trimmedName = name.trim();
      if (!trimmedName) throw new Error("blank_folder_name");
      if (parentId !== undefined && !folders.some((folder) => folder.id === parentId)) {
        throw new Error("invalid_parent");
      }
      if (
        folders.some(
          (folder) =>
            folder.parentId === parentId &&
            folder.name.toLocaleLowerCase() === trimmedName.toLocaleLowerCase(),
        )
      ) {
        throw new Error("duplicate_folder_name");
      }
      const folder = { id: nextId, name: trimmedName, parentId };
      nextId += 1;
      folders = [...folders, folder];
      return { id: folder.id, name: folder.name };
    },
  };
}
