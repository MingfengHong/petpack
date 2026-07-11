use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::GenericImageView;
use reqwest::header::REFERER;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::fs::{self, File};
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use url::Url;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const MAX_MANIFEST_BYTES: usize = 256 * 1024;
const MAX_SPRITE_BYTES: usize = 16 * 1024 * 1024;
const COLUMNS: u32 = 8;
const V1_ROWS: u32 = 9;
const V2_ROWS: u32 = 11;
const STANDARD_FRAMES: [u32; 9] = [6, 8, 8, 4, 5, 8, 6, 6, 6];

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationCheck {
    pub label: String,
    pub ok: bool,
    pub detail: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedPet {
    pub package_dir: String,
    pub source_kind: String,
    pub id: String,
    pub display_name: String,
    pub description: String,
    pub format: String,
    pub sprite_version_number: u8,
    pub spritesheet_path: String,
    pub sprite_data_url: String,
    pub width: u32,
    pub height: u32,
    pub columns: u32,
    pub rows: u32,
    pub cell_width: u32,
    pub cell_height: u32,
    pub valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
    pub checks: Vec<ValidationCheck>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    pub package_dir: String,
    pub output_dir: String,
    pub id: String,
    pub display_name: String,
    pub description: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub folder_path: String,
    pub zip_path: String,
    pub executable_path: String,
    pub platform: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceExportResult {
    pub folder_path: String,
    pub zip_path: String,
    pub included_builder: String,
}

#[derive(Deserialize)]
struct PetdexManifest {
    pets: Vec<PetdexEntry>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PetdexEntry {
    slug: String,
    spritesheet_url: String,
    pet_json_url: String,
}

pub fn import_local(app: &AppHandle, source: &str) -> Result<ImportedPet, String> {
    let source_path = PathBuf::from(source);
    if !source_path.exists() {
        return Err("所选路径不存在。".into());
    }

    let (manifest_bytes, sprite_bytes, sprite_name) = if source_path
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("zip"))
    {
        read_zip_package(&source_path)?
    } else {
        read_directory_package(&source_path)?
    };

    stage_package(app, &manifest_bytes, &sprite_bytes, &sprite_name, "local")
}

pub async fn import_petdex(app: &AppHandle, slug_or_url: &str) -> Result<ImportedPet, String> {
    let slug = parse_petdex_slug(slug_or_url)?;
    let (manifest_bytes, sprite_bytes, sprite_name) = download_petdex_package(&slug).await?;
    stage_package(app, &manifest_bytes, &sprite_bytes, &sprite_name, "petdex")
}

async fn download_petdex_package(slug: &str) -> Result<(Vec<u8>, Vec<u8>, String), String> {
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(20))
        .user_agent("PetPack-Studio/0.1")
        .build()
        .map_err(|error| format!("无法初始化 Petdex 下载器：{error}"))?;

    let manifest = client
        .get("https://petdex.dev/api/manifest")
        .send()
        .await
        .map_err(|error| format!("无法连接 Petdex：{error}"))?
        .error_for_status()
        .map_err(|error| format!("Petdex manifest 返回错误：{error}"))?
        .json::<PetdexManifest>()
        .await
        .map_err(|error| format!("无法解析 Petdex manifest：{error}"))?;

    let entry = manifest
        .pets
        .into_iter()
        .find(|pet| pet.slug.eq_ignore_ascii_case(&slug))
        .ok_or_else(|| format!("Petdex 中没有找到 slug：{slug}"))?;

    ensure_trusted_asset_url(&entry.pet_json_url)?;
    ensure_trusted_asset_url(&entry.spritesheet_url)?;

    let sprite_name = if Url::parse(&entry.spritesheet_url)
        .ok()
        .and_then(|url| Path::new(url.path()).extension().map(|ext| ext.to_owned()))
        .is_some_and(|ext| ext.eq_ignore_ascii_case("png"))
    {
        "spritesheet.png".to_string()
    } else {
        "spritesheet.webp".to_string()
    };
    let (manifest_bytes, sprite_bytes) = tokio::try_join!(
        download_asset(&client, &entry.pet_json_url, MAX_MANIFEST_BYTES, "pet.json",),
        download_asset(
            &client,
            &entry.spritesheet_url,
            MAX_SPRITE_BYTES,
            "spritesheet",
        )
    )?;
    Ok((manifest_bytes, sprite_bytes, sprite_name))
}

async fn download_asset(
    client: &reqwest::Client,
    url: &str,
    limit: usize,
    label: &str,
) -> Result<Vec<u8>, String> {
    let response = client
        .get(url)
        .header(REFERER, "https://petdex.dev/")
        .send()
        .await
        .map_err(|error| format!("下载 {label} 失败：{error}"))?
        .error_for_status()
        .map_err(|error| format!("下载 {label} 失败：{error}"))?;
    if response
        .content_length()
        .is_some_and(|length| length > limit as u64)
    {
        return Err(format!("{label} 超过允许的大小限制。"));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("读取 {label} 失败：{error}"))?;
    if bytes.len() > limit {
        return Err(format!("{label} 超过允许的大小限制。"));
    }
    Ok(bytes.to_vec())
}

fn ensure_trusted_asset_url(value: &str) -> Result<(), String> {
    let url = Url::parse(value).map_err(|_| "Petdex 返回了无效资源 URL。".to_string())?;
    if url.scheme() != "https" || url.host_str() != Some("assets.petdex.dev") {
        return Err("已拒绝非 Petdex 官方资源域名。".into());
    }
    Ok(())
}

fn stage_package(
    app: &AppHandle,
    manifest_bytes: &[u8],
    sprite_bytes: &[u8],
    sprite_name: &str,
    source_kind: &str,
) -> Result<ImportedPet, String> {
    if manifest_bytes.len() > MAX_MANIFEST_BYTES || sprite_bytes.len() > MAX_SPRITE_BYTES {
        return Err("宠物文件超过允许的大小限制。".into());
    }
    let manifest = parse_manifest(manifest_bytes)?;
    let fallback_id = format!("pet-{}", timestamp());
    let id = sanitize_id(string_field(&manifest, "id").unwrap_or(&fallback_id));
    let imports = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法定位应用数据目录：{error}"))?
        .join("imports");
    fs::create_dir_all(&imports).map_err(io_error("无法创建导入目录"))?;
    let destination = imports.join(format!("{}-{}", id, timestamp()));
    fs::create_dir_all(&destination).map_err(io_error("无法创建宠物暂存目录"))?;
    fs::write(destination.join("pet.json"), manifest_bytes)
        .map_err(io_error("无法写入 pet.json"))?;
    fs::write(destination.join(sprite_name), sprite_bytes)
        .map_err(io_error("无法写入 spritesheet"))?;
    load_package(&destination, source_kind)
}

pub fn load_package(package_dir: &Path, source_kind: &str) -> Result<ImportedPet, String> {
    let manifest_path = package_dir.join("pet.json");
    let manifest_bytes = read_file_limited(&manifest_path, MAX_MANIFEST_BYTES, "pet.json")?;
    let manifest = parse_manifest(&manifest_bytes)?;
    let sprite_name = resolve_sprite_name(package_dir, &manifest)?;
    let sprite_path = package_dir.join(&sprite_name);
    let sprite_bytes = read_file_limited(&sprite_path, MAX_SPRITE_BYTES, "spritesheet")?;
    let decoded = image::load_from_memory(&sprite_bytes)
        .map_err(|error| format!("无法解码 spritesheet：{error}"))?;
    let (width, height) = decoded.dimensions();
    let rgba = decoded.to_rgba8();
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut checks = Vec::new();

    let (rows, format, sprite_version) = if width == 1536 && height == 2288 {
        (V2_ROWS, "Codex v2", 2)
    } else if width == 1536 && height == 1872 {
        (V1_ROWS, "Codex / Petdex v1", 1)
    } else if width % COLUMNS == 0 && height % V1_ROWS == 0 {
        warnings.push(format!(
            "检测到非标准 Petdex 9 行图集（{}×{}）；运行时会按 8×9 网格自适应。",
            width, height
        ));
        (V1_ROWS, "Petdex flexible 9-row", 1)
    } else {
        errors.push(format!(
            "不支持的图集尺寸 {}×{}；需要 1536×2288（Codex v2）或 8×9 可整除图集。",
            width, height
        ));
        (V1_ROWS, "Unknown", 1)
    };

    let declared_version = manifest
        .get("spriteVersionNumber")
        .and_then(Value::as_u64)
        .map(|value| value as u8);
    if rows == V2_ROWS && declared_version != Some(2) {
        warnings.push("v2 图集缺少 spriteVersionNumber: 2；导出时会自动补齐。".into());
    }
    if rows == V1_ROWS && declared_version == Some(2) {
        errors.push("pet.json 声明 v2，但图集只有 9 行。".into());
    }

    checks.push(ValidationCheck {
        label: "图集尺寸".into(),
        ok: errors.is_empty(),
        detail: format!("{}×{} · 8×{}", width, height, rows),
    });

    let cell_width = width / COLUMNS;
    let cell_height = height / rows;
    if errors.is_empty() {
        validate_cells(&rgba, cell_width, cell_height, rows, &mut errors);
        checks.push(ValidationCheck {
            label: "帧占用".into(),
            ok: errors.is_empty(),
            detail: "使用帧非空，未使用帧透明".into(),
        });
    }

    let id = sanitize_id(
        string_field(&manifest, "id")
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| {
                package_dir
                    .file_name()
                    .and_then(|v| v.to_str())
                    .unwrap_or("pet")
            }),
    );
    let display_name = string_field(&manifest, "displayName")
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(&id)
        .trim()
        .to_string();
    let description = string_field(&manifest, "description")
        .unwrap_or("A standalone desktop companion.")
        .trim()
        .to_string();
    let extension = Path::new(&sprite_name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("webp")
        .to_ascii_lowercase();
    let mime = if extension == "png" {
        "image/png"
    } else {
        "image/webp"
    };

    checks.push(ValidationCheck {
        label: "清单文件".into(),
        ok: true,
        detail: format!("{} · sprite v{}", display_name, sprite_version),
    });

    Ok(ImportedPet {
        package_dir: package_dir.to_string_lossy().into_owned(),
        source_kind: source_kind.to_string(),
        id,
        display_name,
        description,
        format: format.to_string(),
        sprite_version_number: sprite_version,
        spritesheet_path: sprite_name,
        sprite_data_url: format!("data:{mime};base64,{}", STANDARD.encode(sprite_bytes)),
        width,
        height,
        columns: COLUMNS,
        rows,
        cell_width,
        cell_height,
        valid: errors.is_empty(),
        errors,
        warnings,
        checks,
    })
}

fn validate_cells(
    image: &image::RgbaImage,
    cell_width: u32,
    cell_height: u32,
    rows: u32,
    errors: &mut Vec<String>,
) {
    for row in 0..rows {
        let used = if rows == V2_ROWS && row == 0 {
            // Codex v2 reserves idle column 6 as the neutral/front look frame.
            7
        } else if row < 9 {
            STANDARD_FRAMES[row as usize]
        } else {
            COLUMNS
        };
        for column in 0..COLUMNS {
            let mut visible = false;
            'pixels: for y in row * cell_height..(row + 1) * cell_height {
                for x in column * cell_width..(column + 1) * cell_width {
                    if image.get_pixel(x, y)[3] > 0 {
                        visible = true;
                        break 'pixels;
                    }
                }
            }
            if column < used && !visible {
                errors.push(format!("第 {} 行第 {} 帧为空。", row, column));
            } else if column >= used && visible {
                errors.push(format!(
                    "第 {} 行第 {} 个未使用单元格不是全透明。",
                    row, column
                ));
            }
        }
    }
}

fn read_directory_package(source: &Path) -> Result<(Vec<u8>, Vec<u8>, String), String> {
    let root = if source.is_file() {
        source
            .parent()
            .ok_or("无法定位所选文件的父目录。")?
            .to_path_buf()
    } else {
        resolve_package_root(source)?
    };
    let manifest_path = root.join("pet.json");
    let manifest_bytes = read_file_limited(&manifest_path, MAX_MANIFEST_BYTES, "pet.json")?;
    let manifest = parse_manifest(&manifest_bytes)?;
    let sprite_name = resolve_sprite_name(&root, &manifest)?;
    let sprite_bytes =
        read_file_limited(&root.join(&sprite_name), MAX_SPRITE_BYTES, "spritesheet")?;
    Ok((manifest_bytes, sprite_bytes, sprite_name))
}

fn resolve_package_root(source: &Path) -> Result<PathBuf, String> {
    if source.join("pet.json").is_file() {
        return Ok(source.to_path_buf());
    }
    let children = fs::read_dir(source)
        .map_err(io_error("无法读取所选目录"))?
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir() && entry.path().join("pet.json").is_file())
        .map(|entry| entry.path())
        .collect::<Vec<_>>();
    match children.as_slice() {
        [only] => Ok(only.clone()),
        [] => Err("目录中没有找到 pet.json。请选择宠物文件夹或其单一父目录。".into()),
        _ => Err("目录中包含多个宠物；请一次选择一个宠物文件夹。".into()),
    }
}

fn read_zip_package(path: &Path) -> Result<(Vec<u8>, Vec<u8>, String), String> {
    let file = File::open(path).map_err(io_error("无法打开 zip"))?;
    let mut archive = ZipArchive::new(file).map_err(|error| format!("无效的 zip：{error}"))?;
    let mut manifests = Vec::new();
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| format!("无法读取 zip：{error}"))?;
        let normalized = entry.name().replace('\\', "/");
        if normalized.split('/').next_back() == Some("pet.json") && safe_archive_name(&normalized) {
            manifests.push(normalized);
        }
    }
    manifests.sort_by_key(|name| name.matches('/').count());
    let manifest_name = manifests.first().ok_or("zip 中没有 pet.json。")?.clone();
    if manifests.len() > 1 && manifests[0].matches('/').count() == manifests[1].matches('/').count()
    {
        return Err("zip 中包含多个宠物包；请一次导入一个。".into());
    }
    let manifest_bytes = {
        let entry = archive
            .by_name(&manifest_name)
            .map_err(|error| format!("无法读取 pet.json：{error}"))?;
        read_stream_limited(entry, MAX_MANIFEST_BYTES, "pet.json")?
    };
    let manifest = parse_manifest(&manifest_bytes)?;
    let sprite_basename = manifest_sprite_basename(&manifest).unwrap_or("spritesheet.webp");
    let prefix = manifest_name.strip_suffix("pet.json").unwrap_or("");
    let mut candidates = vec![format!("{prefix}{sprite_basename}")];
    if sprite_basename != "spritesheet.webp" {
        candidates.push(format!("{prefix}spritesheet.webp"));
    }
    if sprite_basename != "spritesheet.png" {
        candidates.push(format!("{prefix}spritesheet.png"));
    }
    for candidate in candidates {
        if let Ok(entry) = archive.by_name(&candidate) {
            let bytes = read_stream_limited(entry, MAX_SPRITE_BYTES, "spritesheet")?;
            let name = Path::new(&candidate)
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("spritesheet.webp")
                .to_string();
            return Ok((manifest_bytes, bytes, name));
        }
    }
    Err("zip 中没有找到 pet.json 指向的 spritesheet。".into())
}

fn safe_archive_name(name: &str) -> bool {
    let path = Path::new(name);
    !path.is_absolute()
        && path
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
}

fn resolve_sprite_name(root: &Path, manifest: &Value) -> Result<String, String> {
    let declared = manifest_sprite_basename(manifest);
    let mut candidates = Vec::new();
    if let Some(name) = declared {
        candidates.push(name.to_string());
    }
    candidates.extend(["spritesheet.webp".into(), "spritesheet.png".into()]);
    candidates
        .into_iter()
        .find(|name| valid_sprite_basename(name) && root.join(name).is_file())
        .ok_or_else(|| "没有找到 spritesheet.webp 或 spritesheet.png。".into())
}

fn manifest_sprite_basename(manifest: &Value) -> Option<&str> {
    string_field(manifest, "spritesheetPath").filter(|value| valid_sprite_basename(value))
}

fn valid_sprite_basename(value: &str) -> bool {
    let path = Path::new(value);
    path.components().count() == 1
        && path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|ext| ext.eq_ignore_ascii_case("png") || ext.eq_ignore_ascii_case("webp"))
}

fn parse_manifest(bytes: &[u8]) -> Result<Value, String> {
    let value: Value = serde_json::from_slice(bytes)
        .map_err(|error| format!("pet.json 不是有效 JSON：{error}"))?;
    if !value.is_object() {
        return Err("pet.json 必须是 JSON 对象。".into());
    }
    Ok(value)
}

fn string_field<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str)
}

fn read_file_limited(path: &Path, limit: usize, label: &str) -> Result<Vec<u8>, String> {
    let metadata = fs::metadata(path).map_err(io_error(&format!("无法读取 {label}")))?;
    if !metadata.is_file() || metadata.len() > limit as u64 {
        return Err(format!("{label} 不存在或超过大小限制。"));
    }
    fs::read(path).map_err(io_error(&format!("无法读取 {label}")))
}

fn read_stream_limited<R: Read>(
    mut reader: R,
    limit: usize,
    label: &str,
) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    reader
        .by_ref()
        .take(limit as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("无法读取 {label}：{error}"))?;
    if bytes.len() > limit {
        return Err(format!("{label} 超过大小限制。"));
    }
    Ok(bytes)
}

pub fn export_pet(_app: &AppHandle, request: ExportRequest) -> Result<ExportResult, String> {
    let runtime = runtime_template_path()?;
    export_with_runtime(
        Path::new(&request.package_dir),
        Path::new(&request.output_dir),
        &runtime,
        &request.id,
        &request.display_name,
        &request.description,
    )
}

pub fn export_source_kit(request: ExportRequest) -> Result<SourceExportResult, String> {
    let package_dir = Path::new(&request.package_dir);
    let pet = load_package(package_dir, "cross-platform-source")?;
    if !pet.valid {
        return Err(format!("宠物校验未通过：{}", pet.errors.join("；")));
    }

    let output_root = Path::new(&request.output_dir);
    fs::create_dir_all(output_root).map_err(io_error("无法创建跨平台接力包目录"))?;
    let id = sanitize_id(if request.id.trim().is_empty() {
        &pet.id
    } else {
        &request.id
    });
    let display_name = if request.display_name.trim().is_empty() {
        &pet.display_name
    } else {
        request.display_name.trim()
    };
    let description = if request.description.trim().is_empty() {
        &pet.description
    } else {
        request.description.trim()
    };
    let folder = unique_output_path(output_root, &format!("{id}-petpack-cross-platform"));
    let bundle = folder.join("petpack.bundle");
    fs::create_dir_all(&bundle).map_err(io_error("无法创建跨平台宠物数据目录"))?;
    fs::copy(
        package_dir.join(&pet.spritesheet_path),
        bundle.join(&pet.spritesheet_path),
    )
    .map_err(io_error("无法复制跨平台 spritesheet"))?;
    let manifest = normalized_manifest(
        &id,
        display_name,
        description,
        pet.sprite_version_number,
        &pet.spritesheet_path,
    );
    fs::write(
        bundle.join("pet.json"),
        serde_json::to_vec_pretty(&manifest).map_err(|error| error.to_string())?,
    )
    .map_err(io_error("无法写入跨平台宠物清单"))?;
    fs::write(
        folder.join("build-request.json"),
        serde_json::to_vec_pretty(&json!({
            "schemaVersion": 1,
            "petId": id,
            "displayName": display_name,
            "description": description,
            "sourceFormat": pet.format,
            "builderProtocol": "petpack-studio build-pet --source <petpack.bundle> --output <dir>"
        }))
        .map_err(|error| error.to_string())?,
    )
    .map_err(io_error("无法写入跨平台构建请求"))?;

    let current_builder =
        std::env::current_exe().map_err(|error| format!("无法定位构建器：{error}"))?;
    let included_builder = include_current_platform_builder(&current_builder, &folder)?;
    fs::write(folder.join("build-here.ps1"), build_here_powershell())
        .map_err(io_error("无法写入 Windows 构建脚本"))?;
    fs::write(folder.join("build-here.sh"), build_here_shell())
        .map_err(io_error("无法写入 macOS/Linux 构建脚本"))?;
    fs::write(folder.join("README.md"), cross_platform_readme(&id))
        .map_err(io_error("无法写入跨平台构建说明"))?;

    let zip_path = folder.with_extension("zip");
    zip_folder(&folder, &zip_path)?;
    Ok(SourceExportResult {
        folder_path: folder.to_string_lossy().into_owned(),
        zip_path: zip_path.to_string_lossy().into_owned(),
        included_builder,
    })
}

fn include_current_platform_builder(current: &Path, folder: &Path) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let app_bundle = current
            .ancestors()
            .find(|path| {
                path.extension()
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("app"))
            })
            .ok_or("macOS 构建器不在 .app 包内。")?;
        let target = folder.join("builders/macos-current/PetPack Builder.app");
        copy_directory(app_bundle, &target)?;
        return Ok("macos-current/PetPack Builder.app".into());
    }
    #[cfg(target_os = "windows")]
    {
        let target = folder.join("builders/windows-x64/petpack-builder.exe");
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(io_error("无法创建 Windows 构建器目录"))?;
        }
        fs::copy(current, &target).map_err(io_error("无法复制 Windows 轻量构建器"))?;
        return Ok("windows-x64/petpack-builder.exe".into());
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        use std::os::unix::fs::PermissionsExt;
        let target = folder.join("builders/linux-current/petpack-builder");
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(io_error("无法创建 Linux 构建器目录"))?;
        }
        fs::copy(current, &target).map_err(io_error("无法复制 Linux 轻量构建器"))?;
        let mut permissions = fs::metadata(&target)
            .map_err(io_error("无法读取 Linux 构建器权限"))?
            .permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&target, permissions).map_err(io_error("无法设置 Linux 构建器权限"))?;
        Ok("linux-current/petpack-builder".into())
    }
}

fn build_here_powershell() -> &'static str {
    r#"$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$builder = Join-Path $root 'builders\windows-x64\petpack-builder.exe'
if (-not (Test-Path -LiteralPath $builder)) {
  throw '此接力包没有 Windows 构建器。请从 PetPack Builder 发布页补入 builders/windows-x64/petpack-builder.exe。'
}
& $builder build-pet --source (Join-Path $root 'petpack.bundle') --output (Join-Path $root 'output')
if ($LASTEXITCODE -ne 0) { throw "构建失败，退出码 $LASTEXITCODE" }
Write-Host '构建完成，请查看 output 目录。'
"#
}

fn build_here_shell() -> &'static str {
    r#"#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
case "$(uname -s)" in
  Darwin) BUILDER="$ROOT/builders/macos-current/PetPack Builder.app/Contents/MacOS/petpack-studio" ;;
  Linux) BUILDER="$ROOT/builders/linux-current/petpack-builder" ;;
  *) echo '不支持的系统。' >&2; exit 2 ;;
esac
if [ ! -x "$BUILDER" ]; then
  echo '接力包中没有当前系统构建器，请从 PetPack Builder 发布页补入 builders 对应目录。' >&2
  exit 2
fi
"$BUILDER" build-pet --source "$ROOT/petpack.bundle" --output "$ROOT/output"
echo '构建完成，请查看 output 目录。'
"#
}

fn cross_platform_readme(id: &str) -> String {
    format!(
        "# {id} 跨平台接力包\n\n此包包含宠物数据、当前发送者平台的轻量命令构建器和本机生成脚本。\n\n- Windows：右键 `build-here.ps1`，选择使用 PowerShell 运行。\n- macOS/Linux：终端执行 `chmod +x build-here.sh && ./build-here.sh`。\n- 如果 builders 中没有接收者平台的构建器，需要从 PetPack Builder 发布产物补入；不能用 Windows 可执行文件直接生成 macOS `.app`。\n- 构建结果位于 `output/`，不需要启动完整 Studio 界面。\n"
    )
}

pub fn export_with_runtime(
    package_dir: &Path,
    output_root: &Path,
    runtime_template: &Path,
    requested_id: &str,
    display_name: &str,
    description: &str,
) -> Result<ExportResult, String> {
    let pet = load_package(package_dir, "export")?;
    if !pet.valid {
        return Err(format!("宠物校验未通过：{}", pet.errors.join("；")));
    }
    if !runtime_template.is_file() {
        return Err(format!(
            "找不到桌宠运行时模板：{}",
            runtime_template.display()
        ));
    }
    fs::create_dir_all(output_root).map_err(io_error("无法创建导出目录"))?;
    let id = sanitize_id(if requested_id.trim().is_empty() {
        &pet.id
    } else {
        requested_id
    });
    let platform = platform_label();
    let folder = unique_output_path(output_root, &format!("{id}-desktop-pet-{platform}"));
    fs::create_dir_all(&folder).map_err(io_error("无法创建桌宠包目录"))?;

    #[cfg(target_os = "macos")]
    let (executable, bundle) = {
        let app_bundle = runtime_template
            .ancestors()
            .find(|path| {
                path.extension()
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("app"))
            })
            .ok_or("macOS 运行时模板不在 .app 包内。")?;
        let target_app = folder.join(format!("{id}.app"));
        copy_directory(app_bundle, &target_app)?;
        let executable_name = runtime_template
            .file_name()
            .ok_or("macOS 运行时缺少可执行文件名。")?;
        (
            target_app
                .join("Contents")
                .join("MacOS")
                .join(executable_name),
            target_app
                .join("Contents")
                .join("Resources")
                .join("petpack.bundle"),
        )
    };
    #[cfg(not(target_os = "macos"))]
    let (executable, bundle) = {
        #[cfg(target_os = "windows")]
        let executable = folder.join(format!("{id}.exe"));
        #[cfg(not(target_os = "windows"))]
        let executable = folder.join(&id);
        fs::copy(runtime_template, &executable).map_err(io_error("无法复制桌宠运行时"))?;
        (executable, folder.join("petpack.bundle"))
    };

    fs::create_dir_all(&bundle).map_err(io_error("无法创建宠物资源目录"))?;
    fs::copy(
        package_dir.join(&pet.spritesheet_path),
        bundle.join(&pet.spritesheet_path),
    )
    .map_err(io_error("无法复制 spritesheet"))?;
    let manifest = normalized_manifest(
        &id,
        if display_name.trim().is_empty() {
            &pet.display_name
        } else {
            display_name.trim()
        },
        if description.trim().is_empty() {
            &pet.description
        } else {
            description.trim()
        },
        pet.sprite_version_number,
        &pet.spritesheet_path,
    );
    fs::write(
        bundle.join("pet.json"),
        serde_json::to_vec_pretty(&manifest).map_err(|error| error.to_string())?,
    )
    .map_err(io_error("无法写入导出清单"))?;
    fs::write(
        bundle.join("petpack-runtime.json"),
        serde_json::to_vec_pretty(&json!({
            "runtimeVersion": 1,
            "sourceFormat": pet.format,
            "createdBy": "PetPack Studio"
        }))
        .map_err(|error| error.to_string())?,
    )
    .map_err(io_error("无法写入运行时标记"))?;
    fs::write(folder.join("README.txt"), export_readme(&id))
        .map_err(io_error("无法写入使用说明"))?;
    fs::write(
        folder.join("THIRD_PARTY_NOTICES.txt"),
        third_party_notices(),
    )
    .map_err(io_error("无法写入第三方声明"))?;

    let zip_path = folder.with_extension("zip");
    zip_folder(&folder, &zip_path)?;

    Ok(ExportResult {
        folder_path: folder.to_string_lossy().into_owned(),
        zip_path: zip_path.to_string_lossy().into_owned(),
        executable_path: executable.to_string_lossy().into_owned(),
        platform: platform.to_string(),
    })
}

fn normalized_manifest(
    id: &str,
    display_name: &str,
    description: &str,
    version: u8,
    spritesheet_path: &str,
) -> Value {
    let mut map = Map::new();
    map.insert("id".into(), json!(id));
    map.insert("displayName".into(), json!(display_name));
    map.insert("description".into(), json!(description));
    if version == 2 {
        map.insert("spriteVersionNumber".into(), json!(2));
    }
    map.insert("spritesheetPath".into(), json!(spritesheet_path));
    Value::Object(map)
}

fn runtime_template_path() -> Result<PathBuf, String> {
    if let Ok(path) = std::env::var("PETPACK_RUNTIME_TEMPLATE") {
        let candidate = PathBuf::from(path);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    let current = std::env::current_exe().map_err(|error| format!("无法定位当前程序：{error}"))?;
    if !cfg!(debug_assertions) {
        return Ok(current);
    }
    let release_name = if cfg!(target_os = "windows") {
        "petpack-studio.exe"
    } else {
        "petpack-studio"
    };
    let release = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("target")
        .join("release")
        .join(release_name);
    if release.is_file() {
        Ok(release)
    } else {
        Err("开发模式尚无 release 运行时。请先运行 npm run tauri build，再点击导出。".into())
    }
}

fn zip_folder(folder: &Path, destination: &Path) -> Result<(), String> {
    let file = File::create(destination).map_err(io_error("无法创建 zip"))?;
    let mut writer = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    let base_name = folder
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("desktop-pet");
    add_directory_to_zip(&mut writer, folder, folder, base_name, options)?;
    writer
        .finish()
        .map_err(|error| format!("无法完成 zip：{error}"))?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn copy_directory(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(io_error("无法复制 macOS app 包"))?;
    for entry in fs::read_dir(source).map_err(io_error("无法读取 macOS app 包"))? {
        let entry = entry.map_err(|error| error.to_string())?;
        let target = destination.join(entry.file_name());
        if entry.path().is_dir() {
            copy_directory(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), target).map_err(io_error("无法复制 macOS app 文件"))?;
        }
    }
    Ok(())
}

fn add_directory_to_zip(
    writer: &mut ZipWriter<File>,
    root: &Path,
    current: &Path,
    base_name: &str,
    options: SimpleFileOptions,
) -> Result<(), String> {
    for entry in fs::read_dir(current).map_err(io_error("无法读取导出目录"))? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        let relative = path.strip_prefix(root).map_err(|error| error.to_string())?;
        let name = format!(
            "{base_name}/{}",
            relative.to_string_lossy().replace('\\', "/")
        );
        if path.is_dir() {
            writer
                .add_directory(format!("{name}/"), options)
                .map_err(|error| error.to_string())?;
            add_directory_to_zip(writer, root, &path, base_name, options)?;
        } else {
            writer
                .start_file(name, options)
                .map_err(|error| error.to_string())?;
            let mut source = File::open(&path).map_err(io_error("无法读取待压缩文件"))?;
            std::io::copy(&mut source, writer).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

pub fn find_runtime_bundle(app: &AppHandle) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(path) = std::env::var("PETPACK_BUNDLE_PATH") {
        candidates.push(PathBuf::from(path));
    }
    if let Ok(executable) = std::env::current_exe() {
        if let Some(parent) = executable.parent() {
            candidates.push(parent.join("petpack.bundle"));
            candidates.push(parent.join("..").join("Resources").join("petpack.bundle"));
        }
    }
    if let Ok(resources) = app.path().resource_dir() {
        candidates.push(resources.join("petpack.bundle"));
    }
    candidates
        .into_iter()
        .find(|candidate| candidate.join("pet.json").is_file())
}

pub fn parse_petdex_slug(value: &str) -> Result<String, String> {
    let trimmed = value.trim().trim_end_matches('/');
    let raw = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        let url = Url::parse(trimmed).map_err(|_| "Petdex 链接无效。".to_string())?;
        match url.host_str() {
            Some("petdex.dev") | Some("www.petdex.dev") | Some("petdex.crafter.run") => {}
            _ => return Err("只接受 petdex.dev 的宠物链接。".into()),
        }
        url.path_segments()
            .and_then(|segments| segments.filter(|part| !part.is_empty()).next_back())
            .ok_or("Petdex 链接中没有宠物 slug。")?
            .to_string()
    } else {
        trimmed.to_string()
    };
    let slug = sanitize_id(&raw);
    if slug.is_empty() || slug == "pet" {
        return Err("请输入 Petdex slug 或宠物链接。".into());
    }
    Ok(slug)
}

pub fn sanitize_id(value: &str) -> String {
    let mut result = String::new();
    let mut dash = false;
    for character in value.trim().to_lowercase().chars() {
        if character.is_ascii_alphanumeric() {
            result.push(character);
            dash = false;
        } else if (character == '-' || character == '_' || character.is_whitespace())
            && !dash
            && !result.is_empty()
        {
            result.push('-');
            dash = true;
        }
    }
    let result = result.trim_matches('-');
    if result.is_empty() {
        "pet".into()
    } else {
        result.chars().take(48).collect()
    }
}

fn timestamp() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn unique_output_path(root: &Path, name: &str) -> PathBuf {
    let preferred = root.join(name);
    if !preferred.exists() {
        preferred
    } else {
        root.join(format!("{name}-{}", timestamp()))
    }
}

fn platform_label() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows-x64"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux-x64"
    }
}

fn export_readme(id: &str) -> String {
    format!(
        "{id} 独立桌宠 / Standalone Desktop Pet\r\n\r\n双击 {id}{} 即可启动。\r\n本程序不读取 Codex 配置，也不需要 Codex 运行。\r\n拖动宠物底部把手可移动；悬停后可挥手、跳跃、切换置顶或退出。\r\n\r\nDouble-click the executable to start. No Codex installation or process is required.\r\nKeep petpack.bundle beside the executable.\r\n",
        if cfg!(target_os = "windows") { ".exe" } else { "" }
    )
}

fn third_party_notices() -> &'static str {
    "PetPack Studio was designed with reference to BongoCat (ayangweb/BongoCat, MIT) and Petdex (crafter-station/petdex, MIT).\r\nNo third-party pet artwork is bundled by PetPack Studio. Imported pet assets remain subject to their creator's license and rights.\r\n"
}

fn io_error(prefix: &str) -> impl FnOnce(std::io::Error) -> String + '_ {
    move |error| format!("{prefix}：{error}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn test_dir(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("petpack-{name}-{}", timestamp()));
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn write_minimal_manifest(path: &Path, sprite_path: &str) {
        fs::write(
            path.join("pet.json"),
            serde_json::to_vec(&json!({
                "id": "test-pet",
                "displayName": "Test Pet",
                "description": "Test fixture",
                "spritesheetPath": sprite_path
            }))
            .unwrap(),
        )
        .unwrap();
    }

    #[test]
    fn parses_petdex_slug_and_url() {
        assert_eq!(parse_petdex_slug("boba").unwrap(), "boba");
        assert_eq!(
            parse_petdex_slug("https://petdex.dev/pets/Boba/").unwrap(),
            "boba"
        );
        assert!(parse_petdex_slug("https://example.com/pets/boba").is_err());
    }

    #[test]
    fn validates_the_provided_codex_v2_sample_when_available() {
        let sample = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("pet-example")
            .join("luofulai");
        if sample.exists() {
            let pet = load_package(&sample, "test").unwrap();
            assert!(pet.valid, "{:?}", pet.errors);
            assert_eq!((pet.width, pet.height, pet.rows), (1536, 2288, 11));
            assert_eq!(pet.sprite_version_number, 2);
        }
    }

    #[test]
    fn resolves_a_parent_with_exactly_one_pet_child() {
        let root = test_dir("parent");
        let child = root.join("only-pet");
        fs::create_dir_all(&child).unwrap();
        write_minimal_manifest(&child, "spritesheet.webp");
        assert_eq!(resolve_package_root(&root).unwrap(), child);
        let second = root.join("second-pet");
        fs::create_dir_all(&second).unwrap();
        write_minimal_manifest(&second, "spritesheet.webp");
        assert!(resolve_package_root(&root).is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_manifest_sprite_path_traversal() {
        let root = test_dir("manifest-traversal");
        write_minimal_manifest(&root, "../outside.webp");
        assert!(load_package(&root, "test").is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_invalid_atlas_dimensions() {
        let root = test_dir("invalid-dimensions");
        write_minimal_manifest(&root, "spritesheet.png");
        image::RgbaImage::from_pixel(64, 64, image::Rgba([255, 255, 255, 255]))
            .save(root.join("spritesheet.png"))
            .unwrap();
        let pet = load_package(&root, "test").unwrap();
        assert!(!pet.valid);
        assert!(pet
            .errors
            .iter()
            .any(|error| error.contains("不支持的图集尺寸")));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_zip_path_traversal_and_multiple_pets() {
        let root = test_dir("unsafe-zips");
        let traversal_zip = root.join("traversal.zip");
        {
            let file = File::create(&traversal_zip).unwrap();
            let mut writer = ZipWriter::new(file);
            let options = SimpleFileOptions::default();
            writer.start_file("../pet.json", options).unwrap();
            writer
                .write_all(br#"{"id":"bad","spritesheetPath":"spritesheet.webp"}"#)
                .unwrap();
            writer.finish().unwrap();
        }
        assert!(read_zip_package(&traversal_zip).is_err());

        let multiple_zip = root.join("multiple.zip");
        {
            let file = File::create(&multiple_zip).unwrap();
            let mut writer = ZipWriter::new(file);
            let options = SimpleFileOptions::default();
            for pet in ["one", "two"] {
                writer
                    .start_file(format!("{pet}/pet.json"), options)
                    .unwrap();
                writer
                    .write_all(br#"{"id":"pet","spritesheetPath":"spritesheet.webp"}"#)
                    .unwrap();
            }
            writer.finish().unwrap();
        }
        assert!(read_zip_package(&multiple_zip).is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn reads_a_single_nested_zip_package() {
        let root = test_dir("nested-zip");
        let archive_path = root.join("pet.zip");
        {
            let file = File::create(&archive_path).unwrap();
            let mut writer = ZipWriter::new(file);
            let options = SimpleFileOptions::default();
            writer.start_file("pet/pet.json", options).unwrap();
            writer
                .write_all(br#"{"id":"nested","spritesheetPath":"spritesheet.webp"}"#)
                .unwrap();
            writer.start_file("pet/spritesheet.webp", options).unwrap();
            writer.write_all(b"sprite-bytes").unwrap();
            writer.finish().unwrap();
        }
        let (manifest, sprite, name) = read_zip_package(&archive_path).unwrap();
        assert_eq!(
            string_field(&parse_manifest(&manifest).unwrap(), "id"),
            Some("nested")
        );
        assert_eq!(sprite, b"sprite-bytes");
        assert_eq!(name, "spritesheet.webp");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    #[cfg(not(target_os = "macos"))]
    fn exports_a_self_contained_package_and_zip() {
        let sample = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("pet-example")
            .join("luofulai");
        if !sample.exists() {
            return;
        }
        let root = test_dir("export");
        let runtime = root.join(if cfg!(target_os = "windows") {
            "runtime.exe"
        } else {
            "runtime"
        });
        fs::write(&runtime, b"petpack-runtime-fixture").unwrap();
        let output = root.join("output");
        let result = export_with_runtime(
            &sample,
            &output,
            &runtime,
            "fixture-pet",
            "Fixture Pet",
            "Export regression test",
        )
        .unwrap();
        assert_eq!(
            fs::read(&result.executable_path).unwrap(),
            b"petpack-runtime-fixture"
        );
        assert!(Path::new(&result.zip_path).is_file());
        let manifest: Value = serde_json::from_slice(
            &fs::read(
                Path::new(&result.folder_path)
                    .join("petpack.bundle")
                    .join("pet.json"),
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(string_field(&manifest, "displayName"), Some("Fixture Pet"));
        assert_eq!(
            manifest.get("spriteVersionNumber").and_then(Value::as_u64),
            Some(2)
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    #[cfg(not(target_os = "macos"))]
    fn exports_a_cross_platform_relay_kit() {
        let sample = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("pet-example")
            .join("luofulai");
        if !sample.exists() {
            return;
        }
        let root = test_dir("source-kit");
        let result = export_source_kit(ExportRequest {
            package_dir: sample.to_string_lossy().into_owned(),
            output_dir: root.to_string_lossy().into_owned(),
            id: "relay-pet".into(),
            display_name: "Relay Pet".into(),
            description: "Cross-platform relay fixture".into(),
        })
        .unwrap();
        let folder = Path::new(&result.folder_path);
        assert!(folder.join("petpack.bundle/pet.json").is_file());
        assert!(folder.join("build-request.json").is_file());
        assert!(folder.join("build-here.ps1").is_file());
        assert!(folder.join("build-here.sh").is_file());
        assert!(Path::new(&result.zip_path).is_file());
        assert!(!result.included_builder.is_empty());
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    #[ignore = "live Petdex integration test"]
    async fn downloads_the_petdex_boba_package() {
        let (manifest, sprite, name) = download_petdex_package("boba").await.unwrap();
        assert_eq!(
            string_field(&parse_manifest(&manifest).unwrap(), "id"),
            Some("boba")
        );
        assert!(sprite.len() > 256);
        assert!(name.ends_with(".webp") || name.ends_with(".png"));
        let decoded = image::load_from_memory(&sprite).unwrap();
        assert!(decoded.width() >= 256 && decoded.height() >= 256);
    }
}
