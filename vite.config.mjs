import { defineConfig } from "vite";
import { demoApi } from "./server/demo.mjs";

export default defineConfig({
  plugins: [
    {
      name: "local-chat-demo",
      configureServer(server) {
        server.middlewares.use(demoApi);
      },
      configurePreviewServer(server) {
        server.middlewares.use(demoApi);
      },
    },
  ],
});
