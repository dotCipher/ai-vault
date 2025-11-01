#!/bin/bash
#
# Provider Coverage Validation Script
#
# Compares data captured via archive (remote API) vs import (official export)
# to identify gaps in provider implementation and data coverage.
#
# Usage:
#   ./scripts/validate-provider-coverage.sh <provider> <export-file-path>
#
# Example:
#   ./scripts/validate-provider-coverage.sh grok-web ~/Downloads/grok-export.zip
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
PROVIDER="${1}"
EXPORT_FILE="${2}"

if [ -z "$PROVIDER" ] || [ -z "$EXPORT_FILE" ]; then
  echo -e "${RED}Error: Missing required arguments${NC}"
  echo "Usage: $0 <provider> <export-file-path>"
  echo "Example: $0 grok-web ~/Downloads/grok-export.zip"
  exit 1
fi

if [ ! -f "$EXPORT_FILE" ] && [ ! -d "$EXPORT_FILE" ]; then
  echo -e "${RED}Error: Export file/directory not found: ${EXPORT_FILE}${NC}"
  exit 1
fi

# Setup directories
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
VALIDATION_DIR="/tmp/ai-vault-validation-${TIMESTAMP}"
ARCHIVE_DIR="${VALIDATION_DIR}/archive-data"
IMPORT_DIR="${VALIDATION_DIR}/import-data"
REPORT_FILE="${VALIDATION_DIR}/validation-report.md"

echo -e "${BLUE}=== AI Vault Provider Coverage Validation ===${NC}"
echo -e "Provider: ${GREEN}${PROVIDER}${NC}"
echo -e "Export file: ${GREEN}${EXPORT_FILE}${NC}"
echo -e "Validation directory: ${GREEN}${VALIDATION_DIR}${NC}"
echo ""

# Create directories
mkdir -p "$ARCHIVE_DIR"
mkdir -p "$IMPORT_DIR"

# Build the CLI first
echo -e "${YELLOW}Building CLI...${NC}"
pnpm run build > /dev/null 2>&1

# Function to run CLI command
run_cli() {
  node dist/cli.js "$@"
}

# Function to count conversations
count_conversations() {
  local dir=$1
  # Count conversation.json or conversation.md files
  local json_count=$(find "$dir" -name "conversation.json" 2>/dev/null | wc -l | tr -d ' ')
  local md_count=$(find "$dir" -name "conversation.md" 2>/dev/null | wc -l | tr -d ' ')
  echo $((json_count + md_count))
}

# Function to count messages across all conversations
count_messages() {
  local dir=$1
  local count=0
  # Count from JSON files
  for conv in $(find "$dir" -name "conversation.json" 2>/dev/null); do
    local msg_count=$(jq '.messages | length' "$conv" 2>/dev/null || echo 0)
    count=$((count + msg_count))
  done
  # Count from markdown files (count User and Assistant headers)
  for conv in $(find "$dir" -name "conversation.md" 2>/dev/null); do
    # Count messages by looking for "## User" and "## Assistant" headers
    local msg_count=$(grep -cE "^## (User|Assistant)" "$conv" 2>/dev/null || echo 0)
    count=$((count + msg_count))
  done
  echo $count
}

# Function to count media files
count_media() {
  local dir=$1
  find "$dir" -path "*/media/*" -type f 2>/dev/null | wc -l | tr -d ' '
}

# Function to analyze hierarchy
analyze_hierarchy() {
  local dir=$1
  local provider=$2
  local has_workspaces=0
  local has_projects=0
  local has_flat=0

  if [ -d "$dir/$provider/workspaces" ]; then
    has_workspaces=$(find "$dir/$provider/workspaces" -type d -mindepth 1 -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')
  fi

  if [ -d "$dir/$provider/workspaces" ]; then
    has_projects=$(find "$dir/$provider/workspaces" -path "*/projects/*" -type d -mindepth 3 -maxdepth 3 2>/dev/null | wc -l | tr -d ' ')
  fi

  if [ -d "$dir/$provider/conversations" ]; then
    has_flat=$(find "$dir/$provider/conversations" -type d -mindepth 1 -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')
  fi

  echo "$has_workspaces,$has_projects,$has_flat"
}

# Function to get conversation IDs
get_conversation_ids() {
  local dir=$1
  # First try getting IDs from conversation.json files
  local json_ids=$(find "$dir" -name "conversation.json" -exec jq -r '.id' {} \; 2>/dev/null)

  # For conversation.md files, get the ID from the parent directory name
  # (since MD files are saved as <conversations-dir>/<conversation-id>/conversation.md)
  local md_ids=$(find "$dir" -name "conversation.md" 2>/dev/null | xargs -n1 dirname | xargs -n1 basename)

  # Combine and sort unique IDs
  (echo "$json_ids"; echo "$md_ids") | grep -v '^$' | sort -u
}

# Step 1: Run Archive
echo -e "${YELLOW}Step 1: Running archive from remote API...${NC}"
echo "This will fetch all data from the remote provider."
echo ""

if ! run_cli archive --provider "$PROVIDER" --output "$ARCHIVE_DIR" --yes 2>&1 | tee "${VALIDATION_DIR}/archive.log"; then
  echo -e "${RED}Archive failed! Check ${VALIDATION_DIR}/archive.log${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Archive completed${NC}"
echo ""

# Step 2: Run Import
echo -e "${YELLOW}Step 2: Running import from official export...${NC}"
echo "This will import data from the platform's official export."
echo ""

if ! run_cli import --provider "$PROVIDER" --file "$EXPORT_FILE" --output "$IMPORT_DIR" --yes 2>&1 | tee "${VALIDATION_DIR}/import.log"; then
  echo -e "${RED}Import failed! Check ${VALIDATION_DIR}/import.log${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Import completed${NC}"
echo ""

# Step 3: Analyze and Compare
echo -e "${YELLOW}Step 3: Analyzing data coverage...${NC}"

# Get conversation IDs from both sources
get_conversation_ids "$ARCHIVE_DIR" > "${VALIDATION_DIR}/archive-ids.txt"
get_conversation_ids "$IMPORT_DIR" > "${VALIDATION_DIR}/import-ids.txt"

# Count statistics
ARCHIVE_CONVS=$(count_conversations "$ARCHIVE_DIR")
IMPORT_CONVS=$(count_conversations "$IMPORT_DIR")
ARCHIVE_MSGS=$(count_messages "$ARCHIVE_DIR")
IMPORT_MSGS=$(count_messages "$IMPORT_DIR")
ARCHIVE_MEDIA=$(count_media "$ARCHIVE_DIR")
IMPORT_MEDIA=$(count_media "$IMPORT_DIR")

# Analyze hierarchy
IFS=',' read -r ARCHIVE_WORKSPACES ARCHIVE_PROJECTS ARCHIVE_FLAT <<< "$(analyze_hierarchy "$ARCHIVE_DIR" "$PROVIDER")"
IFS=',' read -r IMPORT_WORKSPACES IMPORT_PROJECTS IMPORT_FLAT <<< "$(analyze_hierarchy "$IMPORT_DIR" "$PROVIDER")"

# Find differences in conversation IDs
comm -23 "${VALIDATION_DIR}/archive-ids.txt" "${VALIDATION_DIR}/import-ids.txt" > "${VALIDATION_DIR}/archive-only-ids.txt"
comm -13 "${VALIDATION_DIR}/archive-ids.txt" "${VALIDATION_DIR}/import-ids.txt" > "${VALIDATION_DIR}/import-only-ids.txt"
comm -12 "${VALIDATION_DIR}/archive-ids.txt" "${VALIDATION_DIR}/import-ids.txt" > "${VALIDATION_DIR}/common-ids.txt"

ARCHIVE_ONLY=$(wc -l < "${VALIDATION_DIR}/archive-only-ids.txt" | tr -d ' ')
IMPORT_ONLY=$(wc -l < "${VALIDATION_DIR}/import-only-ids.txt" | tr -d ' ')
COMMON=$(wc -l < "${VALIDATION_DIR}/common-ids.txt" | tr -d ' ')

# Step 4: Generate Report
echo -e "${YELLOW}Step 4: Generating validation report...${NC}"

cat > "$REPORT_FILE" << EOF
# Provider Coverage Validation Report

**Provider:** ${PROVIDER}
**Date:** $(date +"%Y-%m-%d %H:%M:%S")
**Export File:** ${EXPORT_FILE}

---

## Executive Summary

This report compares data captured via **archive** (remote API calls) versus **import** (official platform export) to identify gaps in provider implementation.

EOF

# Add coverage summary
if [ $ARCHIVE_ONLY -eq 0 ] && [ $IMPORT_ONLY -eq 0 ]; then
  echo -e "**Result:** ${GREEN}✓ Perfect coverage${NC} - Archive and import have identical conversation sets."
  cat >> "$REPORT_FILE" << EOF
**Result:** ✅ **Perfect Coverage** - Archive and import have identical conversation sets.

EOF
elif [ $IMPORT_ONLY -eq 0 ]; then
  echo -e "**Result:** ${GREEN}✓ Complete coverage${NC} - Archive captured all conversations from import, plus ${ARCHIVE_ONLY} additional."
  cat >> "$REPORT_FILE" << EOF
**Result:** ✅ **Complete Coverage** - Archive captured all conversations from import, plus ${ARCHIVE_ONLY} additional conversations.

EOF
else
  echo -e "**Result:** ${RED}⚠ Incomplete coverage${NC} - Archive is missing ${IMPORT_ONLY} conversations from import."
  cat >> "$REPORT_FILE" << EOF
**Result:** ⚠️ **Incomplete Coverage** - Archive is missing ${IMPORT_ONLY} conversations from import.

EOF
fi

cat >> "$REPORT_FILE" << EOF
---

## Data Statistics

### Conversations

| Source | Count | Unique to Source |
|--------|-------|------------------|
| Archive (remote API) | ${ARCHIVE_CONVS} | ${ARCHIVE_ONLY} |
| Import (official export) | ${IMPORT_CONVS} | ${IMPORT_ONLY} |
| **Common** | **${COMMON}** | - |

### Messages

| Source | Total Messages | Avg per Conversation |
|--------|----------------|----------------------|
| Archive | ${ARCHIVE_MSGS} | $(awk "BEGIN {printf \"%.1f\", ${ARCHIVE_MSGS}/${ARCHIVE_CONVS}}") |
| Import | ${IMPORT_MSGS} | $(awk "BEGIN {printf \"%.1f\", ${IMPORT_MSGS}/${IMPORT_CONVS}}") |

### Media Files

| Source | Count |
|--------|-------|
| Archive | ${ARCHIVE_MEDIA} |
| Import | ${IMPORT_MEDIA} |

### Hierarchy Organization

| Source | Workspaces | Projects | Flat (unorganized) |
|--------|-----------|----------|-------------------|
| Archive | ${ARCHIVE_WORKSPACES} | ${ARCHIVE_PROJECTS} | ${ARCHIVE_FLAT} |
| Import | ${IMPORT_WORKSPACES} | ${IMPORT_PROJECTS} | ${IMPORT_FLAT} |

---

## Detailed Findings

### Conversations Only in Archive (${ARCHIVE_ONLY})

EOF

if [ $ARCHIVE_ONLY -gt 0 ]; then
  cat >> "$REPORT_FILE" << EOF
These conversations were captured via remote API but not present in the official export:

\`\`\`
$(head -20 "${VALIDATION_DIR}/archive-only-ids.txt")
$([ $ARCHIVE_ONLY -gt 20 ] && echo "... and $(($ARCHIVE_ONLY - 20)) more")
\`\`\`

**Possible reasons:**
- Conversations created after the export was generated
- Export doesn't include certain conversation types (e.g., deleted, archived)
- API provides access to more complete data

EOF
else
  cat >> "$REPORT_FILE" << EOF
None - All archived conversations are present in the import.

EOF
fi

cat >> "$REPORT_FILE" << EOF
### Conversations Only in Import (${IMPORT_ONLY})

EOF

if [ $IMPORT_ONLY -gt 0 ]; then
  cat >> "$REPORT_FILE" << EOF
These conversations exist in the official export but were NOT captured via archive:

\`\`\`
$(head -20 "${VALIDATION_DIR}/import-only-ids.txt")
$([ $IMPORT_ONLY -gt 20 ] && echo "... and $(($IMPORT_ONLY - 20)) more")
\`\`\`

**⚠️ This indicates missing functionality in the archive implementation!**

**Recommended actions:**
1. Investigate why these conversations are not accessible via the remote API
2. Check for pagination issues or query parameter problems
3. Verify authentication scope covers all conversation types
4. Review provider implementation for missing API endpoints

EOF
else
  cat >> "$REPORT_FILE" << EOF
None - All imported conversations were captured via archive.

EOF
fi

cat >> "$REPORT_FILE" << EOF
---

## Structure Comparison

### Archive Directory Structure

\`\`\`
$(tree -L 4 -d "$ARCHIVE_DIR/$PROVIDER" 2>/dev/null || find "$ARCHIVE_DIR/$PROVIDER" -type d | head -20)
\`\`\`

### Import Directory Structure

\`\`\`
$(tree -L 4 -d "$IMPORT_DIR/$PROVIDER" 2>/dev/null || find "$IMPORT_DIR/$PROVIDER" -type d | head -20)
\`\`\`

---

## Sample Conversation Comparison

EOF

# Compare a sample conversation in detail
SAMPLE_ID=$(head -1 "${VALIDATION_DIR}/common-ids.txt")

if [ -n "$SAMPLE_ID" ]; then
  # Try to find conversation.json first
  ARCHIVE_CONV=$(find "$ARCHIVE_DIR" -name "conversation.json" -exec grep -l "\"id\": *\"$SAMPLE_ID\"" {} \; 2>/dev/null | head -1)
  # If not found, look for conversation.md in a directory matching the ID
  if [ -z "$ARCHIVE_CONV" ]; then
    ARCHIVE_CONV=$(find "$ARCHIVE_DIR" -type d -name "$SAMPLE_ID" -exec test -f {}/conversation.md \; -print 2>/dev/null | head -1)
    if [ -n "$ARCHIVE_CONV" ]; then
      ARCHIVE_CONV="$ARCHIVE_CONV/conversation.md"
    fi
  fi

  IMPORT_CONV=$(find "$IMPORT_DIR" -name "conversation.json" -exec grep -l "\"id\": *\"$SAMPLE_ID\"" {} \; 2>/dev/null | head -1)
  # If not found, look for conversation.md in a directory matching the ID
  if [ -z "$IMPORT_CONV" ]; then
    IMPORT_CONV=$(find "$IMPORT_DIR" -type d -name "$SAMPLE_ID" -exec test -f {}/conversation.md \; -print 2>/dev/null | head -1)
    if [ -n "$IMPORT_CONV" ]; then
      IMPORT_CONV="$IMPORT_CONV/conversation.md"
    fi
  fi

  if [ -n "$ARCHIVE_CONV" ] && [ -n "$IMPORT_CONV" ]; then
    # Extract data based on file type
    if [[ "$ARCHIVE_CONV" == *.json ]]; then
      ARCHIVE_MSGS=$(jq '.messages | length' "$ARCHIVE_CONV" 2>/dev/null)
      ARCHIVE_HIERARCHY=$(jq 'if .hierarchy then "Yes" else "No" end' "$ARCHIVE_CONV" 2>/dev/null)
      ARCHIVE_MEDIA=$(jq '.metadata.mediaCount // 0' "$ARCHIVE_CONV" 2>/dev/null)
    else
      ARCHIVE_MSGS=$(grep -cE "^## (User|Assistant)" "$ARCHIVE_CONV" 2>/dev/null || echo 0)
      # Check for hierarchy by looking for Workspace or Project headers
      ARCHIVE_HIERARCHY=$(grep -qE "^\*\*Workspace:" "$ARCHIVE_CONV" 2>/dev/null && echo "Yes" || echo "No")
      # Extract media count from Messages line (e.g., "**Messages:** 559")
      ARCHIVE_MEDIA=0
    fi

    if [[ "$IMPORT_CONV" == *.json ]]; then
      IMPORT_MSGS=$(jq '.messages | length' "$IMPORT_CONV" 2>/dev/null)
      IMPORT_HIERARCHY=$(jq 'if .hierarchy then "Yes" else "No" end' "$IMPORT_CONV" 2>/dev/null)
      IMPORT_MEDIA=$(jq '.metadata.mediaCount // 0' "$IMPORT_CONV" 2>/dev/null)
    else
      IMPORT_MSGS=$(grep -cE "^## (User|Assistant)" "$IMPORT_CONV" 2>/dev/null || echo 0)
      # Check for hierarchy by looking for Workspace or Project headers
      IMPORT_HIERARCHY=$(grep -qE "^\*\*Workspace:" "$IMPORT_CONV" 2>/dev/null && echo "Yes" || echo "No")
      # Extract media count from Messages line (e.g., "**Messages:** 559")
      IMPORT_MEDIA=0
    fi

    cat >> "$REPORT_FILE" << EOF
**Sample ID:** \`${SAMPLE_ID}\`

### Archive Version
- **Format:** $(basename "$ARCHIVE_CONV")
- **Messages:** $ARCHIVE_MSGS
- **Has Hierarchy:** $ARCHIVE_HIERARCHY
- **Media Count:** $ARCHIVE_MEDIA

### Import Version
- **Format:** $(basename "$IMPORT_CONV")
- **Messages:** $IMPORT_MSGS
- **Has Hierarchy:** $IMPORT_HIERARCHY
- **Media Count:** $IMPORT_MEDIA

EOF
  fi
fi

cat >> "$REPORT_FILE" << EOF
---

## Recommendations

### For Developers

EOF

if [ $IMPORT_ONLY -gt 0 ]; then
  cat >> "$REPORT_FILE" << EOF
1. **High Priority:** Investigate missing ${IMPORT_ONLY} conversations in archive implementation
   - Review API endpoint coverage
   - Check pagination and filtering logic
   - Verify authentication scope

EOF
fi

cat >> "$REPORT_FILE" << EOF
2. Review hierarchy tracking accuracy
   - Archive: ${ARCHIVE_WORKSPACES} workspaces, ${ARCHIVE_PROJECTS} projects
   - Import: ${IMPORT_WORKSPACES} workspaces, ${IMPORT_PROJECTS} projects

3. Verify media download completeness
   - Archive: ${ARCHIVE_MEDIA} files
   - Import: ${IMPORT_MEDIA} files

### Testing This Provider Again

\`\`\`bash
# Re-run this validation
./scripts/validate-provider-coverage.sh ${PROVIDER} ${EXPORT_FILE}
\`\`\`

---

## Artifacts

All validation artifacts are available in:
\`${VALIDATION_DIR}\`

- \`archive-ids.txt\` - Conversation IDs from archive
- \`import-ids.txt\` - Conversation IDs from import
- \`archive-only-ids.txt\` - IDs only in archive
- \`import-only-ids.txt\` - IDs only in import (⚠️ missing from archive)
- \`common-ids.txt\` - IDs in both sources
- \`archive.log\` - Archive command output
- \`import.log\` - Import command output

EOF

# Display report
echo ""
echo -e "${GREEN}✓ Validation complete!${NC}"
echo ""
echo -e "${BLUE}=== Summary ===${NC}"
echo -e "Archive conversations: ${ARCHIVE_CONVS}"
echo -e "Import conversations:  ${IMPORT_CONVS}"
echo -e "Common:               ${COMMON}"
echo -e "Archive only:         ${ARCHIVE_ONLY}"
echo -e "Import only:          ${IMPORT_ONLY} $([ $IMPORT_ONLY -gt 0 ] && echo -e \"${RED}⚠️${NC}\" || echo -e \"${GREEN}✓${NC}\")"
echo ""
echo -e "${BLUE}Full report saved to:${NC}"
echo -e "${GREEN}${REPORT_FILE}${NC}"
echo ""
echo -e "${BLUE}View report:${NC}"
echo "cat ${REPORT_FILE}"
echo ""
echo -e "${BLUE}Or open in your editor:${NC}"
echo "open ${REPORT_FILE}  # macOS"
echo "code ${REPORT_FILE}  # VS Code"
