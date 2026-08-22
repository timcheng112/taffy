mod commands;
mod database;
mod onboarding;

use std::sync::Mutex;

use database::Database;
use tauri::Manager;

pub struct AppState(pub Mutex<Database>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let database_path = app.path().app_data_dir()?.join("taffy.sqlite3");
            let database = Database::open(&database_path)
                .map_err(|error| Box::new(error) as Box<dyn std::error::Error>)?;
            app.manage(AppState(Mutex::new(database)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_learner,
            commands::complete_onboarding
        ])
        .run(tauri::generate_context!())
        .expect("error while running taffy");
}
