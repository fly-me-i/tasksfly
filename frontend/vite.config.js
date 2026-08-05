import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// See https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "/tasksfly/",
  server: {
    port: 5173,
  },
});
