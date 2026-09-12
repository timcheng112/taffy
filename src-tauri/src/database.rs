#[cfg(test)]
use std::cell::Cell;
use std::fs;
use std::path::Path;

use chrono::{Local, LocalResult, NaiveDate, TimeZone, Utc};
use rusqlite::{Connection, Transaction};
use thiserror::Error;

use crate::learning_items::{
    LearningItem, LearningItemDetail, LearningItemFolder, LearningItemsError,
};
use crate::library::{Folder, FolderContent, FolderView, LibraryError};
use crate::onboarding::{Learner, OnboardingError};
use crate::review_queue::{
    CompleteDueReviewError, HomeReviewQueueEntry, ReviewQueueError, ReviewQueueFolder,
    ReviewQueueFolderAncestor,
};
use crate::scheduling::{
    first_review_date, schedule, timestamp_millis, utc_from_timestamp_millis, LocalDateClock,
    RecallRating, ScheduleState, SystemLocalDateClock,
};

#[cfg(test)]
thread_local! {
    static FAIL_COMPLETION_COMMIT: Cell<bool> = const { Cell::new(false) };
}

fn commit_completion(transaction: Transaction<'_>) -> Result<(), DatabaseError> {
    #[cfg(test)]
    if FAIL_COMPLETION_COMMIT.with(Cell::get) {
        return Err(DatabaseError::storage(
            rusqlite::Error::ExecuteReturnedResults,
        ));
    }
    transaction.commit().map_err(DatabaseError::storage)
}

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
        if !Self::has_migration(&transaction, 4)? {
            transaction
                .execute_batch(
                    "CREATE TABLE review_queue_entries (
                       id INTEGER PRIMARY KEY AUTOINCREMENT,
                       learning_item_id INTEGER NOT NULL UNIQUE
                         REFERENCES learning_items(id)
                     );
                     INSERT INTO schema_migrations (version) VALUES (4);",
                )
                .map_err(DatabaseError::storage)?;
        }
        if !Self::has_migration(&transaction, 5)? {
            transaction
                .execute_batch(
                    "CREATE TABLE review_events (
                       id INTEGER PRIMARY KEY AUTOINCREMENT,
                       learning_item_id INTEGER NOT NULL REFERENCES learning_items(id),
                       event_kind TEXT NOT NULL CHECK (event_kind IN ('scheduled', 'manual')),
                       rating TEXT NOT NULL CHECK (rating IN ('again', 'hard', 'good', 'easy')),
                       completed_on TEXT NOT NULL
                     );
                     ALTER TABLE pending_schedules ADD COLUMN fsrs_state TEXT NOT NULL DEFAULT 'new'
                       CHECK (fsrs_state IN ('new', 'learning', 'review', 'relearning'));
                     ALTER TABLE pending_schedules ADD COLUMN fsrs_stability REAL NOT NULL DEFAULT 0;
                     ALTER TABLE pending_schedules ADD COLUMN fsrs_difficulty REAL NOT NULL DEFAULT 0;
                     ALTER TABLE pending_schedules ADD COLUMN fsrs_elapsed_days INTEGER NOT NULL DEFAULT 0;
                     ALTER TABLE pending_schedules ADD COLUMN fsrs_scheduled_days INTEGER NOT NULL DEFAULT 0;
                     ALTER TABLE pending_schedules ADD COLUMN fsrs_reps INTEGER NOT NULL DEFAULT 0;
                     ALTER TABLE pending_schedules ADD COLUMN fsrs_lapses INTEGER NOT NULL DEFAULT 0;
                     ALTER TABLE pending_schedules ADD COLUMN fsrs_last_review_date TEXT;
                     INSERT INTO schema_migrations (version) VALUES (5);",
                )
                .map_err(DatabaseError::storage)?;
        }
        if !Self::has_migration(&transaction, 6)? {
            transaction
                .execute_batch(
                    "ALTER TABLE pending_schedules ADD COLUMN due_at_utc INTEGER NOT NULL DEFAULT 0;
                     ALTER TABLE pending_schedules ADD COLUMN fsrs_last_review_at_utc INTEGER;
                     CREATE INDEX pending_schedules_due_at_utc ON pending_schedules(due_at_utc);",
                )
                .map_err(DatabaseError::storage)?;
            let schedules = {
                let mut statement = transaction
                    .prepare("SELECT learning_item_id, review_date, fsrs_last_review_date FROM pending_schedules")
                    .map_err(DatabaseError::storage)?;
                let schedules = statement
                    .query_map([], |row| {
                        Ok((
                            row.get::<_, i64>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, Option<String>>(2)?,
                        ))
                    })
                    .map_err(DatabaseError::storage)?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(DatabaseError::storage)?;
                schedules
            };
            for (learning_item_id, review_date, last_review_date) in schedules {
                let due_at_utc = Self::local_midnight_timestamp(&review_date)?;
                let last_review_at_utc = last_review_date
                    .as_deref()
                    .map(Self::local_midnight_timestamp)
                    .transpose()?;
                transaction
                    .execute(
                        "UPDATE pending_schedules SET due_at_utc = ?1, fsrs_last_review_at_utc = ?2 WHERE learning_item_id = ?3",
                        rusqlite::params![due_at_utc, last_review_at_utc, learning_item_id],
                    )
                    .map_err(DatabaseError::storage)?;
            }
            transaction
                .execute("INSERT INTO schema_migrations (version) VALUES (6)", [])
                .map_err(DatabaseError::storage)?;
        }
        transaction.commit().map_err(DatabaseError::storage)
    }

    /// v5 only retained a local date. The one-time v6 compatibility policy maps
    /// it to current-host-local midnight; an ambiguous local time picks the earlier
    /// instant and a nonexistent local midnight blocks migration instead of guessing.
    fn local_midnight_timestamp(date: &str) -> Result<i64, DatabaseError> {
        let date = NaiveDate::parse_from_str(date, "%Y-%m-%d").map_err(|_| {
            DatabaseError::storage(rusqlite::Error::FromSqlConversionFailure(
                0,
                rusqlite::types::Type::Text,
                Box::new(std::fmt::Error),
            ))
        })?;
        let local_midnight = date.and_hms_opt(0, 0, 0).ok_or_else(|| {
            DatabaseError::storage(rusqlite::Error::FromSqlConversionFailure(
                0,
                rusqlite::types::Type::Text,
                Box::new(std::fmt::Error),
            ))
        })?;
        match Local.from_local_datetime(&local_midnight) {
            LocalResult::Single(value) => Ok(value.with_timezone(&Utc).timestamp_millis()),
            LocalResult::Ambiguous(earlier, _) => {
                Ok(earlier.with_timezone(&Utc).timestamp_millis())
            }
            LocalResult::None => Err(DatabaseError::storage(
                rusqlite::Error::FromSqlConversionFailure(
                    0,
                    rusqlite::types::Type::Text,
                    Box::new(std::fmt::Error),
                ),
            )),
        }
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
        let review_date = first_review_date(clock).to_string();
        let due_at_utc = Self::local_midnight_timestamp(&review_date)?;
        transaction
            .execute(
                "INSERT INTO pending_schedules (learning_item_id, review_date, due_at_utc) VALUES (?1, ?2, ?3)",
                rusqlite::params![learning_item.id, review_date, due_at_utc],
            )
            .map_err(DatabaseError::storage)?;
        transaction.commit().map_err(DatabaseError::storage)?;
        Ok(learning_item)
    }

    pub fn get_home_review_queue(&self) -> Result<Vec<HomeReviewQueueEntry>, ReviewQueueError> {
        self.get_home_review_queue_with_clock(&SystemLocalDateClock)
    }

    pub fn get_home_review_queue_with_clock(
        &self,
        clock: &impl LocalDateClock,
    ) -> Result<Vec<HomeReviewQueueEntry>, ReviewQueueError> {
        let transaction = self
            .connection
            .unchecked_transaction()
            .map_err(DatabaseError::storage)?;
        let now_utc = timestamp_millis(clock.now_utc());
        transaction
            .execute(
                "INSERT OR IGNORE INTO review_queue_entries (learning_item_id)
                 SELECT learning_items.id
                 FROM learning_items
                 JOIN pending_schedules ON pending_schedules.learning_item_id = learning_items.id
                 WHERE pending_schedules.due_at_utc <= ?1
                 ORDER BY learning_items.id",
                [now_utc],
            )
            .map_err(DatabaseError::storage)?;

        let queued_items = {
            let mut statement = transaction
                .prepare(
                    "SELECT review_queue_entries.learning_item_id, learning_items.title,
                            folders.id, folders.name
                     FROM review_queue_entries
                     JOIN learning_items ON learning_items.id = review_queue_entries.learning_item_id
                     JOIN folders ON folders.id = learning_items.folder_id
                     ORDER BY review_queue_entries.id",
                )
                .map_err(DatabaseError::storage)?;
            let rows = statement
                .query_map([], |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, i64>(2)?,
                        row.get::<_, String>(3)?,
                    ))
                })
                .map_err(DatabaseError::storage)?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(DatabaseError::storage)?
        };

        let mut entries = Vec::with_capacity(queued_items.len());
        for (learning_item_id, title, folder_id, folder_name) in queued_items {
            let mut statement = transaction
                .prepare(
                    "WITH RECURSIVE ancestors(id, name, parent_id, depth) AS (
                       SELECT id, name, parent_id, 0 FROM folders WHERE id = ?1
                       UNION ALL
                       SELECT folders.id, folders.name, folders.parent_id, ancestors.depth + 1
                       FROM folders JOIN ancestors ON folders.id = ancestors.parent_id
                     )
                     SELECT id, name FROM ancestors WHERE depth > 0 ORDER BY depth DESC",
                )
                .map_err(DatabaseError::storage)?;
            let ancestors = statement
                .query_map([folder_id], |row| {
                    Ok(ReviewQueueFolderAncestor {
                        id: row.get(0)?,
                        name: row.get(1)?,
                    })
                })
                .map_err(DatabaseError::storage)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(DatabaseError::storage)?;
            entries.push(HomeReviewQueueEntry {
                learning_item_id,
                title,
                folder: ReviewQueueFolder {
                    id: folder_id,
                    name: folder_name,
                    ancestors,
                },
                kind: HomeReviewQueueEntry::DUE_REVIEW,
            });
        }

        transaction.commit().map_err(DatabaseError::storage)?;
        Ok(entries)
    }

    pub fn complete_due_review(
        &self,
        learning_item_id: i64,
        rating: RecallRating,
    ) -> Result<(), CompleteDueReviewError> {
        self.complete_due_review_with_clock(learning_item_id, rating, &SystemLocalDateClock)
    }

    pub fn complete_due_review_with_clock(
        &self,
        learning_item_id: i64,
        rating: RecallRating,
        clock: &impl LocalDateClock,
    ) -> Result<(), CompleteDueReviewError> {
        let completed_at_utc = clock.now_utc();
        let completed_on = clock.local_date_at(completed_at_utc);
        let transaction = self
            .connection
            .unchecked_transaction()
            .map_err(DatabaseError::storage)?;
        let schedule_row = transaction.query_row(
            "SELECT pending_schedules.review_date, pending_schedules.due_at_utc, pending_schedules.fsrs_state,
                    pending_schedules.fsrs_stability, pending_schedules.fsrs_difficulty,
                    pending_schedules.fsrs_elapsed_days, pending_schedules.fsrs_scheduled_days,
                    pending_schedules.fsrs_reps, pending_schedules.fsrs_lapses,
                    pending_schedules.fsrs_last_review_date, pending_schedules.fsrs_last_review_at_utc
             FROM learning_items
             JOIN review_queue_entries ON review_queue_entries.learning_item_id = learning_items.id
             JOIN pending_schedules ON pending_schedules.learning_item_id = learning_items.id
             WHERE learning_items.id = ?1",
            [learning_item_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, f64>(3)?,
                    row.get::<_, f64>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, i64>(6)?,
                    row.get::<_, i64>(7)?,
                    row.get::<_, i64>(8)?,
                    row.get::<_, Option<String>>(9)?,
                    row.get::<_, Option<i64>>(10)?,
                ))
            },
        );
        let (
            _review_date,
            due_at_utc,
            state,
            stability,
            difficulty,
            elapsed_days,
            scheduled_days,
            reps,
            lapses,
            _last_review_date,
            last_review_at_utc,
        ) = match schedule_row {
            Ok(row) => row,
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                return Err(CompleteDueReviewError::NotEligible)
            }
            Err(error) => return Err(DatabaseError::storage(error).into()),
        };
        let due_at_utc = utc_from_timestamp_millis(due_at_utc)?;
        if due_at_utc > completed_at_utc {
            return Err(CompleteDueReviewError::NotEligible);
        }
        let current = ScheduleState {
            state,
            stability,
            difficulty,
            elapsed_days,
            scheduled_days,
            reps,
            lapses,
            last_review_at_utc: last_review_at_utc
                .map(utc_from_timestamp_millis)
                .transpose()?,
            due_at_utc,
        };
        let next = schedule(&current, rating, completed_at_utc)?;
        let next_review_date = next.next_review_at_utc.with_timezone(&Local).date_naive();
        transaction
            .execute(
                "INSERT INTO review_events (learning_item_id, event_kind, rating, completed_on)
                 VALUES (?1, 'scheduled', ?2, ?3)",
                rusqlite::params![
                    learning_item_id,
                    rating.to_string(),
                    completed_on.to_string()
                ],
            )
            .map_err(DatabaseError::storage)?;
        let changed = transaction
            .execute(
                "UPDATE pending_schedules
                 SET review_date = ?1, due_at_utc = ?2, fsrs_state = ?3, fsrs_stability = ?4,
                     fsrs_difficulty = ?5, fsrs_elapsed_days = ?6, fsrs_scheduled_days = ?7,
                     fsrs_reps = ?8, fsrs_lapses = ?9, fsrs_last_review_date = ?10,
                     fsrs_last_review_at_utc = ?11
                 WHERE learning_item_id = ?12",
                rusqlite::params![
                    next_review_date.to_string(),
                    timestamp_millis(next.next_review_at_utc),
                    next.state,
                    next.stability,
                    next.difficulty,
                    next.elapsed_days,
                    next.scheduled_days,
                    next.reps,
                    next.lapses,
                    next.last_review_at_utc
                        .with_timezone(&Local)
                        .date_naive()
                        .to_string(),
                    timestamp_millis(next.last_review_at_utc),
                    learning_item_id
                ],
            )
            .map_err(DatabaseError::storage)?;
        if changed != 1 {
            return Err(CompleteDueReviewError::NotEligible);
        }
        let removed = transaction
            .execute(
                "DELETE FROM review_queue_entries WHERE learning_item_id = ?1",
                [learning_item_id],
            )
            .map_err(DatabaseError::storage)?;
        if removed != 1 {
            return Err(CompleteDueReviewError::NotEligible);
        }
        commit_completion(transaction)?;
        Ok(())
    }

    pub fn learning_item_detail(
        &self,
        learning_item_id: i64,
    ) -> Result<LearningItemDetail, LearningItemsError> {
        let transaction = self
            .connection
            .unchecked_transaction()
            .map_err(DatabaseError::storage)?;
        let detail = Self::learning_item_detail_in_transaction(&transaction, learning_item_id)?;
        transaction.commit().map_err(DatabaseError::storage)?;
        Ok(detail)
    }

    pub fn update_learning_item_title(
        &self,
        learning_item_id: i64,
        value: &str,
    ) -> Result<LearningItemDetail, LearningItemsError> {
        let title = LearningItem::title(value)?;
        let transaction = self
            .connection
            .unchecked_transaction()
            .map_err(DatabaseError::storage)?;
        let folder_id: i64 = transaction
            .query_row(
                "SELECT folder_id FROM learning_items WHERE id = ?1",
                [learning_item_id],
                |row| row.get(0),
            )
            .map_err(|error| match error {
                rusqlite::Error::QueryReturnedNoRows => LearningItemsError::LearningItemNotFound,
                error => DatabaseError::storage(error).into(),
            })?;
        let duplicate_exists: bool = transaction
            .query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM learning_items
                    WHERE folder_id = ?1 AND title = ?2 COLLATE NOCASE AND id != ?3
                 )",
                rusqlite::params![folder_id, title, learning_item_id],
                |row| row.get(0),
            )
            .map_err(DatabaseError::storage)?;
        if duplicate_exists {
            return Err(LearningItemsError::DuplicateTitle);
        }
        transaction
            .execute(
                "UPDATE learning_items SET title = ?1 WHERE id = ?2",
                rusqlite::params![title, learning_item_id],
            )
            .map_err(DatabaseError::storage)?;
        let detail = Self::learning_item_detail_in_transaction(&transaction, learning_item_id)?;
        transaction.commit().map_err(DatabaseError::storage)?;
        Ok(detail)
    }

    fn learning_item_detail_in_transaction(
        transaction: &Transaction<'_>,
        learning_item_id: i64,
    ) -> Result<LearningItemDetail, LearningItemsError> {
        let detail_row = transaction.query_row(
            "SELECT learning_items.id, learning_items.title, folders.id, folders.name,
                    pending_schedules.review_date
             FROM learning_items
             JOIN folders ON folders.id = learning_items.folder_id
             JOIN pending_schedules ON pending_schedules.learning_item_id = learning_items.id
             WHERE learning_items.id = ?1",
            [learning_item_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        );
        let (id, title, folder_id, folder_name, review_date): (i64, String, i64, String, String) =
            match detail_row {
                Ok(detail) => detail,
                Err(rusqlite::Error::QueryReturnedNoRows) => {
                    let item_exists: bool = transaction
                        .query_row(
                            "SELECT EXISTS(SELECT 1 FROM learning_items WHERE id = ?1)",
                            [learning_item_id],
                            |row| row.get(0),
                        )
                        .map_err(DatabaseError::storage)?;
                    if item_exists {
                        return Err(
                            DatabaseError::storage(rusqlite::Error::QueryReturnedNoRows).into()
                        );
                    }
                    return Err(LearningItemsError::LearningItemNotFound);
                }
                Err(error) => return Err(DatabaseError::storage(error).into()),
            };
        let mut statement = transaction
            .prepare(
                "WITH RECURSIVE ancestors(id, name, parent_id, depth) AS (
                   SELECT id, name, parent_id, 0 FROM folders WHERE id = ?1
                   UNION ALL
                   SELECT folders.id, folders.name, folders.parent_id, ancestors.depth + 1
                   FROM folders JOIN ancestors ON folders.id = ancestors.parent_id
                 )
                 SELECT id, name FROM ancestors WHERE depth > 0 ORDER BY depth DESC",
            )
            .map_err(DatabaseError::storage)?;
        let ancestors = statement
            .query_map([folder_id], |row| {
                Ok(Folder {
                    id: row.get(0)?,
                    name: row.get(1)?,
                })
            })
            .map_err(DatabaseError::storage)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(DatabaseError::storage)?;
        Ok(LearningItemDetail {
            id,
            title,
            folder: LearningItemFolder {
                id: folder_id,
                name: folder_name,
                ancestors,
            },
            review_date,
        })
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
    use chrono::{DateTime, NaiveDate, Utc};
    use rs_fsrs::{Card, Rating, State, FSRS};

    use super::Database;
    use crate::library::{Folder, FolderContent};
    use crate::scheduling::LocalDateClock;

    struct FixedClock(NaiveDate);

    impl LocalDateClock for FixedClock {
        fn today(&self) -> NaiveDate {
            self.0
        }
    }

    struct FixedInstantClock(DateTime<Utc>);

    impl LocalDateClock for FixedInstantClock {
        fn today(&self) -> NaiveDate {
            self.0.date_naive()
        }

        fn now_utc(&self) -> DateTime<Utc> {
            self.0
        }
    }

    struct ZonedInstantClock {
        now: DateTime<Utc>,
        local_date: NaiveDate,
    }

    impl LocalDateClock for ZonedInstantClock {
        fn today(&self) -> NaiveDate {
            self.local_date
        }

        fn now_utc(&self) -> DateTime<Utc> {
            self.now
        }

        fn local_date_at(&self, _: DateTime<Utc>) -> NaiveDate {
            self.local_date
        }
    }

    fn queued_due_database() -> (Database, i64, NaiveDate) {
        let database = Database::open_in_memory().unwrap();
        let folder = database.create_folder("Algorithms", None).unwrap();
        let today = NaiveDate::from_ymd_opt(2026, 9, 11).unwrap();
        let item = database
            .create_learning_item_with_clock("Binary Search", folder.id, &FixedClock(today))
            .unwrap();
        database
            .connection
            .execute(
                "UPDATE pending_schedules SET review_date = ?1, due_at_utc = CAST(strftime('%s', ?1 || 'T00:00:00Z') AS INTEGER) * 1000 WHERE learning_item_id = ?2",
                rusqlite::params![today.to_string(), item.id],
            )
            .unwrap();
        database
            .get_home_review_queue_with_clock(&FixedClock(today))
            .unwrap();
        (database, item.id, today)
    }

    fn assert_golden_float(actual: f64, expected: f64) {
        assert!(
            (actual - expected).abs() <= 1e-12_f64.max(1e-12 * actual.abs().max(expected.abs()))
        );
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
    fn migration_upgrades_v3_without_losing_learning_items_or_schedules() {
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
                 CREATE TABLE learning_items (
                   id INTEGER PRIMARY KEY,
                   folder_id INTEGER NOT NULL REFERENCES folders(id),
                   title TEXT NOT NULL CHECK (length(trim(title)) > 0),
                   created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                 );
                 CREATE TABLE pending_schedules (
                   learning_item_id INTEGER PRIMARY KEY REFERENCES learning_items(id),
                   review_date TEXT NOT NULL
                 );
                 INSERT INTO folders (id, name) VALUES (1, 'Algorithms');
                 INSERT INTO learning_items (id, folder_id, title) VALUES (2, 1, 'Binary Search');
                 INSERT INTO pending_schedules (learning_item_id, review_date) VALUES (2, '2026-09-09');
                 INSERT INTO schema_migrations (version) VALUES (1), (2), (3);",
            )
            .unwrap();
        let mut database = super::Database { connection };

        database.migrate().unwrap();
        assert_eq!(
            database
                .connection
                .query_row(
                    "SELECT review_date FROM pending_schedules WHERE learning_item_id = 2",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .unwrap(),
            "2026-09-09"
        );
        assert_eq!(
            database
                .connection
                .query_row(
                    "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap(),
            6
        );
        assert!(database
            .connection
            .query_row(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'review_queue_entries'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .is_ok());
    }

    #[test]
    fn migration_upgrades_an_immediately_preceding_version_four_database() {
        let connection = rusqlite::Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY);
                 CREATE TABLE learner_identity (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), display_name TEXT NOT NULL);
                 CREATE TABLE folders (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES folders(id), name TEXT NOT NULL, created_at TEXT NOT NULL);
                 CREATE TABLE learning_items (id INTEGER PRIMARY KEY, folder_id INTEGER NOT NULL REFERENCES folders(id), title TEXT NOT NULL, created_at TEXT NOT NULL);
                 CREATE TABLE pending_schedules (learning_item_id INTEGER PRIMARY KEY REFERENCES learning_items(id), review_date TEXT NOT NULL);
                 CREATE TABLE review_queue_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, learning_item_id INTEGER NOT NULL UNIQUE REFERENCES learning_items(id));
                 INSERT INTO folders (id, name, created_at) VALUES (1, 'Algorithms', 'now');
                 INSERT INTO learning_items (id, folder_id, title, created_at) VALUES (2, 1, 'Binary Search', 'now');
                 INSERT INTO pending_schedules (learning_item_id, review_date) VALUES (2, '2026-09-08');
                 INSERT INTO review_queue_entries (id, learning_item_id) VALUES (7, 2);
                 INSERT INTO schema_migrations (version) VALUES (1), (2), (3), (4);",
            )
            .unwrap();
        let mut database = super::Database { connection };
        database.migrate().unwrap();
        assert_eq!(
            database
                .connection
                .query_row("SELECT MAX(version) FROM schema_migrations", [], |row| row
                    .get::<_, i64>(
                    0
                ))
                .unwrap(),
            6
        );
        assert_eq!(database.connection.query_row("SELECT review_date, fsrs_state FROM pending_schedules WHERE learning_item_id = 2", [], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))).unwrap(), ("2026-09-08".to_owned(), "new".to_owned()));
        assert_eq!(
            database
                .connection
                .query_row(
                    "SELECT id FROM review_queue_entries WHERE learning_item_id = 2",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            7
        );
    }

    #[test]
    fn observes_today_inclusive_and_excludes_future_items() {
        let database = Database::open_in_memory().unwrap();
        let folder = database.create_folder("Algorithms", None).unwrap();
        let today = NaiveDate::from_ymd_opt(2026, 9, 9).unwrap();
        let due = database
            .create_learning_item_with_clock("Due", folder.id, &FixedClock(today))
            .unwrap();
        let future = database
            .create_learning_item_with_clock("Future", folder.id, &FixedClock(today))
            .unwrap();
        database
            .connection
            .execute(
                "UPDATE pending_schedules SET review_date = ?1, due_at_utc = CAST(strftime('%s', ?1 || 'T00:00:00Z') AS INTEGER) * 1000 WHERE learning_item_id = ?2",
                rusqlite::params![today.to_string(), due.id],
            )
            .unwrap();

        let entries = database
            .get_home_review_queue_with_clock(&FixedClock(today))
            .unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].learning_item_id, due.id);
        assert_eq!(entries[0].kind, "dueReview");
        assert_eq!(entries[0].folder.name, "Algorithms");
        assert_eq!(
            database
                .connection
                .query_row(
                    "SELECT COUNT(*) FROM review_queue_entries WHERE learning_item_id = ?1",
                    [future.id],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap(),
            0
        );
    }

    #[test]
    fn observes_due_instants_before_at_after_and_never_reorders_on_clock_rollback() {
        let database = Database::open_in_memory().unwrap();
        let folder = database.create_folder("Algorithms", None).unwrap();
        let item = database
            .create_learning_item("Binary Search", folder.id)
            .unwrap();
        let due = DateTime::parse_from_rfc3339("2026-09-09T12:05:00Z")
            .unwrap()
            .with_timezone(&Utc);
        database
            .connection
            .execute(
                "UPDATE pending_schedules SET due_at_utc = ?1 WHERE learning_item_id = ?2",
                rusqlite::params![due.timestamp_millis(), item.id],
            )
            .unwrap();
        let before = FixedInstantClock(due - chrono::Duration::milliseconds(1));
        assert!(database
            .get_home_review_queue_with_clock(&before)
            .unwrap()
            .is_empty());
        let at = FixedInstantClock(due);
        assert_eq!(
            database
                .get_home_review_queue_with_clock(&at)
                .unwrap()
                .len(),
            1
        );
        let queue_id: i64 = database
            .connection
            .query_row(
                "SELECT id FROM review_queue_entries WHERE learning_item_id = ?1",
                [item.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            database
                .get_home_review_queue_with_clock(&before)
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            database
                .connection
                .query_row(
                    "SELECT id FROM review_queue_entries WHERE learning_item_id = ?1",
                    [item.id],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap(),
            queue_id
        );
    }

    #[test]
    fn fixed_injected_instant_keeps_queue_predicate_invariant_across_timezone_projections() {
        let due = DateTime::parse_from_rfc3339("2026-09-11T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        // UTC, America/Los_Angeles, and Asia/Singapore respectively. Their local
        // dates differ around midnight, while the durable due predicate is exact.
        for local_date in [
            NaiveDate::from_ymd_opt(2026, 9, 11).unwrap(),
            NaiveDate::from_ymd_opt(2026, 9, 10).unwrap(),
            NaiveDate::from_ymd_opt(2026, 9, 11).unwrap(),
        ] {
            let database = Database::open_in_memory().unwrap();
            let folder = database.create_folder("Algorithms", None).unwrap();
            let item = database
                .create_learning_item("Binary Search", folder.id)
                .unwrap();
            database
                .connection
                .execute(
                    "UPDATE pending_schedules SET due_at_utc = ?1 WHERE learning_item_id = ?2",
                    rusqlite::params![due.timestamp_millis(), item.id],
                )
                .unwrap();
            let clock = ZonedInstantClock {
                now: due,
                local_date,
            };
            assert_eq!(
                database
                    .get_home_review_queue_with_clock(&clock)
                    .unwrap()
                    .iter()
                    .map(|entry| entry.learning_item_id)
                    .collect::<Vec<_>>(),
                vec![item.id]
            );
        }
    }

    #[test]
    fn sqlite_v5_reconstructs_and_matches_direct_next_step() {
        let path = std::env::temp_dir().join(format!(
            "taffy-fsrs-v5-round-trip-{}-{}.sqlite3",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let now = DateTime::parse_from_rfc3339("2026-09-11T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let original = Card {
            due: now,
            stability: 10.0,
            difficulty: 5.0,
            elapsed_days: 10,
            scheduled_days: 10,
            reps: 3,
            lapses: 1,
            state: State::Review,
            last_review: DateTime::parse_from_rfc3339("2026-09-01T00:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
        };
        // This is the direct-crate verifier, independent of Taffy's adapter and
        // persistence reconstruction. Its literals were captured from rs-fsrs 1.2.1.
        let first = FSRS::default().next(original, now, Rating::Good).card;
        assert_eq!(first.state, State::Review);
        assert_eq!(
            first.due,
            DateTime::parse_from_rfc3339("2026-10-15T00:00:00Z")
                .unwrap()
                .with_timezone(&Utc)
        );
        assert_golden_float(first.stability, 34.19217523527655);
        assert_golden_float(first.difficulty, 4.9598188419861655);
        assert_eq!(
            (
                first.elapsed_days,
                first.scheduled_days,
                first.reps,
                first.lapses
            ),
            (10, 34, 4, 1)
        );
        assert_eq!(first.last_review, now);

        let database = Database::open(&path).unwrap();
        let folder = database.create_folder("Algorithms", None).unwrap();
        let item = database
            .create_learning_item("Binary Search", folder.id)
            .unwrap();
        // The v5 scalar columns plus v6's canonical due instant are deliberately
        // written as SQLite values, then reopened for production reconstruction.
        database
            .connection
            .execute(
                "UPDATE pending_schedules SET review_date = ?1, due_at_utc = ?2,
                fsrs_state = ?3, fsrs_stability = ?4, fsrs_difficulty = ?5,
                fsrs_elapsed_days = ?6, fsrs_scheduled_days = ?7, fsrs_reps = ?8,
                fsrs_lapses = ?9, fsrs_last_review_date = ?10,
                fsrs_last_review_at_utc = ?11 WHERE learning_item_id = ?12",
                rusqlite::params![
                    first
                        .due
                        .with_timezone(&chrono::Local)
                        .date_naive()
                        .to_string(),
                    first.due.timestamp_millis(),
                    "review",
                    first.stability,
                    first.difficulty,
                    first.elapsed_days,
                    first.scheduled_days,
                    first.reps,
                    first.lapses,
                    first
                        .last_review
                        .with_timezone(&chrono::Local)
                        .date_naive()
                        .to_string(),
                    first.last_review.timestamp_millis(),
                    item.id,
                ],
            )
            .unwrap();
        drop(database);

        let reopened = Database::open(&path).unwrap();
        let at_due = FixedInstantClock(first.due);
        assert_eq!(
            reopened
                .get_home_review_queue_with_clock(&at_due)
                .unwrap()
                .len(),
            1
        );
        let second = FSRS::default()
            .next(first.clone(), first.due, Rating::Easy)
            .card;
        assert_eq!(second.state, State::Review);
        assert_eq!(
            second.due,
            DateTime::parse_from_rfc3339("2027-06-08T00:00:00Z")
                .unwrap()
                .with_timezone(&Utc)
        );
        assert_golden_float(second.stability, 236.1099184281765);
        assert_golden_float(second.difficulty, 3.8804012630698552);
        assert_eq!(
            (
                second.elapsed_days,
                second.scheduled_days,
                second.reps,
                second.lapses
            ),
            (34, 236, 5, 1)
        );
        assert_eq!(second.last_review, first.due);

        reopened
            .complete_due_review_with_clock(item.id, crate::scheduling::RecallRating::Easy, &at_due)
            .unwrap();
        let persisted = reopened
            .connection
            .query_row(
                "SELECT review_date, due_at_utc, fsrs_state, fsrs_stability, fsrs_difficulty,
                    fsrs_elapsed_days, fsrs_scheduled_days, fsrs_reps, fsrs_lapses,
                    fsrs_last_review_at_utc FROM pending_schedules WHERE learning_item_id = ?1",
                [item.id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, f64>(3)?,
                        row.get::<_, f64>(4)?,
                        row.get::<_, i64>(5)?,
                        row.get::<_, i64>(6)?,
                        row.get::<_, i64>(7)?,
                        row.get::<_, i64>(8)?,
                        row.get::<_, i64>(9)?,
                    ))
                },
            )
            .unwrap();
        assert_eq!(
            persisted.0,
            second
                .due
                .with_timezone(&chrono::Local)
                .date_naive()
                .to_string()
        );
        assert_eq!(persisted.1, second.due.timestamp_millis());
        assert_eq!(persisted.2, "review");
        assert_golden_float(persisted.3, second.stability);
        assert_golden_float(persisted.4, second.difficulty);
        assert_eq!(
            (
                persisted.5,
                persisted.6,
                persisted.7,
                persisted.8,
                persisted.9
            ),
            (
                second.elapsed_days,
                second.scheduled_days,
                i64::from(second.reps),
                i64::from(second.lapses),
                second.last_review.timestamp_millis()
            )
        );
        drop(reopened);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn migration_backfills_v5_date_at_current_host_local_midnight() {
        let connection = rusqlite::Connection::open_in_memory().unwrap();
        connection.execute_batch(
            "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY);
             CREATE TABLE learner_identity (singleton INTEGER PRIMARY KEY, display_name TEXT NOT NULL);
             CREATE TABLE folders (id INTEGER PRIMARY KEY, parent_id INTEGER, name TEXT NOT NULL, created_at TEXT NOT NULL);
             CREATE TABLE learning_items (id INTEGER PRIMARY KEY, folder_id INTEGER NOT NULL, title TEXT NOT NULL, created_at TEXT NOT NULL);
             CREATE TABLE pending_schedules (learning_item_id INTEGER PRIMARY KEY, review_date TEXT NOT NULL, fsrs_state TEXT NOT NULL DEFAULT 'new', fsrs_stability REAL NOT NULL DEFAULT 0, fsrs_difficulty REAL NOT NULL DEFAULT 0, fsrs_elapsed_days INTEGER NOT NULL DEFAULT 0, fsrs_scheduled_days INTEGER NOT NULL DEFAULT 0, fsrs_reps INTEGER NOT NULL DEFAULT 0, fsrs_lapses INTEGER NOT NULL DEFAULT 0, fsrs_last_review_date TEXT);
             CREATE TABLE review_queue_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, learning_item_id INTEGER NOT NULL UNIQUE);
             CREATE TABLE review_events (id INTEGER PRIMARY KEY AUTOINCREMENT, learning_item_id INTEGER NOT NULL, event_kind TEXT NOT NULL, rating TEXT NOT NULL, completed_on TEXT NOT NULL);
             INSERT INTO pending_schedules (learning_item_id, review_date) VALUES (7, '2026-03-08');
             INSERT INTO schema_migrations (version) VALUES (1), (2), (3), (4), (5);"
        ).unwrap();
        let mut database = super::Database { connection };
        let expected = super::Database::local_midnight_timestamp("2026-03-08").unwrap();
        database.migrate().unwrap();
        assert_eq!(
            database
                .connection
                .query_row(
                    "SELECT due_at_utc FROM pending_schedules WHERE learning_item_id = 7",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            expected
        );
        assert_eq!(
            database
                .connection
                .query_row("SELECT MAX(version) FROM schema_migrations", [], |row| row
                    .get::<_, i64>(
                    0
                ))
                .unwrap(),
            6
        );
    }

    #[test]
    fn appends_fifo_membership_once_and_returns_coherent_rows() {
        let database = Database::open_in_memory().unwrap();
        let folder = database.create_folder("Algorithms", None).unwrap();
        let today = NaiveDate::from_ymd_opt(2026, 9, 9).unwrap();
        let first = database
            .create_learning_item_with_clock("First", folder.id, &FixedClock(today))
            .unwrap();
        let second = database
            .create_learning_item_with_clock("Second", folder.id, &FixedClock(today))
            .unwrap();
        database
            .connection
            .execute(
                "UPDATE pending_schedules SET review_date = ?1, due_at_utc = CAST(strftime('%s', ?1 || 'T00:00:00Z') AS INTEGER) * 1000 WHERE learning_item_id IN (?2, ?3)",
                rusqlite::params![today.to_string(), first.id, second.id],
            )
            .unwrap();

        let first_read = database
            .get_home_review_queue_with_clock(&FixedClock(today))
            .unwrap();
        let second_read = database
            .get_home_review_queue_with_clock(&FixedClock(today))
            .unwrap();
        assert_eq!(
            first_read
                .iter()
                .map(|entry| entry.learning_item_id)
                .collect::<Vec<_>>(),
            vec![first.id, second.id]
        );
        assert_eq!(second_read, first_read);
        assert_eq!(
            database
                .connection
                .query_row("SELECT COUNT(*) FROM review_queue_entries", [], |row| {
                    row.get::<_, i64>(0)
                })
                .unwrap(),
            2
        );
    }

    #[test]
    fn preserves_fifo_order_after_database_reopen() {
        let path = std::env::temp_dir().join(format!(
            "taffy-review-queue-{}-{}.sqlite3",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let today = NaiveDate::from_ymd_opt(2026, 9, 9).unwrap();
        let database = Database::open(&path).unwrap();
        let folder = database.create_folder("Algorithms", None).unwrap();
        let first = database.create_learning_item("First", folder.id).unwrap();
        let second = database.create_learning_item("Second", folder.id).unwrap();
        database
            .connection
            .execute(
                "UPDATE pending_schedules SET review_date = ?1, due_at_utc = CAST(strftime('%s', ?1 || 'T00:00:00Z') AS INTEGER) * 1000 WHERE learning_item_id IN (?2, ?3)",
                rusqlite::params![today.to_string(), first.id, second.id],
            )
            .unwrap();
        let before = database
            .get_home_review_queue_with_clock(&FixedClock(today))
            .unwrap();
        drop(database);

        let reopened = Database::open(&path).unwrap();
        assert_eq!(
            reopened
                .get_home_review_queue_with_clock(&FixedClock(today))
                .unwrap(),
            before
        );
        drop(reopened);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn rolls_back_all_queue_additions_and_retry_is_safe() {
        let database = Database::open_in_memory().unwrap();
        let folder = database.create_folder("Algorithms", None).unwrap();
        let today = NaiveDate::from_ymd_opt(2026, 9, 9).unwrap();
        let item = database
            .create_learning_item_with_clock("Due", folder.id, &FixedClock(today))
            .unwrap();
        database
            .connection
            .execute(
                "UPDATE pending_schedules SET review_date = ?1, due_at_utc = CAST(strftime('%s', ?1 || 'T00:00:00Z') AS INTEGER) * 1000 WHERE learning_item_id = ?2",
                rusqlite::params![today.to_string(), item.id],
            )
            .unwrap();
        database
            .connection
            .execute_batch(
                "CREATE TRIGGER reject_review_queue_insert
                 BEFORE INSERT ON review_queue_entries
                 BEGIN SELECT RAISE(ABORT, 'queue insert rejected'); END;",
            )
            .unwrap();

        assert!(database
            .get_home_review_queue_with_clock(&FixedClock(today))
            .is_err());
        assert_eq!(
            database
                .connection
                .query_row("SELECT COUNT(*) FROM review_queue_entries", [], |row| {
                    row.get::<_, i64>(0)
                })
                .unwrap(),
            0
        );
        database
            .connection
            .execute_batch("DROP TRIGGER reject_review_queue_insert")
            .unwrap();
        assert_eq!(
            database
                .get_home_review_queue_with_clock(&FixedClock(today))
                .unwrap()
                .len(),
            1
        );
    }

    struct CountingClock {
        date: NaiveDate,
        reads: std::cell::Cell<u32>,
    }

    impl LocalDateClock for CountingClock {
        fn today(&self) -> NaiveDate {
            self.reads.set(self.reads.get() + 1);
            self.date
        }
    }

    #[test]
    fn reads_the_local_date_clock_once_per_observation() {
        let database = Database::open_in_memory().unwrap();
        let clock = CountingClock {
            date: NaiveDate::from_ymd_opt(2026, 9, 9).unwrap(),
            reads: std::cell::Cell::new(0),
        };
        database.get_home_review_queue_with_clock(&clock).unwrap();
        assert_eq!(clock.reads.get(), 1);
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
            database.create_learning_item(&"a".repeat(121), algorithms.id),
            Err(crate::learning_items::LearningItemsError::TitleTooLong)
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
    fn reads_nested_learning_item_detail_and_renames_only_the_title() {
        let database = Database::open_in_memory().unwrap();
        let algorithms = database.create_folder("Algorithms", None).unwrap();
        let trees = database
            .create_folder("Trees", Some(algorithms.id))
            .unwrap();
        let item = database
            .create_learning_item_with_clock(
                "Binary Search",
                trees.id,
                &FixedClock(NaiveDate::from_ymd_opt(2026, 9, 5).unwrap()),
            )
            .unwrap();

        assert_eq!(
            database.learning_item_detail(item.id).unwrap(),
            crate::learning_items::LearningItemDetail {
                id: item.id,
                title: "Binary Search".to_owned(),
                folder: crate::learning_items::LearningItemFolder {
                    id: trees.id,
                    name: "Trees".to_owned(),
                    ancestors: vec![algorithms.clone()],
                },
                review_date: "2026-09-06".to_owned(),
            }
        );

        let detail = database
            .update_learning_item_title(item.id, "  Binary Search Trees  ")
            .unwrap();
        assert_eq!(detail.title, "Binary Search Trees");
        assert_eq!(detail.folder.id, trees.id);
        assert_eq!(detail.review_date, "2026-09-06");
        assert_eq!(
            database
                .connection
                .query_row(
                    "SELECT folder_id FROM learning_items WHERE id = ?1",
                    [item.id],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap(),
            trees.id
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
            "2026-09-06"
        );
    }

    #[test]
    fn rejects_invalid_duplicate_and_missing_title_updates_without_changes() {
        let database = Database::open_in_memory().unwrap();
        let algorithms = database.create_folder("Algorithms", None).unwrap();
        let binary_search = database
            .create_learning_item("Binary Search", algorithms.id)
            .unwrap();
        database
            .create_learning_item("Binary Trees", algorithms.id)
            .unwrap();

        assert!(matches!(
            database.update_learning_item_title(binary_search.id, " \n "),
            Err(crate::learning_items::LearningItemsError::BlankTitle)
        ));
        assert!(matches!(
            database.update_learning_item_title(binary_search.id, "binary trees"),
            Err(crate::learning_items::LearningItemsError::DuplicateTitle)
        ));
        assert!(matches!(
            database.update_learning_item_title(binary_search.id, &"a".repeat(121)),
            Err(crate::learning_items::LearningItemsError::TitleTooLong)
        ));
        assert!(matches!(
            database.update_learning_item_title(999, "Anything"),
            Err(crate::learning_items::LearningItemsError::LearningItemNotFound)
        ));
        assert_eq!(
            database
                .learning_item_detail(binary_search.id)
                .unwrap()
                .title,
            "Binary Search"
        );
        assert!(database
            .update_learning_item_title(binary_search.id, "BINARY SEARCH")
            .is_ok());
    }

    #[test]
    fn completes_each_rating_atomically_and_persists_canonical_state() {
        for (rating, expected_state) in [
            (crate::scheduling::RecallRating::Again, "learning"),
            (crate::scheduling::RecallRating::Hard, "learning"),
            (crate::scheduling::RecallRating::Good, "learning"),
            (crate::scheduling::RecallRating::Easy, "review"),
        ] {
            let database = Database::open_in_memory().unwrap();
            let folder = database.create_folder("Algorithms", None).unwrap();
            let today = NaiveDate::from_ymd_opt(2026, 9, 9).unwrap();
            let item = database
                .create_learning_item_with_clock("Binary Search", folder.id, &FixedClock(today))
                .unwrap();
            database
                .connection
                .execute(
                    "UPDATE pending_schedules SET review_date = ?1, due_at_utc = CAST(strftime('%s', ?1 || 'T00:00:00Z') AS INTEGER) * 1000 WHERE learning_item_id = ?2",
                    rusqlite::params![today.to_string(), item.id],
                )
                .unwrap();
            database
                .get_home_review_queue_with_clock(&FixedClock(today))
                .unwrap();

            database
                .complete_due_review_with_clock(item.id, rating, &FixedClock(today))
                .unwrap();
            assert_eq!(
                database
                    .connection
                    .query_row(
                        "SELECT learning_item_id, event_kind, rating, completed_on FROM review_events",
                        [],
                        |row| {
                            Ok((
                                row.get::<_, i64>(0)?,
                                row.get::<_, String>(1)?,
                                row.get::<_, String>(2)?,
                                row.get::<_, String>(3)?,
                            ))
                        },
                    )
                    .unwrap(),
                (item.id, "scheduled".to_owned(), rating.to_string(), today.to_string())
            );
            assert!(
                database
                    .connection
                    .query_row(
                        "SELECT review_date FROM pending_schedules WHERE learning_item_id = ?1",
                        [item.id],
                        |row| row.get::<_, String>(0),
                    )
                    .unwrap()
                    >= today.to_string()
            );
            assert_eq!(
                database
                    .connection
                    .query_row(
                        "SELECT fsrs_state FROM pending_schedules WHERE learning_item_id = ?1",
                        [item.id],
                        |row| row.get::<_, String>(0),
                    )
                    .unwrap(),
                expected_state
            );
            assert_eq!(
                database
                    .connection
                    .query_row("SELECT COUNT(*) FROM review_queue_entries", [], |row| {
                        row.get::<_, i64>(0)
                    })
                    .unwrap(),
                0
            );
        }
    }

    #[test]
    fn rejects_invalid_or_stale_completion_without_durable_changes() {
        let database = Database::open_in_memory().unwrap();
        let folder = database.create_folder("Algorithms", None).unwrap();
        let item = database
            .create_learning_item("Binary Search", folder.id)
            .unwrap();
        let today = NaiveDate::from_ymd_opt(2026, 9, 9).unwrap();
        assert!(matches!(
            database.complete_due_review_with_clock(
                item.id,
                crate::scheduling::RecallRating::Good,
                &FixedClock(today)
            ),
            Err(crate::review_queue::CompleteDueReviewError::NotEligible)
        ));
        assert!(matches!(
            crate::scheduling::RecallRating::parse("star"),
            Err(crate::scheduling::SchedulerError::InvalidRating)
        ));
        assert_eq!(
            database
                .connection
                .query_row("SELECT COUNT(*) FROM review_events", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }

    #[test]
    fn rolls_back_event_and_schedule_when_the_transition_fails() {
        let database = Database::open_in_memory().unwrap();
        let folder = database.create_folder("Algorithms", None).unwrap();
        let today = NaiveDate::from_ymd_opt(2026, 9, 9).unwrap();
        let item = database
            .create_learning_item_with_clock("Binary Search", folder.id, &FixedClock(today))
            .unwrap();
        database
            .connection
            .execute(
                "UPDATE pending_schedules SET review_date = ?1, due_at_utc = CAST(strftime('%s', ?1 || 'T00:00:00Z') AS INTEGER) * 1000 WHERE learning_item_id = ?2",
                rusqlite::params![today.to_string(), item.id],
            )
            .unwrap();
        database
            .get_home_review_queue_with_clock(&FixedClock(today))
            .unwrap();
        database
            .connection
            .execute_batch(
                "CREATE TRIGGER reject_completion_schedule BEFORE UPDATE ON pending_schedules
             BEGIN SELECT RAISE(ABORT, 'schedule rejected'); END;",
            )
            .unwrap();
        assert!(database
            .complete_due_review_with_clock(
                item.id,
                crate::scheduling::RecallRating::Good,
                &FixedClock(today)
            )
            .is_err());
        assert_eq!(
            database
                .connection
                .query_row("SELECT COUNT(*) FROM review_events", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            database
                .connection
                .query_row("SELECT COUNT(*) FROM review_queue_entries", [], |row| row
                    .get::<_, i64>(
                    0
                ))
                .unwrap(),
            1
        );
        assert_eq!(
            database
                .connection
                .query_row(
                    "SELECT review_date FROM pending_schedules WHERE learning_item_id = ?1",
                    [item.id],
                    |row| row.get::<_, String>(0)
                )
                .unwrap(),
            today.to_string()
        );
    }

    #[test]
    fn rolls_back_before_event_insert_failure() {
        let (database, item_id, today) = queued_due_database();
        database
            .connection
            .execute_batch(
                "CREATE TRIGGER reject_completion_event BEFORE INSERT ON review_events
                 BEGIN SELECT RAISE(ABORT, 'event rejected'); END;",
            )
            .unwrap();
        assert!(database
            .complete_due_review_with_clock(
                item_id,
                crate::scheduling::RecallRating::Good,
                &FixedClock(today),
            )
            .is_err());
        assert_eq!(
            database
                .connection
                .query_row("SELECT COUNT(*) FROM review_events", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            database
                .connection
                .query_row("SELECT COUNT(*) FROM review_queue_entries", [], |row| row
                    .get::<_, i64>(
                    0
                ))
                .unwrap(),
            1
        );
    }

    #[test]
    fn rolls_back_before_queue_delete_failure() {
        let (database, item_id, today) = queued_due_database();
        database
            .connection
            .execute_batch(
                "CREATE TRIGGER reject_completion_queue_delete BEFORE DELETE ON review_queue_entries
                 BEGIN SELECT RAISE(ABORT, 'queue delete rejected'); END;",
            )
            .unwrap();
        assert!(database
            .complete_due_review_with_clock(
                item_id,
                crate::scheduling::RecallRating::Good,
                &FixedClock(today),
            )
            .is_err());
        assert_eq!(
            database
                .connection
                .query_row("SELECT COUNT(*) FROM review_events", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            database
                .connection
                .query_row("SELECT COUNT(*) FROM review_queue_entries", [], |row| row
                    .get::<_, i64>(
                    0
                ))
                .unwrap(),
            1
        );
        assert_eq!(
            database
                .connection
                .query_row(
                    "SELECT review_date FROM pending_schedules WHERE learning_item_id = ?1",
                    [item_id],
                    |row| row.get::<_, String>(0)
                )
                .unwrap(),
            today.to_string()
        );
    }

    #[test]
    fn rolls_back_all_completion_writes_when_commit_fails() {
        let (database, item_id, today) = queued_due_database();
        super::FAIL_COMPLETION_COMMIT.with(|flag| flag.set(true));
        let result = database.complete_due_review_with_clock(
            item_id,
            crate::scheduling::RecallRating::Good,
            &FixedClock(today),
        );
        super::FAIL_COMPLETION_COMMIT.with(|flag| flag.set(false));
        assert!(result.is_err());
        assert_eq!(
            database
                .connection
                .query_row("SELECT COUNT(*) FROM review_events", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            database
                .connection
                .query_row("SELECT COUNT(*) FROM review_queue_entries", [], |row| row
                    .get::<_, i64>(
                    0
                ))
                .unwrap(),
            1
        );
        assert_eq!(
            database
                .connection
                .query_row(
                    "SELECT review_date FROM pending_schedules WHERE learning_item_id = ?1",
                    [item_id],
                    |row| row.get::<_, String>(0)
                )
                .unwrap(),
            today.to_string()
        );
    }

    #[test]
    fn completion_reads_submission_date_once_and_preserves_unrelated_fifo() {
        let database = Database::open_in_memory().unwrap();
        let folder = database.create_folder("Algorithms", None).unwrap();
        let today = NaiveDate::from_ymd_opt(2026, 9, 9).unwrap();
        let first = database.create_learning_item("First", folder.id).unwrap();
        let second = database.create_learning_item("Second", folder.id).unwrap();
        database
            .connection
            .execute(
                "UPDATE pending_schedules SET review_date = ?1, due_at_utc = CAST(strftime('%s', ?1 || 'T00:00:00Z') AS INTEGER) * 1000 WHERE learning_item_id IN (?2, ?3)",
                rusqlite::params![today.to_string(), first.id, second.id],
            )
            .unwrap();
        database
            .get_home_review_queue_with_clock(&FixedClock(today))
            .unwrap();
        let clock = CountingClock {
            date: today,
            reads: std::cell::Cell::new(0),
        };
        database
            .complete_due_review_with_clock(first.id, crate::scheduling::RecallRating::Good, &clock)
            .unwrap();
        assert_eq!(clock.reads.get(), 1);
        assert_eq!(
            database
                .connection
                .query_row(
                    "SELECT review_date FROM pending_schedules WHERE learning_item_id = ?1",
                    [first.id],
                    |row| row.get::<_, String>(0),
                )
                .unwrap(),
            today.to_string()
        );
        assert_eq!(
            database
                .get_home_review_queue_with_clock(&FixedClock(today))
                .unwrap()
                .iter()
                .map(|entry| entry.learning_item_id)
                .collect::<Vec<_>>(),
            vec![second.id]
        );
    }

    #[test]
    fn completion_survives_database_reopen_and_duplicate_retry_is_stale() {
        let path = std::env::temp_dir().join(format!(
            "taffy-review-completion-{}-{}.sqlite3",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let today = NaiveDate::from_ymd_opt(2026, 9, 9).unwrap();
        let database = Database::open(&path).unwrap();
        let folder = database.create_folder("Algorithms", None).unwrap();
        let item = database
            .create_learning_item_with_clock("Binary Search", folder.id, &FixedClock(today))
            .unwrap();
        database
            .connection
            .execute(
                "UPDATE pending_schedules SET review_date = ?1, due_at_utc = CAST(strftime('%s', ?1 || 'T00:00:00Z') AS INTEGER) * 1000 WHERE learning_item_id = ?2",
                rusqlite::params![today.to_string(), item.id],
            )
            .unwrap();
        database
            .get_home_review_queue_with_clock(&FixedClock(today))
            .unwrap();
        database
            .complete_due_review_with_clock(
                item.id,
                crate::scheduling::RecallRating::Easy,
                &FixedClock(today),
            )
            .unwrap();
        drop(database);

        let reopened = Database::open(&path).unwrap();
        assert_eq!(
            reopened
                .connection
                .query_row(
                    "SELECT COUNT(*) FROM review_events WHERE learning_item_id = ?1",
                    [item.id],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            1
        );
        assert_eq!(
            reopened
                .connection
                .query_row(
                    "SELECT fsrs_state FROM pending_schedules WHERE learning_item_id = ?1",
                    [item.id],
                    |row| row.get::<_, String>(0)
                )
                .unwrap(),
            "review"
        );
        assert!(matches!(
            reopened.complete_due_review_with_clock(
                item.id,
                crate::scheduling::RecallRating::Easy,
                &FixedClock(today)
            ),
            Err(crate::review_queue::CompleteDueReviewError::NotEligible)
        ));
        assert_eq!(
            reopened
                .connection
                .query_row(
                    "SELECT COUNT(*) FROM review_events WHERE learning_item_id = ?1",
                    [item.id],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            1
        );
        drop(reopened);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn rolls_back_a_title_update_when_sqlite_rejects_it() {
        let database = Database::open_in_memory().unwrap();
        let folder = database.create_folder("Algorithms", None).unwrap();
        let item = database
            .create_learning_item("Binary Search", folder.id)
            .unwrap();
        database
            .connection
            .execute_batch(
                "CREATE TRIGGER reject_title_update
                 BEFORE UPDATE OF title ON learning_items
                 BEGIN SELECT RAISE(ABORT, 'title update rejected'); END;",
            )
            .unwrap();

        assert!(database
            .update_learning_item_title(item.id, "Binary Search Trees")
            .is_err());
        assert_eq!(
            database.learning_item_detail(item.id).unwrap().title,
            "Binary Search"
        );
    }

    #[test]
    fn persists_a_renamed_learning_item_after_reopening() {
        let path = std::env::temp_dir().join(format!(
            "taffy-learning-item-rename-{}-{}.sqlite3",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let database = Database::open(&path).unwrap();
        let folder = database.create_folder("Algorithms", None).unwrap();
        let item = database
            .create_learning_item("Binary Search", folder.id)
            .unwrap();
        database
            .update_learning_item_title(item.id, "Binary Search Trees")
            .unwrap();
        drop(database);

        let reopened = Database::open(&path).unwrap();
        assert_eq!(
            reopened.learning_item_detail(item.id).unwrap().title,
            "Binary Search Trees"
        );
        drop(reopened);
        std::fs::remove_file(path).unwrap();
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
