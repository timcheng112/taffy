use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use rs_fsrs::{Card, Rating, State, FSRS};
use serde::Serialize;
use thiserror::Error;

pub trait LocalDateClock {
    fn today(&self) -> NaiveDate;

    /// A single Rust-owned instant used for a completion or queue observation.
    /// Test clocks that only care about a date retain UTC-midnight behavior.
    fn now_utc(&self) -> DateTime<Utc> {
        utc_midnight(self.today()).expect("a valid local date has a UTC midnight")
    }

    fn local_date_at(&self, instant: DateTime<Utc>) -> NaiveDate {
        instant.date_naive()
    }
}
pub struct SystemLocalDateClock;
impl LocalDateClock for SystemLocalDateClock {
    fn today(&self) -> NaiveDate {
        chrono::Local::now().date_naive()
    }

    fn now_utc(&self) -> DateTime<Utc> {
        Utc::now()
    }

    fn local_date_at(&self, instant: DateTime<Utc>) -> NaiveDate {
        instant.with_timezone(&chrono::Local).date_naive()
    }
}
pub fn first_review_date(clock: &impl LocalDateClock) -> NaiveDate {
    clock
        .today()
        .succ_opt()
        .expect("the local date can advance by one day")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RecallRating {
    Again,
    Hard,
    Good,
    Easy,
}
impl RecallRating {
    pub fn parse(value: &str) -> Result<Self, SchedulerError> {
        match value {
            "again" => Ok(Self::Again),
            "hard" => Ok(Self::Hard),
            "good" => Ok(Self::Good),
            "easy" => Ok(Self::Easy),
            _ => Err(SchedulerError::InvalidRating),
        }
    }
}
impl std::fmt::Display for RecallRating {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::Again => "again",
            Self::Hard => "hard",
            Self::Good => "good",
            Self::Easy => "easy",
        })
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct ScheduleState {
    pub state: String,
    pub stability: f64,
    pub difficulty: f64,
    pub elapsed_days: i64,
    pub scheduled_days: i64,
    pub reps: i64,
    pub lapses: i64,
    pub last_review_at_utc: Option<DateTime<Utc>>,
    pub due_at_utc: DateTime<Utc>,
}
#[derive(Debug, Clone, PartialEq)]
pub struct ScheduledState {
    pub next_review_at_utc: DateTime<Utc>,
    pub state: String,
    pub stability: f64,
    pub difficulty: f64,
    pub elapsed_days: i64,
    pub scheduled_days: i64,
    pub reps: i64,
    pub lapses: i64,
    pub last_review_at_utc: DateTime<Utc>,
}
#[derive(Debug, Error, PartialEq, Eq)]
pub enum SchedulerError {
    #[error("invalid recall rating")]
    InvalidRating,
    #[error("invalid persisted scheduler state")]
    InvalidState,
    #[error("invalid persisted schedule date")]
    InvalidDate,
    #[error("invalid persisted schedule timestamp")]
    InvalidTimestamp,
}

pub fn timestamp_millis(value: DateTime<Utc>) -> i64 {
    value.timestamp_millis()
}

pub fn utc_from_timestamp_millis(value: i64) -> Result<DateTime<Utc>, SchedulerError> {
    DateTime::from_timestamp_millis(value).ok_or(SchedulerError::InvalidTimestamp)
}

fn utc_midnight(date: NaiveDate) -> Result<DateTime<Utc>, SchedulerError> {
    Ok(Utc.from_utc_datetime(
        &date
            .and_hms_opt(0, 0, 0)
            .ok_or(SchedulerError::InvalidDate)?,
    ))
}
fn state_from_storage(value: &str) -> Result<State, SchedulerError> {
    match value {
        "new" => Ok(State::New),
        "learning" => Ok(State::Learning),
        "review" => Ok(State::Review),
        "relearning" => Ok(State::Relearning),
        _ => Err(SchedulerError::InvalidState),
    }
}
fn state_to_storage(value: State) -> &'static str {
    match value {
        State::New => "new",
        State::Learning => "learning",
        State::Review => "review",
        State::Relearning => "relearning",
    }
}
fn rating_to_fsrs(value: RecallRating) -> Rating {
    match value {
        RecallRating::Again => Rating::Again,
        RecallRating::Hard => Rating::Hard,
        RecallRating::Good => Rating::Good,
        RecallRating::Easy => Rating::Easy,
    }
}

fn card_from_state(current: &ScheduleState) -> Result<Card, SchedulerError> {
    if !current.stability.is_finite()
        || !current.difficulty.is_finite()
        || current.stability < 0.0
        || current.difficulty < 0.0
        || current.elapsed_days < 0
        || current.scheduled_days < 0
        || current.reps < 0
        || current.lapses < 0
        || current.reps > i32::MAX as i64
        || current.lapses > i32::MAX as i64
    {
        return Err(SchedulerError::InvalidState);
    }
    let state = state_from_storage(&current.state)?;
    if state == State::New
        && (current.stability != 0.0
            || current.difficulty != 0.0
            || current.elapsed_days != 0
            || current.scheduled_days != 0
            || current.reps != 0
            || current.lapses != 0)
    {
        return Err(SchedulerError::InvalidState);
    }
    let last_review = match (state, current.last_review_at_utc) {
        (State::New, None) => {
            utc_midnight(NaiveDate::from_ymd_opt(1970, 1, 1).ok_or(SchedulerError::InvalidDate)?)?
        }
        (State::New, Some(_)) => return Err(SchedulerError::InvalidState),
        (_, Some(instant)) => instant,
        (_, None) => return Err(SchedulerError::InvalidState),
    };
    Ok(Card {
        due: current.due_at_utc,
        stability: current.stability,
        difficulty: current.difficulty,
        elapsed_days: current.elapsed_days,
        scheduled_days: current.scheduled_days,
        reps: current.reps as i32,
        lapses: current.lapses as i32,
        state,
        last_review,
    })
}

/// The sole scheduler adapter; rs-fsrs types and UTC normalization stop here.
pub fn schedule(
    current: &ScheduleState,
    rating: RecallRating,
    completed_at_utc: DateTime<Utc>,
) -> Result<ScheduledState, SchedulerError> {
    let info = FSRS::default().next(
        card_from_state(current)?,
        completed_at_utc,
        rating_to_fsrs(rating),
    );
    if !info.card.stability.is_finite()
        || !info.card.difficulty.is_finite()
        || info.card.elapsed_days < 0
        || info.card.scheduled_days < 0
    {
        return Err(SchedulerError::InvalidState);
    }
    Ok(ScheduledState {
        next_review_at_utc: info.card.due,
        state: state_to_storage(info.card.state).to_owned(),
        stability: info.card.stability,
        difficulty: info.card.difficulty,
        elapsed_days: info.card.elapsed_days,
        scheduled_days: info.card.scheduled_days,
        reps: i64::from(info.card.reps),
        lapses: i64::from(info.card.lapses),
        last_review_at_utc: info.card.last_review,
    })
}

#[cfg(test)]
mod tests {
    use super::{first_review_date, schedule, LocalDateClock, RecallRating, ScheduleState};
    use chrono::{DateTime, NaiveDate, Utc};
    use rs_fsrs::{Card, Rating, State, FSRS};
    struct FixedClock(NaiveDate);
    impl LocalDateClock for FixedClock {
        fn today(&self) -> NaiveDate {
            self.0
        }
    }
    fn new_card(date: NaiveDate) -> ScheduleState {
        ScheduleState {
            state: "new".to_owned(),
            stability: 0.0,
            difficulty: 0.0,
            elapsed_days: 0,
            scheduled_days: 0,
            reps: 0,
            lapses: 0,
            last_review_at_utc: None,
            due_at_utc: super::utc_midnight(date).unwrap(),
        }
    }
    fn fixture_time(value: &str) -> DateTime<Utc> {
        value.parse().unwrap()
    }
    fn direct_new_card() -> Card {
        Card {
            due: fixture_time("2026-09-11T00:00:00Z"),
            stability: 0.0,
            difficulty: 0.0,
            elapsed_days: 0,
            scheduled_days: 0,
            reps: 0,
            lapses: 0,
            state: State::New,
            last_review: fixture_time("1970-01-01T00:00:00Z"),
        }
    }
    fn direct_review_card() -> Card {
        Card {
            due: fixture_time("2026-09-11T00:00:00Z"),
            stability: 10.0,
            difficulty: 5.0,
            elapsed_days: 10,
            scheduled_days: 10,
            reps: 3,
            lapses: 1,
            state: State::Review,
            last_review: fixture_time("2026-09-01T00:00:00Z"),
        }
    }
    #[derive(Clone, Copy)]
    struct GoldenTuple {
        state: State,
        due: &'static str,
        projected_local_review_date: &'static str,
        stability: f64,
        difficulty: f64,
        elapsed_days: i64,
        scheduled_days: i64,
        reps: i32,
        lapses: i32,
        last_review: &'static str,
    }
    const NEW_GOLDENS: [GoldenTuple; 4] = [
        GoldenTuple {
            state: State::Learning,
            due: "2026-09-11T00:01:00Z",
            projected_local_review_date: "2026-09-11",
            stability: 0.4072,
            difficulty: 7.2102,
            elapsed_days: 0,
            scheduled_days: 0,
            reps: 1,
            lapses: 0,
            last_review: "2026-09-11T00:00:00Z",
        },
        GoldenTuple {
            state: State::Learning,
            due: "2026-09-11T00:05:00Z",
            projected_local_review_date: "2026-09-11",
            stability: 1.1829,
            difficulty: 6.508547223894037,
            elapsed_days: 0,
            scheduled_days: 0,
            reps: 1,
            lapses: 0,
            last_review: "2026-09-11T00:00:00Z",
        },
        GoldenTuple {
            state: State::Learning,
            due: "2026-09-11T00:10:00Z",
            projected_local_review_date: "2026-09-11",
            stability: 3.1262,
            difficulty: 5.314577829570867,
            elapsed_days: 0,
            scheduled_days: 0,
            reps: 1,
            lapses: 0,
            last_review: "2026-09-11T00:00:00Z",
        },
        GoldenTuple {
            state: State::Review,
            due: "2026-09-26T00:00:00Z",
            projected_local_review_date: "2026-09-26",
            stability: 15.4722,
            difficulty: 3.28285649513529,
            elapsed_days: 0,
            scheduled_days: 15,
            reps: 1,
            lapses: 0,
            last_review: "2026-09-11T00:00:00Z",
        },
    ];
    const REVIEW_GOLDENS: [GoldenTuple; 4] = [
        GoldenTuple {
            state: State::Relearning,
            due: "2026-09-11T00:05:00Z",
            projected_local_review_date: "2026-09-11",
            stability: 2.2052614384348512,
            difficulty: 7.040172161986166,
            elapsed_days: 10,
            scheduled_days: 0,
            reps: 4,
            lapses: 2,
            last_review: "2026-09-11T00:00:00Z",
        },
        GoldenTuple {
            state: State::Review,
            due: "2026-09-27T00:00:00Z",
            projected_local_review_date: "2026-09-27",
            stability: 15.823056579131066,
            difficulty: 5.999995501986166,
            elapsed_days: 10,
            scheduled_days: 16,
            reps: 4,
            lapses: 1,
            last_review: "2026-09-11T00:00:00Z",
        },
        GoldenTuple {
            state: State::Review,
            due: "2026-10-15T00:00:00Z",
            projected_local_review_date: "2026-10-15",
            stability: 34.19217523527655,
            difficulty: 4.9598188419861655,
            elapsed_days: 10,
            scheduled_days: 34,
            reps: 4,
            lapses: 1,
            last_review: "2026-09-11T00:00:00Z",
        },
        GoldenTuple {
            state: State::Review,
            due: "2026-12-01T00:00:00Z",
            projected_local_review_date: "2026-12-01",
            stability: 81.28466354826588,
            difficulty: 3.9196421819861658,
            elapsed_days: 10,
            scheduled_days: 81,
            reps: 4,
            lapses: 1,
            last_review: "2026-09-11T00:00:00Z",
        },
    ];
    fn assert_close(actual: f64, expected: f64) {
        assert!(
            (actual - expected).abs() <= 1e-12_f64.max(1e-12 * actual.abs().max(expected.abs()))
        );
    }
    fn assert_direct_card(card: &Card, expected: GoldenTuple) {
        assert_eq!(card.state, expected.state);
        assert_eq!(card.due, fixture_time(expected.due));
        assert_eq!(
            card.due
                .with_timezone(&chrono::Local)
                .date_naive()
                .to_string(),
            expected.projected_local_review_date
        );
        assert_close(card.stability, expected.stability);
        assert_close(card.difficulty, expected.difficulty);
        assert_eq!(card.elapsed_days, expected.elapsed_days);
        assert_eq!(card.scheduled_days, expected.scheduled_days);
        assert_eq!(card.reps, expected.reps);
        assert_eq!(card.lapses, expected.lapses);
        assert_eq!(card.last_review, fixture_time(expected.last_review));
    }
    fn assert_adapter_result(actual: &super::ScheduledState, expected: GoldenTuple) {
        assert_eq!(actual.state, super::state_to_storage(expected.state));
        assert_eq!(actual.next_review_at_utc, fixture_time(expected.due));
        assert_close(actual.stability, expected.stability);
        assert_close(actual.difficulty, expected.difficulty);
        assert_eq!(actual.elapsed_days, expected.elapsed_days);
        assert_eq!(actual.scheduled_days, expected.scheduled_days);
        assert_eq!(actual.reps, i64::from(expected.reps));
        assert_eq!(actual.lapses, i64::from(expected.lapses));
        assert_eq!(
            actual.last_review_at_utc,
            fixture_time(expected.last_review)
        );
    }
    fn review_schedule_state() -> ScheduleState {
        ScheduleState {
            state: "review".to_owned(),
            stability: 10.0,
            difficulty: 5.0,
            elapsed_days: 10,
            scheduled_days: 10,
            reps: 3,
            lapses: 1,
            last_review_at_utc: Some(fixture_time("2026-09-01T00:00:00Z")),
            due_at_utc: fixture_time("2026-09-11T00:00:00Z"),
        }
    }
    #[test]
    fn new_card_all_four_ratings_match_rs_fsrs_1_2_1_golden_tuples() {
        let now = fixture_time("2026-09-11T00:00:00Z");
        for ((rating, crate_rating), expected) in [
            (RecallRating::Again, Rating::Again),
            (RecallRating::Hard, Rating::Hard),
            (RecallRating::Good, Rating::Good),
            (RecallRating::Easy, Rating::Easy),
        ]
        .into_iter()
        .zip(NEW_GOLDENS)
        {
            // The first assertion is the independent direct-crate verifier; the
            // adapter is only compared with the recorded literal afterwards.
            assert_direct_card(
                &FSRS::default()
                    .next(direct_new_card(), now, crate_rating)
                    .card,
                expected,
            );
            assert_adapter_result(
                &schedule(&new_card(now.date_naive()), rating, now).unwrap(),
                expected,
            );
        }
    }
    #[test]
    fn review_card_all_four_ratings_match_rs_fsrs_1_2_1_golden_tuples() {
        let now = fixture_time("2026-09-11T00:00:00Z");
        for ((rating, crate_rating), expected) in [
            (RecallRating::Again, Rating::Again),
            (RecallRating::Hard, Rating::Hard),
            (RecallRating::Good, Rating::Good),
            (RecallRating::Easy, Rating::Easy),
        ]
        .into_iter()
        .zip(REVIEW_GOLDENS)
        {
            assert_direct_card(
                &FSRS::default()
                    .next(direct_review_card(), now, crate_rating)
                    .card,
                expected,
            );
            assert_adapter_result(
                &schedule(&review_schedule_state(), rating, now).unwrap(),
                expected,
            );
        }
    }
    #[test]
    fn review_again_enters_relearning_and_increments_lapse() {
        let now = fixture_time("2026-09-11T00:00:00Z");
        let direct = FSRS::default()
            .next(direct_review_card(), now, Rating::Again)
            .card;
        assert_direct_card(&direct, REVIEW_GOLDENS[0]);
        assert_eq!(direct.state, State::Relearning);
        assert_eq!(direct.lapses, direct_review_card().lapses + 1);
        assert_adapter_result(
            &schedule(&review_schedule_state(), RecallRating::Again, now).unwrap(),
            REVIEW_GOLDENS[0],
        );
    }
    struct ZonedFixedClock {
        now: DateTime<Utc>,
        local_date: NaiveDate,
    }
    impl LocalDateClock for ZonedFixedClock {
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
    #[test]
    fn fixed_injected_instant_is_invariant_across_host_clock_and_timezone() {
        let now = fixture_time("2026-09-11T00:00:00Z");
        // UTC, Los Angeles (the prior local day), and Singapore (later local day)
        // deliberately have different host-local calendar projections. The Rust
        // scheduler receives only the injected UTC instant and must be identical.
        for clock in [
            ZonedFixedClock {
                now,
                local_date: NaiveDate::from_ymd_opt(2026, 9, 11).unwrap(),
            },
            ZonedFixedClock {
                now,
                local_date: NaiveDate::from_ymd_opt(2026, 9, 10).unwrap(),
            },
            ZonedFixedClock {
                now,
                local_date: NaiveDate::from_ymd_opt(2026, 9, 11).unwrap(),
            },
        ] {
            assert_adapter_result(
                &schedule(
                    &review_schedule_state(),
                    RecallRating::Good,
                    clock.now_utc(),
                )
                .unwrap(),
                REVIEW_GOLDENS[2],
            );
        }
    }
    #[test]
    fn schedules_the_first_review_on_the_next_local_day() {
        assert_eq!(
            first_review_date(&FixedClock(NaiveDate::from_ymd_opt(2026, 9, 5).unwrap())),
            NaiveDate::from_ymd_opt(2026, 9, 6).unwrap()
        );
    }
    #[test]
    fn schedules_across_a_year_boundary() {
        assert_eq!(
            first_review_date(&FixedClock(NaiveDate::from_ymd_opt(2026, 12, 31).unwrap())),
            NaiveDate::from_ymd_opt(2027, 1, 1).unwrap()
        );
    }
    #[test]
    fn all_ratings_use_the_pinned_adapter_and_return_valid_states() {
        let date = NaiveDate::from_ymd_opt(2026, 9, 11).unwrap();
        for rating in [
            RecallRating::Again,
            RecallRating::Hard,
            RecallRating::Good,
            RecallRating::Easy,
        ] {
            let next =
                schedule(&new_card(date), rating, super::utc_midnight(date).unwrap()).unwrap();
            assert!(next.next_review_at_utc >= super::utc_midnight(date).unwrap());
            assert!(next.stability.is_finite() && next.difficulty.is_finite());
            assert_eq!(next.reps, 1);
        }
    }
}
