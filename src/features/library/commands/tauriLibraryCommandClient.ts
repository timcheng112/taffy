import { invoke } from "@tauri-apps/api/core";
import type { Folder, LibraryCommandClient } from "./types";

export const tauriLibraryCommandClient: LibraryCommandClient = {
  getRootFolders: () => invoke<Folder[]>("get_root_folders"),
  createRootFolder: (request) => invoke<Folder>("create_root_folder", { request }),
};
