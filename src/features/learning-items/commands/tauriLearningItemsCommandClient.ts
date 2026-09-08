import { invoke } from "@tauri-apps/api/core";
import {
  learningItemsCommandError,
  type LearningItem,
  type LearningItemDetail,
  type LearningItemsCommandClient,
} from "./types";

function commandFailure(error: unknown, message: string) {
  return (
    learningItemsCommandError(error) ?? {
      code: "database_unavailable",
      message,
    }
  );
}

export const tauriLearningItemsCommandClient: LearningItemsCommandClient = {
  createLearningItem: async (request) => {
    try {
      return await invoke<LearningItem>("create_learning_item", { request });
    } catch (error) {
      throw commandFailure(error, "Taffy could not save this Learning Item. Please try again.");
    }
  },
  getLearningItemDetail: async (learningItemId) => {
    try {
      return await invoke<LearningItemDetail>("get_learning_item_detail", { learningItemId });
    } catch (error) {
      throw commandFailure(error, "Taffy could not load this Learning Item. Please try again.");
    }
  },
  updateLearningItemTitle: async (request) => {
    try {
      return await invoke<LearningItemDetail>("update_learning_item_title", { request });
    } catch (error) {
      throw commandFailure(error, "Taffy could not save this Learning Item. Please try again.");
    }
  },
};
