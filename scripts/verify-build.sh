#!/bin/bash
# Comprehensive build verification script
# Ensures the entire build pipeline works correctly

set -e

echo "🏗️  Verifying complete build pipeline..."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Track errors
HAS_ERROR=0

# 1. Clean previous builds
echo ""
echo -e "${BLUE}1. Cleaning previous builds...${NC}"

if [ -d "dist" ]; then
  echo "   Removing dist/"
  rm -rf dist
fi

echo -e "${GREEN}✓${NC} Clean complete"

# 2. Run TypeScript build
echo ""
echo -e "${BLUE}2. Building TypeScript...${NC}"

if ! pnpm run build; then
  echo -e "${RED}❌ TypeScript build FAILED${NC}"
  HAS_ERROR=1
  exit 1
fi

echo -e "${GREEN}✓${NC} TypeScript build successful"

# 3. Verify build outputs
echo ""
echo -e "${BLUE}3. Verifying build outputs...${NC}"

REQUIRED_BUILD_FILES=(
  "dist/cli.js"
  "dist/index.js"
  "dist/commands/backup.js"
  "dist/commands/ui.js"
  "dist/api/server.js"
)

for file in "${REQUIRED_BUILD_FILES[@]}"; do
  if [ -f "$file" ]; then
    echo -e "${GREEN}✓${NC} $file"
  else
    echo -e "${RED}❌${NC} $file MISSING"
    HAS_ERROR=1
  fi
done

# 4. Check for TypeScript errors in build
echo ""
echo -e "${BLUE}4. Running TypeScript type check...${NC}"

if pnpm run typecheck; then
  echo -e "${GREEN}✓${NC} No TypeScript errors"
else
  echo -e "${RED}❌ TypeScript errors found${NC}"
  HAS_ERROR=1
fi

# 5. Verify UI assets exist
echo ""
echo -e "${BLUE}5. Verifying UI assets...${NC}"

if [ ! -d "ui/dist" ]; then
  echo -e "${YELLOW}⚠${NC}  ui/dist/ not found"
  echo "   Note: UI assets should be built separately"
  echo "   This is a warning, not a failure"
else
  if [ -f "ui/dist/index.html" ]; then
    echo -e "${GREEN}✓${NC} UI assets present"
  else
    echo -e "${YELLOW}⚠${NC}  ui/dist/index.html not found"
  fi
fi

# 6. Run linter
echo ""
echo -e "${BLUE}6. Running ESLint...${NC}"

if pnpm run lint; then
  echo -e "${GREEN}✓${NC} No linting errors"
else
  echo -e "${YELLOW}⚠${NC}  Linting warnings/errors found"
  echo "   Run 'pnpm run lint:fix' to auto-fix"
fi

# 7. Run tests
echo ""
echo -e "${BLUE}7. Running tests...${NC}"

if pnpm test; then
  echo -e "${GREEN}✓${NC} All tests passed"
else
  echo -e "${RED}❌ Tests FAILED${NC}"
  HAS_ERROR=1
fi

# 8. Verify package.json integrity
echo ""
echo -e "${BLUE}8. Verifying package.json...${NC}"

# Check version is valid semver
VERSION=$(node -p "require('./package.json').version")
if [[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]]; then
  echo -e "${GREEN}✓${NC} Version is valid semver: $VERSION"
else
  echo -e "${RED}❌ Invalid version format: $VERSION${NC}"
  HAS_ERROR=1
fi

# Check bin file is specified
BIN_FILE=$(node -p "require('./package.json').bin['ai-vault']")
if [ "$BIN_FILE" == "./dist/cli.js" ]; then
  echo -e "${GREEN}✓${NC} Bin file correctly specified"
else
  echo -e "${RED}❌ Bin file incorrect: $BIN_FILE${NC}"
  HAS_ERROR=1
fi

# Check files field includes UI
FILES_INCLUDES_UI=$(node -p "require('./package.json').files.includes('ui/dist/**/*')")
if [ "$FILES_INCLUDES_UI" == "true" ]; then
  echo -e "${GREEN}✓${NC} package.json includes UI files"
else
  echo -e "${RED}❌ package.json missing UI files${NC}"
  HAS_ERROR=1
fi

# 9. Run smoke tests
echo ""
echo -e "${BLUE}9. Running smoke tests...${NC}"
echo ""

if ./scripts/smoke-test.sh; then
  echo -e "${GREEN}✓${NC} Smoke tests passed"
else
  echo -e "${RED}❌ Smoke tests FAILED${NC}"
  HAS_ERROR=1
fi

# 10. Run package verification
echo ""
echo -e "${BLUE}10. Running package verification...${NC}"
echo ""

if ./scripts/verify-package.sh; then
  echo -e "${GREEN}✓${NC} Package verification passed"
else
  echo -e "${RED}❌ Package verification FAILED${NC}"
  HAS_ERROR=1
fi

# Final summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $HAS_ERROR -eq 1 ]; then
  echo -e "${RED}❌ BUILD VERIFICATION FAILED${NC}"
  echo ""
  echo "Please fix the errors above before releasing."
  exit 1
else
  echo -e "${GREEN}✅ BUILD VERIFICATION PASSED${NC}"
  echo ""
  echo "All checks passed! Build is ready for release."
  echo ""
  echo "Next steps:"
  echo "  • Review CHANGELOG.md"
  echo "  • Commit changes to main branch"
  echo "  • Release will be created automatically"
  exit 0
fi
