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
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("@supabase")) return "supabase";
          if (id.includes("@tanstack")) return "tanstack";
          if (id.includes("@radix-ui")) return "radix";
          if (id.includes("@hookform") || id.includes("react-hook-form")) return "forms";
          if (id.includes("lucide-react")) return "icons";
          if (id.includes("recharts")) return "charts";
          if (id.includes("date-fns")) return "date-fns";
          if (id.includes("zod")) return "zod";
          if (id.includes("sonner")) return "sonner";
          if (id.includes("embla-carousel-react")) return "embla";
          if (id.includes("react-day-picker")) return "day-picker";
          if (id.includes("input-otp")) return "input-otp";
          if (id.includes("next-themes")) return "themes";
          if (id.includes("vaul")) return "vaul";
          if (id.includes("cmdk")) return "cmdk";
          if (id.includes("react-router-dom")) return "router";
          if (id.includes("react-dom") || id.includes("/react/")) return "react";

          return "vendor";
        },
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
