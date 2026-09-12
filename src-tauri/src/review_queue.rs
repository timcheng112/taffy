use serde::Serialize;
use thiserror::Error;

use crate::database::DatabaseError;
use crate::scheduling::{RecallRating, SchedulerError};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewQueueFolder {
    pub id: i64,
    pub name: String,
    pub ancestors: Vec<ReviewQueueFolderAncestor>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewQueueFolderAncestor {
    pub id: i64,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeReviewQueueEntry {
    pub learning_item_id: i64,
    pub title: String,
    pub folder: ReviewQueueFolder,
    #[serde(rename = "kind")]
    pub kind: &'static str,
}

impl HomeReviewQueueEntry {
    pub const DUE_REVIEW: &'static str = "dueReview";
}

#[derive(Debug, Error)]
pub enum ReviewQueueError {
    #[error(transparent)]
    Database(#[from] DatabaseError),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletedDueReview {
    pub learning_item_id: i64,
    pub review_event_id: i64,
    pub rating: RecallRating,
    pub event_kind: &'static str,
    pub completed_on: String,
    pub next_review_date: String,
}

#[derive(Debug, Error)]
pub enum CompleteDueReviewError {
    #[error("the review is no longer eligible")]
    NotEligible,
    #[error(transparent)]
    Database(#[from] DatabaseError),
    #[error(transparent)]
    Scheduler(#[from] SchedulerError),
}

#[cfg(test)]
mod tests {
    use super::HomeReviewQueueEntry;

    #[test]
    fn serializes_the_stable_home_entry_wire_shape() {
        let entry = HomeReviewQueueEntry {
            learning_item_id: 7,
            title: "Binary Search".to_owned(),
            folder: super::ReviewQueueFolder {
                id: 3,
                name: "Algorithms".to_owned(),
                ancestors: vec![super::ReviewQueueFolderAncestor {
                    id: 1,
                    name: "Computer Science".to_owned(),
                }],
            },
            kind: HomeReviewQueueEntry::DUE_REVIEW,
        };
        assert_eq!(
            serde_json::to_value(entry).unwrap(),
            serde_json::json!({
                "learningItemId": 7,
                "title": "Binary Search",
                "folder": {
                    "id": 3,
                    "name": "Algorithms",
                    "ancestors": [{"id": 1, "name": "Computer Science"}]
                },
                "kind": "dueReview"
            })
        );
    }
}
