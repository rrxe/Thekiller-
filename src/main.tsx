import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// (No <StrictMode>: the Crash round loop owns timers/rAF and must mount exactly once.)
createRoot(document.getElementById("root")!).render(<App />);
