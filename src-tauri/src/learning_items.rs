use serde::Serialize;
use thiserror::Error;

use crate::database::DatabaseError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningItem {
    pub id: i64,
    pub folder_id: i64,
    pub title: String,
}

impl LearningItem {
    pub fn title(value: &str) -> Result<String, LearningItemsError> {
        let title = value.trim();
        if title.is_empty() {
            return Err(LearningItemsError::BlankTitle);
        }
        Ok(title.to_owned())
    }
}

#[derive(Debug, Error)]
pub enum LearningItemsError {
    #[error("A Learning Item title is required.")]
    BlankTitle,
    #[error("A Learning Item with that title already exists in this Folder.")]
    DuplicateTitle,
    #[error("That Folder no longer exists. Return to the Library and try again.")]
    InvalidFolder,
    #[error(transparent)]
    Database(#[from] DatabaseError),
}

#[cfg(test)]
mod tests {
    use super::{LearningItem, LearningItemsError};

    #[test]
    fn trims_a_valid_title() {
        assert_eq!(
            LearningItem::title("  Binary Search  ").unwrap(),
            "Binary Search"
        );
    }

    #[test]
    fn rejects_a_blank_title() {
        assert!(matches!(
            LearningItem::title(" \n "),
            Err(LearningItemsError::BlankTitle)
        ));
    }
}
