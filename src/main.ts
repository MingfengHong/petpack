import { getCurrentWindow } from "@tauri-apps/api/window";
import { mountRuntime } from "./runtime";
import { mountStudio } from "./studio";

const label = getCurrentWindow().label;

if (label === "pet" || label === "pet-preview") {
  mountRuntime(label);
} else {
  mountStudio();
}
