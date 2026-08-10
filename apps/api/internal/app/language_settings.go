package app

const (
	defaultLanguageSimplified  = "zh-CN"
	defaultLanguageTraditional = "zh-TW"
	defaultLanguageEnglish     = "en"
)

func defaultLanguageSupported(value string) bool {
	switch value {
	case defaultLanguageSimplified, defaultLanguageTraditional, defaultLanguageEnglish:
		return true
	default:
		return false
	}
}

func normalizeDefaultLanguage(value string) string {
	if defaultLanguageSupported(value) {
		return value
	}
	return defaultLanguageSimplified
}
