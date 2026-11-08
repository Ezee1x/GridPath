"use client";
import { useEffect, useReducer } from "react";
export function useIntakeUpdates() {
  const [, refresh] = useReducer((n) => n + 1, 0);
  useEffect(() => {
    const update = () => refresh();
    window.addEventListener("qore-intake-saved", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("qore-intake-saved", update);
      window.removeEventListener("storage", update);
    };
  }, []);
}
