import "./styles/base.css";
import "./styles/dialog.css";
import "./styles/motion.css";
import { mount } from "svelte";
import App from "./App.svelte";
import { restoreAppearance } from "./features/settings/appearance";

const target = document.getElementById("app");
if (!target) throw new Error("Brak głównego elementu aplikacji");
// A stored set arrives with its stylesheet before the first frame; without
// that stylesheet the application still starts, in the default set.
const start = () => mount(App, { target });
void restoreAppearance().then(start, start);
