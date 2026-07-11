import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { SpritePlayer } from "./sprite";
import type { ImportedPet } from "./types";

export async function mountRuntime(label: string) {
  document.documentElement.dataset.mode = "runtime";
  document.body.className = "runtime-body";
  const app = document.querySelector<HTMLElement>("#app")!;
  app.className = "runtime-app";
  app.innerHTML = `
    <div class="runtime-scale-shell">
      <div class="pet-runtime">
        <div class="runtime-toolbar">
          <button data-action="smaller" title="缩小">−</button>
          <button data-action="larger" title="放大">＋</button>
          <button data-action="wave" title="挥手">Hi</button>
          <button data-action="jump" title="跳跃">↑</button>
          <button data-action="pin" class="active" title="切换置顶">●</button>
          <button data-action="close" title="退出">×</button>
        </div>
        <div class="runtime-speech"><strong id="runtime-name"></strong></div>
        <div class="runtime-stage" id="runtime-stage"><div class="runtime-sprite" id="runtime-sprite"></div></div>
        <div class="drag-handle" id="drag-handle" data-tauri-drag-region role="button" tabindex="0" aria-label="拖动桌宠"><i></i><i></i><i></i></div>
      </div>
    </div>`;

  try {
    const pet = await invoke<ImportedPet>("get_runtime_pet");
    await startPetRuntime(pet, label);
  } catch (error) {
    app.innerHTML = `<div class="runtime-error"><strong>宠物无法启动</strong><span></span><button>退出</button></div>`;
    app.querySelector("span")!.textContent = String(error);
    app.querySelector("button")!.addEventListener("click", () => invoke("quit_app"));
  }
}

async function startPetRuntime(pet: ImportedPet, label: string) {
  const appWindow = getCurrentWindow();
  const spriteElement = document.getElementById("runtime-sprite")!;
  const stage = document.getElementById("runtime-stage")!;
  document.getElementById("runtime-name")!.textContent = pet.displayName;
  const player = new SpritePlayer(spriteElement, pet, 0.78);
  let pinned = true;
  let lookReset = 0;
  let runtimeScale = Number.parseFloat(localStorage.getItem("petpack.runtime.scale") ?? "1");
  if (!Number.isFinite(runtimeScale)) runtimeScale = 1;

  const applyRuntimeScale = async (requested: number) => {
    const applied = await invoke<number>("resize_pet_window", { scale: requested });
    runtimeScale = applied;
    document.documentElement.style.setProperty("--pet-scale", String(applied));
    localStorage.setItem("petpack.runtime.scale", String(applied));
  };
  await applyRuntimeScale(runtimeScale);

  if (label === "pet") {
    listen<string>("pet-action", ({ payload }) => {
      if (
        payload === "idle" ||
        payload === "waving" ||
        payload === "jumping" ||
        payload === "running"
      ) {
        player.setState(payload, payload !== "idle");
      }
    });
    listen<boolean>("pet-pin-changed", ({ payload }) => {
      pinned = payload;
      document
        .querySelector<HTMLButtonElement>('[data-action="pin"]')
        ?.classList.toggle("active", pinned);
    });
    listen<number>("pet-scale", ({ payload }) => void applyRuntimeScale(payload));
  }

  stage.addEventListener("pointermove", (event) => {
    if (pet.rows < 11) return;
    const rect = stage.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    if (Math.hypot(dx, dy) < 18) return;
    const degrees = (Math.atan2(dx, -dy) * 180) / Math.PI;
    player.setLookDirection(degrees);
    window.clearTimeout(lookReset);
    lookReset = window.setTimeout(() => player.setState("idle"), 700);
  });
  stage.addEventListener("pointerleave", () => player.setState("idle"));
  stage.addEventListener("dblclick", () => player.setState("waving", true));

  document.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.action;
      if (action === "smaller") await applyRuntimeScale(runtimeScale - 0.15);
      if (action === "larger") await applyRuntimeScale(runtimeScale + 0.15);
      if (action === "wave") player.setState("waving", true);
      if (action === "jump") player.setState("jumping", true);
      if (action === "pin") {
        pinned = !pinned;
        await appWindow.setAlwaysOnTop(pinned);
        button.classList.toggle("active", pinned);
      }
      if (action === "close") {
        player.destroy();
        if (label === "pet-preview") await appWindow.close();
        else await invoke("quit_app");
      }
    });
  });

  document.getElementById("drag-handle")!.addEventListener("pointerdown", async (event) => {
    if (event.button === 0) {
      event.preventDefault();
      await appWindow.startDragging();
    }
  });
}
