import "./styles/base.css";
import "./styles/dialog.css";
import "./styles/motion.css";
import { mount } from "svelte";
import App from "./App.svelte";

const target = document.getElementById("app");
if (!target) throw new Error("Missing application root");
mount(App, { target });
