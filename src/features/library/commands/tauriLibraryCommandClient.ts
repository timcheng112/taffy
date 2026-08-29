import { invoke } from "@tauri-apps/api/core";
import type { Folder, FolderView, LibraryCommandClient } from "./types";

export const tauriLibraryCommandClient: LibraryCommandClient = {
  getRootFolders: () => invoke<Folder[]>("get_root_folders"),
  getFolderView: (folderId) => invoke<FolderView>("get_folder_view", { folderId }),
  createFolder: (request) => invoke<Folder>("create_folder", { request }),
};
