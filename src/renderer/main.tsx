import { CSPProvider } from "@base-ui/react/csp-provider"
import { createRoot } from "react-dom/client"
import { TooltipProvider } from "@/components/ui/tooltip"
import { App } from "./App"

const root = document.getElementById("app")
if (!root) throw new Error("Elemento radice del renderer non trovato.")

createRoot(root).render(<CSPProvider disableStyleElements><TooltipProvider><App /></TooltipProvider></CSPProvider>)
