import * as params from '@params';

let fuse;
let resList = document.getElementById('searchResults');
let sInput = document.getElementById('searchInput');
let first, last, current_elem = null
let resultsAvailable = false;

function stripHtml(raw) {
    let text = String(raw).replace(/<[^>]*>/g, ' ');
    text = text
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    return text.replace(/\s+/g, ' ').trim();
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Locate every literal occurrence of any whitespace-separated token in
// `query` inside `text` (case-insensitive). Returns sorted, merged
// [start, end) character ranges — exclusive end so callers can slice
// with text.slice(start, end) without an off-by-one.
function findLiteralRanges(text, query) {
    if (!query) return [];
    let tokens = query.split(/\s+/).filter(t => t.length > 0);
    if (tokens.length === 0) return [];
    let ranges = [];
    for (let token of tokens) {
        let pattern = new RegExp(escapeRegex(token), 'gi');
        let m;
        while ((m = pattern.exec(text)) !== null) {
            ranges.push([m.index, m.index + m[0].length]);
        }
    }
    if (ranges.length === 0) return [];
    ranges.sort((a, b) => a[0] - b[0]);
    return mergeRanges(ranges);
}

function makeSnippet(item, query, matches) {
    let raw = item.content || item.summary || '';
    let text = stripHtml(raw);
    if (!text) return { snippet: '' };

    const CONTEXT = 80;
    const MAX = 200;

    // Center the snippet window on the first literal query occurrence
    // (matches what the highlight will show). Fall back to Fuse's fuzzy
    // match position when the query words are not literally present.
    let center = 0;
    let literal = findLiteralRanges(text, query);
    if (literal.length > 0) {
        center = literal[0][0];
    } else if (matches) {
        let contentMatches = matches.filter(m => m.key === 'content' || m.key === 'summary');
        let allIndices = [];
        for (let m of contentMatches) {
            if (m.indices) {
                for (let [start] of m.indices) {
                    allIndices.push(start);
                }
            }
        }
        if (allIndices.length > 0) {
            allIndices.sort((a, b) => a - b);
            center = allIndices[0];
        }
    }

    let snippetStart = Math.max(0, center - CONTEXT);
    let snippetEnd = Math.min(text.length, snippetStart + MAX);
    snippetStart = Math.max(0, snippetEnd - MAX);

    let snippet = text.slice(snippetStart, snippetEnd);

    let prefix = snippetStart > 0 ? '…' : '';
    let suffix = snippetEnd < text.length ? '…' : '';

    return { snippet: prefix + snippet + suffix };
}

function mergeRanges(ranges) {
    if (ranges.length === 0) return [];
    let merged = [ranges[0]];
    for (let i = 1; i < ranges.length; i++) {
        let last = merged[merged.length - 1];
        if (ranges[i][0] <= last[1]) {
            last[1] = Math.max(last[1], ranges[i][1]);
        } else {
            merged.push(ranges[i]);
        }
    }
    return merged;
}

function renderSnippetWithHighlight(snippet, query) {
    let ranges = findLiteralRanges(snippet, query);
    if (ranges.length === 0) {
        return escapeHtml(snippet);
    }

    let parts = [];
    let cursor = 0;
    for (let [start, end] of ranges) {
        if (start > cursor) {
            parts.push(escapeHtml(snippet.slice(cursor, start)));
        }
        parts.push('<mark>' + escapeHtml(snippet.slice(start, end)) + '</mark>');
        cursor = end;
    }
    if (cursor < snippet.length) {
        parts.push(escapeHtml(snippet.slice(cursor)));
    }
    return parts.join('');
}

function makeTitleHtml(title, query) {
    let ranges = findLiteralRanges(title, query);
    if (ranges.length === 0) {
        return escapeHtml(title);
    }

    let parts = [];
    let cursor = 0;
    for (let [start, end] of ranges) {
        if (start > cursor) {
            parts.push(escapeHtml(title.slice(cursor, start)));
        }
        parts.push('<mark>' + escapeHtml(title.slice(start, end)) + '</mark>');
        cursor = end;
    }
    if (cursor < title.length) {
        parts.push(escapeHtml(title.slice(cursor)));
    }
    return parts.join('');
}

function loadSearchIndex() {
    return fetch('../index.json')
        .then(function (response) {
            if (!response.ok) {
                throw new Error('Search index returned HTTP ' + response.status);
            }
            return response.json();
        })
        .then(function (data) {
            if (!data) return;
            let options = {
                distance: 100,
                threshold: 0.4,
                ignoreLocation: true,
                includeMatches: true,
                keys: [
                    'title',
                    'permalink',
                    'summary',
                    'content'
                ]
            };
            if (params.fuseOpts) {
                options = {
                    isCaseSensitive: params.fuseOpts.iscasesensitive ?? false,
                    includeScore: params.fuseOpts.includescore ?? false,
                    includeMatches: params.fuseOpts.includematches ?? true,
                    minMatchCharLength: params.fuseOpts.minmatchcharlength ?? 1,
                    shouldSort: params.fuseOpts.shouldsort ?? true,
                    findAllMatches: params.fuseOpts.findallmatches ?? false,
                    keys: params.fuseOpts.keys ?? ['title', 'permalink', 'summary', 'content'],
                    location: params.fuseOpts.location ?? 0,
                    threshold: params.fuseOpts.threshold ?? 0.4,
                    distance: params.fuseOpts.distance ?? 100,
                    ignoreLocation: params.fuseOpts.ignorelocation ?? true
                }
            }
            fuse = new Fuse(data, options);
        })
        .catch(function (err) {
            console.error('Failed to load search index:', err);
        });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadSearchIndex);
} else {
    loadSearchIndex();
}

function activeToggle(ae) {
    document.querySelectorAll('.focus').forEach(function (element) {
        element.classList.remove("focus")
    });
    if (ae) {
        ae.focus()
        document.activeElement = current_elem = ae;
        ae.parentElement.classList.add("focus")
    } else {
        document.activeElement.parentElement.classList.add("focus")
    }
}

function reset() {
    resultsAvailable = false;
    resList.innerHTML = sInput.value = '';
    sInput.focus();
}

sInput.onkeyup = function (e) {
    if (fuse) {
        let results;
        let query = this.value.trim();
        if (!query) {
            resultsAvailable = false;
            resList.innerHTML = '';
            return;
        }
        if (params.fuseOpts) {
            results = fuse.search(query, { limit: params.fuseOpts.limit });
        } else {
            results = fuse.search(query);
        }
        if (results.length !== 0) {
            let resultSet = '';

            for (let item in results) {
                const r = results[item];
                const ri = r.item;
                const matches = r.matches;
                const titleHtml = makeTitleHtml(ri.title, query);
                const { snippet } = makeSnippet(ri, query, matches);
                const snippetHtml = renderSnippetWithHighlight(snippet, query);

                resultSet +=
                    `<li class="post-entry">` +
                    `<header class="entry-header">${titleHtml}&nbsp;»</header>` +
                    (snippetHtml ? `<div class="search-snippet">${snippetHtml}</div>` : '') +
                    `<a href="${escapeHtml(ri.permalink)}" aria-label="${escapeHtml(ri.title)}"></a>` +
                    `</li>`;
            }

            resList.innerHTML = resultSet;
            resultsAvailable = true;
            first = resList.firstChild;
            last = resList.lastChild;
        } else {
            resultsAvailable = false;
            resList.innerHTML = '';
        }
    }
}

sInput.addEventListener('search', function (e) {
    if (!this.value) reset()
})

document.onkeydown = function (e) {
    let key = e.key;
    let ae = document.activeElement;

    let inbox = document.getElementById("searchbox").contains(ae)

    if (ae === sInput) {
        let elements = document.getElementsByClassName('focus');
        while (elements.length > 0) {
            elements[0].classList.remove('focus');
        }
    } else if (current_elem) ae = current_elem;

    if (key === "Escape") {
        reset()
    } else if (!resultsAvailable || !inbox) {
        return
    } else if (key === "ArrowDown") {
        e.preventDefault();
        if (ae == sInput) {
            activeToggle(resList.firstChild.lastChild);
        } else if (ae.parentElement != last) {
            activeToggle(ae.parentElement.nextSibling.lastChild);
        }
    } else if (key === "ArrowUp") {
        e.preventDefault();
        if (ae.parentElement == first) {
            activeToggle(sInput);
        } else if (ae != sInput) {
            activeToggle(ae.parentElement.previousSibling.lastChild);
        }
    } else if (key === "ArrowRight") {
        ae.click();
    }
}