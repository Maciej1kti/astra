import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { calendarLayoutPlugin } from "./build/calendar-layout-plugin.ts";

export default defineConfig({
  plugins: [calendarLayoutPlugin(), svelte()],
  server: { host: "127.0.0.1" },
  build: { manifest: true },
});
