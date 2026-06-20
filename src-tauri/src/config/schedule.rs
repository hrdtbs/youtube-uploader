use chrono::{DateTime, Datelike, Duration, NaiveDate, NaiveTime, TimeZone, Utc, Weekday};
use chrono_tz::Tz;

use crate::youtube::types::{ScheduleConfig, ScheduledSlot};

const MIN_LEAD_MS: i64 = 15 * 60 * 1000;

struct SlotOccurrence {
    local: DateTime<Tz>,
    utc: DateTime<Utc>,
}

fn js_weekday_to_chrono(weekday: u8) -> Weekday {
    match weekday {
        0 => Weekday::Sun,
        1 => Weekday::Mon,
        2 => Weekday::Tue,
        3 => Weekday::Wed,
        4 => Weekday::Thu,
        5 => Weekday::Fri,
        6 => Weekday::Sat,
        _ => Weekday::Sun,
    }
}

fn sunday_week_start(date: DateTime<Tz>) -> DateTime<Tz> {
    let days_from_sunday = date.weekday().num_days_from_sunday();
    date.date_naive()
        .checked_sub_days(chrono::Days::new(days_from_sunday as u64))
        .map(|day| date.timezone().from_local_datetime(&day.and_hms_opt(0, 0, 0).unwrap()))
        .and_then(|dt| dt.single())
        .unwrap_or(date)
}

fn parse_start_date(start_date: &str, timezone: &Tz) -> anyhow::Result<DateTime<Tz>> {
    let naive = NaiveDate::parse_from_str(start_date, "%Y-%m-%d")
        .map_err(|_| anyhow::anyhow!("Invalid schedule.startDate: {start_date}"))?;
    timezone
        .from_local_datetime(&naive.and_hms_opt(0, 0, 0).unwrap())
        .single()
        .ok_or_else(|| anyhow::anyhow!("Invalid schedule.startDate: {start_date}"))
}

fn sort_slots(schedule: &ScheduleConfig) -> Vec<crate::youtube::types::ScheduleSlot> {
    let mut slots = schedule.slots.clone();
    slots.sort_by(|a, b| {
        a.weekday
            .cmp(&b.weekday)
            .then_with(|| a.time.cmp(&b.time))
    });
    slots
}

fn slot_occurrence_in_week(
    week_start_sunday: DateTime<Tz>,
    slot: &crate::youtube::types::ScheduleSlot,
) -> Option<SlotOccurrence> {
    let parts: Vec<_> = slot.time.split(':').collect();
    if parts.len() != 2 {
        return None;
    }
    let hour: u32 = parts[0].parse().ok()?;
    let minute: u32 = parts[1].parse().ok()?;
    let target = js_weekday_to_chrono(slot.weekday);
    let days_from_week_start = (target.num_days_from_sunday() as i64
        - week_start_sunday.weekday().num_days_from_sunday() as i64
        + 7)
        % 7;

    let local_date = week_start_sunday.date_naive() + Duration::days(days_from_week_start);
    let local_time = NaiveTime::from_hms_opt(hour, minute, 0)?;
    let local = week_start_sunday
        .timezone()
        .from_local_datetime(&local_date.and_time(local_time))
        .single()?;

    Some(SlotOccurrence {
        utc: local.with_timezone(&Utc),
        local,
    })
}

fn generate_occurrences(schedule: &ScheduleConfig) -> Vec<SlotOccurrence> {
    let sorted = sort_slots(schedule);
    let timezone: Tz = schedule
        .timezone
        .parse()
        .unwrap_or(chrono_tz::UTC);
    let start_date = parse_start_date(&schedule.start_date, &timezone).unwrap_or_else(|_| {
        Utc::now().with_timezone(&timezone)
    });
    let week_start = sunday_week_start(start_date);
    let mut results = Vec::new();

    for week in 0..520 {
        let current_week_start = week_start + Duration::days(week * 7);
        for slot in &sorted {
            if let Some(occurrence) = slot_occurrence_in_week(current_week_start, slot) {
                if occurrence.local < start_date {
                    continue;
                }
                results.push(occurrence);
            }
        }
    }

    results
}

fn format_slot(slot: &SlotOccurrence, timezone: &str) -> ScheduledSlot {
    ScheduledSlot {
        publish_at_utc: slot.utc.to_rfc3339(),
        publish_at_local: format!(
            "{} ({timezone})",
            slot.local.format("%Y-%m-%d %H:%M")
        ),
    }
}

pub fn create_schedule_slots(
    schedule: &ScheduleConfig,
    count: usize,
) -> anyhow::Result<Vec<ScheduledSlot>> {
    let timezone: Tz = schedule
        .timezone
        .parse()
        .map_err(|_| anyhow::anyhow!("Invalid schedule.timezone: {}", schedule.timezone))?;
    let min_publish_at = Utc::now() + Duration::milliseconds(MIN_LEAD_MS);
    let occurrences = generate_occurrences(schedule);
    let mut assigned = 0usize;
    let mut slots = Vec::new();

    for occurrence in occurrences {
        if assigned >= count {
            break;
        }
        if occurrence.utc < min_publish_at {
            continue;
        }
        slots.push(format_slot(&occurrence, &schedule.timezone));
        assigned += 1;
    }

    if assigned < count {
        anyhow::bail!(
            "Could not assign {count} publish slot(s). Only {assigned} future slot(s) found within the schedule horizon."
        );
    }

    Ok(slots)
}
