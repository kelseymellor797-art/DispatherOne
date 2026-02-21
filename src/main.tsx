/// <reference types="vite/client" />

import React from 'react';
interface ImportMetaEnv {
  readonly VITE_ORS_API_KEY: string
  // add other env variables here as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

console.log("SANITY CHECK");
console.log("VITE_ORS_API_KEY =", import.meta.env.VITE_ORS_API_KEY);
console.log("All env vars:", import.meta.env);

console.log("ENV CHECK (full):", import.meta.env);
console.log("VITE_ORS_API_KEY:", import.meta.env.VITE_ORS_API_KEY);

import { createRoot } from "react-dom/client";
import { emit } from "@tauri-apps/api/event";
import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import App from "./App";
import "./styles.css";

const container = document.querySelector<HTMLDivElement>("#root");

const isTauri = Boolean((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__);

const registerScreenshotShortcut = async () => {
  if (!isTauri) return;
  try {
    await unregisterAll();
  } catch {
    // Ignore if nothing registered yet.
  }

  try {
    await register("CmdOrCtrl+Shift+1", async () => {
      await emit("ocr-shortcut", { templateType: "ACE_PICKUP" });
    });

    await register("CmdOrCtrl+Shift+2", async () => {
      await emit("ocr-shortcut", { templateType: "ACE_DROPOFF" });
    });
  } catch (error) {
    console.error("Failed to register OCR shortcuts", error);
  }
};

if (container) {
  createRoot(container).render(<App />);

  void registerScreenshotShortcut();
  window.addEventListener("focus", () => {
    void registerScreenshotShortcut();
  });
}
