package billing

import (
	"context"
	"testing"
	"time"

	model "github.com/DEEIX-AI/DEEIX-Chat/backend/internal/infra/persistence/models"
	persistencebilling "github.com/DEEIX-AI/DEEIX-Chat/backend/internal/infra/persistence/postgres/billing"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestAuthorizeUsageWeeklyCapsLegacyPrepaidBudgetToAvailableQuota(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:weekly_authorization_budget?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("resolve sqlite database: %v", err)
	}
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })

	if err = db.AutoMigrate(
		&model.SystemSetting{},
		&model.ModelPricing{},
		&model.BillingPlan{},
		&model.Subscription{},
		&model.UsageReservation{},
		&model.BalanceTransaction{},
		&model.BillingQuotaSchedule{},
		&model.BillingQuotaCycle{},
		&model.BillingWeeklyQuotaAccount{},
	); err != nil {
		t.Fatalf("migrate billing tables: %v", err)
	}

	now := time.Now().UTC()
	endAt := now.AddDate(0, 1, 0)
	plan := model.BillingPlan{
		Code:                "weekly-integration",
		Name:                "Weekly Integration",
		WeeklyCreditNanousd: 5_000_000_000,
		IsActive:            true,
	}
	if err = db.Create(&plan).Error; err != nil {
		t.Fatalf("create weekly plan: %v", err)
	}
	fixtures := []any{
		&model.SystemSetting{Namespace: "billing", Key: "mode", Value: "weekly", ValueType: "string"},
		&model.SystemSetting{Namespace: "billing", Key: "prepaid_amount_usd", Value: "10", ValueType: "string"},
		&model.ModelPricing{PlatformModelName: "gpt-weekly-integration", Currency: "USD", InputNanousdPerMTokens: 1, OutputNanousdPerMTokens: 1},
		&model.Subscription{UserID: 1, PlanID: plan.ID, Status: "active", StartAt: now.Add(-time.Hour), CurrentPeriodStartAt: now.Add(-time.Hour), CurrentPeriodEndAt: &endAt},
	}
	for _, fixture := range fixtures {
		if err = db.Create(fixture).Error; err != nil {
			t.Fatalf("create billing fixture %T: %v", fixture, err)
		}
	}

	service := NewService(persistencebilling.NewRepo(db))
	first, err := service.AuthorizeUsage(context.Background(), 1, "gpt-weekly-integration", "weekly_full_allowance")
	if err != nil {
		t.Fatalf("AuthorizeUsage(full allowance) error = %v", err)
	}
	if first == nil || first.Reservation == nil || first.Reservation.WeeklyCreditNanousd != 5_000_000_000 {
		t.Fatalf("full allowance authorization = %+v, want 5000000000", first)
	}
	if err = service.ReleaseUsageAuthorization(context.Background(), first); err != nil {
		t.Fatalf("release full allowance authorization: %v", err)
	}

	if err = db.Model(&model.BillingWeeklyQuotaAccount{}).
		Where("cycle_id = ? AND user_id = ?", first.Reservation.WeeklyCycleID, 1).
		Update("used_nanousd", int64(4_500_000_000)).Error; err != nil {
		t.Fatalf("set consumed weekly quota: %v", err)
	}
	remaining, err := service.AuthorizeUsage(context.Background(), 1, "gpt-weekly-integration", "weekly_remaining_allowance")
	if err != nil {
		t.Fatalf("AuthorizeUsage(remaining allowance) error = %v", err)
	}
	if remaining == nil || remaining.Reservation == nil || remaining.Reservation.WeeklyCreditNanousd != 500_000_000 {
		t.Fatalf("remaining allowance authorization = %+v, want 500000000", remaining)
	}
}
