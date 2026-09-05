package billing

import (
	"context"
	"errors"
	"time"

	domainbilling "github.com/DEEIX-AI/DEEIX-Chat/backend/internal/domain/billing"
	models "github.com/DEEIX-AI/DEEIX-Chat/backend/internal/infra/persistence/models"
	"github.com/DEEIX-AI/DEEIX-Chat/backend/internal/repository"
	"gorm.io/gorm"
)

func (r *Repo) reserveWeeklyUsage(ctx context.Context, input domainbilling.UsageBalanceReservationRequest) (*domainbilling.UsageBalanceReservation, error) {
	now := input.AuthorizedAt
	if now.IsZero() {
		now = time.Now().UTC()
	} else {
		now = now.UTC()
	}
	var result *domainbilling.UsageBalanceReservation
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		cycle, _, err := ensureWeeklyQuotaCycleForUpdate(tx, now, time.Time{})
		if err != nil {
			return err
		}
		var existing models.UsageReservation
		err = tx.Where("user_id = ? AND ref_no = ?", input.UserID, input.RefNo).First(&existing).Error
		if err == nil {
			return repository.ErrConflict
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return translateError(err)
		}
		var legacyReservationCount int64
		if err = tx.Model(&models.BalanceTransaction{}).
			Where(
				"user_id = ? AND ref_no = ? AND type IN ?",
				input.UserID,
				input.RefNo,
				[]string{
					domainbilling.BalanceTransactionTypeUsageReserve,
					domainbilling.BalanceTransactionTypeUsageRefund,
				},
			).
			Count(&legacyReservationCount).Error; err != nil {
			return translateError(err)
		}
		if legacyReservationCount > 0 {
			return repository.ErrConflict
		}
		activeReservationCount, err := countActiveUsageReservations(tx, input.UserID, now)
		if err != nil {
			return err
		}
		if activeReservationCount >= domainbilling.UsageReservationMaxActivePerUser {
			return repository.ErrUsageReservationLimitExceeded
		}
		account, err := getOrCreateWeeklyQuotaAccountForUpdate(tx, cycle.ID, input.UserID)
		if err != nil {
			return err
		}
		reservedNanousd, err := sumWeeklyQuotaReservedNanousd(tx, cycle.ID, input.UserID, now)
		if err != nil {
			return err
		}
		if err := tx.Model(account).Update("reserved_nanousd", reservedNanousd).Error; err != nil {
			return translateError(err)
		}
		account.ReservedNanousd = reservedNanousd
		availableNanousd := remainingNonNegativeBudget(input.WeeklyCreditNanousd, account.UsedNanousd, account.ReservedNanousd)
		requestedNanousd := input.RequestedNanousd
		if requestedNanousd <= 0 {
			remainingSlots := int64(domainbilling.UsageReservationMaxActivePerUser) - activeReservationCount
			requestedNanousd = divideBudgetAcrossSlots(availableNanousd, remainingSlots)
		} else if requestedNanousd > availableNanousd {
			requestedNanousd = availableNanousd
		}
		if requestedNanousd <= 0 {
			return repository.ErrWeeklyQuotaExceeded
		}
		reservation := models.UsageReservation{
			UserID:              input.UserID,
			RefNo:               input.RefNo,
			Mode:                "weekly",
			WeeklyCycleID:       cycle.ID,
			WeeklyCreditNanousd: requestedNanousd,
			WeeklyLimitNanousd:  input.WeeklyCreditNanousd,
			Status:              domainbilling.UsageReservationStatusActive,
			ExpiresAt:           now.Add(usageReservationTTL),
		}
		if err := tx.Create(&reservation).Error; err != nil {
			if translated := translateError(err); errors.Is(translated, repository.ErrDuplicate) {
				return repository.ErrConflict
			}
			return translateError(err)
		}
		if err := tx.Model(account).Update("reserved_nanousd", addNonNegativeInt64(reservedNanousd, requestedNanousd)).Error; err != nil {
			return translateError(err)
		}
		domain := toDomainUsageReservation(reservation)
		result = &domain
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// AddWeeklyUsageAndSettleQuota records authoritative cost without charging the balance.
func (r *Repo) AddWeeklyUsageAndSettleQuota(ctx context.Context, usage *domainbilling.UsageLedger, reservation *domainbilling.UsageBalanceReservation) error {
	if usage == nil {
		return nil
	}
	if usage.UserID == 0 || usage.BillingAt.IsZero() || usage.UsageDate.IsZero() {
		return repository.ErrInvalidInput
	}
	chargeNanousd := clampNonNegative(usage.BilledNanousd)
	if usage.IsFreeModel {
		chargeNanousd = 0
		usage.BilledNanousd = 0
		usage.BalanceAfterNanousd = nil
	}
	settledSnapshotJSON := ""
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		reservationRow, alreadySettled, err := getUsageReservationForSettlement(tx, usage.UserID, reservation)
		if err != nil {
			return err
		}
		if reservationRow != nil && reservationRow.Mode != "weekly" {
			return repository.ErrConflict
		}
		if alreadySettled {
			if err := restoreSettledUsageLedger(tx, reservationRow.UsageLedgerID, usage); err != nil {
				if !errors.Is(err, repository.ErrNotFound) {
					return err
				}
				usage.BilledNanousd = reservationRow.SettledNanousd
				usage.BalanceAfterNanousd = nil
			}
			settledSnapshotJSON = usage.PricingSnapshotJSON
			return nil
		}
		if !usage.IsFreeModel && reservationRow == nil {
			return repository.ErrConflict
		}
		if reservationRow == nil {
			record := toModelUsageLedger(usage)
			return translateError(tx.Create(&record).Error)
		}
		if reservationRow.WeeklyCycleID == 0 || reservationRow.WeeklyLimitNanousd <= 0 {
			return repository.ErrConflict
		}
		completionCycle, err := weeklyQuotaCycleForTimestamp(tx, usage.BillingAt.UTC())
		if err != nil {
			return err
		}
		originCycleID := reservationRow.WeeklyCycleID
		originAccount, completionAccount, err := lockWeeklySettlementAccounts(tx, originCycleID, completionCycle.ID, usage.UserID)
		if err != nil {
			return err
		}
		usedBeforeNanousd := completionAccount.UsedNanousd
		usedAfterNanousd := addNonNegativeInt64(usedBeforeNanousd, chargeNanousd)
		overageNanousd := int64(0)
		if usedAfterNanousd > reservationRow.WeeklyLimitNanousd {
			overageNanousd = usedAfterNanousd - reservationRow.WeeklyLimitNanousd
		}
		ledger := *usage
		ledger.BalanceAfterNanousd = nil
		ledger.PricingSnapshotJSON = withPeriodSettlementSnapshot(ledger.PricingSnapshotJSON, map[string]any{
			"weekly_origin_cycle_id":           originCycleID,
			"weekly_settlement_cycle_id":       completionCycle.ID,
			"weekly_limit_nanousd":             reservationRow.WeeklyLimitNanousd,
			"weekly_reserved_nanousd":          reservationRow.WeeklyCreditNanousd,
			"weekly_used_before_nanousd":       usedBeforeNanousd,
			"weekly_used_after_nanousd":        usedAfterNanousd,
			"weekly_charged_nanousd":           chargeNanousd,
			"weekly_overage_uncharged_nanousd": overageNanousd,
			"weekly_balance_charged_nanousd":   0,
		})
		record := toModelUsageLedger(&ledger)
		if err := tx.Create(&record).Error; err != nil {
			return translateError(err)
		}
		if err := tx.Model(completionAccount).Update("used_nanousd", usedAfterNanousd).Error; err != nil {
			return translateError(err)
		}
		if err := settleWeeklyUsageReservation(tx, reservationRow, record.ID, chargeNanousd, completionCycle.ID); err != nil {
			return err
		}
		if err := syncWeeklyQuotaReservedNanousd(tx, originAccount.CycleID, usage.UserID, time.Now().UTC()); err != nil {
			return err
		}
		settledSnapshotJSON = ledger.PricingSnapshotJSON
		return nil
	})
	if err != nil {
		return err
	}
	if settledSnapshotJSON != "" {
		usage.PricingSnapshotJSON = settledSnapshotJSON
	}
	return nil
}

func settleWeeklyUsageReservation(tx *gorm.DB, reservation *models.UsageReservation, usageLedgerID uint, settledNanousd int64, cycleID uint) error {
	if reservation == nil || usageLedgerID == 0 || cycleID == 0 {
		return repository.ErrInvalidInput
	}
	settledAt := time.Now().UTC()
	return translateError(tx.Model(reservation).Updates(map[string]any{
		"status":                  domainbilling.UsageReservationStatusSettled,
		"usage_ledger_id":         usageLedgerID,
		"settled_nanousd":         settledNanousd,
		"settled_weekly_cycle_id": cycleID,
		"settled_at":              settledAt,
	}).Error)
}

func weeklyQuotaCycleForTimestamp(tx *gorm.DB, at time.Time) (*models.BillingQuotaCycle, error) {
	if at.IsZero() {
		return nil, repository.ErrInvalidInput
	}
	if _, _, err := ensureWeeklyQuotaCycleForUpdate(tx, at.UTC(), time.Time{}); err != nil {
		return nil, err
	}
	var cycle models.BillingQuotaCycle
	if err := tx.Where("start_at <= ? AND end_at > ?", at.UTC(), at.UTC()).Order("start_at DESC, id DESC").First(&cycle).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, repository.ErrConflict
		}
		return nil, translateError(err)
	}
	return &cycle, nil
}

func lockWeeklySettlementAccounts(tx *gorm.DB, originCycleID uint, completionCycleID uint, userID uint) (*models.BillingWeeklyQuotaAccount, *models.BillingWeeklyQuotaAccount, error) {
	if originCycleID == 0 || completionCycleID == 0 || userID == 0 {
		return nil, nil, repository.ErrInvalidInput
	}
	if originCycleID == completionCycleID {
		account, err := getOrCreateWeeklyQuotaAccountForUpdate(tx, originCycleID, userID)
		return account, account, err
	}
	firstCycleID := originCycleID
	secondCycleID := completionCycleID
	if secondCycleID < firstCycleID {
		firstCycleID, secondCycleID = secondCycleID, firstCycleID
	}
	first, err := getOrCreateWeeklyQuotaAccountForUpdate(tx, firstCycleID, userID)
	if err != nil {
		return nil, nil, err
	}
	second, err := getOrCreateWeeklyQuotaAccountForUpdate(tx, secondCycleID, userID)
	if err != nil {
		return nil, nil, err
	}
	if originCycleID == firstCycleID {
		return first, second, nil
	}
	return second, first, nil
}

func sumWeeklyQuotaReservedNanousd(tx *gorm.DB, cycleID uint, userID uint, now time.Time) (int64, error) {
	if cycleID == 0 || userID == 0 {
		return 0, repository.ErrInvalidInput
	}
	var result int64
	err := tx.Model(&models.UsageReservation{}).
		Select("COALESCE(SUM(weekly_credit_nanousd), 0)").
		Where(
			"weekly_cycle_id = ? AND user_id = ? AND ((status = ? AND expires_at > ?) OR status = ?)",
			cycleID,
			userID,
			domainbilling.UsageReservationStatusActive,
			now.UTC(),
			domainbilling.UsageReservationStatusReconciliation,
		).
		Scan(&result).Error
	return result, translateError(err)
}

func syncWeeklyQuotaReservedNanousd(tx *gorm.DB, cycleID uint, userID uint, now time.Time) error {
	account, err := getOrCreateWeeklyQuotaAccountForUpdate(tx, cycleID, userID)
	if err != nil {
		return err
	}
	reservedNanousd, err := sumWeeklyQuotaReservedNanousd(tx, cycleID, userID, now)
	if err != nil {
		return err
	}
	return translateError(tx.Model(account).Update("reserved_nanousd", reservedNanousd).Error)
}
