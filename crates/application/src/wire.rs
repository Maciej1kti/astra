use crate::AppError;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{Arc, LazyLock, Mutex},
};

static SCHEMA: LazyLock<Value> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../../contracts/openapi.generated.json"))
        .expect("compiled OpenAPI JSON")
});
static VALIDATORS: LazyLock<Mutex<HashMap<&'static str, Arc<jsonschema::Validator>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

pub fn validate(definition: &'static str, value: &Value) -> Result<(), AppError> {
    let validator = {
        let mut cache = VALIDATORS.lock().map_err(|_| AppError::State)?;
        cache.entry(definition).or_insert_with(|| {
            Arc::new(jsonschema::draft202012::options().should_validate_formats(true).build(&json!({
                "$schema":"https://json-schema.org/draft/2020-12/schema",
                "$ref":format!("#/components/schemas/{definition}"),"components":SCHEMA["components"]
            })).expect("compiled API schema"))
        }).clone()
    };
    if validator.is_valid(value) {
        Ok(())
    } else {
        Err(AppError::reject(422, "VALIDATION_FAILED"))
    }
}
