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
    let visibleCount = 0;
    entries.forEach((el) => {
      if (!q) {
        el.dataset.hidden = '';
        visibleCount++;
        return;
      }
      const title = (el.dataset.title || '').toLowerCase();
      const excerpt = (el.dataset.excerpt || '').toLowerCase();
      const cat = (el.dataset.category || '').toLowerCase();
      const match = title.includes(q) || excerpt.includes(q) || cat.includes(q);
      el.dataset.hidden = match ? '' : '1';
      if (match) visibleCount++;
    });
    if (noResults) noResults.hidden = visibleCount > 0;
    hideEmptyMonths();
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => applySearch(e.target.value));
  }

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

  // ---------- INIT ----------
  buildHistogram();
})();
