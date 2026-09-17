package contentsafety

import (
	"context"
	"errors"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

var ErrBlocked = errors.New("request blocked by content safety policy")

func Evaluate(ctx context.Context, req Request) Result {
	s := operation_setting.GetContentSafetySetting()
	if !s.Enabled {
		return Result{Action: ActionAllow}
	}
	if req.Phase == "" {
		req.Phase = PhaseInput
	}
	policy := ResolvePolicyEx(
		[]string{req.ModelName, req.UpstreamModel},
		SplitGroups(req.Group, req.TokenGroup),
	)
	mode := ResolveMode(policy)

	scanText := req.ScanText
	if strings.TrimSpace(scanText) == "" {
		scanText = req.FullText
	}
	if utf8.RuneCountInString(scanText) > 8000 {
		scanText = truncateRunes(scanText, 8000)
	}

	finding := ScanRedline(req.FullText)
	if !finding.Hit {
		finding = ScanRedline(scanText)
	}
	if !finding.Hit && mode != operation_setting.ContentSafetyModeOff && req.Phase == PhaseInput {
		finding = ScanJailbreak(scanText)
	}
	if !finding.Hit && mode != operation_setting.ContentSafetyModeOff && s.GuardEnabled {
		guardFinding, err := ScanGuard(ctx, scanText)
		if err != nil {
			if !s.GuardFailOpen {
				finding = Finding{
					Hit:        true,
					Source:     SourceGuard,
					Category:   CategoryUnknown,
					Categories: []string{CategoryUnknown},
					Safety:     SafetyUnsafe,
					Score:      0.5,
					Matched:    "guard_unavailable",
				}
			}
		} else {
			finding = guardFinding
		}
	}

	action := decideAction(policy, mode, finding, req.Phase, req.LiveRedact)
	result := Result{
		Policy:    policy,
		Mode:      mode,
		Action:    action,
		Finding:   finding,
		Snippet:   snippetOf(scanText),
		ShouldLog: finding.Hit && action != ActionAllow,
	}
	if result.ShouldLog {
		persist(req, result)
		if action == ActionBlock && s.AutoDisableUser && req.Phase == PhaseInput {
			maybeDisableUser(req.UserId)
		}
		if req.Phase == PhaseOutput && isHardBlock(finding) && s.AutoDisableUser {
			maybeDisableUser(req.UserId)
		}
	}
	return result
}

func decideAction(policy, mode string, finding Finding, phase string, liveRedact bool) string {
	if !finding.Hit {
		return ActionAllow
	}
	hard := isHardBlock(finding)
	if hard {
		return ActionBlock
	}
	if liveRedact && isPIIOnly(finding) {
		return ActionReview
	}
	if mode == operation_setting.ContentSafetyModeOff {
		return ActionAllow
	}
	if policy == operation_setting.ContentSafetyPolicyUncensored {
		return ActionReview
	}
	if phase == PhaseOutput {
		// Response already flushed; never pretends to HTTP-block.
		return ActionReview
	}
	if mode == operation_setting.ContentSafetyModeBlocking {
		return ActionBlock
	}
	return ActionReview
}

func isHardBlock(finding Finding) bool {
	if finding.Source == SourceRedline || finding.Source == SourceKeyword || finding.Category == CategoryRedline {
		return true
	}
	for _, cat := range finding.Categories {
		if cat == CategoryRedline {
			return true
		}
	}
	return false
}

func isPIIOnly(finding Finding) bool {
	if finding.Category != "" && finding.Category != CategoryPII {
		return false
	}
	if len(finding.Categories) == 0 {
		return finding.Category == CategoryPII
	}
	for _, cat := range finding.Categories {
		if cat != CategoryPII {
			return false
		}
	}
	return true
}

func RecordKeywordBlock(req Request, words []string) {
	matched := strings.Join(words, ", ")
	finding := Finding{
		Hit:        true,
		Source:     SourceKeyword,
		Category:   CategoryRedline,
		Categories: []string{CategoryRedline},
		Safety:     SafetyUnsafe,
		Score:      1,
		Matched:    truncateRunes(matched, 160),
	}
	result := Result{
		Policy:    ResolvePolicyEx([]string{req.ModelName, req.UpstreamModel}, SplitGroups(req.Group, req.TokenGroup)),
		Mode:      operation_setting.ContentSafetyModeBlocking,
		Action:    ActionBlock,
		Finding:   finding,
		Snippet:   snippetOf(req.ScanText),
		ShouldLog: true,
	}
	if req.Phase == "" {
		req.Phase = PhaseInput
	}
	persist(req, result)
}

func persist(req Request, result Result) {
	cats := result.Finding.Categories
	if len(cats) == 0 && result.Finding.Category != "" {
		cats = []string{result.Finding.Category}
	}
	evt := &model.ContentSafetyEvent{
		CreatedAt:    common.GetTimestamp(),
		UserId:       req.UserId,
		Username:     req.Username,
		TokenName:    req.TokenName,
		ModelName:    req.ModelName,
		Group:        req.Group,
		RequestId:    req.RequestId,
		ChannelId:    req.ChannelId,
		Policy:       result.Policy,
		Phase:        req.Phase,
		Mode:         result.Mode,
		Action:       result.Action,
		Source:       result.Finding.Source,
		Category:     result.Finding.Category,
		Categories:   strings.Join(cats, ","),
		Safety:       result.Finding.Safety,
		Score:        result.Finding.Score,
		Matched:      truncateRunes(result.Finding.Matched, 160),
		Snippet:      result.Snippet,
		ReviewStatus: ReviewPending,
	}
	if err := model.InsertContentSafetyEvent(evt); err != nil {
		common.SysError("content safety persist failed: " + err.Error())
	}
}

func maybeDisableUser(userId int) {
	if err := model.DisableUserForPolicy(userId); err != nil {
		common.SysError("content safety disable user failed: " + err.Error())
	}
}

func ExtractScanText(requestRaw []byte, combineText string) (scan string, full string) {
	full = strings.TrimSpace(combineText)
	if len(requestRaw) > 0 {
		if last := model.ExtractContentText(requestRaw, ""); last != "" {
			scan = last
		}
	}
	if scan == "" {
		scan = full
	}
	return scan, full
}
