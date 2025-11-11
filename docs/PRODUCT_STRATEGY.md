# AI Vault - Product Strategy

## Vision

AI Vault's mission is to give users complete ownership and control over their AI interactions. While the CLI provides powerful automation and archival capabilities, a visual interface unlocks new ways to explore, search, and understand your archived AI conversations.

## Web UI / Desktop App Strategy

### Design Principles

1. **Lightweight & Portable** - Minimal dependencies, fast startup, low resource usage
2. **Clean & Minimal Design** - Focus on content, reduce visual noise, intuitive navigation
3. **Local-First** - No cloud services, all data stays on your machine
4. **Privacy-Focused** - View and search your data without any external connections
5. **Complementary to CLI** - Enhance, don't replace the CLI workflow

### Core Functionality (Priority 1)

The UI provides a visual layer over the CLI's archival capabilities:

#### 1. Dashboard Overview
- **Archive Statistics**
  - Total conversations by provider
  - Storage usage breakdown
  - Recent archive activity timeline
  - Media file statistics (images, videos, documents)

- **Provider Status Cards**
  - Quick status for each configured provider
  - Last archive timestamp
  - Number of new/updated conversations available
  - One-click archive trigger

#### 2. Archive Management
- **Manual Archive Trigger**
  - Select provider(s) to archive
  - Configure archive options (date range, limits, skip media)
  - Real-time progress indicator with logs
  - View archive history and results

- **Schedule Management**
  - View all scheduled backup tasks
  - Create/edit/delete schedules with visual cron builder
  - Enable/disable schedules
  - View schedule execution logs

#### 3. Conversation Browser
- **List View**
  - Paginated table of all archived conversations
  - Sort by date, provider, title, word count
  - Filter by provider, date range, search query
  - Visual indicators for hierarchy (workspace/project badges)
  - Click to view conversation details

- **Conversation Detail View**
  - Full conversation rendering with message history
  - Message timestamps and metadata
  - Inline media display (images, videos)
  - Download conversation as Markdown or JSON
  - View conversation metadata (tokens, model, create/update times)

#### 4. Settings & Configuration
- **Provider Management**
  - View configured providers
  - Test provider connections
  - Edit authentication credentials
  - Add new providers

- **Archive Settings**
  - Configure default archive directory
  - Set export formats (Markdown, JSON)
  - Configure concurrent download limits
  - Media deduplication settings

- **UI Preferences**
  - Theme selection (light/dark/auto)
  - Display density (compact/comfortable/spacious)
  - Date/time format preferences

### Advanced Features (Priority 2)

#### 1. Media Gallery
- **Visual Media Browser**
  - Grid view of all archived images and videos
  - Filter by provider, date, file type
  - Click to view full size with metadata
  - Show which conversations reference each media file
  - Bulk operations (export, delete duplicates)

#### 2. Hierarchy Explorer
- **Workspace/Project Tree View** (for supported providers)
  - Navigate hierarchical organization visually
  - Grok: workspaces → projects → conversations
  - ChatGPT: projects → conversations
  - Expandable tree with conversation counts
  - Drag-and-drop to reorganize (sync with disk structure)

#### 3. Import Assistant
- **Guided Import Wizard**
  - Drag-and-drop ZIP files or select directories
  - Auto-detect provider from file structure
  - Preview import contents before processing
  - Progress indicator with detailed status
  - View imported conversations immediately

### Search & Discovery (Priority 3)

#### 1. Full-Text Search
- **Powerful Search Engine**
  - Index all conversation text for instant search
  - Search across all providers or filter by specific platforms
  - Fuzzy matching for typos
  - Boolean operators (AND, OR, NOT)
  - Phrase search with quotes
  - Search within date ranges

- **Search Results View**
  - Ranked results with relevance scores
  - Highlighted search terms in context snippets
  - Filter results by provider, date, conversation metadata
  - Export search results as CSV or JSON

- **Search Filters**
  - Provider filter (multi-select)
  - Date range picker
  - Conversation length (message count, word count)
  - Contains media (images, videos, documents)
  - Workspace/project filter

#### 2. Conversation Analytics
- **Usage Insights**
  - Conversation frequency over time (timeline chart)
  - Most active providers
  - Average conversation length trends
  - Token usage statistics (where available)
  - Media generation trends (images, videos)

- **Content Analysis**
  - Word clouds from conversation topics
  - Most discussed subjects (keyword extraction)
  - Conversation length distribution
  - Provider comparison charts

#### 3. Smart Collections
- **Auto-Generated Collections**
  - Recently archived
  - Most referenced (high value conversations)
  - Long conversations (deep research sessions)
  - Media-rich conversations
  - Conversations with code artifacts

- **Manual Collections**
  - Create custom collections with tags
  - Add conversations to multiple collections
  - Share collection views (export as manifest)

### Technical Architecture

#### Local API Server

A lightweight REST API provides a consistent interface for both the CLI and web UI:

**Technology Stack:**
- **Framework:** Express.js (minimal, well-established)
- **Port:** Configurable, default `3141` (local only, no external access)
- **Transport:** HTTP REST (simple, portable, language-agnostic)
- **Data Access:** Direct file system operations using existing storage layer

**API Endpoints:**

```
# Provider Operations
GET    /api/providers                  # List configured providers
GET    /api/providers/:provider/status # Get provider status
POST   /api/providers/:provider/test   # Test provider connection
PUT    /api/providers/:provider        # Update provider config

# Archive Operations
GET    /api/archive/status             # Get current archive status
POST   /api/archive/start              # Start archive operation
GET    /api/archive/logs/:id           # Get archive operation logs
GET    /api/archive/history            # List previous archives

# Schedule Operations
GET    /api/schedules                  # List all schedules
POST   /api/schedules                  # Create new schedule
PUT    /api/schedules/:id              # Update schedule
DELETE /api/schedules/:id              # Delete schedule
POST   /api/schedules/:id/enable       # Enable schedule
POST   /api/schedules/:id/disable      # Disable schedule

# Conversation Operations
GET    /api/conversations              # List conversations (paginated, filtered)
GET    /api/conversations/:id          # Get conversation details
GET    /api/conversations/search       # Full-text search conversations
GET    /api/conversations/stats        # Get conversation statistics

# Media Operations
GET    /api/media                      # List media files
GET    /api/media/:hash                # Get media file by hash
GET    /api/media/stats                # Get media statistics

# Settings Operations
GET    /api/settings                   # Get all settings
PUT    /api/settings                   # Update settings
GET    /api/settings/info              # Get system info (version, paths)

# Search Operations (Priority 3)
POST   /api/search/index               # Rebuild search index
POST   /api/search/query               # Execute search query
GET    /api/search/suggestions         # Get search suggestions
```

**API Features:**
- JSON request/response format
- Streaming for long-running operations (archive, import)
- Server-Sent Events (SSE) for real-time progress updates
- Error handling with consistent error format
- CORS enabled for local development
- Optional API key for basic security

#### Web UI Implementation

**Approach:** Lightweight web application served by the local API server

**Technology Stack:**
- **Framework:** React (familiar, component-based, efficient)
- **Build Tool:** Vite (fast, minimal config, small bundle)
- **UI Library:** Minimal custom components + Tailwind CSS
- **State Management:** React Context + hooks (no Redux complexity)
- **Search:** MiniSearch (lightweight, in-memory, full-text search)
- **Charts:** Recharts (simple, composable, small bundle)
- **Icons:** Lucide React (clean, minimal, tree-shakeable)
- **Routing:** React Router (standard, lightweight)

**Bundle Size Target:** < 500KB gzipped (excluding media preview dependencies)

**UI Structure:**
```
ui/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── Dashboard/       # Dashboard widgets
│   │   ├── Conversations/   # Conversation list/detail
│   │   ├── Settings/        # Settings panels
│   │   ├── Search/          # Search interface
│   │   └── common/          # Shared components (buttons, cards, etc.)
│   ├── hooks/               # Custom React hooks
│   │   ├── useApi.ts        # API client hooks
│   │   ├── useSearch.ts     # Search functionality
│   │   └── useSettings.ts   # Settings management
│   ├── pages/               # Page components
│   │   ├── Dashboard.tsx
│   │   ├── Conversations.tsx
│   │   ├── ConversationDetail.tsx
│   │   ├── Search.tsx
│   │   ├── Settings.tsx
│   │   └── MediaGallery.tsx
│   ├── services/            # API client
│   │   └── api.ts           # HTTP client wrapper
│   ├── types/               # TypeScript types
│   ├── utils/               # Helper functions
│   └── App.tsx              # Root component
├── public/                  # Static assets
├── package.json
├── vite.config.ts
└── tailwind.config.js
```

**Design System:**
- **Color Palette:** Minimal (neutral grays + single accent color)
- **Typography:** System fonts for performance
- **Spacing:** Consistent 8px grid
- **Animations:** Subtle, purposeful (no unnecessary motion)
- **Dark Mode:** Full support with system preference detection

#### Electron App (Optional Alternative)

For users who prefer a standalone desktop application:

**Pros:**
- Native application feel
- Auto-updates via Electron Updater
- System tray integration
- Native file system access
- Packaged distribution

**Cons:**
- Larger download size (~100MB vs <1MB)
- More complex build process
- Platform-specific builds required
- Higher resource usage

**Recommendation:** Start with web UI, add Electron wrapper if demand exists. The web UI can be packaged with Electron later without significant refactoring.

### Packaging & Distribution

#### Web UI + API Bundle

All components packaged together for seamless deployment:

**Installation:**
```bash
npm install -g ai-vault  # Includes CLI, API, and Web UI
```

**Usage:**
```bash
# Start web UI (auto-starts API server)
ai-vault ui

# Specify custom port
ai-vault ui --port 3142

# API only mode (for remote access, with auth)
ai-vault api --port 3141 --api-key YOUR_KEY
```

**File Structure After Installation:**
```
ai-vault/
├── dist/
│   ├── cli.js           # CLI entry point
│   ├── api/             # API server
│   │   ├── server.js
│   │   └── routes/
│   └── ui/              # Web UI build
│       ├── index.html
│       ├── assets/
│       └── ...
```

#### Standalone Builds

For advanced users or specific deployment scenarios:

**Docker Image:**
```dockerfile
FROM node:22-alpine
COPY . /app
WORKDIR /app
RUN npm install --production
EXPOSE 3141
CMD ["node", "dist/api/server.js"]
```

**Static Build:**
- Web UI can be built as static files
- Served by any web server (nginx, Apache, file://)
- API runs separately as Node.js process

### Security Considerations

1. **Local-Only by Default**
   - API binds to `127.0.0.1` only
   - No external network access
   - Prevents remote attacks

2. **Optional Authentication**
   - API key for remote access scenarios
   - CORS restrictions
   - Rate limiting on sensitive endpoints

3. **Data Protection**
   - All data stored locally
   - No telemetry or analytics
   - No external API calls (except for archiving)

4. **Secure Credentials**
   - API keys and cookies encrypted at rest
   - Never exposed in API responses
   - Secure deletion on logout

### Development Workflow

**Phase 1: API Server** (Week 1-2)
- Implement core API endpoints
- Add streaming support for long operations
- Write API tests
- Document API with OpenAPI spec

**Phase 2: Basic Web UI** (Week 2-4)
- Dashboard with provider overview
- Conversation browser and detail view
- Settings panel
- Archive trigger interface

**Phase 3: Search & Discovery** (Week 4-6)
- Implement full-text search indexing
- Build search UI with filters
- Add conversation analytics
- Create media gallery

**Phase 4: Polish & Testing** (Week 6-7)
- Responsive design refinement
- Performance optimization
- End-to-end testing
- User acceptance testing

### Success Metrics

**Performance Targets:**
- API response time: < 100ms for most endpoints
- UI initial load: < 2s on average hardware
- Search response: < 200ms for typical queries
- Archive trigger: < 5s to start background operation

**User Experience Goals:**
- Intuitive navigation (users accomplish tasks without documentation)
- Fast iteration (no waiting for operations to complete)
- Visual feedback (always know what's happening)
- Error recovery (graceful handling of failures)

### Future Enhancements

**Phase 2 (Post-Launch):**
- Browser extension for one-click archiving
- Mobile companion app (read-only view)
- Collaboration features (share collections)
- Export to knowledge bases (Obsidian, Notion)
- AI-powered conversation summarization
- Cross-conversation insights (find patterns, connections)

**Community Requests:**
- Electron desktop app wrapper
- Custom themes and styling
- Plugin system for UI extensions
- Conversation annotations and notes
- Advanced filtering with saved views

---

## Implementation Priority

### Must-Have (MVP)
1. Local API server with core endpoints
2. Dashboard with provider overview
3. Conversation browser and detail view
4. Archive trigger with progress indicator
5. Basic settings panel

### Should-Have (v1.0)
6. Schedule management UI
7. Media gallery
8. Full-text search (Priority 3)
9. Import assistant
10. Dark mode support

### Nice-to-Have (v1.x)
11. Conversation analytics
12. Smart collections
13. Advanced search filters
14. Hierarchy explorer
15. Custom themes

### Future (v2.0+)
16. Electron desktop app
17. Browser extension
18. Mobile app
19. Collaboration features
20. AI-powered insights

---

**Document Status:** Draft
**Last Updated:** 2025-11-11
**Next Review:** After MVP implementation
