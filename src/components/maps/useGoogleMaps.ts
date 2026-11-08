"use client";
import { useEffect, useState } from "react";
import {
  loadGoogleMaps,
  mapsAuthError,
  MAPS_AUTH_EVENT,
  MapsLibraries,
} from "@/lib/maps/google-maps";
export function useGoogleMaps() {
  const [state, setState] = useState<{
    libraries: MapsLibraries | null;
    error: string | null;
  }>({ libraries: null, error: null });
  useEffect(() => {
    let cancelled = false;
    const authFailure = () => {
      if (!cancelled) setState({ libraries: null, error: mapsAuthError() });
    };
    window.addEventListener(MAPS_AUTH_EVENT, authFailure);
    loadGoogleMaps()
      .then((libraries) => {
        if (!cancelled)
          setState({
            libraries,
            error: window.__qoreSitesMaps?.authError ?? null,
          });
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ libraries: null, error: error.message });
      });
    return () => {
      cancelled = true;
      window.removeEventListener(MAPS_AUTH_EVENT, authFailure);
    };
  }, []);
  return { ...state, loading: !state.libraries && !state.error };
}
