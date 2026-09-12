import { useEffect, useReducer } from "react"
import type { AppState } from "../state"

export function useAppState(appState: AppState): AppState {
  const [, rerender] = useReducer((version: number) => version + 1, 0)
  useEffect(() => appState.subscribe(rerender), [appState])
  return appState
}
