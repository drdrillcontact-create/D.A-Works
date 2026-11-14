import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The Electron dev script pins the host to 127.0.0.1. Set VITE_HOST=0.0.0.0 and
// VITE_ALLOWED_HOSTS=<domain> when serving the UI through a tunnel or a hosted
// preview, and VITE_HMR_CLIENT_PORT=443 when that proxy terminates TLS.
const allowedHosts = (process.env.VITE_ALLOWED_HOSTS || "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);
const hmrClientPort = Number(process.env.VITE_HMR_CLIENT_PORT);

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    host: process.env.VITE_HOST || "127.0.0.1",
    port: 5173,
    strictPort: true,
    ...(allowedHosts.length ? { allowedHosts } : {}),
    ...(hmrClientPort ? { hmr: { clientPort: hmrClientPort, protocol: "wss" } } : {})
  }
});
