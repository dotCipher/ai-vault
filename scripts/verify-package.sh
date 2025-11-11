#!/bin/bash
# Pre-publish validation script
# Ensures all required files are present in the NPM package

set -e

echo "🔍 Verifying package contents before publish..."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track errors
HAS_ERROR=0

# 1. Check that build artifacts exist
echo ""
echo "📦 Checking build artifacts..."

if [ ! -d "dist" ]; then
  echo -e "${RED}❌ dist/ directory not found${NC}"
  echo "   Run 'pnpm run build' first"
  HAS_ERROR=1
else
  echo -e "${GREEN}✓${NC} dist/ directory exists"
fi

if [ ! -f "dist/cli.js" ]; then
  echo -e "${RED}❌ dist/cli.js not found${NC}"
  HAS_ERROR=1
else
  echo -e "${GREEN}✓${NC} dist/cli.js exists"
fi

# 2. Check UI assets
echo ""
echo "🎨 Checking UI assets..."

if [ ! -d "ui/dist" ]; then
  echo -e "${RED}❌ ui/dist/ directory not found${NC}"
  echo "   UI assets are missing"
  HAS_ERROR=1
else
  echo -e "${GREEN}✓${NC} ui/dist/ directory exists"
fi

if [ ! -f "ui/dist/index.html" ]; then
  echo -e "${RED}❌ ui/dist/index.html not found${NC}"
  HAS_ERROR=1
else
  echo -e "${GREEN}✓${NC} ui/dist/index.html exists"
fi

if [ ! -d "ui/dist/assets" ]; then
  echo -e "${YELLOW}⚠${NC}  ui/dist/assets/ directory not found"
  echo "   This may be expected if UI has no assets"
else
  echo -e "${GREEN}✓${NC} ui/dist/assets/ directory exists"
fi

# 3. Create a test package and verify contents
echo ""
echo "📋 Creating test package..."

# Clean up any existing test packages
rm -f ai-vault-*.tgz

# Create package tarball
npm pack > /dev/null 2>&1

# Find the created tarball
TARBALL=$(ls ai-vault-*.tgz 2>/dev/null | head -1)

if [ -z "$TARBALL" ]; then
  echo -e "${RED}❌ Failed to create package tarball${NC}"
  HAS_ERROR=1
  exit 1
fi

echo -e "${GREEN}✓${NC} Created $TARBALL"

# 4. Verify tarball contents
echo ""
echo "🔍 Verifying tarball contents..."

# Check for required files
REQUIRED_FILES=(
  "package/dist/cli.js"
  "package/ui/dist/index.html"
  "package/README.md"
  "package/LICENSE"
  "package/package.json"
)

for file in "${REQUIRED_FILES[@]}"; do
  if tar -tzf "$TARBALL" | grep -q "^${file}$"; then
    echo -e "${GREEN}✓${NC} $file present in package"
  else
    echo -e "${RED}❌ $file MISSING from package${NC}"
    HAS_ERROR=1
  fi
done

# 5. Check package.json files field
echo ""
echo "📄 Checking package.json files field..."

FILES_FIELD=$(node -p "JSON.stringify(require('./package.json').files || [])")

if echo "$FILES_FIELD" | grep -q "ui/dist"; then
  echo -e "${GREEN}✓${NC} package.json includes ui/dist/**/*"
else
  echo -e "${RED}❌ package.json does NOT include ui/dist/**/*${NC}"
  HAS_ERROR=1
fi

# 6. Get package size info
echo ""
echo "📊 Package statistics..."

PACKAGE_SIZE=$(du -h "$TARBALL" | cut -f1)
FILE_COUNT=$(tar -tzf "$TARBALL" | wc -l)

echo "   Size: $PACKAGE_SIZE"
echo "   Files: $FILE_COUNT"

# List all files in package for review
echo ""
echo "📑 Package contents:"
tar -tzf "$TARBALL" | sed 's/^package\///' | grep -v '^$' | sort | head -20
TOTAL_FILES=$(tar -tzf "$TARBALL" | wc -l)
if [ $TOTAL_FILES -gt 20 ]; then
  echo "   ... and $((TOTAL_FILES - 20)) more files"
fi

# 7. Clean up test package
echo ""
echo "🧹 Cleaning up test package..."
rm -f "$TARBALL"
echo -e "${GREEN}✓${NC} Removed $TARBALL"

# Final result
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $HAS_ERROR -eq 1 ]; then
  echo -e "${RED}❌ Package verification FAILED${NC}"
  echo ""
  echo "Fix the errors above before publishing."
  exit 1
else
  echo -e "${GREEN}✅ Package verification PASSED${NC}"
  echo ""
  echo "Package is ready to publish!"
  exit 0
fi
