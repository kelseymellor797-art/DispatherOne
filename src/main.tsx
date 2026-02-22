/// <reference types="vite/client" />

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

interface ImportMetaEnv {
  readonly VITE_ORS_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

const container = document.querySelector<HTMLDivElement>("#root");

if (container) {
  createRoot(container).render(<App />);
}
