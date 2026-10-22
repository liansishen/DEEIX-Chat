import { THEME_TOKEN_KEYS } from "@/shared/model/theme-presets";
import { isValidHexColor } from "@/shared/model/custom-theme";

/**
 * Applies custom CSS variable overrides to the given target element.
 * Any key not present in overrides (or with invalid value) has its property removed,
 * ensuring no leftover variables pollute the cascade.
 */
export function applyThemeVariables(
  overrides?: Record<string, string> | null,
  targetElement: HTMLElement = document.documentElement,
): void {
  for (const key of THEME_TOKEN_KEYS) {
    const value = overrides?.[key];
    if (value && isValidHexColor(value)) {
      targetElement.style.setProperty(`--${key}`, value);
    } else {
      targetElement.style.removeProperty(`--${key}`);
    }
  }
}

/**
 * Clears all custom CSS variables from the target element.
 */
export function clearThemeVariables(targetElement: HTMLElement = document.documentElement): void {
  for (const key of THEME_TOKEN_KEYS) {
    targetElement.style.removeProperty(`--${key}`);
  }
}
