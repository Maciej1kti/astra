//! Read-only finish-to-start forecast. Never changes recorded schedules.
use crate::{local_date, models::Schedule};
use chrono::{Days, NaiveDate};
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet, VecDeque};

/// Typed snapshot input. Unreliable projections block forecasts for their descendants.
#[derive(Debug, Clone, PartialEq)]
pub struct TimelineInput {
    pub id: String,
    pub schedule: Option<Schedule>,
    pub depends_on: Vec<String>,
    pub reliable: bool,
}

#[derive(Debug, Serialize)]
pub struct Forecast {
    pub id: String,
    pub schedule: Schedule,
    pub delay_days: i64,
    pub drives_finish: bool,
}
#[derive(Debug, Serialize)]
pub struct Analysis {
    pub planned_start: Option<String>,
    pub planned_end: Option<String>,
    pub forecast_end: Option<String>,
    pub delay_days: i64,
    pub scheduled_cards: usize,
    pub unscheduled_cards: usize,
    pub unresolved_cards: usize,
    pub complete: bool,
    pub driving_path: Vec<String>,
    #[serde(skip)]
    pub forecasts: BTreeMap<String, Forecast>,
}

/// Inputs are non-archived, non-cancelled card metadata from one index snapshot.
/// Recorded starts are lower bounds, durations include both dates and weekends.
/// Unknown predecessors block their descendants; cycles never yield fake dates.
pub fn analyze(cards: &[TimelineInput], truncated: bool) -> Analysis {
    let by_id: BTreeMap<&str, &TimelineInput> =
        cards.iter().map(|card| (card.id.as_str(), card)).collect();
    let mut indegree = BTreeMap::new();
    let mut children: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    let mut ranges = BTreeMap::new();
    let mut unknown = BTreeSet::new();
    let mut unscheduled = 0;
    for (&id, card) in &by_id {
        let range = card
            .schedule
            .as_ref()
            .and_then(|range| Some((local_date(&range.start).ok()?, local_date(&range.end).ok()?)))
            .filter(|(s, e)| s <= e);
        if let Some(range) = range {
            ranges.insert(id, range);
        } else {
            unscheduled += 1;
            unknown.insert(id);
        }
        if !card.reliable {
            unknown.insert(id);
        }
        let deps: BTreeSet<&str> = card.depends_on.iter().map(String::as_str).collect();
        indegree.insert(id, deps.len());
        for dep in deps {
            if !by_id.contains_key(dep) {
                unknown.insert(id);
            }
            children.entry(dep).or_default().push(id);
        }
    }
    let planned_start = ranges.values().map(|(s, _)| *s).min();
    let planned_end = ranges.values().map(|(_, e)| *e).max();
    let mut queue: VecDeque<&str> = indegree
        .iter()
        .filter_map(|(&id, &n)| (n == 0).then_some(id))
        .collect();
    let mut ends: BTreeMap<&str, NaiveDate> = BTreeMap::new();
    let mut drivers: BTreeMap<&str, &str> = BTreeMap::new();
    let mut forecasts = BTreeMap::new();
    while let Some(id) = queue.pop_front() {
        if !unknown.contains(id) {
            let (recorded_start, recorded_end) = ranges[id];
            let mut start = recorded_start;
            for dep in by_id[id].depends_on.iter().map(String::as_str) {
                match ends.get(dep).and_then(|e| e.checked_add_days(Days::new(1))) {
                    Some(next) if next >= start => {
                        start = next;
                        drivers.insert(id, dep);
                    }
                    Some(_) => {}
                    None => {
                        unknown.insert(id);
                    }
                }
            }
            if !unknown.contains(id) {
                let duration = (recorded_end - recorded_start).num_days() as u64;
                if let Some(end) = start
                    .checked_add_days(Days::new(duration))
                    .filter(|d| d.to_string().len() == 10)
                {
                    ends.insert(id, end);
                    forecasts.insert(
                        id.to_owned(),
                        Forecast {
                            id: id.to_owned(),
                            schedule: Schedule {
                                start: start.to_string(),
                                end: end.to_string(),
                            },
                            delay_days: (start - recorded_start).num_days(),
                            drives_finish: false,
                        },
                    );
                } else {
                    unknown.insert(id);
                }
            }
        }
        for &child in children.get(id).into_iter().flatten() {
            if unknown.contains(id) {
                unknown.insert(child);
            }
            let degree = indegree.get_mut(child).unwrap();
            *degree -= 1;
            if *degree == 0 {
                queue.push_back(child);
            }
        }
    }
    let finish = ends
        .iter()
        .max_by_key(|(id, end)| (**end, **id))
        .map(|(&id, &end)| (id, end));
    let mut driving_path = Vec::new();
    if let Some((mut id, _)) = finish {
        loop {
            driving_path.push(id.to_owned());
            forecasts.get_mut(id).unwrap().drives_finish = true;
            if let Some(&driver) = drivers.get(id) {
                id = driver;
            } else {
                break;
            }
        }
        driving_path.reverse();
    }
    let unresolved_cards = by_id.len() - forecasts.len();
    Analysis {
        planned_start: planned_start.map(|d| d.to_string()),
        planned_end: planned_end.map(|d| d.to_string()),
        forecast_end: finish.map(|(_, d)| d.to_string()),
        delay_days: finish
            .zip(planned_end)
            .map_or(0, |((_, f), p)| (f - p).num_days().max(0)),
        scheduled_cards: ranges.len(),
        unscheduled_cards: unscheduled,
        unresolved_cards,
        complete: !truncated && unresolved_cards == 0,
        driving_path,
        forecasts,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn card(id: &str, start: &str, end: &str, deps: Vec<&str>) -> TimelineInput {
        TimelineInput {
            id: id.into(),
            schedule: Some(Schedule {
                start: start.into(),
                end: end.into(),
            }),
            depends_on: deps.into_iter().map(str::to_owned).collect(),
            reliable: true,
        }
    }
    #[test]
    fn waterfall_preserves_durations_and_dates_without_mutating_input() {
        let cards = vec![
            card("a", "2026-09-01", "2026-09-03", vec![]),
            card("b", "2026-09-02", "2026-09-04", vec!["a"]),
            card("c", "2026-09-03", "2026-09-03", vec!["b"]),
        ];
        let before = cards.clone();
        let result = analyze(&cards, false);
        assert_eq!(result.forecast_end.as_deref(), Some("2026-09-07"));
        assert_eq!(result.delay_days, 3);
        assert_eq!(result.driving_path, vec!["a", "b", "c"]);
        assert_eq!(result.forecasts["b"].schedule.start, "2026-09-04");
        assert_eq!(cards, before);
        assert!(result.complete);
    }
    #[test]
    fn parallel_paths_wait_for_latest_predecessor_and_preserve_later_start() {
        let result = analyze(
            &[
                card("a", "2026-09-01", "2026-09-03", vec![]),
                card("b", "2026-09-01", "2026-09-05", vec![]),
                card("c", "2026-09-02", "2026-09-02", vec!["a", "b"]),
                card("d", "2026-09-20", "2026-09-20", vec!["c"]),
            ],
            false,
        );
        assert_eq!(result.forecasts["c"].schedule.start, "2026-09-06");
        assert_eq!(result.driving_path, vec!["d"]);
        assert_eq!(result.delay_days, 0);
    }
    #[test]
    fn unknown_missing_and_cyclic_paths_are_incomplete() {
        let result = analyze(
            &[
                TimelineInput {
                    id: "a".into(),
                    schedule: None,
                    depends_on: vec![],
                    reliable: true,
                },
                card("b", "2026-09-01", "2026-09-02", vec!["a"]),
                card("c", "2026-09-01", "2026-09-02", vec!["missing"]),
                card("d", "2026-09-01", "2026-09-02", vec!["e"]),
                card("e", "2026-09-01", "2026-09-02", vec!["d"]),
            ],
            false,
        );
        assert!(!result.complete);
        assert_eq!(result.unresolved_cards, 5);
        assert!(result.forecast_end.is_none());
    }
    #[test]
    fn leap_day_dst_and_supported_date_boundary() {
        let result = analyze(
            &[
                card("a", "2028-02-28", "2028-02-29", vec![]),
                card("b", "2028-02-28", "2028-02-29", vec!["a"]),
            ],
            false,
        );
        assert_eq!(result.forecast_end.as_deref(), Some("2028-03-02"));
        let result = analyze(
            &[
                card("a", "9999-12-31", "9999-12-31", vec![]),
                card("b", "9999-12-31", "9999-12-31", vec!["a"]),
            ],
            false,
        );
        assert!(!result.complete);
        assert!(!analyze(&[], true).complete);
    }
    #[test]
    fn unreliable_inputs_block_descendants_without_discarding_recorded_dates() {
        let mut stale = card("a", "2026-09-01", "2026-09-03", vec![]);
        stale.reliable = false;
        let input = vec![stale, card("b", "2026-09-02", "2026-09-04", vec!["a"])];
        let result = analyze(&input, false);
        assert_eq!(result.scheduled_cards, 2);
        assert_eq!(result.unresolved_cards, 2);
        assert_eq!(result.planned_end.as_deref(), Some("2026-09-04"));
        assert!(result.forecasts.is_empty());
        assert!(!result.complete);
    }
    #[test]
    fn ten_thousand_card_chain_is_iterative_and_bounded() {
        let cards = (0..10_000)
            .map(|i| TimelineInput {
                id: format!("{i:05}"),
                schedule: Some(Schedule {
                    start: "2000-01-01".into(),
                    end: "2000-01-01".into(),
                }),
                depends_on: if i == 0 {
                    vec![]
                } else {
                    vec![format!("{:05}", i - 1)]
                },
                reliable: true,
            })
            .collect::<Vec<_>>();
        let start = std::time::Instant::now();
        let result = analyze(&cards, false);
        eprintln!(
            "10,000-card / 9,999-edge domain forecast: {:?}",
            start.elapsed()
        );
        assert!(result.complete);
        assert_eq!(result.forecasts.len(), 10_000);
        assert_eq!(result.driving_path.len(), 10_000);
        assert_eq!(result.delay_days, 9_999);
    }
}
