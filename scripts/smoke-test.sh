#!/bin/bash
# Smoke tests for ai-vault CLI
# Basic tests to ensure the CLI works correctly

set -e

echo "🧪 Running smoke tests..."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

HAS_ERROR=0

# Test 1: CLI loads and shows help
echo ""
echo -e "${BLUE}1. Testing CLI help...${NC}"

if node dist/cli.js --help > /dev/null 2>&1; then
  echo -e "${GREEN}✓${NC} CLI help works"
else
  echo -e "${RED}❌${NC} CLI help failed"
  HAS_ERROR=1
fi

# Test 2: CLI shows version
echo ""
echo -e "${BLUE}2. Testing CLI version...${NC}"

VERSION_OUTPUT=$(node dist/cli.js version 2>&1)
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓${NC} CLI version: $VERSION_OUTPUT"
else
  echo -e "${RED}❌${NC} CLI version failed"
  HAS_ERROR=1
fi

# Test 3: Verify all commands are registered
echo ""
echo -e "${BLUE}3. Checking available commands...${NC}"

HELP_OUTPUT=$(node dist/cli.js --help 2>&1)

EXPECTED_COMMANDS=("backup" "schedule" "status" "ui" "upgrade")

for cmd in "${EXPECTED_COMMANDS[@]}"; do
  if echo "$HELP_OUTPUT" | grep -q "$cmd"; then
    echo -e "${GREEN}✓${NC} Command '$cmd' registered"
  else
    echo -e "${RED}❌${NC} Command '$cmd' NOT found"
    HAS_ERROR=1
  fi
done

# Test 4: UI command help (don't start server, just check command exists)
echo ""
echo -e "${BLUE}4. Testing UI command registration...${NC}"

if node dist/cli.js ui --help > /dev/null 2>&1; then
  echo -e "${GREEN}✓${NC} UI command registered and accessible"
else
  echo -e "${RED}❌${NC} UI command failed"
  HAS_ERROR=1
fi

# Test 5: Verify UI assets can be found
echo ""
echo -e "${BLUE}5. Testing UI asset resolution...${NC}"

# Check if the server can find UI assets
# We test this by checking the server.js file references
if grep -q "ui/dist" dist/api/server.js 2>/dev/null; then
  echo -e "${GREEN}✓${NC} UI assets path configured in server"
else
  echo -e "${YELLOW}⚠${NC}  UI assets path not found in server.js"
fi

# Check UI assets exist relative to dist
if [ -f "ui/dist/index.html" ]; then
  echo -e "${GREEN}✓${NC} UI index.html exists at ui/dist/index.html"
else
  echo -e "${YELLOW}⚠${NC}  UI index.html not found (expected at ui/dist/index.html)"
  echo "   Note: This may be expected if UI is not built yet"
fi

# Test 6: Check provider modules load
echo ""
echo -e "${BLUE}6. Testing provider modules...${NC}"

PROVIDERS=("chatgpt" "claude" "grok-web" "grok-x")

for provider in "${PROVIDERS[@]}"; do
  # Check if provider file exists
  PROVIDER_FILE="dist/providers/${provider}/index.js"
  if [ -f "$PROVIDER_FILE" ]; then
    echo -e "${GREEN}✓${NC} Provider '$provider' built"
  else
    echo -e "${RED}❌${NC} Provider '$provider' file missing: $PROVIDER_FILE"
    HAS_ERROR=1
  fi
done

# Test 7: Verify critical API routes exist
echo ""
echo -e "${BLUE}7. Testing API route modules...${NC}"

API_ROUTES=("archive" "conversations" "providers" "schedules" "search" "settings" "media")

for route in "${API_ROUTES[@]}"; do
  ROUTE_FILE="dist/api/routes/${route}.js"
  if [ -f "$ROUTE_FILE" ]; then
    echo -e "${GREEN}✓${NC} API route '$route' built"
  else
    echo -e "${RED}❌${NC} API route '$route' missing: $ROUTE_FILE"
    HAS_ERROR=1
  fi
done

# Test 8: Verify utils and core modules
echo ""
echo -e "${BLUE}8. Testing core modules...${NC}"

CORE_MODULES=("dist/utils/index.js" "dist/config/index.js")

for module in "${CORE_MODULES[@]}"; do
  if [ -f "$module" ]; then
    echo -e "${GREEN}✓${NC} Core module exists: $module"
  else
    echo -e "${YELLOW}⚠${NC}  Core module not found: $module (may be optional)"
  fi
done

# Final summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $HAS_ERROR -eq 1 ]; then
  echo -e "${RED}❌ SMOKE TESTS FAILED${NC}"
  echo ""
  echo "Some tests failed. Please review the errors above."
  exit 1
else
  echo -e "${GREEN}✅ SMOKE TESTS PASSED${NC}"
  echo ""
  echo "All basic functionality tests passed!"
  exit 0
fi
