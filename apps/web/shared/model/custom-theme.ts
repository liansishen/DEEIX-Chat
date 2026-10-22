import { isOneOf, isRecord, parseJSON } from "@/shared/lib/type-guards";
import { THEME_COLOR_TOKENS } from "./theme-presets";
import { type ThemePreset, THEME_PRESETS } from "./theme";

const isThemePreset = isOneOf(THEME_PRESETS);

export const CUSTOM_THEME_VERSION = 1 as const;
export const MAX_APPEARANCE_PREFERENCES_BYTES = 16384;
export const CUSTOM_THEME_STORAGE_KEY = "custom-theme";

export const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
export const HEX_NO_ALPHA_REGEX = /^#[0-9a-fA-F]{6}$/;

export type CustomThemeConfig = {
  version: typeof CUSTOM_THEME_VERSION;
  light: Record<string, string>;
  dark: Record<string, string>;
};

export type ThemeExportPayload = {
  version: typeof CUSTOM_THEME_VERSION;
  preset?: ThemePreset;
  customTheme: CustomThemeConfig;
};

export function isValidHexColor(value: string): boolean {
  return HEX_COLOR_REGEX.test(value);
}

export function isValidHexForToken(tokenKey: string, hex: string): boolean {
  if (!HEX_COLOR_REGEX.test(hex)) return false;
  const meta = THEME_COLOR_TOKENS[tokenKey];
  if (!meta) return false;
  if (!meta.allowAlpha && hex.length !== 7) {
    return false;
  }
  return true;
}

/**
 * Lenient validation for stored local state and migration fallback.
 */
export function validateAndSanitizeCustomTheme(raw: unknown): CustomThemeConfig | undefined {
  if (!isRecord(raw)) return undefined;
  if (raw.version !== CUSTOM_THEME_VERSION) return undefined;
  if (!isRecord(raw.light) || !isRecord(raw.dark)) return undefined;

  const light: Record<string, string> = {};
  const dark: Record<string, string> = {};

  for (const [key, val] of Object.entries(raw.light)) {
    if (typeof val !== "string" || !isValidHexForToken(key, val)) continue;
    if (Object.hasOwn(THEME_COLOR_TOKENS, key)) {
      light[key] = val.toLowerCase();
    }
  }

  for (const [key, val] of Object.entries(raw.dark)) {
    if (typeof val !== "string" || !isValidHexForToken(key, val)) continue;
    if (Object.hasOwn(THEME_COLOR_TOKENS, key)) {
      dark[key] = val.toLowerCase();
    }
  }

  return {
    version: CUSTOM_THEME_VERSION,
    light,
    dark,
  };
}

export function serializeCustomTheme(theme: CustomThemeConfig | undefined | null): string {
  if (!theme) {
    return "";
  }
  return JSON.stringify(theme);
}

export function parseCustomTheme(raw: string | null | undefined): CustomThemeConfig | undefined {
  if (!raw) return undefined;
  const parsed = parseJSON(raw);
  return validateAndSanitizeCustomTheme(parsed);
}

export type StrictValidationResult =
  | { ok: true; payload: ThemeExportPayload }
  | { ok: false; error: string };

const KNOWN_TOP_LEVEL_KEYS = new Set(["version", "preset", "customTheme"]);
const KNOWN_CUSTOM_THEME_KEYS = new Set(["version", "light", "dark"]);

/**
 * Strict validator for imported JSON. Rejects unknown tokens, unknown fields,
 * oversized payloads (16 KiB UTF-8), and disallowed alpha.
 */
export function validateStrictThemeImport(raw: string): StrictValidationResult {
  const byteLength = new TextEncoder().encode(raw).length;
  if (byteLength > MAX_APPEARANCE_PREFERENCES_BYTES) {
    return { ok: false, error: "Payload exceeds 16 KiB limit" };
  }

  const parsed = parseJSON(raw);
  if (!isRecord(parsed)) {
    return { ok: false, error: "Invalid JSON format" };
  }

  for (const key of Object.keys(parsed)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      return { ok: false, error: `Unknown top-level attribute: ${key}` };
    }
  }

  if (parsed.version !== CUSTOM_THEME_VERSION) {
    return { ok: false, error: `Unsupported version: ${String(parsed.version)}` };
  }

  let preset: ThemePreset | undefined;
  if (parsed.preset !== undefined) {
    if (isThemePreset(parsed.preset)) {
      preset = parsed.preset;
    } else {
      return { ok: false, error: `Unknown theme preset: ${String(parsed.preset)}` };
    }
  }

  const themeObj = isRecord(parsed.customTheme) ? parsed.customTheme : parsed;
  for (const key of Object.keys(themeObj)) {
    if (themeObj !== parsed && !KNOWN_CUSTOM_THEME_KEYS.has(key)) {
      return { ok: false, error: `Unknown customTheme attribute: ${key}` };
    }
  }

  if (themeObj.version !== CUSTOM_THEME_VERSION) {
    return { ok: false, error: "Invalid customTheme version" };
  }

  if (!isRecord(themeObj.light) || !isRecord(themeObj.dark)) {
    return { ok: false, error: "customTheme must contain light and dark objects" };
  }

  const light: Record<string, string> = {};
  const dark: Record<string, string> = {};

  for (const [key, val] of Object.entries(themeObj.light)) {
    if (!Object.hasOwn(THEME_COLOR_TOKENS, key)) {
      return { ok: false, error: `Unknown color token in light: ${key}` };
    }
    if (typeof val !== "string" || !isValidHexColor(val)) {
      return { ok: false, error: `Invalid HEX color for token "${key}": ${String(val)}` };
    }
    const meta = THEME_COLOR_TOKENS[key];
    if (!meta.allowAlpha && val.length !== 7) {
      return { ok: false, error: `Token "${key}" does not allow opacity` };
    }
    light[key] = val.toLowerCase();
  }

  for (const [key, val] of Object.entries(themeObj.dark)) {
    if (!Object.hasOwn(THEME_COLOR_TOKENS, key)) {
      return { ok: false, error: `Unknown color token in dark: ${key}` };
    }
    if (typeof val !== "string" || !isValidHexColor(val)) {
      return { ok: false, error: `Invalid HEX color for token "${key}": ${String(val)}` };
    }
    const meta = THEME_COLOR_TOKENS[key];
    if (!meta.allowAlpha && val.length !== 7) {
      return { ok: false, error: `Token "${key}" does not allow opacity` };
    }
    dark[key] = val.toLowerCase();
  }

  return {
    ok: true,
    payload: {
      version: CUSTOM_THEME_VERSION,
      preset,
      customTheme: {
        version: CUSTOM_THEME_VERSION,
        light,
        dark,
      },
    },
  };
}

export function parseThemeExportPayload(raw: string): ThemeExportPayload | null {
  const result = validateStrictThemeImport(raw);
  if (!result.ok) {
    return null;
  }
  return result.payload;
}
