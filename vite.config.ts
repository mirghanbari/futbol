import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from the GitHub Pages project subpath https://<user>.github.io/futbol/,
// so assets are referenced under /futbol/. (Override with `vite build --base`
// if the repo is ever renamed or served elsewhere.)
// https://vite.dev/config/
export default defineConfig({
  base: "/futbol/",
  plugins: [react()],
});
