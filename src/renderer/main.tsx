import { CSPProvider } from "@base-ui/react/csp-provider"
import { createRoot } from "react-dom/client"
import { App } from "./App"

const root = document.getElementById("app")
if (!root) throw new Error("Elemento radice del renderer non trovato.")

createRoot(root).render(<CSPProvider disableStyleElements><App /></CSPProvider>)
