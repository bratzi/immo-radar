import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./stil.css";

const wurzel = document.getElementById("wurzel");
if (wurzel === null) throw new Error("Wurzelelement #wurzel fehlt");

createRoot(wurzel).render(
  <StrictMode>
    <App />
  </StrictMode>
);
