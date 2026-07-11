// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Some(code) = petpack_studio_lib::run_cli_if_requested() {
        std::process::exit(code);
    }
    petpack_studio_lib::run()
}
