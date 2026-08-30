// Archive page — Tier 3: client-side search, sort, and monthly histogram.
// Vanilla JS, no dependencies. Reads data-* attributes set by the Hugo
// archive template (data-title, data-excerpt, data-date, data-reading-time,
// data-category on each .archive-entry).

(function () {
  'use strict';

  const root = document.querySelector('.archive-list');
  if (!root) return;  // not on archive page

  const entries = Array.from(root.querySelectorAll('.archive-entry'));
  if (entries.length === 0) return;

  // Cache original DOM order so we can revert sort if needed
  const originalOrder = entries.slice();

  // ---------- SEARCH ----------
  const searchInput = document.getElementById('archive-search-input');
  const noResults = document.getElementById('archive-no-results');

  function applySearch(query) {
    const q = query.trim().toLowerCase();
    entries.forEach((el) => {
      if (!q) {
        el.dataset.searchHidden = '';
        return;
      }
      const title = (el.dataset.title || '').toLowerCase();
      const excerpt = (el.dataset.excerpt || '').toLowerCase();
      const cat = (el.dataset.category || '').toLowerCase();
      const match = title.includes(q) || excerpt.includes(q) || cat.includes(q);
      el.dataset.searchHidden = match ? '' : '1';
    });
    applyCategoryFilter();
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => applySearch(e.target.value));
  }

  // ---------- CATEGORY FILTER ----------
  // Active category is stored on the button via .archive-pill--active.
  // Empty string '' means "show all". Adding a new category in Hugo's
  // frontmatter automatically surfaces a button here — no JS or CSS change.
  let activeCategory = '';

  function applyCategoryFilter() {
    entries.forEach((el) => {
      // Preserve search-hidden state; just add category mismatch on top.
      const searchHidden = el.dataset.searchHidden === '1';
      const cat = el.dataset.category || '';
      const catMatch = !activeCategory || cat === activeCategory;
      el.dataset.hidden = (!catMatch || searchHidden) ? '1' : '';
    });
    hideEmptyMonths();
  }

  const catPills = document.querySelectorAll('.archive-pill--cat');
  catPills.forEach((p) => {
    p.addEventListener('click', () => {
      // Toggle active state on pills
      catPills.forEach((q) => {
        q.classList.remove('archive-pill--active');
        q.setAttribute('aria-pressed', 'false');
      });
      p.classList.add('archive-pill--active');
      p.setAttribute('aria-pressed', 'true');

      activeCategory = p.dataset.cat || '';
      applyCategoryFilter();
    });
  });

  // ---------- SORT ----------
  const sortSelect = document.getElementById('archive-sort-select');

  function sortEntries(mode) {
    const sorted = originalOrder.slice();
    const parseDate = (s) => new Date(s || 0).getTime();
    const parseNum = (s) => parseInt(s, 10) || 0;

    sorted.sort((a, b) => {
      switch (mode) {
        case 'date-asc':
          return parseDate(a.dataset.date) - parseDate(b.dataset.date);
        case 'date-desc':
          return parseDate(b.dataset.date) - parseDate(a.dataset.date);
        case 'title-asc':
          return (a.dataset.title || '').localeCompare(b.dataset.title || '', 'zh-Hans-CN');
        case 'title-desc':
          return (b.dataset.title || '').localeCompare(a.dataset.title || '', 'zh-Hans-CN');
        case 'reading-asc':
          return parseNum(a.dataset.readingTime) - parseNum(b.dataset.readingTime);
        case 'reading-desc':
          return parseNum(b.dataset.readingTime) - parseNum(a.dataset.readingTime);
        default:
          return 0;
      }
    });

    // Re-insert in new order. We move each .archive-entry to the end of
    // its current parent (.archive-posts), so the order within each month
    // changes but the year/month grouping is preserved.
    sorted.forEach((el) => {
      const parent = el.parentElement;
      if (parent) parent.appendChild(el);
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => sortEntries(e.target.value));
  }

  // ---------- HIDE EMPTY MONTH/YEAR GROUPS ----------
  function hideEmptyMonths() {
    // Hide months where all entries are hidden
    document.querySelectorAll('.archive-month').forEach((m) => {
      const entriesInMonth = m.querySelectorAll('.archive-entry');
      const anyVisible = Array.from(entriesInMonth).some((e) => !e.dataset.hidden);
      m.style.display = anyVisible ? '' : 'none';
    });
    // Hide years where all months are hidden
    document.querySelectorAll('.archive-year').forEach((y) => {
      const monthsInYear = y.querySelectorAll('.archive-month');
      const anyVisible = Array.from(monthsInYear).some((m) => m.style.display !== 'none');
      y.style.display = anyVisible ? '' : 'none';
    });
  }

  // ---------- HISTOGRAM ----------
  function buildHistogram() {
    const container = document.getElementById('archive-histogram');
    if (!container) return;

    // Group visible entries by year-month
    const buckets = new Map();
    entries.forEach((el) => {
      const d = el.dataset.date;
      if (!d) return;
      const date = new Date(d);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      buckets.set(key, (buckets.get(key) || 0) + 1);
    });

    if (buckets.size === 0) return;

    // Sort by key (chronological)
    const sorted = Array.from(buckets.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const maxCount = Math.max(...sorted.map(([, c]) => c));

    const titleEl = document.createElement('h4');
    titleEl.className = 'archive-histogram-title';
    titleEl.textContent = '📊 月度发文量';
    container.appendChild(titleEl);

    sorted.forEach(([key, count]) => {
      const row = document.createElement('div');
      row.className = 'archive-histogram-row';

      const label = document.createElement('span');
      label.className = 'archive-histogram-label';
      label.textContent = key;

      const barWrap = document.createElement('div');
      barWrap.className = 'archive-histogram-bar';

      const fill = document.createElement('div');
      fill.className = 'archive-histogram-fill';
      const pct = Math.max(8, (count / maxCount) * 100);
      fill.style.width = pct + '%';

      barWrap.appendChild(fill);

      const countEl = document.createElement('span');
      countEl.className = 'archive-histogram-count';
      countEl.textContent = count;

      row.appendChild(label);
      row.appendChild(barWrap);
      row.appendChild(countEl);
      container.appendChild(row);
    });
  }

  // ---------- RANDOM PICK ----------
  // Weighted toward older posts so the button truly helps you "discover"
  // something you wrote long ago and forgot about. Weight = (now - date).
  // If you only have a few posts (<=3) just pick uniformly to avoid surprises.
  const randomBtn = document.getElementById('archive-random-btn');

  function pickRandom() {
    const now = Date.now();
    const candidates = entries.filter((el) => !el.dataset.hidden);
    if (candidates.length === 0) return;

    let pick;
    if (candidates.length <= 3) {
      pick = candidates[Math.floor(Math.random() * candidates.length)];
    } else {
      const weights = candidates.map((el) => {
        const t = new Date(el.dataset.date || 0).getTime();
        // Older => larger weight; clamp to >=1 day so same-day posts still have mass
        return Math.max(now - t, 24 * 3600 * 1000);
      });
      const total = weights.reduce((a, b) => a + b, 0);
      let r = Math.random() * total;
      pick = candidates[candidates.length - 1];
      for (let i = 0; i < candidates.length; i++) {
        r -= weights[i];
        if (r <= 0) { pick = candidates[i]; break; }
      }
    }

    const link = pick.querySelector('.archive-entry-link');
    if (link && link.href) {
      // Tiny visual feedback: brief pulse on the picked card before navigating
      pick.classList.add('archive-entry--picked');
      window.setTimeout(() => { window.location.href = link.href; }, 180);
    }
  }

  if (randomBtn) {
    randomBtn.addEventListener('click', pickRandom);
  }


  // ---------- PAGINATOR ----------
  // Client-side pagination: respect search/sort visibility, sync URL hash.
  const PAGE_SIZE = 10;
  const paginatorEl = document.getElementById('archive-paginator');
  let currentPage = 1;

  function visibleEntries() {
    return entries.filter((el) => !el.dataset.hidden);
  }

  function readHashPage() {
    const m = /(?:#|&)page=(\d+)/.exec(window.location.hash || '');
    const n = m ? parseInt(m[1], 10) : 1;
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  function writeHashPage(n) {
    const target = '#page=' + n;
    if (window.location.hash !== target) {
      // replaceState avoids spamming browser history
      try { history.replaceState(null, '', window.location.pathname + window.location.search + target); }
      catch (_) { window.location.hash = target; }
    }
  }

  function applyPage(page) {
    const total = visibleEntries().length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    currentPage = Math.min(Math.max(1, page), totalPages);

    // Show only entries within the current page slice
    const visible = visibleEntries();
    const slice = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    const sliceSet = new Set(slice);
    entries.forEach((el) => {
      // Within current page slice AND not already hidden by search/filter => display
      if (sliceSet.has(el)) {
        el.style.display = '';
      } else if (el.dataset.hidden) {
        el.style.display = 'none';
      } else {
        // Outside page slice but still matches current filter => hide by page
        el.style.display = 'none';
      }
    });

    // Year/month grouping: hide headers whose entries are all hidden (page OR search)
    document.querySelectorAll('.archive-month').forEach((m) => {
      const any = Array.from(m.querySelectorAll('.archive-entry')).some((e) => e.style.display !== 'none');
      m.style.display = any ? '' : 'none';
    });
    document.querySelectorAll('.archive-year').forEach((y) => {
      const any = Array.from(y.querySelectorAll('.archive-month')).some((m) => m.style.display !== 'none');
      y.style.display = any ? '' : 'none';
    });

    // Render the paginator control bar
    if (paginatorEl) {
      paginatorEl.innerHTML = '';
      if (totalPages <= 1) return;  // single page: no controls

      const mkBtn = (label, page, opts = {}) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'archive-page-btn' + (opts.current ? ' archive-page-btn--current' : '') + (opts.disabled ? ' archive-page-btn--disabled' : '');
        b.textContent = label;
        if (!opts.disabled && !opts.current) {
          b.addEventListener('click', () => {
            writeHashPage(page);
            applyPage(page);
            paginatorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          });
        }
        return b;
      };

      paginatorEl.appendChild(mkBtn('« 上一页', currentPage - 1, { disabled: currentPage === 1 }));

      // Compact page-number list: show first, last, current ±1
      const numbers = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
      [...numbers].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b).reduce((prev, n) => {
        if (prev !== null && n - prev > 1) {
          const ell = document.createElement('span');
          ell.className = 'archive-page-ellipsis';
          ell.textContent = '…';
          paginatorEl.appendChild(ell);
        }
        paginatorEl.appendChild(mkBtn(String(n), n, { current: n === currentPage }));
        return n;
      }, null);

      paginatorEl.appendChild(mkBtn('下一页 »', currentPage + 1, { disabled: currentPage === totalPages }));

      const summary = document.createElement('span');
      summary.className = 'archive-page-summary';
      summary.textContent = `第 ${currentPage} / ${totalPages} 页 · 共 ${total} 篇`;
      paginatorEl.appendChild(summary);
    }
  }

  // Hook paginator into existing search/filter flow.
  // Easiest: re-run applyPage after every applySearch/applyCategoryFilter.
  // We wrap without changing the body.
  const _origApplySearch = applySearch;
  applySearch = function (q) { _origApplySearch(q); applyPage(1); writeHashPage(1); };
  const _origApplyCategoryFilter = applyCategoryFilter;
  applyCategoryFilter = function () {
    const visibleCount = _origApplyCategoryFilter() ?? entries.filter((e) => !e.dataset.hidden).length;
    if (noResults) noResults.hidden = visibleCount > 0;
    applyPage(1);
    writeHashPage(1);
  };
  const _origSortEntries = sortEntries;
  sortEntries = function (m) { _origSortEntries(m); applyPage(currentPage); };
  const _origHideEmptyMonths = hideEmptyMonths;
  hideEmptyMonths = function () { _origHideEmptyMonths(); };

  window.addEventListener('hashchange', () => applyPage(readHashPage()));

  // ---------- INIT ----------
  buildHistogram();
  applyPage(readHashPage());
})();
