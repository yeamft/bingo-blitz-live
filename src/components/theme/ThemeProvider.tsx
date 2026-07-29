import { ThemeProvider as NextThemeProvider } from "next-themes";
import type { ReactNode } from "react";

export const THEME_STORAGE_KEY = "yegara-theme";

/**
 * The player app is designed dark-first, while the admin console opens light.
 * Admin applies its own default only when the visitor has never chosen a theme.
 */
export function hasStoredThemePreference(): boolean {
  try {
    return Boolean(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return false;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      storageKey={THEME_STORAGE_KEY}
      disableTransitionOnChange
    >
      {children}
    </NextThemeProvider>
  );
}
