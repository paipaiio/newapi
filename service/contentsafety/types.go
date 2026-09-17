package contentsafety

const (
	PhaseInput  = "input"
	PhaseOutput = "output"

	ActionAllow  = "allow"
	ActionReview = "review"
	ActionBlock  = "block"

	SourceRedline   = "redline"
	SourceJailbreak = "jailbreak"
	SourceGuard     = "guard"
	SourceKeyword   = "keyword"

	SafetySafe          = "safe"
	SafetyControversial = "controversial"
	SafetyUnsafe        = "unsafe"

	ReviewPending   = "pending"
	ReviewReviewed  = "reviewed"
	ReviewDismissed = "dismissed"
	ReviewBanned    = "banned"

	CategoryJailbreak = "jailbreak"
	CategoryRedline   = "redline"
	CategorySexual    = "sexual"
	CategoryViolent   = "violent"
	CategoryIllegal   = "illegal"
	CategoryPII       = "pii"
	CategorySuicide   = "suicide"
	CategoryUnethical = "unethical"
	CategoryPolitical = "political"
	CategoryCopyright = "copyright"
	CategoryUnknown   = "unknown"
)

type Request struct {
	UserId         int
	Username       string
	TokenName      string
	ModelName      string
	UpstreamModel  string
	Group          string
	TokenGroup     string
	ChannelId      int
	RequestId      string
	ScanText       string
	FullText       string
	Phase          string
	LiveRedact     bool
}

type Finding struct {
	Hit        bool
	Source     string
	Category   string
	Categories []string
	Safety     string
	Score      float64
	Matched    string
}

type Result struct {
	Policy     string
	Mode       string
	Action     string
	Finding    Finding
	Snippet    string
	ShouldLog  bool
}
