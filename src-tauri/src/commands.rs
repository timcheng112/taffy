use serde::{Deserialize, Serialize};
use tauri::State;

use crate::onboarding::{Learner, OnboardingError};
use crate::AppState;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteOnboardingRequest {
    display_name: String,
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
      OnboardingError::Storage(_) | OnboardingError::Directory(_) => Self { code: "database_unavailable", field: None, message: "Taffy could not access your local library. Check the app-data folder and try again." },
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
