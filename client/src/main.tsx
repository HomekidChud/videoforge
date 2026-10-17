import { createRoot } from "react-dom/client";
import { googleFontsHref } from "@shared/fonts";
import App from "./App";
import "./index.css";
import "./forge.css";
import "./studio.css";
import "./animator.css";
import "./tokens.css";
import "./studio-chrome.css";

if (!window.location.hash) {
  window.location.hash = "#/";
}

// Load every catalog font from Google Fonts so previews match the export.
const fonts = document.createElement("link");
fonts.rel = "stylesheet";
fonts.href = googleFontsHref();
document.head.appendChild(fonts);

createRoot(document.getElementById("root")!).render(<App />);
