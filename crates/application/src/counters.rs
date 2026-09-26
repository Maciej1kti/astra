//! Counter operations preserve dated totals and run inside normal conditional writes.
use crate::AppError;
use serde_json::{Value, json};
use uuid::Uuid;

pub(crate) fn patch(next: &mut Value, payload: &Value) -> Result<(), AppError> {
    let counters = next["metadata"]
        .as_object_mut()
        .unwrap()
        .entry("counters")
        .or_insert_with(|| json!([]))
        .as_array_mut()
        .unwrap();
    if let Some(config) = payload.get("configure_counter") {
        if let Some(id) = config.get("id") {
            let counter = counters
                .iter_mut()
                .find(|c| c["id"] == *id)
                .ok_or_else(|| AppError::reject(422, "COUNTER_NOT_FOUND"))?;
            if counter["unit"] != config["unit"]
                && !counter["values"].as_object().unwrap().is_empty()
            {
                return Err(AppError::reject(422, "COUNTER_UNIT_HAS_HISTORY"));
            }
            for key in ["name", "unit", "step", "archived"] {
                counter[key] = config[key].clone();
            }
        } else {
            let mut counter = config.clone();
            counter["id"] = json!(Uuid::new_v4().to_string());
            counter["values"] = json!({});
            counters.push(counter);
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
        let date = record["date"].as_str().unwrap();
        project_domain::local_date(date)
            .map_err(|_| AppError::reject(422, "INVALID_COUNTER_DATE"))?;
        counter["values"][date] = record["value"].clone();
    }
    Ok(())
}
