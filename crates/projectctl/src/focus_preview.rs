//! A bounded desktop preview uses the same Focus membership snapshot as the browser.
use crate::transport::{Error, checked_bounded};
use reqwest::Client;
use serde_json::{Value, json};
use std::time::{Duration, Instant};

const RESPONSE_LIMIT: usize = 2 * 1024 * 1024;
const MAX_PINS: usize = 100;
const MAX_CARDS: usize = 5;

async fn get(client: &Client, path: &str, deadline: Instant) -> Result<Value, Error> {
    let remaining = deadline
        .checked_duration_since(Instant::now())
        .filter(|remaining| !remaining.is_zero())
        .ok_or("Focus preview deadline exceeded")?;
    checked_bounded(
        client
            .get(format!("http://localhost{path}"))
            .timeout(remaining.min(Duration::from_secs(2))),
        RESPONSE_LIMIT,
        Some(200),
    )
    .await
}

fn reference(value: &Value) -> Option<(&str, &str)> {
    let project = value["project_id"].as_str()?;
    let card = value["card_id"].as_str()?;
    crate::uuid4(project).ok()?;
    crate::uuid4(card).ok()?;
    Some((project, card))
}

fn unavailable() -> Value {
    json!({"title":"Unavailable pinned card","status":"","available":false})
}

fn preview(title: &Value, status: &Value) -> Option<Value> {
    let title = title.as_str()?;
    if title.is_empty() {
        return None;
    }
    Some(json!({
        "title":title.chars().take(300).collect::<String>(),
        "status":status.as_str().unwrap_or("").chars().take(40).collect::<String>(),
        "available":true,
    }))
}

pub(crate) async fn read(client: &Client, timeout: Duration) -> Result<Value, Error> {
    let deadline = Instant::now() + timeout.min(Duration::from_secs(6));
    let focus = get(client, "/api/v1/workspace/focus", deadline).await?;
    let refs = focus["items"]
        .as_array()
        .ok_or("Invalid Focus membership")?;
    if refs.len() > MAX_PINS {
        return Err("Focus membership exceeds 100 pins".into());
    }
    let summaries = match focus.get("cards") {
        Some(value) => {
            let cards = value.as_array().ok_or("Invalid Focus summaries")?;
            if cards.len() > MAX_PINS {
                return Err("Focus summaries exceed 100 cards".into());
            }
            Some(cards)
        }
        None => None,
    };
    let mut cards = Vec::with_capacity(refs.len().min(MAX_CARDS));
    for item in refs.iter().take(MAX_CARDS) {
        let observed = if let Some((project, card)) = reference(item) {
            if let Some(summaries) = summaries {
                // Missing/invalid retained rows stay in their membership position.
                // A modern host never triggers speculative full-source reads.
                summaries
                    .iter()
                    .find(|summary| {
                        summary["type"] == "card"
                            && summary["project_id"] == project
                            && summary["id"] == card
                    })
                    .filter(|summary| summary["availability"] == "ready")
                    .and_then(|summary| preview(&summary["title"], &summary["status"]))
            } else {
                // Reference-only hosts retain the bounded ordinary detail path.
                match get(
                    client,
                    &format!("/api/v1/projects/{project}/cards/{card}"),
                    deadline,
                )
                .await
                {
                    Ok(source) if source["metadata"]["id"] == card && source["type"] == "card" => {
                        preview(&source["metadata"]["title"], &source["metadata"]["status"])
                    }
                    _ => None,
                }
            }
        } else {
            None
        };
        cards.push(observed.unwrap_or_else(unavailable));
    }
    Ok(json!({
        "online":true,"total":refs.len(),"cards":cards,
        "message":"Local API reachable",
    }))
}
