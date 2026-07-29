import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

process.env.BROWSERSLIST_IGNORE_OLD_DATA = "1";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Keep React in one shared chunk. Over-splitting (themes/sonner/radix into
        // separate files) caused "Cannot read properties of undefined (reading 'createContext')".
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          const normalized = id.replace(/\\/g, "/");

          if (
            normalized.includes("/react/") ||
            normalized.includes("/react-dom/") ||
            normalized.includes("/scheduler/") ||
            normalized.endsWith("/react/index.js") ||
            normalized.includes("react/jsx-runtime") ||
            normalized.includes("react/jsx-dev-runtime")
          ) {
            return "react";
          }

          if (normalized.includes("@supabase")) return "supabase";
          if (normalized.includes("recharts") || normalized.includes("d3-")) return "charts";
          if (normalized.includes("@radix-ui")) return "radix";
          if (normalized.includes("lucide-react")) return "icons";
        },
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react/jsx-runtime", "next-themes", "sonner"],
  },
}));
