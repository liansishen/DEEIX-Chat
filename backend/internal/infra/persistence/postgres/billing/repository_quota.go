package billing

import (
	"context"
	"errors"
	"time"

	domainbilling "github.com/DEEIX-AI/DEEIX-Chat/backend/internal/domain/billing"
	models "github.com/DEEIX-AI/DEEIX-Chat/backend/internal/infra/persistence/models"
	"github.com/DEEIX-AI/DEEIX-Chat/backend/internal/repository"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const weeklyQuotaScheduleSingletonID uint = 1

// EnsureWeeklyQuotaCycle initializes or advances the shared quota cycle through now.
func (r *Repo) EnsureWeeklyQuotaCycle(ctx context.Context, now time.Time, initialResetAt time.Time) (*domainbilling.WeeklyQuotaCycle, error) {
	if now.IsZero() {
		return nil, repository.ErrInvalidInput
	}
	now = now.UTC()
	initialResetAt = initialResetAt.UTC()
	var result domainbilling.WeeklyQuotaCycle
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		cycle, _, err := ensureWeeklyQuotaCycleForUpdate(tx, now, initialResetAt)
		if err != nil {
			return err
		}
		result = toDomainWeeklyQuotaCycle(*cycle)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &result, nil
}

// SetWeeklyQuotaNextReset changes only the current boundary and preserves usage counters.
func (r *Repo) SetWeeklyQuotaNextReset(ctx context.Context, now time.Time, nextResetAt time.Time) (*domainbilling.WeeklyQuotaCycle, error) {
	if now.IsZero() || nextResetAt.IsZero() {
		return nil, repository.ErrInvalidInput
	}
	now = now.UTC()
	nextResetAt = nextResetAt.UTC()
	if !nextResetAt.After(now) {
		return nil, repository.ErrInvalidInput
	}
	var result domainbilling.WeeklyQuotaCycle
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		cycle, _, err := ensureWeeklyQuotaCycleForUpdate(tx, now, nextResetAt)
		if err != nil {
			return err
		}
		if cycle.EndAt.Equal(nextResetAt) {
			if err := tx.Model(&models.BillingQuotaSchedule{}).
				Where("id = ?", weeklyQuotaScheduleSingletonID).
				Update("next_reset_at", nextResetAt).Error; err != nil {
				return translateError(err)
			}
			result = toDomainWeeklyQuotaCycle(*cycle)
			return nil
		}
		if err := tx.Model(cycle).Update("end_at", nextResetAt).Error; err != nil {
			return translateError(err)
		}
		if err := tx.Model(&models.BillingQuotaSchedule{}).
			Where("id = ?", weeklyQuotaScheduleSingletonID).
			Update("next_reset_at", nextResetAt).Error; err != nil {
			return translateError(err)
		}
		cycle.EndAt = nextResetAt
		result = toDomainWeeklyQuotaCycle(*cycle)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &result, nil
}

// ResetWeeklyQuotaCycle closes the current cycle and starts a fresh seven-day cycle.
func (r *Repo) ResetWeeklyQuotaCycle(ctx context.Context, now time.Time, actorUserID uint) (*domainbilling.WeeklyQuotaCycle, error) {
	if now.IsZero() || actorUserID == 0 {
		return nil, repository.ErrInvalidInput
	}
	now = now.UTC()
	var result domainbilling.WeeklyQuotaCycle
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		cycle, initialized, err := ensureWeeklyQuotaCycleForUpdate(tx, now, now.Add(domainbilling.WeeklyQuotaCycleDuration))
		if err != nil {
			return err
		}
		if initialized || cycle.StartAt.Equal(now) {
			updates := map[string]any{
				"end_at":           now.Add(domainbilling.WeeklyQuotaCycleDuration),
				"reset_reason":     domainbilling.WeeklyQuotaResetReasonManual,
				"reset_by_user_id": actorUserID,
			}
			if err := tx.Model(cycle).Updates(updates).Error; err != nil {
				return translateError(err)
			}
			if err := tx.Model(&models.BillingQuotaSchedule{}).
				Where("id = ?", weeklyQuotaScheduleSingletonID).
				Update("next_reset_at", now.Add(domainbilling.WeeklyQuotaCycleDuration)).Error; err != nil {
				return translateError(err)
			}
			cycle.EndAt = now.Add(domainbilling.WeeklyQuotaCycleDuration)
			cycle.ResetReason = domainbilling.WeeklyQuotaResetReasonManual
			cycle.ResetByUserID = actorUserID
			result = toDomainWeeklyQuotaCycle(*cycle)
			return nil
		}
		if !now.After(cycle.StartAt) || !cycle.EndAt.After(now) {
			return repository.ErrConflict
		}
		if err := tx.Model(cycle).Update("end_at", now).Error; err != nil {
			return translateError(err)
		}
		next := models.BillingQuotaCycle{
			StartAt:       now,
			EndAt:         now.Add(domainbilling.WeeklyQuotaCycleDuration),
			ResetReason:   domainbilling.WeeklyQuotaResetReasonManual,
			ResetByUserID: actorUserID,
		}
		if err := tx.Create(&next).Error; err != nil {
			return translateError(err)
		}
		if err := setCurrentWeeklyQuotaCycle(tx, next.ID); err != nil {
			return err
		}
		if err := tx.Model(&models.BillingQuotaSchedule{}).
			Where("id = ?", weeklyQuotaScheduleSingletonID).
			Update("next_reset_at", next.EndAt).Error; err != nil {
			return translateError(err)
		}
		result = toDomainWeeklyQuotaCycle(next)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &result, nil
}

// GetOrCreateWeeklyQuotaAccount returns the durable user counter for one cycle.
func (r *Repo) GetOrCreateWeeklyQuotaAccount(ctx context.Context, cycleID uint, userID uint) (*domainbilling.WeeklyQuotaAccount, error) {
	if cycleID == 0 || userID == 0 {
		return nil, repository.ErrInvalidInput
	}
	var result domainbilling.WeeklyQuotaAccount
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		account, err := getOrCreateWeeklyQuotaAccountForUpdate(tx, cycleID, userID)
		if err != nil {
			return err
		}
		result = toDomainWeeklyQuotaAccount(*account)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &result, nil
}

func getOrCreateWeeklyQuotaAccountForUpdate(tx *gorm.DB, cycleID uint, userID uint) (*models.BillingWeeklyQuotaAccount, error) {
	if cycleID == 0 || userID == 0 {
		return nil, repository.ErrInvalidInput
	}
	var cycle models.BillingQuotaCycle
	if err := tx.Where("id = ?", cycleID).First(&cycle).Error; err != nil {
		return nil, translateError(err)
	}
	account := models.BillingWeeklyQuotaAccount{CycleID: cycleID, UserID: userID}
	if err := tx.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "cycle_id"}, {Name: "user_id"}},
		DoNothing: true,
	}).Create(&account).Error; err != nil {
		return nil, translateError(err)
	}
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("cycle_id = ? AND user_id = ?", cycleID, userID).
		First(&account).Error; err != nil {
		return nil, translateError(err)
	}
	return &account, nil
}

func ensureWeeklyQuotaCycleForUpdate(tx *gorm.DB, now time.Time, initialResetAt time.Time) (*models.BillingQuotaCycle, bool, error) {
	schedule, err := lockWeeklyQuotaSchedule(tx)
	if err != nil {
		return nil, false, err
	}
	if schedule.CurrentCycleID == 0 {
		configuredResetAt := initialResetAt
		if configuredResetAt.IsZero() && schedule.NextResetAt != nil {
			configuredResetAt = *schedule.NextResetAt
		}
		endAt, err := normalizeInitialWeeklyReset(now, configuredResetAt)
		if err != nil {
			return nil, false, err
		}
		cycle := models.BillingQuotaCycle{
			StartAt:     endAt.Add(-domainbilling.WeeklyQuotaCycleDuration),
			EndAt:       endAt,
			ResetReason: domainbilling.WeeklyQuotaResetReasonInitial,
		}
		if err := tx.Create(&cycle).Error; err != nil {
			return nil, false, translateError(err)
		}
		if err := setCurrentWeeklyQuotaCycle(tx, cycle.ID); err != nil {
			return nil, false, err
		}
		if err := tx.Model(schedule).Update("next_reset_at", cycle.EndAt).Error; err != nil {
			return nil, false, translateError(err)
		}
		return &cycle, true, nil
	}

	var current models.BillingQuotaCycle
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", schedule.CurrentCycleID).First(&current).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, false, repository.ErrConflict
		}
		return nil, false, translateError(err)
	}
	if !current.EndAt.After(current.StartAt) {
		return nil, false, repository.ErrConflict
	}
	for !now.Before(current.EndAt) {
		next := models.BillingQuotaCycle{
			StartAt:     current.EndAt.UTC(),
			EndAt:       current.EndAt.UTC().Add(domainbilling.WeeklyQuotaCycleDuration),
			ResetReason: domainbilling.WeeklyQuotaResetReasonAutomatic,
		}
		if err := tx.Create(&next).Error; err != nil {
			return nil, false, translateError(err)
		}
		current = next
	}
	if current.ID != schedule.CurrentCycleID {
		if err := setCurrentWeeklyQuotaCycle(tx, current.ID); err != nil {
			return nil, false, err
		}
		if err := tx.Model(schedule).Update("next_reset_at", current.EndAt).Error; err != nil {
			return nil, false, translateError(err)
		}
	}
	return &current, false, nil
}

func lockWeeklyQuotaSchedule(tx *gorm.DB) (*models.BillingQuotaSchedule, error) {
	schedule := models.BillingQuotaSchedule{}
	schedule.ID = weeklyQuotaScheduleSingletonID
	if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&schedule).Error; err != nil {
		return nil, translateError(err)
	}
	if err := tx.Model(&models.BillingQuotaSchedule{}).
		Where("id = ?", weeklyQuotaScheduleSingletonID).
		UpdateColumn("current_cycle_id", gorm.Expr("current_cycle_id")).Error; err != nil {
		return nil, translateError(err)
	}
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", weeklyQuotaScheduleSingletonID).First(&schedule).Error; err != nil {
		return nil, translateError(err)
	}
	return &schedule, nil
}

func setCurrentWeeklyQuotaCycle(tx *gorm.DB, cycleID uint) error {
	if cycleID == 0 {
		return repository.ErrInvalidInput
	}
	result := tx.Model(&models.BillingQuotaSchedule{}).
		Where("id = ?", weeklyQuotaScheduleSingletonID).
		Update("current_cycle_id", cycleID)
	if result.Error != nil {
		return translateError(result.Error)
	}
	if result.RowsAffected == 0 {
		return repository.ErrConflict
	}
	return nil
}

func normalizeInitialWeeklyReset(now time.Time, initialResetAt time.Time) (time.Time, error) {
	if initialResetAt.IsZero() {
		return now.Add(domainbilling.WeeklyQuotaCycleDuration), nil
	}
	endAt := initialResetAt.UTC()
	if endAt.After(now) {
		if endAt.Sub(now) > domainbilling.WeeklyQuotaCycleDuration {
			return time.Time{}, repository.ErrInvalidInput
		}
		return endAt, nil
	}
	elapsed := now.Sub(endAt)
	steps := elapsed/domainbilling.WeeklyQuotaCycleDuration + 1
	return endAt.Add(steps * domainbilling.WeeklyQuotaCycleDuration), nil
}

func toDomainWeeklyQuotaCycle(item models.BillingQuotaCycle) domainbilling.WeeklyQuotaCycle {
	return domainbilling.WeeklyQuotaCycle{
		ID:            item.ID,
		StartAt:       item.StartAt.UTC(),
		EndAt:         item.EndAt.UTC(),
		ResetReason:   item.ResetReason,
		ResetByUserID: item.ResetByUserID,
		CreatedAt:     item.CreatedAt,
		UpdatedAt:     item.UpdatedAt,
	}
}

func toDomainWeeklyQuotaAccount(item models.BillingWeeklyQuotaAccount) domainbilling.WeeklyQuotaAccount {
	return domainbilling.WeeklyQuotaAccount{
		ID:              item.ID,
		CycleID:         item.CycleID,
		UserID:          item.UserID,
		UsedNanousd:     item.UsedNanousd,
		ReservedNanousd: item.ReservedNanousd,
		CreatedAt:       item.CreatedAt,
		UpdatedAt:       item.UpdatedAt,
	}
}
