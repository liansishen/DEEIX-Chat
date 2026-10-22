package auth

import (
	"bytes"
	"encoding/json"
	"regexp"
	"slices"
	"strings"
)

const maxAppearancePreferencesBytes = 16384

var appearanceHexColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$`)

type customThemePreferences struct {
	Version int               `json:"version"`
	Light   map[string]string `json:"light"`
	Dark    map[string]string `json:"dark"`
}

func normalizeAppearancePreferences(raw string) (string, error) {
	if raw == "" {
		return "", nil
	}
	if len(raw) > maxAppearancePreferencesBytes {
		return "", ErrInvalidAppearancePreferences
	}
	var payload map[string]json.RawMessage
	if err := json.Unmarshal([]byte(raw), &payload); err != nil || payload == nil {
		return "", ErrInvalidAppearancePreferences
	}

	normalized := make(map[string]any, len(payload))
	for key, encoded := range payload {
		if key == "customTheme" {
			theme, err := normalizeCustomTheme(encoded)
			if err != nil {
				return "", err
			}
			normalized[key] = theme
			continue
		}
		var value string
		if err := json.Unmarshal(encoded, &value); err != nil {
			return "", ErrInvalidAppearancePreferences
		}
		switch key {
		case "preset":
			if !slices.Contains([]string{"default", "azure", "claude", "cobalt", "graphite", "lagoon", "ink", "ochre", "sepia"}, value) {
				return "", ErrInvalidAppearancePreferences
			}
		case "chatFont":
			if !slices.Contains([]string{"default", "songti", "heiti", "mono"}, value) {
				return "", ErrInvalidAppearancePreferences
			}
		case "chatFontWeight":
			if !slices.Contains([]string{"regular", "medium", "semibold", "bold"}, value) {
				return "", ErrInvalidAppearancePreferences
			}
		case "fontSize":
			if !slices.Contains([]string{"small", "standard", "medium", "large"}, value) {
				value = "standard"
			}
		default:
			return "", ErrInvalidAppearancePreferences
		}
		normalized[key] = value
	}

	next, err := json.Marshal(normalized)
	if err != nil {
		return "", err
	}
	return string(next), nil
}

func normalizeCustomTheme(raw json.RawMessage) (*customThemePreferences, error) {
	var theme customThemePreferences
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&theme); err != nil || theme.Version != 1 || theme.Light == nil || theme.Dark == nil {
		return nil, ErrInvalidAppearancePreferences
	}
	for _, colors := range []map[string]string{theme.Light, theme.Dark} {
		for key, value := range colors {
			if _, ok := appearanceColorTokens[key]; !ok || !appearanceHexColor.MatchString(value) {
				return nil, ErrInvalidAppearancePreferences
			}
			colors[key] = strings.ToLower(value)
		}
	}
	return &theme, nil
}
