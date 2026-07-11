use std::path::Path;

fn main() {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    if args.len() != 3 {
        eprintln!("usage: cargo run --example pack_pet -- <pet-dir> <runtime-exe> <output-dir>");
        std::process::exit(2);
    }
    let pet = petpack_studio_lib::pet_package_for_example(Path::new(&args[0]));
    match petpack_studio_lib::export_with_runtime(
        Path::new(&args[0]),
        Path::new(&args[2]),
        Path::new(&args[1]),
        &pet.0,
        &pet.1,
        &pet.2,
    ) {
        Ok(result) => {
            println!("folder={}", result.folder_path);
            println!("zip={}", result.zip_path);
            println!("executable={}", result.executable_path);
        }
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}
