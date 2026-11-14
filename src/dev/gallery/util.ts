import { createContext, useContext } from 'react';

// Small helpers of the dev-only Gallery (src/dev). Nothing here is reachable from app code.

export const GalleryThemeContext = createContext<'dark' | 'light'>('dark');

/** The Gallery's current theme (the top bar's toggle). */
export function useGalleryTheme(): 'dark' | 'light' {
  return useContext(GalleryThemeContext);
}

export const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
