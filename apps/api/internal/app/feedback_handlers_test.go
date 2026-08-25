package app

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestFeedbackTicketUserAndAdminFlow(t *testing.T) {
	a := newTestApp(t)
	ts := httptest.NewServer(a.Router())
	defer ts.Close()

	admin := &testClient{t: t, server: ts}
	if code := admin.do("POST", "/api/auth/login", map[string]string{"loginName": "admin", "password": "ChangeMe123!"}, nil); code != http.StatusOK {
		t.Fatalf("admin login code=%d", code)
	}
	createUser := func(loginName string) *testClient {
		t.Helper()
		var user AdminUser
		if code := admin.do("POST", "/api/admin/users", map[string]any{
			"loginName": loginName, "displayName": strings.ToUpper(loginName), "role": "user", "password": "Password123!", "disabled": false,
		}, &user); code != http.StatusCreated {
			t.Fatalf("create user %s code=%d", loginName, code)
		}
		client := &testClient{t: t, server: ts}
		if code := client.do("POST", "/api/auth/login", map[string]string{"loginName": loginName, "password": "Password123!"}, nil); code != http.StatusOK {
			t.Fatalf("login user %s code=%d", loginName, code)
		}
		return client
	}
	alice := createUser("feedback-alice")
	bob := createUser("feedback-bob")
	var viewerGroup PermissionGroup
	if code := admin.do("POST", "/api/admin/permission-groups", map[string]any{
		"name": "Feedback viewers", "description": "Read-only feedback access", "permissions": []string{PermissionFeedbackView},
	}, &viewerGroup); code != http.StatusCreated {
		t.Fatalf("create feedback viewer group code=%d", code)
	}
	var viewerUser AdminUser
	if code := admin.do("POST", "/api/admin/users", map[string]any{
		"loginName": "feedback-viewer", "displayName": "Feedback Viewer", "role": "user", "password": "Password123!", "disabled": false,
		"permissionGroupIds": []string{viewerGroup.ID},
	}, &viewerUser); code != http.StatusCreated {
		t.Fatalf("create feedback viewer code=%d", code)
	}
	viewer := &testClient{t: t, server: ts}
	if code := viewer.do("POST", "/api/auth/login", map[string]string{"loginName": "feedback-viewer", "password": "Password123!"}, nil); code != http.StatusOK {
		t.Fatalf("feedback viewer login code=%d", code)
	}
	var managerOnlyGroup PermissionGroup
	if code := admin.do("POST", "/api/admin/permission-groups", map[string]any{
		"name": "Feedback manager only", "description": "Invalid without view access", "permissions": []string{PermissionFeedbackManage},
	}, &managerOnlyGroup); code != http.StatusCreated {
		t.Fatalf("create feedback manager-only group code=%d", code)
	}
	var managerOnlyUser AdminUser
	if code := admin.do("POST", "/api/admin/users", map[string]any{
		"loginName": "feedback-manager-only", "displayName": "Feedback Manager Only", "role": "user", "password": "Password123!", "disabled": false,
		"permissionGroupIds": []string{managerOnlyGroup.ID},
	}, &managerOnlyUser); code != http.StatusCreated {
		t.Fatalf("create feedback manager-only user code=%d", code)
	}
	managerOnly := &testClient{t: t, server: ts}
	if code := managerOnly.do("POST", "/api/auth/login", map[string]string{"loginName": "feedback-manager-only", "password": "Password123!"}, nil); code != http.StatusOK {
		t.Fatalf("feedback manager-only login code=%d", code)
	}

	if code := (&testClient{t: t, server: ts}).do("GET", "/api/me/feedback-tickets", nil, nil); code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated list code=%d", code)
	}
	if code := bob.do("GET", "/api/admin/feedback-tickets", nil, nil); code != http.StatusForbidden {
		t.Fatalf("regular user admin list code=%d", code)
	}

	var created FeedbackTicket
	if code := alice.do("POST", "/api/me/feedback-tickets", map[string]string{"title": "  Login issue  ", "content": "  Please investigate  "}, &created); code != http.StatusCreated {
		t.Fatalf("create ticket code=%d ticket=%+v", code, created)
	}
	if created.Title != "Login issue" || created.Status != "pending" || len(created.Messages) != 1 || created.Messages[0].Content != "Please investigate" || created.Messages[0].AuthorRole != "user" {
		t.Fatalf("unexpected created ticket=%+v", created)
	}
	if created.UserID != "" || created.UserEmail != "" {
		t.Fatalf("owner response exposed admin-only identity fields: %+v", created)
	}
	if code := viewer.do("GET", "/api/admin/feedback-tickets/"+created.ID, nil, nil); code != http.StatusOK {
		t.Fatalf("feedback viewer detail code=%d", code)
	}
	if code := managerOnly.do("POST", "/api/admin/feedback-tickets/"+created.ID+"/messages", map[string]string{"content": "not allowed"}, nil); code != http.StatusForbidden {
		t.Fatalf("feedback manager without view code=%d", code)
	}
	for _, request := range []struct {
		method string
		path   string
		body   any
	}{
		{"POST", "/api/admin/feedback-tickets/" + created.ID + "/messages", map[string]string{"content": "not allowed"}},
		{"POST", "/api/admin/feedback-tickets/" + created.ID + "/status", map[string]any{"status": "closed", "confirm": true}},
		{"DELETE", "/api/admin/feedback-tickets/" + created.ID, map[string]bool{"confirm": true}},
	} {
		if code := viewer.do(request.method, request.path, request.body, nil); code != http.StatusForbidden {
			t.Fatalf("feedback viewer mutation %s %s code=%d", request.method, request.path, code)
		}
	}

	for _, request := range []struct {
		method string
		path   string
		body   any
	}{
		{"GET", "/api/me/feedback-tickets/" + created.ID, nil},
		{"POST", "/api/me/feedback-tickets/" + created.ID + "/messages", map[string]string{"content": "steal"}},
		{"DELETE", "/api/me/feedback-tickets/" + created.ID, map[string]bool{"confirm": true}},
	} {
		if code := bob.do(request.method, request.path, request.body, nil); code != http.StatusNotFound {
			t.Fatalf("cross-user %s %s code=%d", request.method, request.path, code)
		}
	}

	var adminList struct {
		Items []FeedbackTicket `json:"items"`
	}
	if code := admin.do("GET", "/api/admin/feedback-tickets?status=pending", nil, &adminList); code != http.StatusOK || len(adminList.Items) != 1 {
		t.Fatalf("admin list code=%d list=%+v", code, adminList)
	}
	if adminList.Items[0].UserLoginName != "feedback-alice" || adminList.Items[0].MessageCount != 1 {
		t.Fatalf("admin list identity/summary=%+v", adminList.Items[0])
	}
	if code := admin.do("GET", "/api/admin/feedback-tickets?status=invalid", nil, nil); code != http.StatusBadRequest {
		t.Fatalf("invalid status code=%d", code)
	}

	var replied FeedbackTicket
	if code := admin.do("POST", "/api/admin/feedback-tickets/"+created.ID+"/messages", map[string]string{"content": "Admin reply"}, &replied); code != http.StatusCreated {
		t.Fatalf("admin reply code=%d ticket=%+v", code, replied)
	}
	if replied.Status != "replied" || len(replied.Messages) != 2 || replied.Messages[1].AuthorRole != "admin" {
		t.Fatalf("unexpected admin reply=%+v", replied)
	}

	var ownerView FeedbackTicket
	if code := alice.do("GET", "/api/me/feedback-tickets/"+created.ID, nil, &ownerView); code != http.StatusOK {
		t.Fatalf("owner detail code=%d", code)
	}
	if ownerView.Status != "replied" || len(ownerView.Messages) != 2 || ownerView.Messages[1].Content != "Admin reply" {
		t.Fatalf("owner did not receive admin reply: %+v", ownerView)
	}
	if code := alice.do("POST", "/api/me/feedback-tickets/"+created.ID+"/messages", map[string]string{"content": "User follow-up"}, &ownerView); code != http.StatusCreated || ownerView.Status != "pending" {
		t.Fatalf("owner follow-up code=%d ticket=%+v", code, ownerView)
	}

	if code := admin.do("POST", "/api/admin/feedback-tickets/"+created.ID+"/status", map[string]any{"status": "closed", "confirm": false}, nil); code != http.StatusBadRequest {
		t.Fatalf("unconfirmed close code=%d", code)
	}
	if code := admin.do("POST", "/api/admin/feedback-tickets/"+created.ID+"/status", map[string]any{"status": "closed", "confirm": true}, &ownerView); code != http.StatusOK || ownerView.Status != "closed" || ownerView.ClosedAt == nil {
		t.Fatalf("admin close code=%d ticket=%+v", code, ownerView)
	}
	if code := alice.do("POST", "/api/me/feedback-tickets/"+created.ID+"/messages", map[string]string{"content": "closed reply"}, nil); code != http.StatusConflict {
		t.Fatalf("closed owner reply code=%d", code)
	}
	if code := admin.do("POST", "/api/admin/feedback-tickets/"+created.ID+"/messages", map[string]string{"content": "closed admin reply"}, nil); code != http.StatusConflict {
		t.Fatalf("closed admin reply code=%d", code)
	}

	if code := alice.do("DELETE", "/api/me/feedback-tickets/"+created.ID, map[string]bool{"confirm": false}, nil); code != http.StatusBadRequest {
		t.Fatalf("unconfirmed owner delete code=%d", code)
	}
	if code := alice.do("DELETE", "/api/me/feedback-tickets/"+created.ID, map[string]bool{"confirm": true}, nil); code != http.StatusOK {
		t.Fatalf("owner delete code=%d", code)
	}
	var messageCount int
	if err := a.db.QueryRow(`SELECT COUNT(*) FROM feedback_messages WHERE ticket_id=?`, created.ID).Scan(&messageCount); err != nil || messageCount != 0 {
		t.Fatalf("cascade delete messages count=%d err=%v", messageCount, err)
	}
}

func TestFeedbackTicketValidationAndOwnerClose(t *testing.T) {
	a := newTestApp(t)
	ts := httptest.NewServer(a.Router())
	defer ts.Close()
	client := &testClient{t: t, server: ts}
	if code := client.do("POST", "/api/auth/login", map[string]string{"loginName": "admin", "password": "ChangeMe123!"}, nil); code != http.StatusOK {
		t.Fatalf("login code=%d", code)
	}
	if code := client.do("POST", "/api/me/feedback-tickets", map[string]string{"title": strings.Repeat("a", feedbackTitleMaxRunes+1), "content": "body"}, nil); code != http.StatusBadRequest {
		t.Fatalf("long title code=%d", code)
	}
	if code := client.do("POST", "/api/me/feedback-tickets", map[string]string{"title": "title", "content": strings.Repeat("a", feedbackContentMaxRunes+1)}, nil); code != http.StatusBadRequest {
		t.Fatalf("long content code=%d", code)
	}
	var created FeedbackTicket
	if code := client.do("POST", "/api/me/feedback-tickets", map[string]string{"title": "Closable", "content": "body"}, &created); code != http.StatusCreated {
		t.Fatalf("create code=%d", code)
	}
	if code := client.do("POST", "/api/me/feedback-tickets/"+created.ID+"/close", map[string]bool{"confirm": false}, nil); code != http.StatusBadRequest {
		t.Fatalf("unconfirmed owner close code=%d", code)
	}
	var closed FeedbackTicket
	if code := client.do("POST", "/api/me/feedback-tickets/"+created.ID+"/close", map[string]bool{"confirm": true}, &closed); code != http.StatusOK || closed.Status != "closed" {
		t.Fatalf("owner close code=%d ticket=%+v", code, closed)
	}
	var reopened FeedbackTicket
	if code := client.do("POST", "/api/admin/feedback-tickets/"+created.ID+"/status", map[string]any{"status": "processing", "confirm": false}, &reopened); code != http.StatusOK || reopened.Status != "processing" || reopened.ClosedAt != nil {
		t.Fatalf("admin reopen code=%d ticket=%+v", code, reopened)
	}
	if code := client.do("DELETE", "/api/admin/feedback-tickets/"+created.ID, map[string]bool{"confirm": false}, nil); code != http.StatusBadRequest {
		t.Fatalf("unconfirmed admin delete code=%d", code)
	}
	if code := client.do("DELETE", "/api/admin/feedback-tickets/"+created.ID, map[string]bool{"confirm": true}, nil); code != http.StatusOK {
		t.Fatalf("admin delete code=%d", code)
	}
	if code := client.do("GET", "/api/me/feedback-tickets/"+created.ID, nil, nil); code != http.StatusNotFound {
		t.Fatalf("deleted owner ticket code=%d", code)
	}
	if code := client.do("POST", "/api/admin/feedback-tickets/"+created.ID+"/status", map[string]any{"status": "replied", "confirm": false}, nil); code != http.StatusBadRequest {
		t.Fatalf("unsupported manual status code=%d", code)
	}
}

func TestFeedbackTicketCreateRateLimitSurvivesDeletion(t *testing.T) {
	a := newTestApp(t)
	ts := httptest.NewServer(a.Router())
	defer ts.Close()
	client := &testClient{t: t, server: ts}
	if code := client.do("POST", "/api/auth/login", map[string]string{"loginName": "admin", "password": "ChangeMe123!"}, nil); code != http.StatusOK {
		t.Fatalf("login code=%d", code)
	}
	for index := 0; index < 10; index++ {
		var created FeedbackTicket
		if code := client.do("POST", "/api/me/feedback-tickets", map[string]string{"title": "Rate limit", "content": "body"}, &created); code != http.StatusCreated {
			t.Fatalf("create %d code=%d", index, code)
		}
		if code := client.do("DELETE", "/api/me/feedback-tickets/"+created.ID, map[string]bool{"confirm": true}, nil); code != http.StatusOK {
			t.Fatalf("delete %d code=%d", index, code)
		}
	}
	if code := client.do("POST", "/api/me/feedback-tickets", map[string]string{"title": "Rate limit", "content": "body"}, nil); code != http.StatusTooManyRequests {
		t.Fatalf("create after deletion code=%d", code)
	}
}
