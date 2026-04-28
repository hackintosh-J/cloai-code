use crate::paths;
use std::fs;
use std::io::Write;
use std::time::{SystemTime, UNIX_EPOCH};

fn desktop_log_path() -> Result<std::path::PathBuf, String> {
    Ok(paths::desktop_logs_dir()?.join("app.log"))
}

fn append_desktop_log(level: &str, message: &str) {
    let Ok(log_dir) = paths::desktop_logs_dir() else {
        return;
    };
    if fs::create_dir_all(&log_dir).is_err() {
        return;
    }

    let Ok(log_path) = desktop_log_path() else {
        return;
    };

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| format!("{}.{}", duration.as_secs(), duration.subsec_millis()))
        .unwrap_or_else(|_| "0.000".to_string());
    let line = format!("[{}] [{}] {}\n", timestamp, level, message);

    if let Ok(mut file) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
    {
        let _ = file.write_all(line.as_bytes());
    }
}

pub(crate) fn log_info(message: impl AsRef<str>) {
    let message = message.as_ref();
    println!("{}", message);
    append_desktop_log("INFO", message);
}

pub(crate) fn log_error(message: impl AsRef<str>) {
    let message = message.as_ref();
    eprintln!("{}", message);
    append_desktop_log("ERROR", message);
}
