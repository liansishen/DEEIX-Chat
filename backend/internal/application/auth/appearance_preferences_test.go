package auth

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestNormalizeAppearancePreferencesCustomTheme(t *testing.T) {
	raw := `{"preset":"claude","fontSize":"large","customTheme":{"version":1,"light":{"background":"#AABBCC"},"dark":{"background":"#10203080"}}}`
	normalized, err := normalizeAppearancePreferences(raw)
	if err != nil {
		t.Fatal(err)
	}
	var result struct {
		Preset      string                 `json:"preset"`
		FontSize    string                 `json:"fontSize"`
		CustomTheme customThemePreferences `json:"customTheme"`
	}
	if err := json.Unmarshal([]byte(normalized), &result); err != nil {
		t.Fatal(err)
	}
	if result.Preset != "claude" || result.FontSize != "large" || result.CustomTheme.Light["background"] != "#aabbcc" || result.CustomTheme.Dark["background"] != "#10203080" {
		t.Fatalf("unexpected appearance: %s", normalized)
	}
}

func TestNormalizeAppearancePreferencesRejectsInvalidTheme(t *testing.T) {
	for name, theme := range map[string]string{
		"version":      `{"version":2,"light":{},"dark":{}}`,
		"unknown key":  `{"version":1,"light":{"not-a-theme-color":"#123456"},"dark":{}}`,
		"CSS value":    `{"version":1,"light":{"background":"url(https://example.com)"},"dark":{}}`,
		"short hex":    `{"version":1,"light":{"background":"#abc"},"dark":{}}`,
		"extra field":  `{"version":1,"light":{},"dark":{},"css":"body{}"}`,
		"missing mode": `{"version":1,"light":{}}`,
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := normalizeAppearancePreferences(`{"customTheme":` + theme + `}`); err != ErrInvalidAppearancePreferences {
				t.Fatalf("error = %v, want invalid appearance", err)
			}
		})
	}
	raw := strings.Repeat(" ", maxAppearancePreferencesBytes) + `{"preset":"default"}`
	if _, err := normalizeAppearancePreferences(raw); err != ErrInvalidAppearancePreferences {
		t.Fatalf("oversized appearance error = %v", err)
	}
}

func TestNormalizeAppearancePreferencesFullTheme(t *testing.T) {
	colors := make(map[string]string, len(appearanceColorTokens))
	for key := range appearanceColorTokens {
		colors[key] = "#12345678"
	}
	raw, err := json.Marshal(map[string]any{
		"preset": "claude", "chatFont": "default", "chatFontWeight": "regular", "fontSize": "standard",
		"customTheme": customThemePreferences{Version: 1, Light: colors, Dark: colors},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := normalizeAppearancePreferences(string(raw)); err != nil {
		t.Fatalf("full theme (%d bytes): %v", len(raw), err)
	}
}

func TestAppearanceColorTokensMatchFrontend(t *testing.T) {
	raw, err := os.ReadFile("../../../../apps/web/shared/model/theme-color-tokens.json")
	if err != nil {
		t.Fatal(err)
	}
	var frontend map[string]json.RawMessage
	if err := json.Unmarshal(raw, &frontend); err != nil {
		t.Fatal(err)
	}
	if len(frontend) != len(appearanceColorTokens) {
		t.Fatalf("frontend has %d tokens, backend has %d", len(frontend), len(appearanceColorTokens))
	}
	for key := range frontend {
		if _, ok := appearanceColorTokens[key]; !ok {
			t.Errorf("frontend color %q is missing from backend", key)
		}
	}
}
