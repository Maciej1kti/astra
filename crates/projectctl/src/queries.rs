//! Named, bounded reads. Project scope always comes from the explicitly selected folder.
use crate::transport::{Error, Request};
use clap::Subcommand;
use reqwest::Client;
use std::path::Path;

#[derive(Subcommand)]
pub enum Action {
    /// Search one page of resources; --project limits results to that exact folder.
    Search {
        /// Search text, interpreted by the server (maximum 256 characters).
        query: String,
        #[arg(long, default_value_t = 50, value_parser = clap::value_parser!(u32).range(1..=200))]
        limit: u32,
        /// Continue with a cursor returned for the same query, project and limit.
        #[arg(long)]
        cursor: Option<String>,
    },
    /// Read a bounded board, timeline, calendar or attention view.
    View {
        #[command(subcommand)]
        action: View,
    },
    /// Read a workflow job once; unfinished jobs retain exit code 9.
    Job {
        /// Job UUID returned by registration or maintenance; not a command request ID.
        id: String,
    },
}

#[derive(Subcommand)]
pub enum View {
    /// Read board columns for the exact folder selected with --project (required).
    Board {
        /// Maximum cards per column.
        #[arg(long, default_value_t = 50, value_parser = clap::value_parser!(u32).range(1..=200))]
        limit: u32,
        /// Continue a column with its returned cursor and unchanged scope and limit.
        #[arg(long)]
        cursor: Option<String>,
    },
    /// Read timeline rows and forecasts for --project (required); source dates stay unchanged.
    Gantt {
        #[arg(long, default_value_t = 200, value_parser = clap::value_parser!(u32).range(1..=500))]
        limit: u32,
        /// Continue with the returned cursor and unchanged project and limit.
        #[arg(long)]
        cursor: Option<String>,
    },
    /// Read an inclusive date range, optionally limited by --project (maximum 400 days).
    Calendar {
        /// First calendar date, YYYY-MM-DD.
        #[arg(long)]
        from: String,
        /// Last calendar date, YYYY-MM-DD; the server validates the range.
        #[arg(long)]
        to: String,
        #[arg(long, default_value_t = 200, value_parser = clap::value_parser!(u32).range(1..=1000))]
        limit: u32,
        /// Continue with the returned cursor and unchanged dates, project and limit.
        #[arg(long)]
        cursor: Option<String>,
    },
    /// Read items needing attention in this instance, optionally limited by --project.
    Attention {
        #[arg(long, default_value_t = 50, value_parser = clap::value_parser!(u32).range(1..=200))]
        limit: u32,
        /// Continue with the returned cursor and unchanged project and limit.
        #[arg(long)]
        cursor: Option<String>,
    },
}

impl Action {
    pub async fn prepare(self, client: &Client, project: Option<&Path>) -> Result<Request, Error> {
        match self {
            Self::Search {
                query,
                limit,
                cursor,
            } => Ok(paged_request(
                "/api/v1/search",
                optional_project(client, project).await?,
                limit,
                cursor,
                &[("q", &query)],
            )),
            Self::View { action } => action.prepare(client, project).await,
            Self::Job { id } => {
                crate::uuid4(&id)?;
                Ok(Request::read(format!("/api/v1/jobs/{id}")))
            }
        }
    }
}

impl View {
    async fn prepare(self, client: &Client, project: Option<&Path>) -> Result<Request, Error> {
        let request = match self {
            Self::Board { limit, cursor } => paged_request(
                "/api/v1/views/board",
                Some(crate::input::project_id(client, project).await?),
                limit,
                cursor,
                &[],
            ),
            Self::Gantt { limit, cursor } => paged_request(
                "/api/v1/views/gantt",
                Some(crate::input::project_id(client, project).await?),
                limit,
                cursor,
                &[],
            ),
            Self::Calendar {
                from,
                to,
                limit,
                cursor,
            } => paged_request(
                "/api/v1/views/calendar",
                optional_project(client, project).await?,
                limit,
                cursor,
                &[("from", &from), ("to", &to)],
            ),
            Self::Attention { limit, cursor } => paged_request(
                "/api/v1/views/attention",
                optional_project(client, project).await?,
                limit,
                cursor,
                &[],
            ),
        };
        Ok(request)
    }
}

async fn optional_project(
    client: &Client,
    project: Option<&Path>,
) -> Result<Option<String>, Error> {
    match project {
        Some(path) => crate::input::project_id(client, Some(path)).await.map(Some),
        None => Ok(None),
    }
}

fn paged_request(
    path: &str,
    project: Option<String>,
    limit: u32,
    cursor: Option<String>,
    filters: &[(&str, &str)],
) -> Request {
    let mut query = url::form_urlencoded::Serializer::new(String::new());
    query.extend_pairs(filters.iter().copied());
    if let Some(project) = project {
        query.append_pair("project_id", &project);
    }
    query.append_pair("limit", &limit.to_string());
    if let Some(cursor) = cursor {
        query.append_pair("cursor", &cursor);
    }
    Request::read(format!("{path}?{}", query.finish()))
}
