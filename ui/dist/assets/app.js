/**
 * AI Vault Web UI
 * Lightweight vanilla JavaScript SPA
 */

const API_BASE = window.location.origin + '/api';

class App {
  constructor() {
    this.currentPage = 'dashboard';
    this.currentOffset = 0;
    this.currentLimit = 50;
    this.init();
  }

  async init() {
    // Setup navigation
    document.querySelectorAll('.nav-link').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.dataset.page;
        this.navigateTo(page);
      });
    });

    // Setup search on enter
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.performSearch();
        }
      });
    }

    // Setup filters
    const providerFilter = document.getElementById('provider-filter');
    const sortFilter = document.getElementById('sort-filter');
    if (providerFilter && sortFilter) {
      providerFilter.addEventListener('change', () => this.loadConversations());
      sortFilter.addEventListener('change', () => this.loadConversations());
    }

    // Load initial data
    await this.loadDashboard();
  }

  navigateTo(page) {
    // Update nav links
    document.querySelectorAll('.nav-link').forEach((link) => {
      link.classList.remove('active');
      if (link.dataset.page === page) {
        link.classList.add('active');
      }
    });

    // Update pages
    document.querySelectorAll('.page').forEach((p) => {
      p.classList.remove('active');
    });
    document.getElementById(`${page}-page`).classList.add('active');

    this.currentPage = page;

    // Load page data
    switch (page) {
      case 'dashboard':
        this.loadDashboard();
        break;
      case 'conversations':
        this.loadConversations();
        break;
      case 'search':
        // Search is interactive
        break;
      case 'media':
        this.loadMedia();
        break;
      case 'schedules':
        this.loadSchedules();
        break;
      case 'settings':
        this.loadSettings();
        break;
    }
  }

  showLoading() {
    document.getElementById('loading-overlay').classList.remove('hidden');
  }

  hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
  }

  showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    const container = document.getElementById('toast-container');
    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 5000);
  }

  async apiGet(endpoint) {
    try {
      const response = await fetch(`${API_BASE}${endpoint}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      this.showToast(`API Error: ${error.message}`, 'error');
      throw error;
    }
  }

  async apiPost(endpoint, data) {
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      this.showToast(`API Error: ${error.message}`, 'error');
      throw error;
    }
  }

  async loadDashboard() {
    this.showLoading();
    try {
      // Load stats
      const convData = await this.apiGet('/conversations/stats');
      document.getElementById('total-conversations').textContent =
        convData.totalConversations || 0;
      document.getElementById('total-messages').textContent = convData.totalMessages || 0;

      // Load media stats
      const mediaData = await this.apiGet('/media/stats');
      document.getElementById('total-media').textContent = mediaData.totalFiles || 0;

      // Load providers
      const providersData = await this.apiGet('/providers');
      document.getElementById('total-providers').textContent =
        providersData.providers?.length || 0;

      // Populate provider filter
      const providerFilter = document.getElementById('provider-filter');
      const mediaProviderFilter = document.getElementById('media-provider-filter');
      providersData.providers?.forEach((provider) => {
        const option = document.createElement('option');
        option.value = provider.name;
        option.textContent = provider.displayName || provider.name;
        providerFilter.appendChild(option.cloneNode(true));
        mediaProviderFilter.appendChild(option.cloneNode(true));
      });

      // Display providers
      const providersList = document.getElementById('providers-list');
      providersList.innerHTML = '';

      for (const provider of providersData.providers || []) {
        try {
          const status = await this.apiGet(`/providers/${provider.name}/status`);
          const card = document.createElement('div');
          card.className = 'provider-card';
          card.innerHTML = `
            <h4>${status.displayName || provider.name}</h4>
            <span class="status ${status.isAuthenticated ? 'connected' : 'disconnected'}">
              ${status.isAuthenticated ? '✓ Connected' : '✗ Disconnected'}
            </span>
            <p><strong>Auth Method:</strong> ${status.authMethod}</p>
            ${
              convData.byProvider?.[provider.name]
                ? `<p><strong>Conversations:</strong> ${convData.byProvider[provider.name].conversations}</p>`
                : ''
            }
          `;
          providersList.appendChild(card);
        } catch (error) {
          console.error(`Failed to load provider ${provider.name}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      this.hideLoading();
    }
  }

  async loadConversations() {
    this.showLoading();
    try {
      const provider = document.getElementById('provider-filter').value;
      const sortValue = document.getElementById('sort-filter').value;
      const [sortBy, sortOrder] = sortValue.split('-');
      const limit = parseInt(document.getElementById('limit-filter').value) || 50;

      const params = new URLSearchParams({
        offset: this.currentOffset,
        limit,
        sortBy,
        sortOrder,
      });

      if (provider) {
        params.append('provider', provider);
      }

      const data = await this.apiGet(`/conversations?${params}`);

      const list = document.getElementById('conversations-list');
      list.innerHTML = '';

      data.conversations.forEach((conv) => {
        const card = document.createElement('div');
        card.className = 'conversation-card';
        card.innerHTML = `
          <h4>${this.escapeHtml(conv.title || 'Untitled')}</h4>
          <p>${this.escapeHtml(conv.preview || 'No preview available')}</p>
          <div class="meta">
            <span>Provider: ${conv.provider}</span>
            <span>Messages: ${conv.messageCount || 0}</span>
            <span>Updated: ${new Date(conv.updatedAt).toLocaleDateString()}</span>
          </div>
        `;
        card.addEventListener('click', () => this.showConversation(conv.provider, conv.id));
        list.appendChild(card);
      });

      // Update pagination
      document.getElementById('page-info').textContent = `Showing ${this.currentOffset + 1}-${
        this.currentOffset + data.conversations.length
      } of ${data.pagination.total}`;
      document.getElementById('prev-btn').disabled = this.currentOffset === 0;
      document.getElementById('next-btn').disabled = !data.pagination.hasMore;
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      this.hideLoading();
    }
  }

  async showConversation(provider, id) {
    this.showLoading();
    try {
      const data = await this.apiGet(`/conversations/${provider}/${id}`);

      // Create modal or navigate to detail view
      const modal = document.createElement('div');
      modal.className = 'loading-overlay';
      modal.style.alignItems = 'flex-start';
      modal.style.overflow = 'auto';
      modal.innerHTML = `
        <div style="background: var(--bg); padding: 2rem; border-radius: var(--radius); max-width: 800px; width: 90%; margin: 2rem auto;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h2>${this.escapeHtml(data.conversation.title || 'Untitled')}</h2>
            <button class="btn" onclick="this.parentElement.parentElement.parentElement.remove()">Close</button>
          </div>
          <div style="margin-bottom: 1rem; color: var(--text-secondary);">
            <p>Provider: ${provider}</p>
            <p>Created: ${new Date(data.conversation.createdAt).toLocaleString()}</p>
            <p>Updated: ${new Date(data.conversation.updatedAt).toLocaleString()}</p>
            <p>Messages: ${data.conversation.messages?.length || 0}</p>
          </div>
          <hr style="border: none; border-top: 1px solid var(--border); margin: 1rem 0;">
          <div style="white-space: pre-wrap; font-family: monospace; max-height: 60vh; overflow: auto;">
            ${this.escapeHtml(data.markdown || JSON.stringify(data.conversation, null, 2))}
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    } catch (error) {
      console.error('Failed to load conversation:', error);
    } finally {
      this.hideLoading();
    }
  }

  async performSearch() {
    const query = document.getElementById('search-input').value.trim();
    if (!query) {
      this.showToast('Please enter a search query', 'warning');
      return;
    }

    this.showLoading();
    try {
      const data = await this.apiPost('/search/query', { query, limit: 50 });

      const results = document.getElementById('search-results');
      results.innerHTML = '';

      if (data.results.length === 0) {
        results.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No results found</p>';
        return;
      }

      data.results.forEach((result) => {
        const card = document.createElement('div');
        card.className = 'search-result';
        card.innerHTML = `
          <h4>${this.escapeHtml(result.title)}</h4>
          <p>${this.escapeHtml(result.preview)}</p>
          <div class="meta">
            <span>Provider: ${result.provider}</span>
            <span>Score: ${result.score.toFixed(2)}</span>
            <span>Updated: ${new Date(result.updatedAt).toLocaleDateString()}</span>
          </div>
          ${
            result.matches.length > 0
              ? `<div class="context">"...${this.escapeHtml(result.matches[0].context)}..."</div>`
              : ''
          }
        `;
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => this.showConversation(result.provider, result.id));
        results.appendChild(card);
      });

      this.showToast(`Found ${data.results.length} results`, 'success');
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      this.hideLoading();
    }
  }

  async loadMedia() {
    this.showLoading();
    try {
      // Load media stats
      const statsData = await this.apiGet('/media/stats');
      const statsGrid = document.getElementById('media-stats');
      statsGrid.innerHTML = `
        <div class="stat-card">
          <div class="stat-label">Total Files</div>
          <div class="stat-value">${statsData.totalFiles || 0}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Size</div>
          <div class="stat-value">${this.formatBytes(statsData.totalSize || 0)}</div>
        </div>
      `;

      // Load media list
      const provider = document.getElementById('media-provider-filter').value;
      const type = document.getElementById('media-type-filter').value;

      const params = new URLSearchParams({ limit: 100 });
      if (provider) params.append('provider', provider);
      if (type) params.append('type', type);

      const data = await this.apiGet(`/media?${params}`);

      const mediaList = document.getElementById('media-list');
      mediaList.innerHTML = '';

      data.media.forEach((item) => {
        const mediaItem = document.createElement('div');
        mediaItem.className = 'media-item';

        if (item.type === 'image') {
          mediaItem.innerHTML = `<img src="/api/media/${item.provider}/${item.hash}" alt="${item.filename || 'Image'}" />`;
        } else {
          mediaItem.innerHTML = `<div style="padding: 1rem; text-align: center;">${item.filename || item.type}</div>`;
        }

        mediaList.appendChild(mediaItem);
      });
    } catch (error) {
      console.error('Failed to load media:', error);
    } finally {
      this.hideLoading();
    }
  }

  async loadSchedules() {
    this.showLoading();
    try {
      const data = await this.apiGet('/schedules');

      const list = document.getElementById('schedules-list');
      list.innerHTML = '';

      if (data.schedules.length === 0) {
        list.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No schedules configured</p>';
        return;
      }

      data.schedules.forEach((schedule) => {
        const card = document.createElement('div');
        card.className = 'schedule-card';
        card.innerHTML = `
          <div class="info">
            <h4>${this.escapeHtml(schedule.description)}</h4>
            <p>Provider: ${schedule.provider} | Cron: ${schedule.cron}</p>
            <p>Status: ${schedule.enabled ? 'Enabled' : 'Disabled'}</p>
          </div>
          <div class="actions">
            <button class="btn" onclick="app.toggleSchedule('${schedule.id}', ${!schedule.enabled})">
              ${schedule.enabled ? 'Disable' : 'Enable'}
            </button>
            <button class="btn" style="background: var(--danger); color: white;" onclick="app.deleteSchedule('${schedule.id}')">
              Delete
            </button>
          </div>
        `;
        list.appendChild(card);
      });
    } catch (error) {
      console.error('Failed to load schedules:', error);
    } finally {
      this.hideLoading();
    }
  }

  async loadSettings() {
    this.showLoading();
    try {
      const data = await this.apiGet('/settings/info');

      const infoDiv = document.getElementById('system-info');
      infoDiv.innerHTML = `
        <p><strong>Version:</strong> ${data.info.version}</p>
        <p><strong>Platform:</strong> ${data.info.platform} (${data.info.arch})</p>
        <p><strong>Node Version:</strong> ${data.info.nodeVersion}</p>
        <p><strong>Archive Directory:</strong> ${data.info.archiveDir}</p>
      `;

      document.getElementById('archive-dir').value = data.info.archiveDir;
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      this.hideLoading();
    }
  }

  async triggerArchive() {
    const provider = prompt('Enter provider name (or leave empty for all):');

    this.showLoading();
    try {
      const data = await this.apiPost('/archive/start', {
        provider: provider || undefined,
      });

      this.showToast(`Archive started: ${data.operationId}`, 'success');

      // Poll for completion
      const checkStatus = async () => {
        try {
          const status = await this.apiGet(`/archive/operation/${data.operationId}`);
          if (status.status === 'completed') {
            this.showToast('Archive completed successfully!', 'success');
            this.loadDashboard();
          } else if (status.status === 'failed') {
            this.showToast(`Archive failed: ${status.error}`, 'error');
          } else {
            setTimeout(checkStatus, 2000);
          }
        } catch (error) {
          console.error('Failed to check archive status:', error);
        }
      };

      setTimeout(checkStatus, 2000);
    } catch (error) {
      console.error('Failed to start archive:', error);
    } finally {
      this.hideLoading();
    }
  }

  async rebuildSearchIndex() {
    if (!confirm('Rebuild search index? This may take a few minutes.')) {
      return;
    }

    this.showLoading();
    try {
      const data = await this.apiPost('/search/index', {});
      this.showToast(
        `Search index rebuilt: ${data.stats.documentsIndexed} documents indexed`,
        'success'
      );
    } catch (error) {
      console.error('Failed to rebuild search index:', error);
    } finally {
      this.hideLoading();
    }
  }

  async toggleSchedule(id, enable) {
    this.showLoading();
    try {
      await this.apiPost(`/schedules/${id}/${enable ? 'enable' : 'disable'}`, {});
      this.showToast(`Schedule ${enable ? 'enabled' : 'disabled'}`, 'success');
      this.loadSchedules();
    } catch (error) {
      console.error('Failed to toggle schedule:', error);
    } finally {
      this.hideLoading();
    }
  }

  async deleteSchedule(id) {
    if (!confirm('Delete this schedule?')) {
      return;
    }

    this.showLoading();
    try {
      await fetch(`${API_BASE}/schedules/${id}`, { method: 'DELETE' });
      this.showToast('Schedule deleted', 'success');
      this.loadSchedules();
    } catch (error) {
      console.error('Failed to delete schedule:', error);
    } finally {
      this.hideLoading();
    }
  }

  prevPage() {
    if (this.currentOffset > 0) {
      this.currentOffset = Math.max(0, this.currentOffset - this.currentLimit);
      this.loadConversations();
    }
  }

  nextPage() {
    this.currentOffset += this.currentLimit;
    this.loadConversations();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}

// Initialize app
const app = new App();
