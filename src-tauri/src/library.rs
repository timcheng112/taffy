use serde::Serialize;
use thiserror::Error;

use crate::database::DatabaseError;
use crate::learning_items::LearningItem;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: i64,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderView {
    pub folder: Folder,
    pub ancestors: Vec<Folder>,
    pub contents: Vec<FolderContent>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "type", content = "value", rename_all = "camelCase")]
pub enum FolderContent {
    Folder(Folder),
    LearningItem(LearningItem),
}

impl Folder {
    pub fn name(value: &str) -> Result<String, LibraryError> {
        let name = value.trim();
        if name.is_empty() {
            return Err(LibraryError::BlankFolderName);
        }
        Ok(name.to_owned())
    }
}

#[derive(Debug, Error)]
pub enum LibraryError {
    #[error("A Folder name is required.")]
    BlankFolderName,
    #[error("A Folder with that name already exists here.")]
    DuplicateFolderName,
    #[error("The parent Folder no longer exists.")]
    InvalidParent,
    #[error("This Folder no longer exists.")]
    FolderNotFound,
    #[error(transparent)]
    Database(#[from] DatabaseError),
}

#[cfg(test)]
mod tests {
    use super::{Folder, LibraryError};

    #[test]
    fn trims_a_valid_folder_name() {
        assert_eq!(Folder::name("  Algorithms  ").unwrap(), "Algorithms");
    }

    #[test]
    fn rejects_a_blank_folder_name() {
        assert!(matches!(
            Folder::name(" \n "),
            Err(LibraryError::BlankFolderName)
        ));
    }
}
