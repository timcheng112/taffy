use std::fs;
use std::path::Path;

use rusqlite::Connection;

use crate::onboarding::{Learner, OnboardingError};

pub struct Database {
    connection: Connection,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self, OnboardingError> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut database = Self {
            connection: Connection::open(path).map_err(OnboardingError::storage)?,
        };
        database.migrate()?;
        Ok(database)
    }

    pub fn open_in_memory() -> Result<Self, OnboardingError> {
        let mut database = Self {
            connection: Connection::open_in_memory().map_err(OnboardingError::storage)?,
        };
        database.migrate()?;
        Ok(database)
    }

    fn migrate(&mut self) -> Result<(), OnboardingError> {
        let transaction = self
            .connection
            .transaction()
            .map_err(OnboardingError::storage)?;
        transaction
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY);
         CREATE TABLE IF NOT EXISTS learner_identity (
           singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
           display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0)
         );
         INSERT OR IGNORE INTO schema_migrations (version) VALUES (1);",
            )
            .map_err(OnboardingError::storage)?;
        transaction.commit().map_err(OnboardingError::storage)
    }

    pub fn learner(&self) -> Result<Option<Learner>, OnboardingError> {
        let mut statement = self
            .connection
            .prepare("SELECT display_name FROM learner_identity WHERE singleton = 1")
            .map_err(OnboardingError::storage)?;
        let result = statement.query_row([], |row| {
            Ok(Learner {
                display_name: row.get(0)?,
            })
        });
        match result {
            Ok(learner) => Ok(Some(learner)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(error) => Err(OnboardingError::storage(error)),
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
            .map_err(OnboardingError::storage)?;
        Ok(learner)
    }
}

#[cfg(test)]
mod tests {
    use super::Database;

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
}
