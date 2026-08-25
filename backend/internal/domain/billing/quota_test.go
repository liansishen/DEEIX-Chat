package billing

import (
	"errors"
	"testing"
	"time"
)

func TestResolveRedemptionEndClampsCalendarMonthEnd(t *testing.T) {
	tests := []struct {
		name  string
		start time.Time
		count int
		want  time.Time
	}{
		{
			name:  "common year February",
			start: time.Date(2026, time.January, 31, 8, 9, 10, 11, time.UTC),
			count: 1,
			want:  time.Date(2026, time.February, 28, 8, 9, 10, 11, time.UTC),
		},
		{
			name:  "leap year February",
			start: time.Date(2028, time.January, 31, 8, 9, 10, 11, time.UTC),
			count: 1,
			want:  time.Date(2028, time.February, 29, 8, 9, 10, 11, time.UTC),
		},
		{
			name:  "quarter",
			start: time.Date(2026, time.August, 31, 8, 9, 10, 11, time.UTC),
			count: 3,
			want:  time.Date(2026, time.November, 30, 8, 9, 10, 11, time.UTC),
		},
		{
			name:  "year",
			start: time.Date(2026, time.December, 31, 8, 9, 10, 11, time.UTC),
			count: 12,
			want:  time.Date(2027, time.December, 31, 8, 9, 10, 11, time.UTC),
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := ResolveRedemptionEnd(test.start, RedemptionDurationUnitMonth, test.count, 0)
			if err != nil {
				t.Fatalf("ResolveRedemptionEnd() error = %v", err)
			}
			if !got.Equal(test.want) {
				t.Fatalf("ResolveRedemptionEnd() = %s, want %s", got, test.want)
			}
		})
	}
}

func TestResolveRedemptionEndSupportsLegacyFixedDays(t *testing.T) {
	start := time.Date(2026, time.January, 31, 8, 0, 0, 0, time.UTC)
	got, err := ResolveRedemptionEnd(start, "", 0, 30)
	if err != nil {
		t.Fatalf("ResolveRedemptionEnd() error = %v", err)
	}
	want := start.Add(30 * 24 * time.Hour)
	if !got.Equal(want) {
		t.Fatalf("ResolveRedemptionEnd() = %s, want %s", got, want)
	}
}

func TestRedemptionCodeModesAvailableInWeeklyMode(t *testing.T) {
	if !RedemptionCodeModeAvailableInBillingMode(RedemptionCodeModeWeekly, RedemptionCodeModeWeekly) {
		t.Fatal("weekly redemption code should be available in weekly billing mode")
	}
	if RedemptionCodeModeAvailableInBillingMode(RedemptionCodeModeUsage, RedemptionCodeModeWeekly) {
		t.Fatal("usage redemption code should not be available in weekly billing mode")
	}
	modes := RedemptionCodeModesAvailableInBillingMode(RedemptionCodeModeWeekly)
	if len(modes) != 1 || modes[0] != RedemptionCodeModeWeekly {
		t.Fatalf("weekly redemption modes = %v, want [weekly]", modes)
	}
}

func TestResolveRedemptionEndRejectsInvalidDuration(t *testing.T) {
	_, err := ResolveRedemptionEnd(time.Now(), RedemptionDurationUnitMonth, 0, 0)
	if !errors.Is(err, ErrInvalidRedemptionDuration) {
		t.Fatalf("ResolveRedemptionEnd() error = %v, want ErrInvalidRedemptionDuration", err)
	}
}
