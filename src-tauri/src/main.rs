// Empêche l'ouverture d'une console Windows en mode release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    ai_master_studio_v35_lib::run()
}
