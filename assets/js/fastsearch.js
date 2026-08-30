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

function makeSnippet(item, matches) {
    let raw = item.content || item.summary || '';
    let text = stripHtml(raw);
    if (!text) return { snippet: '', highlightRanges: [] };

    const CONTEXT = 80;
    const MAX = 200;

    let contentMatches = [];
    if (matches) {
        contentMatches = matches.filter(m => m.key === 'content' || m.key === 'summary');
    }

    let center = 0;
    if (contentMatches.length > 0) {
        let allIndices = [];
        for (let m of contentMatches) {
            if (m.indices) {
                for (let [start, end] of m.indices) {
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

    let highlightRanges = [];
    if (contentMatches.length > 0) {
        let allIndices = [];
        for (let m of contentMatches) {
            if (m.indices) {
                for (let [start, end] of m.indices) {
                    if (end >= snippetStart && start <= snippetEnd) {
                        let lo = Math.max(start, snippetStart) - snippetStart;
                        let hi = Math.min(end + 1, snippetEnd) - snippetStart;
                        allIndices.push([lo, hi]);
                    }
                }
            }
        }
        allIndices.sort((a, b) => a[0] - b[0]);
        highlightRanges = mergeRanges(allIndices);
    }

    let prefix = snippetStart > 0 ? '…' : '';
    let suffix = snippetEnd < text.length ? '…' : '';

    return { snippet: prefix + snippet + suffix, highlightRanges, offset: snippetStart, prefixLen: prefix.length };
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

function renderSnippetWithHighlight(snippet, highlightRanges, prefixLen) {
    if (highlightRanges.length === 0) {
        return escapeHtml(snippet);
    }

    let adjustedRanges = highlightRanges.map(r => [r[0] + prefixLen, r[1] + prefixLen]);

    let parts = [];
    let cursor = 0;
    for (let [start, end] of adjustedRanges) {
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

function makeTitleHtml(title, matches) {
    let titleMatches = matches ? matches.filter(m => m.key === 'title') : [];
    if (titleMatches.length === 0 || !titleMatches[0].indices || titleMatches[0].indices.length === 0) {
        return escapeHtml(title);
    }

    let ranges = mergeRanges(titleMatches[0].indices);
    let parts = [];
    let cursor = 0;
    for (let [start, end] of ranges) {
        if (start > cursor) {
            parts.push(escapeHtml(title.slice(cursor, start)));
        }
        parts.push('<mark>' + escapeHtml(title.slice(start, end + 1)) + '</mark>');
        cursor = end + 1;
    }
    if (cursor < title.length) {
        parts.push(escapeHtml(title.slice(cursor)));
    }
    return parts.join('');
}

window.onload = function () {
    let xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
            if (xhr.status === 200) {
                let data = JSON.parse(xhr.responseText);
                if (data) {
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
                }
            } else {
                console.log(xhr.responseText);
            }
        }
    };
    xhr.open('GET', "../index.json");
    xhr.send();
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
                const titleHtml = makeTitleHtml(ri.title, matches);
                const { snippet, highlightRanges, prefixLen } = makeSnippet(ri, matches);
                const snippetHtml = renderSnippetWithHighlight(snippet, highlightRanges, 0);

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