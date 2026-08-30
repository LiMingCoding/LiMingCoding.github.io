// Archive page — Tier 3: sort, monthly histogram, random pick, client-side
// pagination, plus the Pagefind inline-search glue.
//
// Vanilla JS, no build step. The static list (.archive-entry cards) supports
// category filtering / sorting / pagination; full-text search is delegated to
// the Pagefind component UI (see layouts/_partials/archive-search.html).
//
// data-* attributes read by this file are set by the Hugo archive template
// (data-title, data-date, data-reading-time, data-category on each entry).

(function () {
  'use strict';

  const root = document.querySelector('.archive-list');
  // The archive page is also the search center; if there is no .archive-list
  // we are not on the archive page and can bail early.
  if (!root) return;

  const entries = Array.from(root.querySelectorAll('.archive-entry'));

  // ---------- CATEGORY FILTER ----------
  // Active category is stored on the button via .archive-pill--active.
  // Empty string '' means "show all". Adding a new category in Hugo's
  // frontmatter automatically surfaces a button here — no JS or CSS change.
  let activeCategory = '';

  function applyCategoryFilter() {
    entries.forEach((el) => {
      const cat = el.dataset.category || '';
      const catMatch = !activeCategory || cat === activeCategory;
      el.dataset.hidden = catMatch ? '' : '1';
    });
    hideEmptyMonths();
    applyPage(1);  // reset to first page of the filtered set
  }

  const catPills = document.querySelectorAll('.archive-pill--cat');
  catPills.forEach((p) => {
    p.addEventListener('click', () => {
      catPills.forEach((q) => {
        q.classList.remove('archive-pill--active');
        q.setAttribute('aria-pressed', 'false');
      });
      p.classList.add('archive-pill--active');
      p.setAttribute('aria-pressed', 'true');

      activeCategory = p.dataset.cat || '';
      applyCategoryFilter();   // re-filters + resets to page 1
      writeHashPage(1);        // reflect in URL only on explicit user action
    });
  });

  // ---------- SORT ----------
  const sortSelect = document.getElementById('archive-sort-select');
  const originalOrder = entries.slice();  // cache DOM order to re-sort from

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

    // Re-insert in new order. We move each .archive-entry to the end of its
    // current parent (.archive-posts), so order within each month changes but
    // the year/month grouping is preserved.
    sorted.forEach((el) => {
      const parent = el.parentElement;
      if (parent) parent.appendChild(el);
    });

    applyPage(currentPage);  // re-paginate after reordering
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => sortEntries(e.target.value));
  }

  // ---------- HIDE EMPTY MONTH/YEAR GROUPS ----------
  function hideEmptyMonths() {
    document.querySelectorAll('.archive-month').forEach((m) => {
      const anyVisible = Array.from(m.querySelectorAll('.archive-entry')).some((e) => !e.dataset.hidden);
      m.style.display = anyVisible ? '' : 'none';
    });
    document.querySelectorAll('.archive-year').forEach((y) => {
      const anyVisible = Array.from(y.querySelectorAll('.archive-month')).some((m) => m.style.display !== 'none');
      y.style.display = anyVisible ? '' : 'none';
    });
  }

  // ---------- HISTOGRAM ----------
  function buildHistogram() {
    const container = document.getElementById('archive-histogram');
    if (!container) return;

    const buckets = new Map();
    entries.forEach((el) => {
      const d = el.dataset.date;
      if (!d) return;
      const date = new Date(d);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      buckets.set(key, (buckets.get(key) || 0) + 1);
    });

    if (buckets.size === 0) return;

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
        return Math.max(now - t, 24 * 3600 * 1000);  // clamp to >= 1 day
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
      pick.classList.add('archive-entry--picked');
      window.setTimeout(() => { window.location.href = link.href; }, 180);
    }
  }

  if (randomBtn) {
    randomBtn.addEventListener('click', pickRandom);
  }

  // ---------- PAGINATOR ----------
  // Client-side pagination over the (category-filtered) static list.
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
      try { history.replaceState(null, '', window.location.pathname + window.location.search + target); }
      catch (_) { window.location.hash = target; }
    }
  }

  function applyPage(page) {
    const total = visibleEntries().length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    currentPage = Math.min(Math.max(1, page), totalPages);

    const visible = visibleEntries();
    const slice = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    const sliceSet = new Set(slice);
    entries.forEach((el) => {
      el.style.display = sliceSet.has(el) ? '' : 'none';
    });

    // Year/month grouping: hide headers whose entries are all off-page/hidden.
    document.querySelectorAll('.archive-month').forEach((m) => {
      const any = Array.from(m.querySelectorAll('.archive-entry')).some((e) => e.style.display !== 'none');
      m.style.display = any ? '' : 'none';
    });
    document.querySelectorAll('.archive-year').forEach((y) => {
      const any = Array.from(y.querySelectorAll('.archive-month')).some((m) => m.style.display !== 'none');
      y.style.display = any ? '' : 'none';
    });

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

  window.addEventListener('hashchange', () => {
    // A category-filter view has no query; only paginate the static list when
    // the search results are not shown.
    if (document.body.classList.contains('pf-searching')) return;
    applyPage(readHashPage());
  });

  // ---------- PAGEFIND SEARCH GLUE ----------
  // Responsibilities:
  //   1. Toggle between the static archive list and the Pagefind results:
  //      when a query is active, body gets .pf-searching so CSS hides the
  //      static list / histogram / paginator and shows only the results. The
  //      taxonomy chips at the top are never toggled.
  //   2. Two-way sync with ?q= in the URL so searches are shareable/reloadable
  //      (Pagefind 1.5.2 does not manage the URL itself).
  //   3. Apply an incoming ?q= (e.g. from the retired /search/ redirect) on
  //      first load by triggering the shared instance.
  const params = new URLSearchParams(window.location.search);
  const initialQuery = params.get('q');

  // Pre-hide the static list before the (async) index loads to avoid a flash
  // of the list followed by results.
  if (initialQuery) document.body.classList.add('pf-searching');

  function setSearching(on) {
    document.body.classList.toggle('pf-searching', !!on);
  }

  function syncUrl(term) {
    const url = new URL(window.location.href);
    if (term) url.searchParams.set('q', term);
    else url.searchParams.delete('q');
    // Drop any #page= while searching so pagination and the results view do
    // not fight over the URL.
    if (term) url.hash = '';
    try { history.replaceState(null, '', url.toString()); } catch (_) { /* ignore */ }
  }

  function initPagefind() {
    const searchWrap = document.getElementById('pagefind-search');
    if (!searchWrap || !window.PagefindComponents) return;

    const manager = window.PagefindComponents.getInstanceManager();
    // Get (not create) — the <pagefind-config instance="blog"> element has
    // already created this instance during its own connectedCallback.
    if (!manager.hasInstance('blog')) return;
    const instance = manager.getInstance('blog');

    // The <pagefind-input> updates its own field via the SAME 'search' hook,
    // so reacting here for URL sync + list toggle introduces no feedback loop.
    instance.on('search', (term) => {
      const t = (term || '').trim();
      setSearching(t.length > 0);
      syncUrl(t);
      if (t.length === 0) applyPage(readHashPage());  // restore static list view
    });

    // Apply an incoming ?q= once the instance is ready. triggerSearch drives
    // the whole flow (input self-sync, our hook, results render).
    if (initialQuery) instance.triggerSearch(initialQuery);
  }

  // The Pagefind component script is loaded with `defer` in <head>, so
  // window.PagefindComponents and the custom element definitions exist before
  // this body script (also deferred) runs.
  initPagefind();

  // ---------- INIT ----------
  buildHistogram();
  applyCategoryFilter();
})();
