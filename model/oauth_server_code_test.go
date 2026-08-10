package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBindOAuthAuthRequestUserClaimsPendingRequestOnce(t *testing.T) {
	require.NoError(t, DB.AutoMigrate(&OAuthAuthorizationCode{}))
	require.NoError(t, DB.Exec("DELETE FROM oauth_authorization_codes").Error)
	t.Cleanup(func() {
		_ = DB.Exec("DELETE FROM oauth_authorization_codes").Error
	})

	request := &OAuthAuthorizationCode{
		RequestId:   "oauth-binding-request",
		ClientId:    "client-a",
		RedirectUri: "https://client.example/callback",
	}
	require.NoError(t, CreateOAuthAuthRequest(request))

	require.NoError(t, BindOAuthAuthRequestUser(request.RequestId, 101))
	// Retrying the consent query for the same authenticated user is idempotent.
	require.NoError(t, BindOAuthAuthRequestUser(request.RequestId, 101))

	err := BindOAuthAuthRequestUser(request.RequestId, 202)
	assert.EqualError(t, err, "authorization request not found or already claimed")

	claimed, err := GetOAuthAuthRequestByRequestId(request.RequestId)
	require.NoError(t, err)
	assert.Equal(t, 101, claimed.UserId)
}

func TestBindOAuthAuthRequestUserRejectsHandledOrExpiredRequest(t *testing.T) {
	require.NoError(t, DB.AutoMigrate(&OAuthAuthorizationCode{}))
	require.NoError(t, DB.Exec("DELETE FROM oauth_authorization_codes").Error)
	t.Cleanup(func() {
		_ = DB.Exec("DELETE FROM oauth_authorization_codes").Error
	})

	tests := []struct {
		name      string
		requestId string
		status    string
		expiresAt int64
	}{
		{name: "approved", requestId: "oauth-approved-request", status: OAuthCodeStatusApproved, expiresAt: 4102444800},
		{name: "expired", requestId: "oauth-expired-request", status: OAuthCodeStatusPending, expiresAt: 1},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			require.NoError(t, DB.Create(&OAuthAuthorizationCode{
				RequestId: test.requestId,
				Status:    test.status,
				ExpiresAt: test.expiresAt,
			}).Error)

			err := BindOAuthAuthRequestUser(test.requestId, 101)
			assert.EqualError(t, err, "authorization request not found or already claimed")
		})
	}
}
