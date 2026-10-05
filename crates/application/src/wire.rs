use crate::AppError;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{Arc, LazyLock, Mutex},
};

#[expect(
    clippy::expect_used,
    reason = "the OpenAPI document is embedded at build time and parsed by every test"
)]
static SCHEMA: LazyLock<Value> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../../contracts/openapi.generated.json"))
        .expect("compiled OpenAPI JSON")
});
static VALIDATORS: LazyLock<Mutex<HashMap<&'static str, Arc<jsonschema::Validator>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

pub fn validate(definition: &'static str, value: &Value) -> Result<(), AppError> {
    let validator = {
        let mut cache = VALIDATORS
            .lock()
            .map_err(|_| AppError::LockPoisoned("API validator cache"))?;
        match cache.get(definition) {
            Some(validator) => validator.clone(),
            None => {
                let validator = Arc::new(
                    jsonschema::draft202012::options()
                        .should_validate_formats(true)
                        .build(&json!({
                            "$schema": "https://json-schema.org/draft/2020-12/schema",
                            "$ref": format!("#/components/schemas/{definition}"),
                            "components": SCHEMA["components"],
                        }))
                        .map_err(|_| AppError::invariant("compiled API schema"))?,
                );
                cache.insert(definition, validator.clone());
                validator
            }
        }
    };
    if validator.is_valid(value) {
        Ok(())
    } else {
        Err(AppError::reject(422, "VALIDATION_FAILED"))
    }
}
