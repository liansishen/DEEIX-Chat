package conversation

import (
	"context"
	"strings"
	"time"

	appbilling "github.com/DEEIX-AI/DEEIX-Chat/backend/internal/application/billing"
	"github.com/DEEIX-AI/DEEIX-Chat/backend/internal/application/channel"
	domainbilling "github.com/DEEIX-AI/DEEIX-Chat/backend/internal/domain/billing"
	"github.com/DEEIX-AI/DEEIX-Chat/backend/internal/infra/llm"
	"go.uber.org/zap"
)

func (s *Service) weeklyUsageCutoffReached(
	ctx context.Context,
	authorization *domainbilling.UsageAuthorization,
	userID uint,
	conversationID uint,
	route *channel.ResolvedRoute,
	usage llm.Usage,
	callCount int,
) bool {
	if s == nil || s.billingSvc == nil || authorization == nil || authorization.Reservation == nil ||
		strings.TrimSpace(authorization.Mode) != "weekly" || route == nil || usage == (llm.Usage{}) {
		return false
	}
	cutoff, err := s.billingSvc.WeeklyUsageCutoffReached(ctx, authorization, appbilling.UsagePricingInput{
		UserID:             userID,
		ConversationID:     conversationID,
		PlatformModelName:  strings.TrimSpace(route.PlatformModelName),
		RoutedBindingCode:  strings.TrimSpace(route.BindingCode),
		ProviderProtocol:   strings.TrimSpace(route.Protocol),
		UpstreamName:       strings.TrimSpace(route.UpstreamName),
		UpstreamModelName:  strings.TrimSpace(route.UpstreamModel),
		UsageSpeed:         strings.TrimSpace(usage.Speed),
		UsageServiceTier:   strings.TrimSpace(usage.ServiceTier),
		InputTokens:        usage.InputTokens,
		CacheReadTokens:    usage.CacheReadTokens,
		CacheWriteTokens:   usage.CacheWriteTokens,
		CacheWrite5mTokens: usage.CacheWrite5mTokens,
		CacheWrite1hTokens: usage.CacheWrite1hTokens,
		OutputTokens:       usage.OutputTokens,
		ReasoningTokens:    usage.ReasoningTokens,
		CallCount:          int64(callCount),
		RawUsageJSON:       usage.RawUsageJSON,
		BillingAt:          time.Now().UTC(),
	})
	if err != nil {
		if s.logger != nil {
			s.logger.Warn("weekly_usage_cutoff_estimate_failed",
				zap.Uint("user_id", userID),
				zap.Uint("conversation_id", conversationID),
				zap.String("model", route.PlatformModelName),
				zap.Error(err),
			)
		}
		return false
	}
	return cutoff
}
