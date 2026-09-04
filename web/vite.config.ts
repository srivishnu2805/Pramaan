import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      "^/(auth|cases|documents|audit|search|healthz|docs|config)": {
        target: process.env.VITE_API_URL ?? "http://backend:8000",
        changeOrigin: true,
      },
    },
  },
});
