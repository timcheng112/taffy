import { invoke } from "@tauri-apps/api/core";
import {
  learningItemsCommandError,
  type LearningItem,
  type LearningItemsCommandClient,
} from "./types";

export const tauriLearningItemsCommandClient: LearningItemsCommandClient = {
  createLearningItem: async (request) => {
    try {
      return await invoke<LearningItem>("create_learning_item", { request });
    } catch (error) {
      throw (
        learningItemsCommandError(error) ?? {
          code: "database_unavailable",
          message: "Taffy could not save this Learning Item. Please try again.",
        }
      );
    }
  },
};
