// The boot guard MUST be imported first: it installs the dark fallback palette
// and the global error handlers before any CEP-dependent module is evaluated,
// so a failure anywhere below renders as visible text instead of a blank panel.
import { renderBootError } from "./boot-guard";
import App from "./main.svelte";
import { initBolt } from "../lib/utils/bolt";
import { mount } from "svelte";

// CEP init (flyout/context menus) is best-effort: if it fails, the UI must
// still mount.
try {
  initBolt();
} catch (e) {
  console.error("initBolt failed", e);
  renderBootError(e);
}

try {
  mount(App, {
    target: document.getElementById("app")!,
  });
} catch (e) {
  renderBootError(e);
}
