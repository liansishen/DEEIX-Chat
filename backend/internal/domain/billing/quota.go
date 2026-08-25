package billing

import (
	"errors"
	"strings"
	"time"
)

const (
	// WeeklyQuotaCycleDuration 是统一周额度周期的固定长度。
	WeeklyQuotaCycleDuration = 7 * 24 * time.Hour

	// WeeklyQuotaResetReasonInitial 表示首次初始化统一周周期。
	WeeklyQuotaResetReasonInitial = "initial"
	// WeeklyQuotaResetReasonAutomatic 表示按固定七天间隔自动推进。
	WeeklyQuotaResetReasonAutomatic = "automatic"
	// WeeklyQuotaResetReasonManual 表示管理员立即重置。
	WeeklyQuotaResetReasonManual = "manual"
)

// ErrInvalidRedemptionDuration 表示兑换码订阅期限无法解析。
var ErrInvalidRedemptionDuration = errors.New("invalid redemption duration")

// WeeklyQuotaCycle 表示所有用户共享的周额度周期。
type WeeklyQuotaCycle struct {
	ID            uint
	StartAt       time.Time
	EndAt         time.Time
	ResetReason   string
	ResetByUserID uint
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

// WeeklyQuotaAccount 表示用户在指定统一周周期内的独立额度计数。
type WeeklyQuotaAccount struct {
	ID              uint
	CycleID         uint
	UserID          uint
	UsedNanousd     int64
	ReservedNanousd int64
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// ResolveRedemptionEnd 解析自然月期限，并兼容旧版固定天数兑换码。
func ResolveRedemptionEnd(start time.Time, unit string, count int, legacyDays int) (time.Time, error) {
	if start.IsZero() {
		return time.Time{}, ErrInvalidRedemptionDuration
	}
	switch strings.TrimSpace(unit) {
	case RedemptionDurationUnitMonth:
		if count <= 0 {
			return time.Time{}, ErrInvalidRedemptionDuration
		}
		end := addCalendarMonthsClamped(start, count)
		if !end.After(start) {
			return time.Time{}, ErrInvalidRedemptionDuration
		}
		return end, nil
	case "":
		if legacyDays <= 0 {
			return time.Time{}, ErrInvalidRedemptionDuration
		}
		end := start.Add(time.Duration(legacyDays) * 24 * time.Hour)
		if !end.After(start) {
			return time.Time{}, ErrInvalidRedemptionDuration
		}
		return end, nil
	default:
		return time.Time{}, ErrInvalidRedemptionDuration
	}
}

func addCalendarMonthsClamped(start time.Time, months int) time.Time {
	year, month, day := start.Date()
	targetMonth := time.Date(year, month+time.Month(months), 1, start.Hour(), start.Minute(), start.Second(), start.Nanosecond(), start.Location())
	lastDay := targetMonth.AddDate(0, 1, -1).Day()
	if day > lastDay {
		day = lastDay
	}
	return time.Date(targetMonth.Year(), targetMonth.Month(), day, start.Hour(), start.Minute(), start.Second(), start.Nanosecond(), start.Location())
}
