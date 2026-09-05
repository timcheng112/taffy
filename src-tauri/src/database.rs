use std::fs;
use std::path::Path;

use rusqlite::Connection;
use thiserror::Error;

use crate::learning_items::{LearningItem, LearningItemsError};
use crate::library::{Folder, FolderContent, FolderView, LibraryError};
use crate::onboarding::{Learner, OnboardingError};
use crate::scheduling::{first_review_date, LocalDateClock, SystemLocalDateClock};

#[derive(Debug, Error)]
pub enum DatabaseError {
    #[error("Taffy could not access its local database.")]
    Storage(#[source] rusqlite::Error),
    #[error("Taffy could not prepare its app-data folder.")]
    Directory(#[source] std::io::Error),
}

impl DatabaseError {
    fn storage(error: rusqlite::Error) -> Self {
        Self::Storage(error)
    }
}

impl From<std::io::Error> for DatabaseError {
    fn from(error: std::io::Error) -> Self {
        Self::Directory(error)
    }
}

pub struct Database {
    connection: Connection,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self, DatabaseError> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut database = Self {
            connection: Connection::open(path).map_err(DatabaseError::storage)?,
        };
        database.migrate()?;
        Ok(database)
    }

    pub fn open_in_memory() -> Result<Self, DatabaseError> {
        let mut database = Self {
            connection: Connection::open_in_memory().map_err(DatabaseError::storage)?,
        };
        database.migrate()?;
        Ok(database)
    }

    fn migrate(&mut self) -> Result<(), DatabaseError> {
        let transaction = self
            .connection
            .transaction()
            .map_err(DatabaseError::storage)?;
        transaction
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY);",
            )
            .map_err(DatabaseError::storage)?;
        if !Self::has_migration(&transaction, 1)? {
            transaction
                .execute_batch(
                    "CREATE TABLE learner_identity (
                       singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
                       display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0)
                     );
                     INSERT INTO schema_migrations (version) VALUES (1);",
                )
                .map_err(DatabaseError::storage)?;
        }
        if !Self::has_migration(&transaction, 2)? {
            transaction
                .execute_batch(
                    "CREATE TABLE folders (
                       id INTEGER PRIMARY KEY,
                       parent_id INTEGER REFERENCES folders(id),
                       name TEXT NOT NULL CHECK (length(trim(name)) > 0),
                       created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                     );
                     CREATE UNIQUE INDEX folders_root_name_unique
                       ON folders(name COLLATE NOCASE) WHERE parent_id IS NULL;
                     CREATE UNIQUE INDEX folders_child_name_unique
                       ON folders(parent_id, name COLLATE NOCASE) WHERE parent_id IS NOT NULL;
                     INSERT INTO schema_migrations (version) VALUES (2);",
                )
                .map_err(DatabaseError::storage)?;
        }
        if !Self::has_migration(&transaction, 3)? {
            transaction
                .execute_batch(
                    "CREATE TABLE learning_items (
                       id INTEGER PRIMARY KEY,
                       folder_id INTEGER NOT NULL REFERENCES folders(id),
                       title TEXT NOT NULL CHECK (length(trim(title)) > 0),
                       created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                     );
                     CREATE UNIQUE INDEX learning_items_folder_title_unique
                       ON learning_items(folder_id, title COLLATE NOCASE);
                     CREATE TABLE pending_schedules (
                       learning_item_id INTEGER PRIMARY KEY REFERENCES learning_items(id),
                       review_date TEXT NOT NULL
                     );
                     INSERT INTO schema_migrations (version) VALUES (3);",
                )
                .map_err(DatabaseError::storage)?;
        }
        transaction.commit().map_err(DatabaseError::storage)
    }

    fn has_migration(
        transaction: &rusqlite::Transaction<'_>,
        version: i64,
    ) -> Result<bool, DatabaseError> {
        transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = ?1)",
                [version],
                |row| row.get(0),
            )
            .map_err(DatabaseError::storage)
    }

    pub fn learner(&self) -> Result<Option<Learner>, OnboardingError> {
        let mut statement = self
            .connection
            .prepare("SELECT display_name FROM learner_identity WHERE singleton = 1")
            .map_err(DatabaseError::storage)?;
        let result = statement.query_row([], |row| {
            Ok(Learner {
                display_name: row.get(0)?,
            })
        });
        match result {
            Ok(learner) => Ok(Some(learner)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(error) => Err(DatabaseError::storage(error).into()),
        }
    }

    pub fn save_learner(&self, display_name: &str) -> Result<Learner, OnboardingError> {
        let learner = Learner::from_display_name(display_name)?;
        self.connection
            .execute(
                "INSERT INTO learner_identity (singleton, display_name) VALUES (1, ?1)
         ON CONFLICT(singleton) DO UPDATE SET display_name = excluded.display_name",
                [&learner.display_name],
            )
            .map_err(DatabaseError::storage)?;
        Ok(learner)
    }

    pub fn root_folders(&self) -> Result<Vec<Folder>, LibraryError> {
        let mut statement = self
            .connection
            .prepare(
                "SELECT id, name FROM folders WHERE parent_id IS NULL ORDER BY name COLLATE NOCASE",
            )
            .map_err(DatabaseError::storage)?;
        let folders = statement
            .query_map([], |row| {
                Ok(Folder {
                    id: row.get(0)?,
                    name: row.get(1)?,
                })
            })
            .map_err(DatabaseError::storage)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(DatabaseError::storage)?;
        Ok(folders)
    }

    pub fn folder_view(&self, folder_id: i64) -> Result<FolderView, LibraryError> {
        let folder = self
            .folder_by_id(folder_id)?
            .ok_or(LibraryError::FolderNotFound)?;
        let mut ancestors = Vec::new();
        let mut parent_id = self.parent_id(folder_id)?;
        while let Some(id) = parent_id {
            let ancestor = self.folder_by_id(id)?.ok_or(LibraryError::FolderNotFound)?;
            parent_id = self.parent_id(id)?;
            ancestors.push(ancestor);
        }
        ancestors.reverse();
        Ok(FolderView {
            folder,
            ancestors,
            contents: self.folder_contents(folder_id)?,
        })
    }

    pub fn create_folder(
        &self,
        value: &str,
        parent_id: Option<i64>,
    ) -> Result<Folder, LibraryError> {
        let name = Folder::name(value)?;
        if let Some(parent_id) = parent_id {
            if self.folder_by_id(parent_id)?.is_none() {
                return Err(LibraryError::InvalidParent);
            }
        }
        let exists: bool = self
            .connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM folders WHERE parent_id IS ?1 AND name = ?2 COLLATE NOCASE)",
                rusqlite::params![parent_id, name],
                |row| row.get(0),
            )
            .map_err(DatabaseError::storage)?;
        if exists {
            return Err(LibraryError::DuplicateFolderName);
        }
        self.connection
            .execute(
                "INSERT INTO folders (parent_id, name) VALUES (?1, ?2)",
                rusqlite::params![parent_id, name],
            )
            .map_err(DatabaseError::storage)?;
        Ok(Folder {
            id: self.connection.last_insert_rowid(),
            name,
        })
    }

    pub fn create_learning_item(
        &self,
        value: &str,
        folder_id: i64,
    ) -> Result<LearningItem, LearningItemsError> {
        self.create_learning_item_with_clock(value, folder_id, &SystemLocalDateClock)
    }

    pub fn create_learning_item_with_clock(
        &self,
        value: &str,
        folder_id: i64,
        clock: &impl LocalDateClock,
    ) -> Result<LearningItem, LearningItemsError> {
        let title = LearningItem::title(value)?;
        let transaction = self
            .connection
            .unchecked_transaction()
            .map_err(DatabaseError::storage)?;
        let folder_exists: bool = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM folders WHERE id = ?1)",
                [folder_id],
                |row| row.get(0),
            )
            .map_err(DatabaseError::storage)?;
        if !folder_exists {
            return Err(LearningItemsError::InvalidFolder);
        }
        let duplicate_exists: bool = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM learning_items WHERE folder_id = ?1 AND title = ?2 COLLATE NOCASE)",
                rusqlite::params![folder_id, title],
                |row| row.get(0),
            )
            .map_err(DatabaseError::storage)?;
        if duplicate_exists {
            return Err(LearningItemsError::DuplicateTitle);
        }
        transaction
            .execute(
                "INSERT INTO learning_items (folder_id, title) VALUES (?1, ?2)",
                rusqlite::params![folder_id, title],
            )
            .map_err(DatabaseError::storage)?;
        let learning_item = LearningItem {
            id: transaction.last_insert_rowid(),
            folder_id,
            title,
        };
        transaction
            .execute(
                "INSERT INTO pending_schedules (learning_item_id, review_date) VALUES (?1, ?2)",
                rusqlite::params![learning_item.id, first_review_date(clock).to_string()],
            )
            .map_err(DatabaseError::storage)?;
        transaction.commit().map_err(DatabaseError::storage)?;
        Ok(learning_item)
    }

    fn folder_contents(&self, folder_id: i64) -> Result<Vec<FolderContent>, LibraryError> {
        let mut statement = self
            .connection
            .prepare(
                "SELECT content_type, id, name, item_folder_id
                 FROM (
                   SELECT 0 AS sort_group, 'folder' AS content_type, id, name, NULL AS item_folder_id
                   FROM folders WHERE parent_id = ?1
                   UNION ALL
                   SELECT 1 AS sort_group, 'learningItem' AS content_type, id, title AS name, folder_id AS item_folder_id
                   FROM learning_items WHERE folder_id = ?1
                 )
                 ORDER BY sort_group, name COLLATE NOCASE",
            )
            .map_err(DatabaseError::storage)?;
        let contents = statement
            .query_map([folder_id], |row| {
                let content_type: String = row.get(0)?;
                let id = row.get(1)?;
                let name = row.get(2)?;
                match content_type.as_str() {
                    "folder" => Ok(FolderContent::Folder(Folder { id, name })),
                    "learningItem" => Ok(FolderContent::LearningItem(LearningItem {
                        id,
                        folder_id: row.get(3)?,
                        title: name,
                    })),
                    _ => unreachable!("folder content queries use known content types"),
                }
            })
            .map_err(DatabaseError::storage)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| LibraryError::Database(DatabaseError::storage(error)))?;
        Ok(contents)
    }

    fn folder_by_id(&self, id: i64) -> Result<Option<Folder>, LibraryError> {
        self.connection
            .query_row("SELECT id, name FROM folders WHERE id = ?1", [id], |row| {
                Ok(Folder {
                    id: row.get(0)?,
                    name: row.get(1)?,
                })
            })
            .map(Some)
            .or_else(|error| match error {
                rusqlite::Error::QueryReturnedNoRows => Ok(None),
                error => Err(DatabaseError::storage(error).into()),
            })
    }

    fn parent_id(&self, id: i64) -> Result<Option<i64>, LibraryError> {
        self.connection
            .query_row("SELECT parent_id FROM folders WHERE id = ?1", [id], |row| {
                row.get(0)
            })
            .map_err(|error| LibraryError::Database(DatabaseError::storage(error)))
    }
}

#[cfg(test)]
mod tests {
    use chrono::NaiveDate;

    use super::Database;
    use crate::library::{Folder, FolderContent};
    use crate::scheduling::LocalDateClock;

    struct FixedClock(NaiveDate);

    impl LocalDateClock for FixedClock {
        fn today(&self) -> NaiveDate {
            self.0
        }
    }

    #[test]
    fn migration_creates_a_fresh_database_and_persists_a_learner() {
        let database = Database::open_in_memory().expect("migration succeeds");
        assert_eq!(database.learner().expect("read succeeds"), None);
        database.save_learner("  Ada  ").expect("save succeeds");
        assert_eq!(
            database
                .learner()
                .expect("read succeeds")
                .expect("learner exists")
                .display_name,
            "Ada"
        );
    }

    #[test]
    fn migration_upgrades_a_version_one_database_to_the_current_schema() {
        let connection = rusqlite::Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY);
                 CREATE TABLE learner_identity (
                   singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
                   display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0)
                 );
                 INSERT INTO schema_migrations (version) VALUES (1);",
            )
            .unwrap();
        let database = super::Database { connection };
        let mut database = database;
        database.migrate().unwrap();
        let folder = database.create_folder("  Algorithms  ", None).unwrap();
        assert_eq!(folder.name, "Algorithms");
        assert_eq!(database.root_folders().unwrap(), vec![folder.clone()]);
        assert!(database
            .create_learning_item_with_clock(
                "Binary Search",
                folder.id,
                &FixedClock(NaiveDate::from_ymd_opt(2026, 12, 31).unwrap()),
            )
            .is_ok());
    }

    #[test]
    fn migration_upgrades_an_immediately_preceding_version_two_database() {
        let connection = rusqlite::Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY);
                 CREATE TABLE learner_identity (
                   singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
                   display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0)
                 );
                 CREATE TABLE folders (
                   id INTEGER PRIMARY KEY,
                   parent_id INTEGER REFERENCES folders(id),
                   name TEXT NOT NULL CHECK (length(trim(name)) > 0),
                   created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                 );
                 INSERT INTO folders (id, name) VALUES (1, 'Algorithms');
                 INSERT INTO schema_migrations (version) VALUES (1), (2);",
            )
            .unwrap();
        let mut database = super::Database { connection };
        database.migrate().unwrap();
        let item = database
            .create_learning_item_with_clock(
                "Binary Search",
                1,
                &FixedClock(NaiveDate::from_ymd_opt(2026, 9, 5).unwrap()),
            )
            .unwrap();
        assert_eq!(item.title, "Binary Search");
        assert_eq!(
            database
                .connection
                .query_row("SELECT COUNT(*) FROM pending_schedules", [], |row| {
                    row.get::<_, i64>(0)
                })
                .unwrap(),
            1
        );
    }

    #[test]
    fn root_folder_names_are_case_insensitively_unique() {
        let database = Database::open_in_memory().unwrap();
        database.create_folder("Algorithms", None).unwrap();
        assert!(matches!(
            database.create_folder("algorithms", None),
            Err(crate::library::LibraryError::DuplicateFolderName)
        ));
    }

    #[test]
    fn creates_and_reads_nested_folders() {
        let database = Database::open_in_memory().unwrap();
        let algorithms = database.create_folder("Algorithms", None).unwrap();
        let trees = database
            .create_folder("Trees", Some(algorithms.id))
            .unwrap();
        let graphs = database
            .create_folder("Graphs", Some(algorithms.id))
            .unwrap();
        let view = database.folder_view(algorithms.id).unwrap();
        assert_eq!(
            view.contents,
            vec![FolderContent::Folder(graphs), FolderContent::Folder(trees)]
        );
        assert!(matches!(
            database.create_folder("Trees", Some(999)),
            Err(crate::library::LibraryError::InvalidParent)
        ));
        assert!(matches!(
            database.create_folder("trees", Some(algorithms.id)),
            Err(crate::library::LibraryError::DuplicateFolderName)
        ));
    }

    #[test]
    fn allows_equal_names_under_different_parents() {
        let database = Database::open_in_memory().unwrap();
        let algorithms = database.create_folder("Algorithms", None).unwrap();
        let data_structures = database.create_folder("Data Structures", None).unwrap();
        database
            .create_folder("Graphs", Some(algorithms.id))
            .unwrap();
        assert!(database
            .create_folder("Graphs", Some(data_structures.id))
            .is_ok());
    }

    #[test]
    fn creates_a_title_only_learning_item_and_first_review_atomically() {
        let database = Database::open_in_memory().unwrap();
        let algorithms = database.create_folder("Algorithms", None).unwrap();
        let item = database
            .create_learning_item_with_clock(
                "  Binary Search  ",
                algorithms.id,
                &FixedClock(NaiveDate::from_ymd_opt(2026, 12, 31).unwrap()),
            )
            .unwrap();
        assert_eq!(item.title, "Binary Search");
        assert_eq!(
            database.folder_view(algorithms.id).unwrap().contents,
            vec![FolderContent::LearningItem(item.clone())]
        );
        assert_eq!(
            database
                .connection
                .query_row(
                    "SELECT review_date FROM pending_schedules WHERE learning_item_id = ?1",
                    [item.id],
                    |row| row.get::<_, String>(0),
                )
                .unwrap(),
            "2027-01-01"
        );
    }

    #[test]
    fn persists_a_learning_item_and_first_review_after_reopening() {
        let path = std::env::temp_dir().join(format!(
            "taffy-learning-item-{}-{}.sqlite3",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let database = Database::open(&path).unwrap();
        let folder = database.create_folder("Algorithms", None).unwrap();
        let item = database
            .create_learning_item_with_clock(
                "Binary Search",
                folder.id,
                &FixedClock(NaiveDate::from_ymd_opt(2026, 9, 5).unwrap()),
            )
            .unwrap();
        drop(database);

        let reopened = Database::open(&path).unwrap();
        assert_eq!(
            reopened.folder_view(folder.id).unwrap().contents,
            vec![FolderContent::LearningItem(item.clone())]
        );
        assert_eq!(
            reopened
                .connection
                .query_row(
                    "SELECT review_date FROM pending_schedules WHERE learning_item_id = ?1",
                    [item.id],
                    |row| row.get::<_, String>(0),
                )
                .unwrap(),
            "2026-09-06"
        );
        drop(reopened);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn rolls_back_the_learning_item_when_its_first_review_cannot_be_saved() {
        let database = Database::open_in_memory().unwrap();
        let folder = database.create_folder("Algorithms", None).unwrap();
        database
            .connection
            .execute_batch(
                "CREATE TRIGGER reject_first_review
                 BEFORE INSERT ON pending_schedules
                 BEGIN SELECT RAISE(ABORT, 'first review rejected'); END;",
            )
            .unwrap();
        assert!(database
            .create_learning_item("Binary Search", folder.id)
            .is_err());
        assert!(database.folder_view(folder.id).unwrap().contents.is_empty());
        let schedule_count: i64 = database
            .connection
            .query_row("SELECT COUNT(*) FROM pending_schedules", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(schedule_count, 0);
    }

    #[test]
    fn rejects_invalid_or_duplicate_learning_items_without_creating_a_schedule() {
        let database = Database::open_in_memory().unwrap();
        let algorithms = database.create_folder("Algorithms", None).unwrap();
        assert!(matches!(
            database.create_learning_item("  ", algorithms.id),
            Err(crate::learning_items::LearningItemsError::BlankTitle)
        ));
        assert!(matches!(
            database.create_learning_item("Binary Search", 999),
            Err(crate::learning_items::LearningItemsError::InvalidFolder)
        ));
        database
            .create_learning_item("Binary Search", algorithms.id)
            .unwrap();
        assert!(matches!(
            database.create_learning_item("binary search", algorithms.id),
            Err(crate::learning_items::LearningItemsError::DuplicateTitle)
        ));
        let schedule_count: i64 = database
            .connection
            .query_row("SELECT COUNT(*) FROM pending_schedules", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(schedule_count, 1);
    }

    #[test]
    fn allows_equal_learning_item_titles_in_different_folders() {
        let database = Database::open_in_memory().unwrap();
        let algorithms = database.create_folder("Algorithms", None).unwrap();
        let data_structures = database.create_folder("Data Structures", None).unwrap();
        database
            .create_learning_item("Binary Search", algorithms.id)
            .unwrap();
        assert!(database
            .create_learning_item("Binary Search", data_structures.id)
            .is_ok());
    }

    #[test]
    fn persists_child_folders_after_reopening_the_database() {
        let path = std::env::temp_dir().join(format!(
            "taffy-folder-hierarchy-{}-{}.sqlite3",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let database = Database::open(&path).unwrap();
        let algorithms = database.create_folder("Algorithms", None).unwrap();
        database
            .create_folder("Graphs", Some(algorithms.id))
            .unwrap();
        drop(database);

        let reopened = Database::open(&path).unwrap();
        assert_eq!(
            reopened.folder_view(algorithms.id).unwrap().contents,
            vec![FolderContent::Folder(Folder {
                id: 2,
                name: "Graphs".to_owned()
            })]
        );
        drop(reopened);
        std::fs::remove_file(path).unwrap();
    }
}
