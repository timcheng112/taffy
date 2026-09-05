use serde::{Deserialize, Serialize};
use tauri::State;

use crate::library::{Folder, FolderView, LibraryError};
use crate::onboarding::{Learner, OnboardingError};
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
