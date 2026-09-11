import { invoke } from "@tauri-apps/api/core";
import {
  reviewQueueCommandError,
  type HomeReviewQueueEntry,
  type ReviewQueueCommandClient,
} from "./types";

const unavailableMessage = "Taffy could not load your Review Queue. Please try again.";

export const tauriReviewQueueCommandClient: ReviewQueueCommandClient = {
  getHomeReviewQueue: async () => {
    try {
      return await invoke<HomeReviewQueueEntry[]>("get_home_review_queue");
    } catch (error) {
      throw (
        reviewQueueCommandError(error) ?? {
          code: "database_unavailable",
          message: unavailableMessage,
        }
      );
    }
  },
};
