import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, ".", "");
  const deepSeekApiKey = environment.DEEPSEEK_API_KEY?.trim();
  const deepSeekBaseUrl = environment.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com";
  const deepSeekModel = environment.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash";
  const deepSeekProxy: Record<string, string | ProxyOptions> = deepSeekApiKey
    ? {
        "/api/deepseek": {
          target: deepSeekBaseUrl,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/deepseek/, ""),
          headers: { Authorization: `Bearer ${deepSeekApiKey}` },
        },
      }
    : {};

  return {
    base: "./",
    plugins: [react()],
    define: {
      "import.meta.env.VITE_DEEPSEEK_ENABLED": JSON.stringify(deepSeekApiKey ? "true" : ""),
      "import.meta.env.VITE_DEEPSEEK_MODEL": JSON.stringify(deepSeekModel),
    },
    build: {
      target: "es2022",
      sourcemap: true,
    },
    server: {
      host: "127.0.0.1",
      port: 4173,
      proxy: deepSeekProxy,
    },
    preview: {
      proxy: deepSeekProxy,
    },
  };
});
