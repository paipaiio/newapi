package controller

import (
	"net/http"
	"testing"
)

func TestCapProxyAllowed(t *testing.T) {
	t.Parallel()

	tests := []struct {
		method string
		path   string
		want   bool
	}{
		{http.MethodGet, "/api/cap/assets/widget.js", true},
		{http.MethodGet, "/api/cap/assets/cap_wasm_bg.wasm", true},
		{http.MethodHead, "/api/cap/assets/widget.js", true},
		{http.MethodPost, "/api/cap/da389d41d5/challenge", true},
		{http.MethodPost, "/api/cap/da389d41d5/redeem", true},
		{http.MethodPost, "/api/cap/da389d41d5/challenge/", true},
		{http.MethodGet, "/api/cap/", false},
		{http.MethodGet, "/api/cap", false},
		{http.MethodGet, "/api/cap/server/keys", false},
		{http.MethodPost, "/api/cap/server/keys", false},
		{http.MethodGet, "/api/cap/swagger", false},
		{http.MethodGet, "/api/cap/public/index.html", false},
		{http.MethodPost, "/api/cap/login", false},
		{http.MethodPost, "/api/cap/da389d41d5/siteverify", false},
		{http.MethodGet, "/api/cap/assets/../server/keys", false},
		{http.MethodGet, "/api/cap/assets/", false},
		{http.MethodPost, "/api/cap/../server/keys", false},
		{http.MethodDelete, "/api/cap/da389d41d5/challenge", false},
		{http.MethodPost, "/api/cap/ab/challenge", false},
	}

	for _, tt := range tests {
		t.Run(tt.method+" "+tt.path, func(t *testing.T) {
			t.Parallel()
			if got := capProxyAllowed(tt.method, tt.path); got != tt.want {
				t.Fatalf("capProxyAllowed(%q, %q) = %v, want %v", tt.method, tt.path, got, tt.want)
			}
		})
	}
}
