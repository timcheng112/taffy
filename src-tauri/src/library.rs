use serde::Serialize;
use thiserror::Error;

use crate::database::DatabaseError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: i64,
    pub name: String,
}

impl Folder {
    pub fn root_name(value: &str) -> Result<String, LibraryError> {
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
    #[error(transparent)]
    Database(#[from] DatabaseError),
}

#[cfg(test)]
mod tests {
    use super::{Folder, LibraryError};

    #[test]
    fn trims_a_valid_root_folder_name() {
        assert_eq!(Folder::root_name("  Algorithms  ").unwrap(), "Algorithms");
    }

    #[test]
    fn rejects_a_blank_root_folder_name() {
        assert!(matches!(
            Folder::root_name(" \n "),
            Err(LibraryError::BlankFolderName)
        ));
    }
}
