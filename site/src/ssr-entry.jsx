import { renderToString } from "react-dom/server";
import App from "./App.jsx";

/** Server-side render of the dashboard, given window.__BENCH_DATA__ is set. */
export function render() {
  return renderToString(<App />);
}
