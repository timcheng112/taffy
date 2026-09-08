use serde::Serialize;
use thiserror::Error;

use crate::database::DatabaseError;
use crate::library::Folder;

pub const MAX_TITLE_LENGTH: usize = 120;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningItem {
    pub id: i64,
    pub folder_id: i64,
    pub title: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningItemDetail {
    pub id: i64,
    pub title: String,
    pub folder: LearningItemFolder,
    pub review_date: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningItemFolder {
    pub id: i64,
    pub name: String,
    pub ancestors: Vec<Folder>,
}

impl LearningItem {
    pub fn title(value: &str) -> Result<String, LearningItemsError> {
        let title = value.trim();
        if title.is_empty() {
            return Err(LearningItemsError::BlankTitle);
        }
        if title.chars().count() > MAX_TITLE_LENGTH {
            return Err(LearningItemsError::TitleTooLong);
        }
        Ok(title.to_owned())
    }
}

#[derive(Debug, Error)]
pub enum LearningItemsError {
    #[error("A Learning Item title is required.")]
    BlankTitle,
    #[error("Keep Learning Item titles to 120 characters or fewer.")]
    TitleTooLong,
    #[error("A Learning Item with that title already exists in this Folder.")]
    DuplicateTitle,
    #[error("That Folder no longer exists. Return to the Library and try again.")]
    InvalidFolder,
    #[error("That Learning Item no longer exists. Return to the Folder and try again.")]
    LearningItemNotFound,
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

    #[test]
    fn rejects_a_title_longer_than_120_characters() {
        assert!(matches!(
            LearningItem::title(&"a".repeat(121)),
            Err(LearningItemsError::TitleTooLong)
        ));
    }
}
