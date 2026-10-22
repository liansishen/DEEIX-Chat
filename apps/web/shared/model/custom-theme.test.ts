import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  CUSTOM_THEME_VERSION,
  MAX_APPEARANCE_PREFERENCES_BYTES,
  isValidHexColor,
  isValidHexForToken,
  parseCustomTheme,
  parseThemeExportPayload,
  serializeCustomTheme,
  validateAndSanitizeCustomTheme,
  validateStrictThemeImport,
} from "./custom-theme";
import { THEME_COLOR_TOKENS, THEME_PRESET_ITEMS, THEME_TOKEN_KEYS } from "./theme-presets";
import { THEME_PRESETS } from "./theme";

describe("Theme tokens registry", () => {
  test("token keys are unique and non-empty (71 tokens)", () => {
    assert.equal(THEME_TOKEN_KEYS.length, 71);
    const set = new Set(THEME_TOKEN_KEYS);
    assert.equal(set.size, THEME_TOKEN_KEYS.length);
  });

  test("each token has valid group metadata", () => {
    const validGroups = new Set([
      "surface",
      "interactive",
      "sidebar",
      "chat",
      "controls",
      "content",
      "status",
    ]);
    for (const key of THEME_TOKEN_KEYS) {
      const meta = THEME_COLOR_TOKENS[key];
      assert.ok(meta, `Token ${key} should have metadata`);
      assert.ok(validGroups.has(meta.group), `Token ${key} has invalid group ${meta.group}`);
      assert.equal(typeof meta.allowAlpha, "boolean");
    }
  });

  test("Claude preset is registered in THEME_PRESETS and items", () => {
    assert.ok(THEME_PRESETS.includes("claude"));
    const claudeItem = THEME_PRESET_ITEMS.find((item) => item.value === "claude");
    assert.ok(claudeItem, "Claude preset item should exist");
    assert.ok(claudeItem.light.background.startsWith("#"));
    assert.ok(claudeItem.dark.background.startsWith("#"));
  });
});

describe("HEX color validator", () => {
  test("accepts valid 6-digit and 8-digit hex colors", () => {
    assert.equal(isValidHexColor("#ffffff"), true);
    assert.equal(isValidHexColor("#000000"), true);
    assert.equal(isValidHexColor("#fbf9f5"), true);
    assert.equal(isValidHexColor("#fbf9f580"), true);
    assert.equal(isValidHexColor("#123456aa"), true);
  });

  test("rejects invalid colors, non-hex, injections and functions", () => {
    assert.equal(isValidHexColor("red"), false);
    assert.equal(isValidHexColor("#fff"), false);
    assert.equal(isValidHexColor("rgb(0,0,0)"), false);
    assert.equal(isValidHexColor("var(--bg)"), false);
    assert.equal(isValidHexColor("javascript:alert(1)"), false);
    assert.equal(isValidHexColor("#gggggg"), false);
    assert.equal(isValidHexColor("#12345"), false);
    assert.equal(isValidHexColor("#1234567"), false);
    assert.equal(isValidHexColor("#123456789"), false);
  });

  test("enforces allowAlpha constraint per token", () => {
    assert.equal(isValidHexForToken("foreground", "#1f1e1d"), true);
    assert.equal(isValidHexForToken("foreground", "#1f1e1d80"), false); // foreground doesn't allow alpha
    assert.equal(isValidHexForToken("background", "#ffffff80"), true); // background allows alpha
  });
});

describe("Custom theme sanitization", () => {
  test("validates and keeps only whitelisted tokens with valid hex", () => {
    const raw = {
      version: 1,
      light: {
        background: "#FFFFFF",
        "chat-user-background": "#F0E8DC",
        unknownToken: "#123456",
        invalidHex: "not-a-hex",
      },
      dark: {
        background: "#000000",
        "chat-user-background": "#332E2B",
      },
    };

    const sanitized = validateAndSanitizeCustomTheme(raw);
    assert.ok(sanitized);
    assert.equal(sanitized.version, CUSTOM_THEME_VERSION);
    assert.equal(sanitized.light.background, "#ffffff");
    assert.equal(sanitized.light["chat-user-background"], "#f0e8dc");
    assert.equal(sanitized.light.unknownToken, undefined);
    assert.equal(sanitized.light.invalidHex, undefined);
    assert.equal(sanitized.dark.background, "#000000");
    assert.equal(sanitized.dark["chat-user-background"], "#332e2b");
  });

  test("rejects invalid version and non-object configs", () => {
    assert.equal(validateAndSanitizeCustomTheme(null), undefined);
    assert.equal(validateAndSanitizeCustomTheme("string"), undefined);
    assert.equal(validateAndSanitizeCustomTheme({ version: 2, light: {}, dark: {} }), undefined);
  });

  test("round-trips through serialize and parse", () => {
    const config = {
      version: 1 as const,
      light: { background: "#ffffff" },
      dark: { background: "#000000" },
    };

    const serialized = serializeCustomTheme(config);
    const parsed = parseCustomTheme(serialized);
    assert.deepEqual(parsed, config);
  });
});

describe("Theme import / export payload (strict)", () => {
  test("parses valid export format with preset and customTheme", () => {
    const payload = JSON.stringify({
      version: 1,
      preset: "claude",
      customTheme: {
        version: 1,
        light: { background: "#fbf9f5" },
        dark: { background: "#1b1918" },
      },
    });

    const parsed = parseThemeExportPayload(payload);
    assert.ok(parsed);
    assert.equal(parsed.preset, "claude");
    assert.equal(parsed.customTheme.light.background, "#fbf9f5");
  });

  test("supports preset + empty customTheme roundtrip", () => {
    const payload = JSON.stringify({
      version: 1,
      preset: "azure",
      customTheme: {
        version: 1,
        light: {},
        dark: {},
      },
    });

    const result = validateStrictThemeImport(payload);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.payload.preset, "azure");
      assert.deepEqual(result.payload.customTheme.light, {});
      assert.deepEqual(result.payload.customTheme.dark, {});
    }
  });

  test("rejects unknown color tokens in import", () => {
    const invalidToken = JSON.stringify({
      version: 1,
      customTheme: {
        version: 1,
        light: { "my-custom-color": "#123456" },
        dark: {},
      },
    });

    const result = validateStrictThemeImport(invalidToken);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.includes("Unknown color token"));
    }
  });

  test("rejects unknown extra top-level fields", () => {
    const extraFields = JSON.stringify({
      version: 1,
      preset: "sepia",
      customTheme: {
        version: 1,
        light: {},
        dark: {},
      },
      maliciousField: "injection",
    });

    const result = validateStrictThemeImport(extraFields);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.includes("Unknown top-level attribute"));
    }
  });

  test("rejects alpha opacity for tokens where allowAlpha is false", () => {
    const disallowedAlpha = JSON.stringify({
      version: 1,
      customTheme: {
        version: 1,
        light: { foreground: "#11223380" },
        dark: {},
      },
    });

    const result = validateStrictThemeImport(disallowedAlpha);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.includes("does not allow opacity"));
    }
  });

  test("rejects payload exceeding UTF-8 byte limit", () => {
    const oversized = JSON.stringify({
      version: 1,
      customTheme: {
        version: 1,
        light: { background: "#ffffff" },
        dark: { background: "#000000" },
      },
      filler: "x".repeat(MAX_APPEARANCE_PREFERENCES_BYTES + 10),
    });

    assert.equal(parseThemeExportPayload(oversized), null);
  });
});
