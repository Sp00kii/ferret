import { defineConfig } from "vite";

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // Ferret mod: uiohook-napi is a native module, copied in by forge
      external: ["node-pipewire", "uiohook-napi"],
    },
  },
});
