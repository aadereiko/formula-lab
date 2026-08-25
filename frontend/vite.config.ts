import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 7732 / 7731 are used to stay clear of the ports other local projects occupy
// (Vite's 5173-5175, Opik's 8080/8123/8765, and the 74xx range).
const API_PORT = Number(process.env.FORMULA_LAB_API_PORT ?? 7731);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 7732,
    strictPort: true,
    // Proxying means the browser only ever talks to one origin, so CORS never
    // enters the picture during development.
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
  build: { outDir: "dist", sourcemap: true },
});
