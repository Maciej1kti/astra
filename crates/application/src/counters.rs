//! Counter operations preserve dated totals and run inside normal conditional writes.
use crate::AppError;
use serde_json::{Value, json};
use uuid::Uuid;

pub(crate) fn patch(next: &mut Value, payload: &Value) -> Result<(), AppError> {
    let counters = next["metadata"]
        .as_object_mut()
        .ok_or(AppError::invariant("validated document metadata"))?
        .entry("counters")
        .or_insert_with(|| json!([]))
        .as_array_mut()
        .ok_or(AppError::invariant("validated card counters"))?;
    if let Some(config) = payload.get("configure_counter") {
        if let Some(id) = config.get("id") {
            let counter = counters
                .iter_mut()
                .find(|c| c["id"] == *id)
                .ok_or_else(|| AppError::reject(422, "COUNTER_NOT_FOUND"))?;
            if counter["unit"] != config["unit"]
                && !counter["values"]
                    .as_object()
                    .ok_or(AppError::invariant("validated counter values"))?
                    .is_empty()
            {
                return Err(AppError::reject(422, "COUNTER_UNIT_HAS_HISTORY"));
            }
            let counter = counter
                .as_object_mut()
                .ok_or(AppError::invariant("validated card counter"))?;
            for key in ["name", "unit", "step", "archived"] {
                counter.insert(key.into(), config[key].clone());
            }
            // An omitted rate keeps the stored one; an explicit null removes it.
            match config.get("rate") {
                Some(Value::Null) => {
                    counter.remove("rate");
                }
                Some(rate) => {
                    counter.insert("rate".into(), rate.clone());
                }
                None => {}
            }
        } else {
            let mut counter = config
                .as_object()
                .ok_or(AppError::invariant("validated counter configuration"))?
                .clone();
            if counter.get("rate").is_some_and(Value::is_null) {
                counter.remove("rate");
            }
            counter.insert("id".into(), json!(Uuid::new_v4().to_string()));
            counter.insert("values".into(), json!({}));
            counters.push(Value::Object(counter));
        }
    }
    if let Some(record) = payload.get("record_counter") {
        let counter = counters
            .iter_mut()
            .find(|c| c["id"] == record["id"])
            .ok_or_else(|| AppError::reject(422, "COUNTER_NOT_FOUND"))?;
        if counter["archived"] == true {
            return Err(AppError::reject(422, "COUNTER_ARCHIVED"));
        }
        let date = record["date"]
            .as_str()
            .ok_or(AppError::invariant("validated counter date"))?;
        project_domain::local_date(date)
            .map_err(|_| AppError::reject(422, "INVALID_COUNTER_DATE"))?;
        counter
            .get_mut("values")
            .and_then(Value::as_object_mut)
            .ok_or(AppError::invariant("validated counter values"))?
            .insert(date.into(), record["value"].clone());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn malformed_counter_shapes_are_errors_not_panics() {
        let document = |counters: Value| json!({"metadata":{"counters":counters}});
        // A new counter whose configuration is not an object.
        let mut next = document(json!([]));
        assert!(matches!(
            patch(&mut next, &json!({"configure_counter":"not an object"})),
            Err(AppError::Invariant(_))
        ));
        // A stored element that is not an object matches a record without an ID.
        let mut next = document(json!(["not an object"]));
        assert!(matches!(
            patch(
                &mut next,
                &json!({"record_counter":{"date":"2026-10-05","value":1}})
            ),
            Err(AppError::Invariant(_))
        ));
        // A counter whose values are not an object.
        let mut next = document(json!([{"id":"counter","values":[]}]));
        assert!(matches!(
            patch(
                &mut next,
                &json!({"record_counter":{"id":"counter","date":"2026-10-05","value":1}})
            ),
            Err(AppError::Invariant(_))
        ));
        let mut next = document(json!([{"id":"counter","unit":"reps","values":{}}]));
        patch(
            &mut next,
            &json!({"record_counter":{"id":"counter","date":"2026-10-05","value":3}}),
        )
        .unwrap();
        assert_eq!(next["metadata"]["counters"][0]["values"]["2026-10-05"], 3);
    }
}
