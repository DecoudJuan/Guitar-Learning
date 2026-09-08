import { defineConfig } from "vite";

export default defineConfig({
  // Vercel serves the app from the domain root. Anything that builds a URL at
  // runtime still goes through import.meta.env.BASE_URL, so moving it under a
  // subpath again is a one-line change.
  base: "/",
  server: { port: 3004, strictPort: true },
});
