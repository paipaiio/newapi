package contentsafety

import (
	"path"
	"strings"

	"github.com/QuantumNous/new-api/setting/operation_setting"
)

func ResolvePolicy(modelName, group string) string {
	return ResolvePolicyEx([]string{modelName}, []string{group})
}

func ResolvePolicyEx(modelNames, groups []string) string {
	s := operation_setting.GetContentSafetySetting()
	for _, modelName := range modelNames {
		if matchAny(s.UncensoredModels, modelName) {
			return operation_setting.ContentSafetyPolicyUncensored
		}
	}
	for _, group := range groups {
		if matchAny(s.UncensoredGroups, group) {
			return operation_setting.ContentSafetyPolicyUncensored
		}
	}
	return operation_setting.ContentSafetyPolicyStandard
}

func SplitGroups(values ...string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0)
	for _, value := range values {
		for _, part := range strings.Split(value, ",") {
			part = strings.TrimSpace(part)
			if part == "" {
				continue
			}
			key := strings.ToLower(part)
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			out = append(out, part)
		}
	}
	return out
}

func ResolveMode(policy string) string {
	s := operation_setting.GetContentSafetySetting()
	if policy == operation_setting.ContentSafetyPolicyUncensored {
		return operation_setting.NormalizeContentSafetyMode(s.UncensoredMode)
	}
	return operation_setting.NormalizeContentSafetyMode(s.StandardMode)
}

func matchAny(spec, value string) bool {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" {
		return false
	}
	for _, raw := range strings.Split(spec, "\n") {
		pattern := strings.ToLower(strings.TrimSpace(raw))
		if pattern == "" {
			continue
		}
		if strings.ContainsAny(pattern, "*?[]") {
			ok, err := path.Match(pattern, value)
			if err == nil && ok {
				return true
			}
			continue
		}
		if strings.Contains(value, pattern) {
			return true
		}
	}
	return false
}
