import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/auth": "http://127.0.0.1:8000",
      "/sales": "http://127.0.0.1:8000",
      "/account": "http://127.0.0.1:8000",
      "/inventory": "http://127.0.0.1:8000",
      "/payments": "http://127.0.0.1:8000",
      "/admin": "http://127.0.0.1:8000",
      "/supply-orders": "http://127.0.0.1:8000",
      "/products": "http://127.0.0.1:8000",
      "/prices": "http://127.0.0.1:8000",
      "/health": "http://127.0.0.1:8000",
    },
  },
});
