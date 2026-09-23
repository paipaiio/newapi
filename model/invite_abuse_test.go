package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestSameIPv6Subnet64(t *testing.T) {
	tests := []struct {
		name string
		a    string
		b    string
		want bool
	}{
		{
			name: "same /64 with compressed forms",
			a:    "2408:8207:78cc:5f0::1",
			b:    "2408:8207:78cc:5f0:aaaa:bbbb:cccc:dddd",
			want: true,
		},
		{
			name: "same /64 loopback variants",
			a:    "::1",
			b:    "0:0:0:0:0:0:0:1",
			want: true,
		},
		{
			name: "different /64 same /48",
			a:    "2408:8207:78cc:5f0::1",
			b:    "2408:8207:78cc:5f1::1",
			want: false,
		},
		{
			name: "different prefix",
			a:    "2408:8207:78cc:5f0::1",
			b:    "2409:8207:78cc:5f0::1",
			want: false,
		},
		{
			name: "ipv4 never matches",
			a:    "2408:8207:78cc:5f0::1",
			b:    "92.44.27.10",
			want: false,
		},
		{
			name: "ipv4-mapped ipv6 treated as ipv4",
			a:    "::ffff:192.168.0.1",
			b:    "::ffff:192.168.0.2",
			want: false,
		},
		{
			name: "invalid input",
			a:    "not-an-ip",
			b:    "2408:8207:78cc:5f0::1",
			want: false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, sameIPv6Subnet64(tt.a, tt.b))
			assert.Equal(t, tt.want, sameIPv6Subnet64(tt.b, tt.a))
		})
	}
}
