package billing

import (
	"context"
	"strings"
	"testing"
	"time"

	domainbilling "github.com/DEEIX-AI/DEEIX-Chat/backend/internal/domain/billing"
	model "github.com/DEEIX-AI/DEEIX-Chat/backend/internal/infra/persistence/models"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type legacyRedemptionCodeDuration struct {
	model.BaseModel
	CodeHash     string
	Mode         string
	RewardType   string
	PlanID       uint
	DurationDays int
	PerUserLimit int
	Status       string
}

func (legacyRedemptionCodeDuration) TableName() string {
	return "billing_redemption_codes"
}

func TestEnsureWeeklyQuotaCycleAdvancesInFixedUTCIntervals(t *testing.T) {
	db := openWeeklyQuotaSQLiteTestDB(t)
	repo := NewRepo(db)
	ctx := context.Background()

	now := time.Date(2026, time.January, 1, 12, 0, 0, 0, time.FixedZone("UTC+8", 8*60*60))
	initialReset := time.Date(2026, time.January, 8, 4, 0, 0, 0, time.UTC)
	first, err := repo.EnsureWeeklyQuotaCycle(ctx, now, initialReset)
	if err != nil {
		t.Fatalf("EnsureWeeklyQuotaCycle(initial) error = %v", err)
	}
	if first.ResetReason != domainbilling.WeeklyQuotaResetReasonInitial || !first.EndAt.Equal(initialReset) {
		t.Fatalf("initial cycle = %+v", first)
	}
	if first.StartAt.Location() != time.UTC || first.EndAt.Location() != time.UTC {
		t.Fatalf("initial cycle locations = %v/%v, want UTC", first.StartAt.Location(), first.EndAt.Location())
	}

	advancedAt := initialReset.Add(2 * domainbilling.WeeklyQuotaCycleDuration)
	current, err := repo.EnsureWeeklyQuotaCycle(ctx, advancedAt, time.Time{})
	if err != nil {
		t.Fatalf("EnsureWeeklyQuotaCycle(advance) error = %v", err)
	}
	if current.ResetReason != domainbilling.WeeklyQuotaResetReasonAutomatic {
		t.Fatalf("advanced reset reason = %q, want automatic", current.ResetReason)
	}
	if !current.StartAt.Equal(advancedAt) || !current.EndAt.Equal(advancedAt.Add(domainbilling.WeeklyQuotaCycleDuration)) {
		t.Fatalf("advanced cycle = [%s,%s), want [%s,%s)", current.StartAt, current.EndAt, advancedAt, advancedAt.Add(domainbilling.WeeklyQuotaCycleDuration))
	}
	var cycleCount int64
	if err := db.Model(&model.BillingQuotaCycle{}).Count(&cycleCount).Error; err != nil {
		t.Fatalf("count cycles: %v", err)
	}
	if cycleCount != 4 {
		t.Fatalf("cycle count = %d, want 4", cycleCount)
	}
}

func TestSetWeeklyQuotaNextResetPreservesCycleAndUsage(t *testing.T) {
	db := openWeeklyQuotaSQLiteTestDB(t)
	repo := NewRepo(db)
	ctx := context.Background()
	now := time.Date(2026, time.March, 2, 9, 0, 0, 0, time.UTC)

	cycle, err := repo.EnsureWeeklyQuotaCycle(ctx, now, now.Add(domainbilling.WeeklyQuotaCycleDuration))
	if err != nil {
		t.Fatalf("EnsureWeeklyQuotaCycle() error = %v", err)
	}
	account, err := repo.GetOrCreateWeeklyQuotaAccount(ctx, cycle.ID, 7)
	if err != nil {
		t.Fatalf("GetOrCreateWeeklyQuotaAccount() error = %v", err)
	}
	if err := db.Model(&model.BillingWeeklyQuotaAccount{}).Where("id = ?", account.ID).
		Updates(map[string]interface{}{"used_nanousd": 125, "reserved_nanousd": 25}).Error; err != nil {
		t.Fatalf("update weekly account: %v", err)
	}

	nextReset := now.Add(48 * time.Hour)
	updated, err := repo.SetWeeklyQuotaNextReset(ctx, now.Add(time.Hour), nextReset)
	if err != nil {
		t.Fatalf("SetWeeklyQuotaNextReset() error = %v", err)
	}
	if updated.ID != cycle.ID || !updated.EndAt.Equal(nextReset) {
		t.Fatalf("updated cycle = %+v, want same ID %d and end %s", updated, cycle.ID, nextReset)
	}
	var persisted model.BillingWeeklyQuotaAccount
	if err := db.Where("id = ?", account.ID).First(&persisted).Error; err != nil {
		t.Fatalf("load weekly account: %v", err)
	}
	if persisted.UsedNanousd != 125 || persisted.ReservedNanousd != 25 {
		t.Fatalf("weekly account changed to used/reserved %d/%d", persisted.UsedNanousd, persisted.ReservedNanousd)
	}
}

func TestResetWeeklyQuotaCycleStartsFreshAccountGeneration(t *testing.T) {
	db := openWeeklyQuotaSQLiteTestDB(t)
	repo := NewRepo(db)
	ctx := context.Background()
	start := time.Date(2026, time.April, 10, 0, 0, 0, 0, time.UTC)

	previous, err := repo.EnsureWeeklyQuotaCycle(ctx, start, start.Add(domainbilling.WeeklyQuotaCycleDuration))
	if err != nil {
		t.Fatalf("EnsureWeeklyQuotaCycle() error = %v", err)
	}
	previousAccount, err := repo.GetOrCreateWeeklyQuotaAccount(ctx, previous.ID, 9)
	if err != nil {
		t.Fatalf("GetOrCreateWeeklyQuotaAccount(previous) error = %v", err)
	}
	if err := db.Model(&model.BillingWeeklyQuotaAccount{}).Where("id = ?", previousAccount.ID).Update("used_nanousd", 500).Error; err != nil {
		t.Fatalf("update previous account: %v", err)
	}

	resetAt := start.Add(36 * time.Hour)
	current, err := repo.ResetWeeklyQuotaCycle(ctx, resetAt, 42)
	if err != nil {
		t.Fatalf("ResetWeeklyQuotaCycle() error = %v", err)
	}
	if current.ID == previous.ID || current.ResetReason != domainbilling.WeeklyQuotaResetReasonManual || current.ResetByUserID != 42 {
		t.Fatalf("manual cycle = %+v", current)
	}
	if !current.StartAt.Equal(resetAt) || !current.EndAt.Equal(resetAt.Add(domainbilling.WeeklyQuotaCycleDuration)) {
		t.Fatalf("manual cycle bounds = [%s,%s)", current.StartAt, current.EndAt)
	}
	var closed model.BillingQuotaCycle
	if err := db.First(&closed, previous.ID).Error; err != nil {
		t.Fatalf("load closed cycle: %v", err)
	}
	if !closed.EndAt.Equal(resetAt) {
		t.Fatalf("closed cycle end = %s, want %s", closed.EndAt, resetAt)
	}
	currentAccount, err := repo.GetOrCreateWeeklyQuotaAccount(ctx, current.ID, 9)
	if err != nil {
		t.Fatalf("GetOrCreateWeeklyQuotaAccount(current) error = %v", err)
	}
	if currentAccount.UsedNanousd != 0 || currentAccount.ReservedNanousd != 0 {
		t.Fatalf("new account = %+v, want zero counters", currentAccount)
	}
	var previousPersisted model.BillingWeeklyQuotaAccount
	if err := db.First(&previousPersisted, previousAccount.ID).Error; err != nil {
		t.Fatalf("load previous account: %v", err)
	}
	if previousPersisted.UsedNanousd != 500 {
		t.Fatalf("previous account used = %d, want 500", previousPersisted.UsedNanousd)
	}
}

func TestNormalizeInitialWeeklyResetUsesNextFixedPhase(t *testing.T) {
	now := time.Date(2026, time.January, 20, 0, 0, 0, 0, time.UTC)
	anchor := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	got, err := normalizeInitialWeeklyReset(now, anchor)
	if err != nil {
		t.Fatalf("normalizeInitialWeeklyReset() error = %v", err)
	}
	want := time.Date(2026, time.January, 22, 0, 0, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Fatalf("normalizeInitialWeeklyReset() = %s, want %s", got, want)
	}
	if _, err := normalizeInitialWeeklyReset(now, now.Add(domainbilling.WeeklyQuotaCycleDuration+time.Second)); err == nil {
		t.Fatal("normalizeInitialWeeklyReset() accepted a next reset more than seven days away")
	}
}

func TestLegacyRedemptionDurationMigratesWithoutChangingDays(t *testing.T) {
	dbName := strings.NewReplacer("/", "_", " ", "_").Replace(t.Name())
	db, err := gorm.Open(sqlite.Open("file:"+dbName+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&legacyRedemptionCodeDuration{}); err != nil {
		t.Fatalf("migrate legacy redemption code: %v", err)
	}
	legacy := legacyRedemptionCodeDuration{
		CodeHash:     "legacy-duration-hash",
		Mode:         domainbilling.RedemptionCodeModePeriod,
		RewardType:   domainbilling.RedemptionRewardTypeSubscription,
		PlanID:       3,
		DurationDays: 30,
		PerUserLimit: 1,
		Status:       domainbilling.RedemptionCodeStatusActive,
	}
	if err := db.Create(&legacy).Error; err != nil {
		t.Fatalf("create legacy redemption code: %v", err)
	}
	if err := db.AutoMigrate(&model.RedemptionCode{}); err != nil {
		t.Fatalf("migrate current redemption code: %v", err)
	}
	var migrated model.RedemptionCode
	if err := db.First(&migrated, legacy.ID).Error; err != nil {
		t.Fatalf("load migrated redemption code: %v", err)
	}
	if migrated.DurationDays != 30 || migrated.DurationUnit != "" || migrated.DurationCount != 0 {
		t.Fatalf("migrated duration = unit %q count %d days %d", migrated.DurationUnit, migrated.DurationCount, migrated.DurationDays)
	}
}

func TestCalendarMonthRedemptionsExtendFromEffectiveSubscriptionEnd(t *testing.T) {
	db := openWeeklyQuotaSQLiteTestDB(t)
	plan := model.BillingPlan{Code: "pro", Name: "Pro", IsActive: true, WeeklyCreditNanousd: 5_000_000_000}
	if err := db.Create(&plan).Error; err != nil {
		t.Fatalf("create plan: %v", err)
	}
	price := model.BillingPrice{PlanID: plan.ID, Code: "pro-monthly", IsActive: true, IsDefault: true}
	if err := db.Create(&price).Error; err != nil {
		t.Fatalf("create price: %v", err)
	}
	code := model.RedemptionCode{
		PlanID:        plan.ID,
		DurationUnit:  domainbilling.RedemptionDurationUnitMonth,
		DurationCount: 1,
	}
	firstAt := time.Date(2026, time.January, 30, 12, 0, 0, 0, time.UTC)
	first, err := applyRedemptionSubscription(db, 17, code, firstAt)
	if err != nil {
		t.Fatalf("applyRedemptionSubscription(first) error = %v", err)
	}
	wantFirstEnd := time.Date(2026, time.February, 28, 12, 0, 0, 0, time.UTC)
	if first.CurrentPeriodEndAt == nil || !first.CurrentPeriodEndAt.Equal(wantFirstEnd) {
		t.Fatalf("first subscription end = %v, want %s", first.CurrentPeriodEndAt, wantFirstEnd)
	}

	if _, err := applyRedemptionSubscription(db, 17, code, firstAt.Add(24*time.Hour)); err != nil {
		t.Fatalf("applyRedemptionSubscription(second) error = %v", err)
	}
	var subscriptions []model.Subscription
	if err := db.Where("user_id = ? AND status = ?", 17, "active").Order("current_period_end_at ASC").Find(&subscriptions).Error; err != nil {
		t.Fatalf("list subscriptions: %v", err)
	}
	if len(subscriptions) == 0 || subscriptions[len(subscriptions)-1].CurrentPeriodEndAt == nil {
		t.Fatalf("active subscriptions = %+v", subscriptions)
	}
	wantFinalEnd := time.Date(2026, time.March, 28, 12, 0, 0, 0, time.UTC)
	if !subscriptions[len(subscriptions)-1].CurrentPeriodEndAt.Equal(wantFinalEnd) {
		t.Fatalf("final subscription end = %s, want %s", subscriptions[len(subscriptions)-1].CurrentPeriodEndAt, wantFinalEnd)
	}
}

func openWeeklyQuotaSQLiteTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dbName := strings.NewReplacer("/", "_", " ", "_").Replace(t.Name())
	db, err := gorm.Open(sqlite.Open("file:"+dbName+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("resolve sqlite db: %v", err)
	}
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() {
		_ = sqlDB.Close()
	})
	if err := db.AutoMigrate(
		&model.BillingPlan{},
		&model.BillingPrice{},
		&model.Subscription{},
		&model.RedemptionCode{},
		&model.BillingQuotaSchedule{},
		&model.BillingQuotaCycle{},
		&model.BillingWeeklyQuotaAccount{},
	); err != nil {
		t.Fatalf("migrate weekly quota tables: %v", err)
	}
	return db
}
