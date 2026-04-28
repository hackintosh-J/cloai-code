mod artifacts;
mod commands;
mod connectors;
mod conversations;
mod github;
mod logging;
mod paths;
mod preferences;
mod projects;
mod providers;
mod runtime;
mod skills;
mod streaming;
mod uploads;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_platform,
            commands::get_app_path,
            commands::select_directory,
            commands::select_file,
            commands::select_bun_file,
            commands::open_folder,
            commands::show_item_in_folder,
            commands::resize_window,
            commands::get_workspace_config,
            commands::set_workspace_config,
            commands::get_runtime_setup_status,
            commands::get_system_status,
            commands::set_runtime_config,
            commands::desktop_config_exists,
            commands::get_desktop_preferences,
            commands::set_desktop_preferences,
            commands::import_cloai_providers,
            commands::get_providers,
            commands::create_provider,
            commands::update_provider,
            commands::delete_provider,
            commands::get_provider_models,
            commands::test_provider_websearch,
            commands::start_openai_oauth_provider,
            commands::get_provider_presets,
            commands::get_conversations,
            commands::get_conversation,
            commands::create_conversation,
            commands::update_conversation,
            commands::delete_conversation,
            commands::get_context_size,
            commands::delete_messages_from,
            commands::delete_messages_tail,
            commands::warm_engine,
            commands::get_stream_status,
            commands::get_generation_status,
            commands::stop_generation,
            commands::answer_user_question,
            commands::submit_code_result,
            commands::compact_conversation,
            commands::generate_conversation_title,
            commands::start_chat_stream,
            commands::reconnect_chat_stream,
            commands::get_projects,
            commands::create_project,
            commands::get_project,
            commands::update_project,
            commands::delete_project,
            commands::get_project_conversations,
            commands::create_project_conversation,
            commands::upload_project_file,
            commands::delete_project_file,
            commands::upload_file,
            commands::get_upload_path,
            commands::read_upload_raw,
            commands::delete_upload,
            commands::get_artifacts,
            commands::get_artifact_content,
            commands::get_skills,
            commands::get_skill_detail,
            commands::get_skill_file,
            commands::import_skill,
            commands::create_skill,
            commands::update_skill,
            commands::delete_skill,
            commands::toggle_skill,
            commands::get_connector_mcp_status,
            commands::install_connector_mcp,
            commands::uninstall_connector_mcp,
            commands::get_connector_composio_status,
            commands::get_connector_composio_config,
            commands::set_connector_composio_config,
            commands::connect_connector_via_composio,
            commands::uninstall_connector_composio,
            commands::get_github_status,
            commands::get_github_auth_url,
            commands::disconnect_github,
            commands::get_github_repos,
            commands::get_github_tree,
            commands::get_github_contents,
            commands::materialize_github,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
