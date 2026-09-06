use chrono::{Local, NaiveDate};

pub trait LocalDateClock {
    fn today(&self) -> NaiveDate;
}

pub struct SystemLocalDateClock;

impl LocalDateClock for SystemLocalDateClock {
    fn today(&self) -> NaiveDate {
        Local::now().date_naive()
    }
}

pub fn first_review_date(clock: &impl LocalDateClock) -> NaiveDate {
    clock
        .today()
        .succ_opt()
        .expect("the local date can advance by one day")
}

#[cfg(test)]
mod tests {
    use chrono::NaiveDate;

    use super::{first_review_date, LocalDateClock};

    struct FixedClock(NaiveDate);

    impl LocalDateClock for FixedClock {
        fn today(&self) -> NaiveDate {
            self.0
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
}
