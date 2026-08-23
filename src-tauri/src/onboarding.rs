use serde::Serialize;
use thiserror::Error;

use crate::database::DatabaseError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Learner {
    pub display_name: String,
}

impl Learner {
    pub fn from_display_name(value: &str) -> Result<Self, OnboardingError> {
        let display_name = value.trim();
        if display_name.is_empty() {
            return Err(OnboardingError::blank_display_name());
        }
        Ok(Self {
            display_name: display_name.to_owned(),
        })
    }
}

#[derive(Debug, Error)]
pub enum OnboardingError {
    #[error("A display name is required.")]
    BlankDisplayName,
    #[error(transparent)]
    Database(#[from] DatabaseError),
}

impl OnboardingError {
    pub fn blank_display_name() -> Self {
        Self::BlankDisplayName
    }
}

#[cfg(test)]
mod tests {
    use super::Learner;

    #[test]
    fn trims_a_valid_display_name() {
        assert_eq!(
            Learner::from_display_name("  Ada  ").unwrap().display_name,
            "Ada"
        );
    }

    #[test]
    fn rejects_a_blank_display_name() {
        assert!(Learner::from_display_name(" \n ").is_err());
    }
}
