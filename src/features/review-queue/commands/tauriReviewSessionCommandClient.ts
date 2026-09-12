import { invoke } from "@tauri-apps/api/core";
import {
  completeDueReviewCommandError,
  type CompleteDueReviewRequest,
  type ReviewSessionCommandClient,
} from "./types";

const unavailableMessage = "Taffy could not save this review. Please try again.";

export const tauriReviewSessionCommandClient: ReviewSessionCommandClient = {
  completeDueReview: async (request: CompleteDueReviewRequest) => {
    try {
      await invoke("complete_due_review", { request });
    } catch (error) {
      throw (
        completeDueReviewCommandError(error) ?? {
          code: "database_unavailable",
          field: null,
          message: unavailableMessage,
        }
      );
    }
  },
};
