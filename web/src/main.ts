import "./styles.css";
import { mountApp } from "./app/shell";
import { renderSite } from "./site";

const root = document.getElementById("root")!;
const site = location.pathname.match(/^\/s\/([\w-]+)\/?$/);

if (site) {
  document.body.classList.add("is-site");
  void renderSite(root, site[1]);
} else {
  mountApp(root);
}
