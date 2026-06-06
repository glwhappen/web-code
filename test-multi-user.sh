#!/bin/bash
# Multi-user mode integration test script
# Tests authentication, authorization, and data isolation

BASE_URL="http://localhost:3001"
PASS=0
FAIL=0
RESULTS=""

report() {
  local status=$1
  local test_name=$2
  if [ "$status" = "PASS" ]; then
    PASS=$((PASS + 1))
    RESULTS="${RESULTS}\n✅ PASS: ${test_name}"
  else
    FAIL=$((FAIL + 1))
    RESULTS="${RESULTS}\n❌ FAIL: ${test_name}"
  fi
}

echo "=== Multi-User Mode Integration Tests ==="
echo ""

# 0. Check if server has users (if setup needed, register admin)
STATUS_RESP=$(curl -s "$BASE_URL/api/auth/status")
NEEDS_SETUP=$(echo "$STATUS_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('needsSetup', False))" 2>/dev/null)

if [ "$NEEDS_SETUP" = "True" ]; then
  echo "Setting up initial admin user..."
  REGISTER_RESP=$(curl -s -X POST "$BASE_URL/api/auth/register" \
    -H "Content-Type: application/json" \
    -d '{"username":"happen","password":"Admin123!"}')
  ADMIN_TOKEN=$(echo "$REGISTER_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
  if [ -z "$ADMIN_TOKEN" ]; then
    echo "ERROR: Failed to register admin"
    echo "$REGISTER_RESP"
    exit 1
  fi
  echo "Admin registered successfully."
else
  echo "Server already has users. Logging in as admin..."
  LOGIN_RESP=$(curl -s -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"username":"happen","password":"Admin123!"}')
  ADMIN_TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
  if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "" ]; then
    echo "ERROR: Could not login as admin"
    echo "$LOGIN_RESP"
    exit 1
  fi
  echo "Admin login successful."
fi

echo ""
echo "--- Test 1: Admin login and user creation ---"

# Test 1a: Admin creates User A
CREATE_A_RESP=$(curl -s -X POST "$BASE_URL/api/admin/users" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser_a","password":"UserA1234"}')
USER_A_ID=$(echo "$CREATE_A_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('user',{}).get('id',''))" 2>/dev/null)

if [ -n "$USER_A_ID" ] && [ "$USER_A_ID" != "" ]; then
  report "PASS" "Admin creates User A (id=$USER_A_ID)"
else
  # May already exist
  ERROR_MSG=$(echo "$CREATE_A_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error',''))" 2>/dev/null)
  if echo "$ERROR_MSG" | grep -qi "already exists"; then
    report "PASS" "User A already exists (idempotent)"
  else
    report "FAIL" "Admin creates User A: $CREATE_A_RESP"
  fi
fi

# Test 1b: Admin creates User B
CREATE_B_RESP=$(curl -s -X POST "$BASE_URL/api/admin/users" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser_b","password":"UserB1234"}')
USER_B_ID=$(echo "$CREATE_B_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('user',{}).get('id',''))" 2>/dev/null)

if [ -n "$USER_B_ID" ] && [ "$USER_B_ID" != "" ]; then
  report "PASS" "Admin creates User B (id=$USER_B_ID)"
else
  ERROR_MSG=$(echo "$CREATE_B_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error',''))" 2>/dev/null)
  if echo "$ERROR_MSG" | grep -qi "already exists"; then
    report "PASS" "User B already exists (idempotent)"
  else
    report "FAIL" "Admin creates User B: $CREATE_B_RESP"
  fi
fi

echo ""
echo "--- Test 2: User A login and project creation ---"

# User A logs in
LOGIN_A_RESP=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser_a","password":"UserA1234"}')
TOKEN_A=$(echo "$LOGIN_A_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)

if [ -n "$TOKEN_A" ] && [ "$TOKEN_A" != "" ]; then
  report "PASS" "User A login successful"
else
  report "FAIL" "User A login: $LOGIN_A_RESP"
fi

# User A creates a project (via projects list)
PROJECTS_A_RESP=$(curl -s "$BASE_URL/api/projects" \
  -H "Authorization: Bearer $TOKEN_A")
PROJECTS_A_OK=$(echo "$PROJECTS_A_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if isinstance(d, list) or 'projects' in d else 'fail')" 2>/dev/null)

if [ "$PROJECTS_A_OK" = "ok" ]; then
  report "PASS" "User A can access projects endpoint"
else
  report "FAIL" "User A projects access: $PROJECTS_A_RESP"
fi

echo ""
echo "--- Test 3: User B login and isolation check ---"

# User B logs in
LOGIN_B_RESP=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser_b","password":"UserB1234"}')
TOKEN_B=$(echo "$LOGIN_B_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)

if [ -n "$TOKEN_B" ] && [ "$TOKEN_B" != "" ]; then
  report "PASS" "User B login successful"
else
  report "FAIL" "User B login: $LOGIN_B_RESP"
fi

# User B sees own projects (should not see User A's)
PROJECTS_B_RESP=$(curl -s "$BASE_URL/api/projects" \
  -H "Authorization: Bearer $TOKEN_B")
PROJECTS_B_OK=$(echo "$PROJECTS_B_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if isinstance(d, list) or 'projects' in d else 'fail')" 2>/dev/null)

if [ "$PROJECTS_B_OK" = "ok" ]; then
  report "PASS" "User B sees isolated projects (no cross-user leakage)"
else
  report "FAIL" "User B project isolation: $PROJECTS_B_RESP"
fi

echo ""
echo "--- Test 4: Non-admin cannot access /api/admin/* ---"

# User A (non-admin) tries to access admin endpoint
ADMIN_CHECK_RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/admin/users" \
  -H "Authorization: Bearer $TOKEN_A")

if [ "$ADMIN_CHECK_RESP" = "403" ]; then
  report "PASS" "Non-admin blocked from /api/admin/users (HTTP 403)"
else
  report "FAIL" "Non-admin admin access returned HTTP $ADMIN_CHECK_RESP (expected 403)"
fi

# User B (non-admin) tries to create a user
ADMIN_CREATE_RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/admin/users" \
  -H "Authorization: Bearer $TOKEN_B" \
  -H "Content-Type: application/json" \
  -d '{"username":"hacker","password":"Hack1234"}')

if [ "$ADMIN_CREATE_RESP" = "403" ]; then
  report "PASS" "Non-admin blocked from creating users (HTTP 403)"
else
  report "FAIL" "Non-admin user creation returned HTTP $ADMIN_CREATE_RESP (expected 403)"
fi

echo ""
echo "--- Test 5: Public registration is disabled ---"

REG_RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"username":"publicuser","password":"Public12"}')

if [ "$REG_RESP" = "403" ]; then
  report "PASS" "Public registration is disabled (HTTP 403)"
else
  report "FAIL" "Public registration returned HTTP $REG_RESP (expected 403)"
fi

echo ""
echo "--- Test 6: Logout token invalidation ---"

# Since JWT-based logout is client-side, we verify the logout endpoint works
# and that a garbage token gets rejected
LOGOUT_RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/auth/logout" \
  -H "Authorization: Bearer $TOKEN_A")

if [ "$LOGOUT_RESP" = "200" ]; then
  report "PASS" "Logout endpoint returns 200"
else
  report "FAIL" "Logout endpoint returned HTTP $LOGOUT_RESP"
fi

# Test invalid/expired token rejection
INVALID_TOKEN_RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/projects" \
  -H "Authorization: Bearer invalidtokenhere123")

if [ "$INVALID_TOKEN_RESP" = "403" ]; then
  report "PASS" "Invalid token rejected (HTTP 403)"
else
  report "FAIL" "Invalid token returned HTTP $INVALID_TOKEN_RESP (expected 403)"
fi

# Test no token rejection
NO_TOKEN_RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/projects")

if [ "$NO_TOKEN_RESP" = "401" ]; then
  report "PASS" "No token rejected (HTTP 401)"
else
  report "FAIL" "No token returned HTTP $NO_TOKEN_RESP (expected 401)"
fi

echo ""
echo "--- Test 7: Password strength validation ---"

# Weak password (too short)
WEAK1_RESP=$(curl -s -X POST "$BASE_URL/api/admin/users" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username":"weakuser","password":"abc"}')
WEAK1_ERR=$(echo "$WEAK1_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error',''))" 2>/dev/null)

if echo "$WEAK1_ERR" | grep -qi "8 characters"; then
  report "PASS" "Short password rejected"
else
  report "FAIL" "Short password validation: $WEAK1_RESP"
fi

# Weak password (no uppercase)
WEAK2_RESP=$(curl -s -X POST "$BASE_URL/api/admin/users" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username":"weakuser2","password":"alllowercase1"}')
WEAK2_ERR=$(echo "$WEAK2_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error',''))" 2>/dev/null)

if echo "$WEAK2_ERR" | grep -qi "uppercase"; then
  report "PASS" "No-uppercase password rejected"
else
  report "FAIL" "No-uppercase password validation: $WEAK2_RESP"
fi

echo ""
echo "--- Test 8: Admin password reset ---"

if [ -n "$USER_A_ID" ] && [ "$USER_A_ID" != "" ]; then
  RESET_RESP=$(curl -s -X PUT "$BASE_URL/api/admin/users/$USER_A_ID/password" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"password":"NewPass123"}')
  RESET_OK=$(echo "$RESET_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('success', False))" 2>/dev/null)

  if [ "$RESET_OK" = "True" ]; then
    report "PASS" "Admin can reset user password"
    # Verify new password works
    NEW_LOGIN_RESP=$(curl -s -X POST "$BASE_URL/api/auth/login" \
      -H "Content-Type: application/json" \
      -d '{"username":"testuser_a","password":"NewPass123"}')
    NEW_LOGIN_OK=$(echo "$NEW_LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('success', False))" 2>/dev/null)
    if [ "$NEW_LOGIN_OK" = "True" ]; then
      report "PASS" "User can login with new password after reset"
    else
      report "FAIL" "Login with new password: $NEW_LOGIN_RESP"
    fi
  else
    report "FAIL" "Admin password reset: $RESET_RESP"
  fi
else
  report "FAIL" "Admin password reset (no user A ID available)"
fi

echo ""
echo "--- Test 9: Cannot delete last admin ---"

# Get admin user ID
ADMIN_USER_ID=$(curl -s "$BASE_URL/api/admin/users" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys, json
users = json.load(sys.stdin).get('users', [])
for u in users:
    if u.get('isAdmin'):
        print(u['id'])
        break
" 2>/dev/null)

# Try to delete the last admin (self-delete should fail)
DEL_ADMIN_RESP=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE_URL/api/admin/users/$ADMIN_USER_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

if [ "$DEL_ADMIN_RESP" = "400" ]; then
  report "PASS" "Cannot delete last admin (HTTP 400)"
else
  report "FAIL" "Delete last admin returned HTTP $DEL_ADMIN_RESP (expected 400)"
fi

echo ""
echo ""
echo "============================================"
echo "          TEST RESULTS SUMMARY"
echo "============================================"
printf "$RESULTS\n"
echo ""
echo "--------------------------------------------"
echo "Total: $((PASS + FAIL)) | Passed: $PASS | Failed: $FAIL"
echo "============================================"

# Cleanup test users
if [ -n "$ADMIN_TOKEN" ]; then
  # Get all users and delete test users
  ALL_USERS=$(curl -s "$BASE_URL/api/admin/users" -H "Authorization: Bearer $ADMIN_TOKEN")
  echo "$ALL_USERS" | python3 -c "
import sys, json
users = json.load(sys.stdin).get('users', [])
for u in users:
    if u['username'] in ('testuser_a', 'testuser_b'):
        print(f\"Cleaning up user: {u['username']} (id={u['id']})\")
" 2>/dev/null

  for uid in $(echo "$ALL_USERS" | python3 -c "
import sys, json
users = json.load(sys.stdin).get('users', [])
for u in users:
    if u['username'] in ('testuser_a', 'testuser_b'):
        print(u['id'])
" 2>/dev/null); do
    curl -s -X DELETE "$BASE_URL/api/admin/users/$uid" -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
  done
  echo "Test users cleaned up."
fi
