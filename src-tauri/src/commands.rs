use serde::{Deserialize, Serialize};
use tauri::State;

use crate::learning_items::{LearningItem, LearningItemDetail, LearningItemsError};
use crate::library::{Folder, FolderView, LibraryError};
use crate::onboarding::{Learner, OnboardingError};
use crate::review_queue::{CompleteDueReviewError, HomeReviewQueueEntry, ReviewQueueError};
use crate::scheduling::RecallRating;
use crate::AppState;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteOnboardingRequest {
    display_name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFolderRequest {
    name: String,
    parent_id: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLearningItemRequest {
    folder_id: i64,
    title: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLearningItemTitleRequest {
    learning_item_id: i64,
    title: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteDueReviewRequest {
    learning_item_id: i64,
    #[serde(default)]
    rating: Option<serde_json::Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    code: &'static str,
    field: Option<&'static str>,
    message: &'static str,
}

impl From<OnboardingError> for CommandError {
    fn from(error: OnboardingError) -> Self {
        match error {
      OnboardingError::BlankDisplayName => Self { code: "blank_display_name", field: Some("displayName"), message: "Enter a display name to continue." },
      OnboardingError::Database(_) => Self { code: "database_unavailable", field: None, message: "Taffy could not access your local library. Check the app-data folder and try again." },
    }
    }
}

impl From<LibraryError> for CommandError {
    fn from(error: LibraryError) -> Self {
        match error {
            LibraryError::BlankFolderName => Self { code: "blank_folder_name", field: Some("name"), message: "Enter a Folder name." },
            LibraryError::DuplicateFolderName => Self { code: "duplicate_folder_name", field: Some("name"), message: "A Folder with that name already exists here." },
            LibraryError::InvalidParent => Self { code: "invalid_parent", field: Some("parentId"), message: "That parent Folder no longer exists. Return to the Library and try again." },
            LibraryError::FolderNotFound => Self { code: "folder_not_found", field: None, message: "That Folder no longer exists. Return to the Library and try again." },
            LibraryError::Database(_) => Self { code: "database_unavailable", field: None, message: "Taffy could not access your local library. Check the app-data folder and try again." },
        }
    }
}

impl From<LearningItemsError> for CommandError {
    fn from(error: LearningItemsError) -> Self {
        match error {
            LearningItemsError::BlankTitle => Self { code: "blank_learning_item_title", field: Some("title"), message: "Enter a Learning Item title." },
            LearningItemsError::TitleTooLong => Self { code: "learning_item_title_too_long", field: Some("title"), message: "Keep Learning Item titles to 120 characters or fewer." },
            LearningItemsError::DuplicateTitle => Self { code: "duplicate_learning_item_title", field: Some("title"), message: "A Learning Item with that title already exists in this Folder." },
            LearningItemsError::InvalidFolder => Self { code: "invalid_folder", field: Some("folderId"), message: "That Folder no longer exists. Return to the Library and try again." },
            LearningItemsError::LearningItemNotFound => Self { code: "learning_item_not_found", field: None, message: "That Learning Item no longer exists. Return to the Folder and try again." },
            LearningItemsError::Database(_) => Self { code: "database_unavailable", field: None, message: "Taffy could not access your local library. Check the app-data folder and try again." },
        }
    }
}

impl From<ReviewQueueError> for CommandError {
    fn from(_: ReviewQueueError) -> Self {
        Self {
            code: "database_unavailable",
            field: None,
            message: "Taffy could not access your local library. Check the app-data folder and try again.",
        }
    }
}

impl From<CompleteDueReviewError> for CommandError {
    fn from(error: CompleteDueReviewError) -> Self {
        match error {
            CompleteDueReviewError::NotEligible => Self { code: "review_not_eligible", field: None, message: "That review is no longer available. Return to Home and try again." },
            CompleteDueReviewError::Scheduler(crate::scheduling::SchedulerError::InvalidRating) => Self { code: "invalid_recall_rating", field: Some("rating"), message: "Choose one of the available Recall Ratings." },
            CompleteDueReviewError::Scheduler(_) | CompleteDueReviewError::Database(_) => Self { code: "database_unavailable", field: None, message: "Taffy could not access your local library. Check the app-data folder and try again." },
        }
    }
}

#[tauri::command]
pub fn get_learner(state: State<'_, AppState>) -> Result<Option<Learner>, CommandError> {
    state
        .0
        .lock()
        .map_err(|_| CommandError {
            code: "database_unavailable",
            field: None,
            message: "Taffy could not access your local library. Restart taffy and try again.",
        })?
        .learner()
        .map_err(Into::into)
}

#[tauri::command]
pub fn complete_onboarding(
    request: CompleteOnboardingRequest,
    state: State<'_, AppState>,
) -> Result<Learner, CommandError> {
    state
        .0
        .lock()
        .map_err(|_| CommandError {
            code: "database_unavailable",
            field: None,
            message: "Taffy could not access your local library. Restart taffy and try again.",
        })?
        .save_learner(&request.display_name)
        .map_err(Into::into)
}

#[tauri::command]
pub fn get_root_folders(state: State<'_, AppState>) -> Result<Vec<Folder>, CommandError> {
    state
        .0
        .lock()
        .map_err(|_| CommandError {
            code: "database_unavailable",
            field: None,
            message: "Taffy could not access your local library. Restart taffy and try again.",
        })?
        .root_folders()
        .map_err(Into::into)
}

#[tauri::command]
pub fn get_folder_view(
    folder_id: i64,
    state: State<'_, AppState>,
) -> Result<FolderView, CommandError> {
    state
        .0
        .lock()
        .map_err(|_| CommandError {
            code: "database_unavailable",
            field: None,
            message: "Taffy could not access your local library. Restart taffy and try again.",
        })?
        .folder_view(folder_id)
        .map_err(Into::into)
}

#[tauri::command]
pub fn create_folder(
    request: CreateFolderRequest,
    state: State<'_, AppState>,
) -> Result<Folder, CommandError> {
    state
        .0
        .lock()
        .map_err(|_| CommandError {
            code: "database_unavailable",
            field: None,
            message: "Taffy could not access your local library. Restart taffy and try again.",
        })?
        .create_folder(&request.name, request.parent_id)
        .map_err(Into::into)
}

#[tauri::command]
pub fn create_learning_item(
    request: CreateLearningItemRequest,
    state: State<'_, AppState>,
) -> Result<LearningItem, CommandError> {
    state
        .0
        .lock()
        .map_err(|_| CommandError {
            code: "database_unavailable",
            field: None,
            message: "Taffy could not access your local library. Restart taffy and try again.",
        })?
        .create_learning_item(&request.title, request.folder_id)
        .map_err(Into::into)
}

#[tauri::command]
pub fn get_learning_item_detail(
    learning_item_id: i64,
    state: State<'_, AppState>,
) -> Result<LearningItemDetail, CommandError> {
    state
        .0
        .lock()
        .map_err(|_| CommandError {
            code: "database_unavailable",
            field: None,
            message: "Taffy could not access your local library. Restart taffy and try again.",
        })?
        .learning_item_detail(learning_item_id)
        .map_err(Into::into)
}

#[tauri::command]
pub fn update_learning_item_title(
    request: UpdateLearningItemTitleRequest,
    state: State<'_, AppState>,
) -> Result<LearningItemDetail, CommandError> {
    state
        .0
        .lock()
        .map_err(|_| CommandError {
            code: "database_unavailable",
            field: None,
            message: "Taffy could not access your local library. Restart taffy and try again.",
        })?
        .update_learning_item_title(request.learning_item_id, &request.title)
        .map_err(Into::into)
}

#[tauri::command]
pub fn get_home_review_queue(
    state: State<'_, AppState>,
) -> Result<Vec<HomeReviewQueueEntry>, CommandError> {
    state
        .0
        .lock()
        .map_err(|_| CommandError {
            code: "database_unavailable",
            field: None,
            message: "Taffy could not access your local library. Restart taffy and try again.",
        })?
        .get_home_review_queue()
        .map_err(Into::into)
}

#[tauri::command]
pub fn complete_due_review(
    request: CompleteDueReviewRequest,
    state: State<'_, AppState>,
) -> Result<(), CommandError> {
    let rating = request
        .rating
        .as_ref()
        .and_then(serde_json::Value::as_str)
        .ok_or(CommandError {
            code: "invalid_recall_rating",
            field: Some("rating"),
            message: "Choose one of the available Recall Ratings.",
        })
        .and_then(|value| {
            RecallRating::parse(value).map_err(|_| CommandError {
                code: "invalid_recall_rating",
                field: Some("rating"),
                message: "Choose one of the available Recall Ratings.",
            })
        })?;
    state
        .0
        .lock()
        .map_err(|_| CommandError {
            code: "database_unavailable",
            field: None,
            message: "Taffy could not access your local library. Restart taffy and try again.",
        })?
        .complete_due_review(request.learning_item_id, rating)
        .map(|_| ())
        .map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use super::{CommandError, CompleteDueReviewRequest};
    use crate::database::DatabaseError;
    use crate::learning_items::LearningItemsError;
    use crate::review_queue::ReviewQueueError;
    use crate::scheduling::RecallRating;

    #[test]
    fn maps_learning_item_detail_errors_to_stable_command_failures() {
        let missing = CommandError::from(LearningItemsError::LearningItemNotFound);
        assert_eq!(missing.code, "learning_item_not_found");
        assert_eq!(missing.field, None);

        let blank = CommandError::from(LearningItemsError::BlankTitle);
        assert_eq!(blank.code, "blank_learning_item_title");
        assert_eq!(blank.field, Some("title"));

        let too_long = CommandError::from(LearningItemsError::TitleTooLong);
        assert_eq!(too_long.code, "learning_item_title_too_long");
        assert_eq!(too_long.field, Some("title"));

        let duplicate = CommandError::from(LearningItemsError::DuplicateTitle);
        assert_eq!(duplicate.code, "duplicate_learning_item_title");
        assert_eq!(duplicate.field, Some("title"));

        let unavailable = CommandError::from(LearningItemsError::Database(DatabaseError::Storage(
            rusqlite::Error::QueryReturnedNoRows,
        )));
        assert_eq!(unavailable.code, "database_unavailable");
        assert_eq!(unavailable.field, None);
    }

    #[test]
    fn maps_review_queue_failures_to_database_unavailable() {
        let error = CommandError::from(ReviewQueueError::Database(DatabaseError::Storage(
            rusqlite::Error::QueryReturnedNoRows,
        )));
        assert_eq!(error.code, "database_unavailable");
        assert_eq!(error.field, None);
    }

    #[test]
    fn serializes_database_failure_as_the_stable_wire_envelope() {
        let error = CommandError {
            code: "database_unavailable",
            field: None,
            message: "Taffy could not access your local library.",
        };
        assert_eq!(
            serde_json::to_value(error).unwrap(),
            serde_json::json!({
                "code": "database_unavailable",
                "field": null,
                "message": "Taffy could not access your local library."
            })
        );
    }

    #[test]
    fn deserializes_the_exact_completion_request_and_serializes_an_acknowledgement() {
        let request: CompleteDueReviewRequest = serde_json::from_value(serde_json::json!({
            "learningItemId": 42,
            "rating": "good"
        }))
        .unwrap();
        assert_eq!(request.learning_item_id, 42);
        assert_eq!(
            request.rating.as_ref().and_then(serde_json::Value::as_str),
            Some("good")
        );

        for malformed in [
            serde_json::json!({"learningItemId": 42, "rating": 3}),
            serde_json::json!({"learningItemId": 42, "rating": null}),
            serde_json::json!({"learningItemId": 42}),
        ] {
            let request: CompleteDueReviewRequest = serde_json::from_value(malformed).unwrap();
            let error = request
                .rating
                .as_ref()
                .and_then(serde_json::Value::as_str)
                .and_then(|value| RecallRating::parse(value).ok())
                .ok_or(CommandError {
                    code: "invalid_recall_rating",
                    field: Some("rating"),
                    message: "Choose one of the available Recall Ratings.",
                })
                .unwrap_err();
            assert_eq!(error.code, "invalid_recall_rating");
            assert_eq!(error.field, Some("rating"));
        }

        assert_eq!(serde_json::to_value(()).unwrap(), serde_json::Value::Null);
    }
}
