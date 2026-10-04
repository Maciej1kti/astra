import "./styles/base.css";
import "./styles/dialog.css";
import "./styles/motion.css";
import { mount } from "svelte";
import App from "./App.svelte";

const target = document.getElementById("app");
if (!target) throw new Error("Brak głównego elementu aplikacji");
mount(App, { target });
