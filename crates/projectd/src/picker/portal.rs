//! XDG FileChooser support without a Zenity dependency.
use futures_util::StreamExt;
use std::{collections::HashMap, time::Duration};
use zbus::{
    Connection, Proxy,
    zvariant::{OwnedObjectPath, OwnedValue, Value},
};

const DESTINATION: &str = "org.freedesktop.portal.Desktop";
const UNAVAILABLE: &str = "NATIVE_FOLDER_PICKER_UNAVAILABLE";
const FAILED: &str = "NATIVE_FOLDER_PICKER_FAILED";

pub(super) fn choose(timeout: Duration) -> Result<Option<String>, &'static str> {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|_| UNAVAILABLE)?
        .block_on(choose_async(timeout))
}

async fn choose_async(timeout: Duration) -> Result<Option<String>, &'static str> {
    let setup = async {
        let connection = Connection::session().await.map_err(|_| UNAVAILABLE)?;
        let chooser = Proxy::new(
            &connection,
            DESTINATION,
            "/org/freedesktop/portal/desktop",
            "org.freedesktop.portal.FileChooser",
        )
        .await
        .map_err(|_| UNAVAILABLE)?;
        let version: u32 = chooser
            .get_property("version")
            .await
            .map_err(|_| UNAVAILABLE)?;
        if version < 3 {
            return Err(UNAVAILABLE);
        }
        drop(chooser);
        Ok(connection)
    };
    let connection = tokio::time::timeout(Duration::from_secs(5), setup)
        .await
        .map_err(|_| UNAVAILABLE)??;
    let sender = connection
        .unique_name()
        .ok_or(UNAVAILABLE)?
        .as_str()
        .trim_start_matches(':')
        .replace('.', "_");
    let token = format!("astra_{}", uuid::Uuid::new_v4().simple());
    let path = format!("/org/freedesktop/portal/desktop/request/{sender}/{token}");
    let request = Proxy::new(
        &connection,
        DESTINATION,
        path.as_str(),
        "org.freedesktop.portal.Request",
    )
    .await
    .map_err(|_| UNAVAILABLE)?;
    // Subscribe before OpenFile so an immediate response cannot be lost.
    let mut responses = request
        .receive_signal("Response")
        .await
        .map_err(|_| UNAVAILABLE)?;
    let interaction = async {
        let chooser = Proxy::new(
            &connection,
            DESTINATION,
            "/org/freedesktop/portal/desktop",
            "org.freedesktop.portal.FileChooser",
        )
        .await
        .map_err(|_| FAILED)?;
        let options = HashMap::from([
            ("handle_token", Value::from(token.as_str())),
            ("directory", Value::from(true)),
            ("multiple", Value::from(false)),
            ("modal", Value::from(false)),
        ]);
        let handle: OwnedObjectPath = chooser
            .call(
                "OpenFile",
                &("", "Choose a project folder for Local Projects", options),
            )
            .await
            .map_err(|_| UNAVAILABLE)?;
        if handle.as_str() != path {
            return Err(FAILED);
        }
        let message = responses.next().await.ok_or(FAILED)?;
        let (status, mut values): (u32, HashMap<String, OwnedValue>) =
            message.body().deserialize().map_err(|_| FAILED)?;
        if status == 1 {
            return Ok(None);
        }
        if status != 0 {
            return Err(FAILED);
        }
        let uris =
            Vec::<String>::try_from(values.remove("uris").ok_or(FAILED)?).map_err(|_| FAILED)?;
        selected_path(&uris).map(Some)
    };
    let result = tokio::time::timeout(timeout, interaction).await;
    if !matches!(result, Ok(Ok(_))) {
        // Closing the request also dismisses its dialog on timeout or failure.
        let _ = tokio::time::timeout(
            Duration::from_secs(2),
            request.call::<_, _, ()>("Close", &()),
        )
        .await;
    }
    result.map_err(|_| "NATIVE_FOLDER_PICKER_TIMEOUT")?
}

fn selected_path(uris: &[String]) -> Result<String, &'static str> {
    if uris.len() != 1 {
        return Err("INVALID_FOLDER_PATH");
    }
    let uri = url::Url::parse(&uris[0]).map_err(|_| "INVALID_FOLDER_PATH")?;
    let path = uri.to_file_path().map_err(|_| "INVALID_FOLDER_PATH")?;
    let path = path.canonicalize().map_err(|_| "FOLDER_UNAVAILABLE")?;
    if !path.is_dir() {
        return Err("FOLDER_UNAVAILABLE");
    }
    let path = path.to_str().ok_or("INVALID_FOLDER_PATH")?;
    if path.len() > 4096 {
        return Err("FOLDER_PATH_TOO_LONG");
    }
    Ok(path.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn selection_accepts_one_local_directory_and_decodes_uri() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("a folder # żółć");
        std::fs::create_dir(&path).unwrap();
        let uri = url::Url::from_directory_path(&path).unwrap().to_string();
        assert_eq!(
            selected_path(std::slice::from_ref(&uri)).unwrap(),
            path.to_str().unwrap()
        );
        assert!(selected_path(&[]).is_err());
        assert!(selected_path(&[uri.clone(), uri]).is_err());
        assert!(selected_path(&["https://example.com/folder".into()]).is_err());
        assert!(selected_path(&["file://remote/folder".into()]).is_err());
        let file = temp.path().join("file");
        std::fs::write(&file, "fixture").unwrap();
        assert!(selected_path(&[url::Url::from_file_path(file).unwrap().to_string()]).is_err());
    }

    #[test]
    #[ignore = "opens the real desktop dialog and closes it after five seconds"]
    fn desktop_portal_opens_and_times_out() {
        assert_eq!(
            choose(Duration::from_secs(5)),
            Err("NATIVE_FOLDER_PICKER_TIMEOUT")
        );
    }
}
