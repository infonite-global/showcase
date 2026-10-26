/**
 * results-kit.js
 * What every flow's results page draws the same way, so that each flow's own module draws only what
 * is its own: how an amount, a rate, a date and a moment are written; the cards, statements, facts,
 * tags and bars a record is drawn with; a record or a view that came in a shape nobody expected; the
 * search over a long list; a document opened over the page; the session's own view (its
 * connections, its messages, its consent) and its raw JSON; and the person the results are about —
 * the banner a crossed identity raises, the chip with their name and their profile.
 *
 * Nothing here reads a page's state: every piece takes what it draws. Like the other shared modules
 * it brings its own small helpers, so it depends on nothing loaded before it. Styles:
 * css/results-kit.css (class prefix `rk-`).
 */
(function () {
    'use strict';

    // ---------------------------------------------------------------- text

    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    /** The last part of a code, as words: `credit:mortgage_loan` is «mortgage loan». */
    const kindOf = (code) => (code ? String(code).split(':').pop().replace(/_/g, ' ') : '');
    const titleCase = (text) => String(text || '').toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, gap, letter) => gap + letter.toUpperCase());

    /** A name as the source wrote it, with one repair: capitals whose accented letters came small («MI PRéSTAMO») are capitals throughout. */
    function tidy(text) {
        const value = String(text ?? '').trim();
        return /[a-z]/.test(value) || !/\p{Ll}/u.test(value) ? value : value.toUpperCase();
    }

    /** A country's flag, drawn by Twemoji from its ISO code: an emoji flag does not show on every system. */
    function flagUrl(iso) {
        const points = [...String(iso).toUpperCase()].map(letter => (0x1f1e6 + letter.charCodeAt(0) - 65).toString(16));
        return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${points.join('-')}.svg`;
    }

    /** An engine's logo, from the public assets host, built from its code (a reference's channel is dropped). */
    function logoUrl(reference, shape = 'square') {
        const code = String(reference || '').split('-')[0];
        return `https://assets.infonite.dev/engine-logos/${encodeURIComponent(code)}/light-${shape}.png`;
    }

    // ---------------------------------------------------------------- how a figure is written

    /** Whether an amount came: a number, never an empty or `NaN` placeholder. */
    const has = (money) => !!money && money.amount !== null && money.amount !== undefined && money.amount !== '' && Number.isFinite(Number(money.amount));

    const formats = new Map();
    const formatter = (key, build) => formats.get(key) || formats.set(key, build()).get(key);

    /**
     * An amount in the house's notation, grouped at every size: the Spanish default leaves four
     * digits ungrouped, and 6541,73 € beside 11.000,00 € reads as two different styles.
     */
    function money(value, { sign = false, decimals = 2 } = {}) {
        if (!has(value)) return '—';
        const shape = { minimumFractionDigits: Math.min(2, decimals), maximumFractionDigits: decimals, useGrouping: 'always', signDisplay: sign ? 'exceptZero' : 'auto' };
        const currency = /^[A-Z]{3}$/.test(value.currency || '') ? value.currency : null;
        if (!currency) {
            const number = formatter(`n${decimals}${sign}`, () => new Intl.NumberFormat('es-ES', shape)).format(Number(value.amount));
            return `${number} ${esc(value.currency || '')}`.trim();
        }
        return formatter(`${currency}${decimals}${sign}`, () => new Intl.NumberFormat('es-ES', { style: 'currency', currency, ...shape })).format(Number(value.amount));
    }

    /** A rate or a return as people read it: «6,025 %», «+36,48 %». Empty when none came. */
    function pct(rate, { sign = false } = {}) {
        if (!rate || !Number.isFinite(Number(rate.value)) || rate.value === '' || rate.value === null) return '';
        const number = formatter(`p${sign}`, () => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3, signDisplay: sign ? 'exceptZero' : 'auto' })).format(Number(rate.value));
        return `${number}\u00a0${esc(rate.unit || '%')}`;
    }

    /** A quantity or a count without trailing zeros, grouped at every size: `12.456600` is 12,4566, 6171 is 6.171. Empty when there is none. */
    function qty(value) {
        if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return '';
        return formatter('q', () => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 6, useGrouping: 'always' })).format(Number(value));
    }

    /** A share as people read it: «40,5 %», and «<0,1 %» for some, but too little to round. */
    function share(part) {
        if (part > 0 && part < 0.001) return '&lt;0,1\u00a0%';
        return `${formatter('s', () => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 })).format(part * 100)}\u00a0%`;
    }

    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    /** A calendar date, never moved by the reader's time zone: «07 Oct 2026» (or «Oct 2026»). */
    function day(value, { month = false } = {}) {
        if (!value) return '—';
        const text = String(value);
        const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00Z` : text);
        if (Number.isNaN(date.getTime())) return esc(text);
        const tail = `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
        return month ? tail : `${String(date.getUTCDate()).padStart(2, '0')} ${tail}`;
    }

    /** A moment, to the second and in UTC, so a piece of evidence reads the same everywhere: «12 Sep 2026 · 12:16:20 UTC». */
    function stamp(value) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? String(value ?? '') : `${day(value)} · ${date.toISOString().slice(11, 19)} UTC`;
    }

    /** A life in one line: «Dec 2024 – Dec 2028». */
    const term = (from, to) => (from || to ? `${day(from, { month: true })} – ${day(to, { month: true })}` : '');

    const signOf = (value) => (has(value) ? (Number(value.amount) < 0 ? 'is-negative' : Number(value.amount) > 0 ? 'is-positive' : '') : '');
    const signOfRate = (rate) => (rate && Number.isFinite(Number(rate.value)) ? (Number(rate.value) < 0 ? 'is-negative' : Number(rate.value) > 0 ? 'is-positive' : '') : '');

    // ---------------------------------------------------------------- a record of a shape nobody expected

    const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
    /** A list that may have come as something else: anything but an array reads as an empty one. */
    const listOf = (value) => (Array.isArray(value) ? value : []);

    const NOT_DRAWN = 'It came in a shape this demo does not draw. RAW JSON shows it as it was returned.';

    /** The card a record that could not be drawn leaves in its place. */
    function broken(name, note = NOT_DRAWN) {
        return `
                <article class="rk-card is-broken">
                    <div class="rk-card-title"><h3>${esc(name || 'A record')}</h3><span class="rk-tag is-warn">not drawn</span></div>
                    <p class="rk-muted">${note}</p>
                </article>`;
    }

    /**
     * A record drawn whatever its shape: one that came in a form the page does not expect takes its
     * place as what `fallback` returns (a broken card when it gives nothing), and the rest of the view
     * still draws.
     */
    function safely(draw, args, fallback) {
        try {
            return draw(...args);
        } catch (error) {
            console.warn('Results: a record could not be drawn', error);
            try {
                return typeof fallback === 'function' ? fallback(error) : broken();
            } catch {
                return broken();
            }
        }
    }

    function empty(icon, title, text) {
        return `<div class="rk-empty"><span><i class="${icon}"></i></span><b>${title}</b><p>${text}</p></div>`;
    }

    /** What a view becomes when it cannot be drawn at all: a word about it, never a blank page. */
    const undrawn = () => `<div class="rk-page">${empty('fa-solid fa-triangle-exclamation', 'This view could not be drawn', 'The results came in a shape this demo does not expect. RAW JSON shows them as they are.')}</div>`;

    // ---------------------------------------------------------------- the pieces a record is drawn with

    /** A view's head, on the page's ground: its icon, its title and a line under it. */
    function head(icon, title, sub = '') {
        return `
            <header class="rk-head">
                <span class="rk-head-icon"><i class="${icon}"></i></span>
                <div class="min-w-0">
                    <h2 class="rk-title">${title}</h2>
                    ${sub ? `<p class="rk-sub">${sub}</p>` : ''}
                </div>
            </header>`;
    }

    /** A section's label, with how many it holds when `count` is given. */
    const sectionLabel = (icon, text, count) => `<span class="rk-section-label"><i class="${icon}"></i> ${text}${count === undefined || count === null ? '' : `<em>${count}</em>`}</span>`;

    /** The headline figure of a card: its label over it, both flush right, and what dates it under. */
    function amount(label, value, { sub = '', tone = '' } = {}) {
        return `<div class="rk-amount"><small>${label}</small><b class="${tone}">${value}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
    }

    /** A fact that came, for a row of facts or a ledger; nothing when none came. */
    const fact = (label, value, options = {}) => (value && value !== '—' ? { label, value, ...options } : null);

    /** The facts under a record's name: a row of label and value, all one size. */
    function facts(list) {
        const shown = list.filter(Boolean);
        if (!shown.length) return '';
        return `<dl class="rk-facts">${shown.map(item => `<div class="${item.wide ? 'is-wide' : ''}"><dt>${item.label}</dt><dd class="${item.tone || ''}"><span>${item.value}</span>${item.sub ? `<small>${item.sub}</small>` : ''}</dd></div>`).join('')}</dl>`;
    }

    /** A statement: label left, value flush right, the headline line first and larger; a meter may sit under it. */
    function ledger(rows) {
        const shown = rows.filter(Boolean);
        if (!shown.length) return '';
        return `<dl class="rk-ledger">${shown.map(item => (item.meter
            ? `<div class="rk-ledger-meter">${item.meter}</div>`
            : `<div class="${item.main ? 'is-main' : ''}"><dt>${item.label}</dt><dd class="${item.tone || ''}"><span>${item.value}</span>${item.sub ? `<small>${item.sub}</small>` : ''}</dd></div>`)).join('')}</dl>`;
    }

    /** A bar and its legend: how far along something is, from two figures one source gave. */
    function meter(part, { left, right = '', tone = '' }) {
        const width = Math.max(0, Math.min(1, part)) * 100;
        return `
            <div class="rk-meter ${tone} ${part > 0 ? '' : 'is-zero'}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${width.toFixed(1)}">
                <div class="rk-meter-bar"><span style="width:${width.toFixed(2)}%"></span></div>
                <div class="rk-meter-legend"><span>${left}</span>${right ? `<span>${right}</span>` : ''}</div>
            </div>`;
    }

    /** A line of small things beside a name: a number, what the source calls the record. */
    const subLine = (...parts) => parts.filter(Boolean).map(part => `<span>${part}</span>`).join('<i class="rk-dot"></i>');

    const go = (label) => `<span class="rk-card-go">${label} <i class="fa-solid fa-chevron-right"></i></span>`;

    /**
     * One record, one card: its name and number on the left, the figure it is read by on the right,
     * and the rest of what the source said in a row of facts underneath. Its tags go beside the name,
     * or over it (`above`) where a name is long and its tags must not move with it.
     */
    function card({ open = '', title, tags = '', above = false, sub = '', main = '', gauge = '', facts: list = [], below = '', foot = '', after = '' }) {
        return `
            <article class="rk-card ${open ? 'is-link' : ''}" ${open ? `onclick="${open}"` : ''}>
                <header class="rk-card-head">
                    <div class="rk-card-id">
                        ${above && tags ? `<div class="rk-card-tags">${tags}</div>` : ''}
                        <div class="rk-card-title"><h3 title="${esc(title)}">${esc(title)}</h3>${above ? '' : tags}</div>
                        ${sub ? `<div class="rk-card-sub">${sub}</div>` : ''}
                    </div>
                    ${main}
                </header>
                ${gauge}
                ${facts(list)}
                ${below}
                ${foot ? `<footer class="rk-card-foot">${foot}</footer>` : ''}
                ${after}
            </article>`;
    }

    /** The way back from a record's own page: «Accounts / My account» (`open` is the handler's code). */
    const crumbs = ({ label, open, title }) => `<nav class="rk-crumbs"><button type="button" onclick="${open}"><i class="fa-solid fa-chevron-left"></i>${label}</button><span>/</span><b>${esc(title)}</b></nav>`;

    /** A labelled value of a card of fields or a profile; a dash when none came. */
    const field = (label, value) => `<div class="rk-field"><span>${label}</span><b>${value || '—'}</b></div>`;

    // ---------------------------------------------------------------- finding a record in a long list

    /** Text the way the search compares it: no accents, no case, one space between words. */
    const fold = (text) => String(text ?? '').normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

    /** Every text and number inside a value, a few levels deep: all a record says about itself. */
    function leaves(value, depth = 3) {
        if (value === null || value === undefined) return [];
        if (typeof value === 'string' || typeof value === 'number') return [String(value)];
        if (depth <= 0 || typeof value !== 'object') return [];
        return (Array.isArray(value) ? value : Object.values(value)).flatMap(item => leaves(item, depth - 1));
    }

    /** An amount in every way someone may type it: -137.04, 137,04, 1033.55, 1.033,55. */
    function spellings(value) {
        if (!has(value)) return [];
        const plain = Math.abs(Number(value.amount)).toFixed(2);
        return [String(value.amount), plain, plain.replace('.', ','), money({ ...value, amount: plain })];
    }

    /** A search split into what must all be found: its words, or "a phrase" in quotes. */
    function termsOf(query) {
        const terms = [];
        String(query || '').replace(/"([^"]*)"|(\S+)/g, (_, phrase, word) => {
            const term = fold(phrase ?? word.replace(/"/g, ''));
            if (term) terms.push(term);
            return '';
        });
        return terms;
    }

    /** Each list's records as the search reads them, in the list's order, by the list's id. */
    const indexes = new Map();

    /**
     * What each record of a list on screen can be found by: `read` gives its text, and a record it
     * cannot read is found by nothing — the search never breaks the list. The list's records carry
     * `data-i`, their place in `items`.
     */
    function index(target, items, read) {
        indexes.set(target, items.map(item => {
            try {
                return fold(read(item));
            } catch {
                return '';
            }
        }));
    }

    /** The box that searches the list `target`: every word must match; quotes keep a phrase together. */
    function searchBox({ target, placeholder, label = placeholder, title }) {
        return `
                <label class="rk-search" title="${esc(title)}">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input type="search" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false" aria-label="${esc(label)}" data-target="${esc(target)}" oninput="InfoniteResults.search(this)" onkeydown="if (event.key === 'Escape') { this.value = ''; InfoniteResults.search(this); }">
                    <button type="button" class="rk-search-clear" onclick="InfoniteResults.clearSearch(this)" title="Clear the search"><i class="fa-solid fa-xmark"></i></button>
                </label>`;
    }

    /** What a list says when the search leaves nothing in it: a table's row (`colspan`) or a line. */
    const searchNone = (text, colspan = 0) => (colspan
        ? `<tr class="rk-search-none" hidden><td colspan="${colspan}"><i class="fa-solid fa-magnifying-glass"></i>${text}</td></tr>`
        : `<p class="rk-search-none" hidden><i class="fa-solid fa-magnifying-glass"></i>${text}</p>`);

    /**
     * Leaves in the list the records that hold every term; with no term, or on any failure, all of
     * them. A group of records (`data-search-group`) goes with its last record shown. The list's count
     * (`<target>Count`) says how many are left of how many.
     */
    function search(input) {
        const target = input.dataset.target;
        const list = document.getElementById(target);
        if (!list) return;
        const rows = [...list.querySelectorAll('[data-i]')];
        const texts = indexes.get(target) || [];
        let terms = [];
        try { terms = termsOf(input.value); } catch { terms = []; }
        let shown = 0;
        rows.forEach(row => {
            let hit = true;
            try { hit = !terms.length || terms.every(term => (texts[Number(row.dataset.i)] || '').includes(term)); } catch { hit = true; }
            row.hidden = !hit;
            if (hit) shown += 1;
        });
        list.querySelectorAll('[data-search-group]').forEach(group => { group.hidden = !group.querySelector('[data-i]:not([hidden])'); });
        const none = list.querySelector('.rk-search-none');
        if (none) none.hidden = shown > 0;
        const count = document.getElementById(`${target}Count`);
        if (count) count.textContent = terms.length ? `${shown} of ${rows.length}` : String(rows.length);
        input.closest('.rk-search')?.classList.toggle('is-filled', !!input.value);
    }

    function clearSearch(button) {
        const input = button.closest('.rk-search')?.querySelector('input');
        if (!input) return;
        input.value = '';
        search(input);
        input.focus();
    }

    // ---------------------------------------------------------------- a document, over the page

    /** The documents already fetched, by key: the API serves a document once every 5 seconds, so a second look is free. */
    const documents = new Map();
    let onScreen = null;

    const renderable = (type) => /^(application\/pdf|image\/)/.test(type || '');

    /**
     * Opens a document over the page in the browser's own viewer. `fetch` brings it as a Blob (the
     * application secret travels in a header, which no link can carry, so it is shown from memory) and
     * «Save to disk» keeps `name`. While it comes, the button that asked says so; if it does not come,
     * the button says why for a moment.
     */
    async function openDocument(button, { key, name, type = '', fetch }) {
        if (!button || button.classList.contains('is-busy')) return;
        // how it goes — opening, or why it could not — is laid over the button's face, never in
        // place of it: the button keeps its size, and the row it sits in never reflows
        const title = button.title;
        const iconOnly = !button.textContent.trim();
        const state = Object.assign(document.createElement('span'), { className: 'rk-doc-state' });
        const say = (icon, text) => { state.innerHTML = `<i class="fa-solid ${icon}"></i>${iconOnly ? '' : `<span>${esc(text)}</span>`}`; };
        if (getComputedStyle(button).position === 'static') button.style.position = 'relative';
        say('fa-spinner fa-spin', 'Opening');
        button.classList.add('is-busy');
        button.append(state);
        try {
            if (!documents.has(key)) {
                const blob = await fetch();
                // the viewer needs the type to draw the file instead of offering to save it
                documents.set(key, renderable(blob.type) ? blob : new Blob([blob], { type: renderable(type) ? type : 'application/pdf' }));
            }
            showDocument(documents.get(key), name);
            state.remove();
            button.classList.remove('is-busy');
        } catch (error) {
            button.classList.add('is-error');
            button.title = error.message;
            say('fa-triangle-exclamation', error.message);
            setTimeout(() => { state.remove(); button.title = title; button.classList.remove('is-busy', 'is-error'); }, 4000);
        }
    }

    /** A document fetched before, if it was: what a page shows inline (a photograph) without fetching it twice. */
    async function documentOf(key, fetch) {
        if (!documents.has(key)) documents.set(key, await fetch());
        return documents.get(key);
    }

    function showDocument(blob, name) {
        let modal = document.getElementById('rkPdf');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'rkPdf';
            modal.className = 'rk-pdf';
            modal.innerHTML = `
                <div class="rk-pdf-panel" role="dialog" aria-modal="true" aria-label="Document">
                    <header class="rk-pdf-head">
                        <i class="fa-solid fa-file-pdf"></i>
                        <b id="rkPdfName"></b>
                        <button type="button" class="rk-pdf-save" onclick="InfoniteResults.saveDocument()"><i class="fa-solid fa-download"></i><span>Save to disk</span></button>
                        <button type="button" class="rk-pdf-close" onclick="InfoniteResults.closeDocument()" title="Close"><i class="fa-solid fa-xmark"></i></button>
                    </header>
                    <div class="rk-pdf-body"><iframe id="rkPdfFrame" title="Document" src="about:blank"></iframe></div>
                </div>`;
            modal.addEventListener('click', (event) => { if (event.target === modal) closeDocument(); });
            document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && onScreen) closeDocument(); });
            document.body.appendChild(modal);
        }
        closeDocument();
        onScreen = { url: URL.createObjectURL(blob), name };
        modal.querySelector('.rk-pdf-head > i').className = `fa-solid ${String(blob.type).startsWith('image/') ? 'fa-file-image' : 'fa-file-pdf'}`;
        document.getElementById('rkPdfName').textContent = name;
        document.getElementById('rkPdfFrame').src = onScreen.url;
        modal.classList.add('is-open');
        document.body.classList.add('overflow-hidden');
    }

    function closeDocument() {
        const modal = document.getElementById('rkPdf');
        if (modal) modal.classList.remove('is-open');
        const frame = document.getElementById('rkPdfFrame');
        if (frame) frame.src = 'about:blank';
        if (onScreen) URL.revokeObjectURL(onScreen.url);
        onScreen = null;
        document.body.classList.remove('overflow-hidden');
    }

    /** The document on screen, saved under the name it came with (the viewer's own button would name it after the blob). */
    function saveDocument() {
        if (!onScreen) return;
        const link = Object.assign(document.createElement('a'), { href: onScreen.url, download: onScreen.name });
        document.body.appendChild(link);
        link.click();
        link.remove();
    }

    // ---------------------------------------------------------------- the session: its connections, what it says, its consent

    const MESSAGE_TONES = { error: 'bg-red-50 border-red-200 text-red-700', warning: 'bg-amber-50 border-amber-200 text-amber-700', flag: 'bg-indigo-50 border-indigo-200 text-indigo-700', info: 'bg-slate-50 border-slate-200 text-slate-600' };

    /** What the session has to say about itself, oldest first. */
    function messages(list) {
        const items = listOf(list).filter(isRecord);
        return items.length
            ? items.map(m => `
                <div class="p-3 rounded-2xl border ${MESSAGE_TONES[m.type] || MESSAGE_TONES.info} flex flex-col gap-1">
                    <span class="text-[10px] font-black uppercase tracking-widest">${esc(m.type)} · <span class="font-mono normal-case">${esc(m.message_id)}</span></span>
                    ${m.message ? `<span class="text-xs font-semibold">${esc(m.message)}</span>` : ''}
                    ${listOf(m.location).length ? `<span class="text-[10px] font-mono opacity-80">${esc(m.location.join(' › '))}</span>` : ''}
                </div>`).join('')
            : '<p class="text-sm text-slate-400 font-medium italic">The session has nothing to say about itself.</p>';
    }

    /** A connection the session ran: its engine's logo, what the page calls it (`name`, and `meta` beside the execution) and the execution that ran it. */
    function connectionRow(executionId, reference, { name, meta = '' }) {
        const code = String(reference).split('-')[0];
        return `
                <div class="flex items-center justify-between p-3 rounded-2xl bg-white border border-slate-100 shadow-sm">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-lg bg-[var(--primary-container)] border border-[var(--primary)]/20 flex items-center justify-center text-[var(--primary)] shadow-sm shrink-0 relative overflow-hidden group">
                            <img src="${logoUrl(reference)}" class="w-full h-full object-contain p-1 bg-white absolute inset-0 z-10" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" alt="${esc(code)}" title="${esc(code)}">
                            <div class="w-full h-full flex items-center justify-center hidden" style="display: none;">
                                <i class="fa-solid fa-plug text-xs"></i>
                            </div>
                        </div>
                        <div class="flex flex-col gap-1 min-w-0">
                            <span class="text-sm font-black text-slate-800 leading-none">${esc(name || code)}</span>
                            <span class="text-[11px] font-semibold font-mono text-slate-500 leading-tight break-all">${esc(reference)}</span>
                            <span class="text-[10px] font-semibold text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">${meta}<span class="flex items-center gap-1.5" title="The execution that ran this connection"><i class="fa-solid fa-fingerprint"></i> <span class="font-mono">${esc(executionId)}</span></span></span>
                        </div>
                    </div>
                </div>
                `;
    }

    /** What a device a user agent belongs to, as people say it: a phone, or a computer. */
    const deviceOf = (agent) => (/Mobi|Android|iPhone|iPad|iPod/i.test(agent || '') ? 'Mobile' : 'Desktop');

    /** The evidence of the consent: when it was given, from where and on what, and for which customer. */
    function consentCard(consent, customerId) {
        const agent = consent.user_agent ? String(consent.user_agent) : '';
        return card({
            title: 'Consent given',
            tags: agent ? `<span class="rk-tag ${deviceOf(agent) === 'Mobile' ? '' : 'is-quiet'}">${deviceOf(agent)}</span>` : '',
            sub: consent.accepted_date ? `<span class="rk-mono">${esc(stamp(consent.accepted_date))}</span>` : 'The date of the consent did not come',
            facts: [
                fact('User IP', consent.user_ip ? `<span class="rk-mono">${esc(consent.user_ip)}</span>` : ''),
                fact('Origin', consent.origin ? `<span class="rk-mono" title="${esc(consent.origin)}">${esc(consent.origin)}</span>` : ''),
                fact('Customer ID', customerId ? `<span class="rk-mono" title="${esc(customerId)}">${esc(customerId)}</span>` : ''),
            ],
            below: agent ? `<p class="rk-agent"><span>User agent</span>${esc(agent)}</p>` : '',
        });
    }

    /** A document slot as people read it: `application_mandate` is «Application mandate». */
    const documentName = (key) => String(key || 'Document').replace(/_/g, ' ').replace(/^./, letter => letter.toUpperCase());

    /** A document the person accepted: its version, and — when it was signed — who signed it, how and when, and the hash it was signed with. */
    function acceptedDocument(key, doc) {
        const signature = isRecord(doc.signature_metadata) ? doc.signature_metadata : {};
        const identity = isRecord(signature.user_identification) ? signature.user_identification : null;
        const kind = identity ? String(identity.type || '').split(':').pop().toUpperCase() : '';
        return card({
            title: documentName(key),
            tags: (doc.version ? `<span class="rk-tag is-quiet">v ${esc(doc.version)}</span>` : '') + (doc.sign_date ? '<span class="rk-tag is-ok">signed</span>' : '<span class="rk-tag">read and accepted</span>'),
            sub: doc.sign_date ? `Signed <span class="rk-mono">${esc(stamp(doc.sign_date))}</span>` : 'Accepted with the consent',
            facts: [
                fact('Signed by', signature.user_email ? `<span title="${esc(signature.user_email)}">${esc(signature.user_email)}</span>` : ''),
                fact('Identity', identity ? `${kind ? `${esc(kind)} ` : ''}<span class="rk-mono">${esc(identity.value)}</span>` : '', { sub: esc([identity?.validated ? 'validated' : '', signature.identifier_source ? String(signature.identifier_source).replace(/[-_]/g, ' ') : ''].filter(Boolean).join(' · ')) }),
                fact('Signature', doc.signature_provider ? esc(titleCase(doc.signature_provider)) : ''),
                fact('From', signature.user_ip ? `<span class="rk-mono">${esc(signature.user_ip)}</span>` : '', { sub: esc(signature.origin || '') }),
            ],
            below: doc.hash ? `<p class="rk-hash"><span>Hash</span><code title="${esc(doc.hash)}">${esc(doc.hash)}</code></p>` : '',
        });
    }

    /** What the person accepted, one chip each, named as the features' catalogue names them. */
    function featureChips(codes, catalogue = window.INFONITE_FEATURES) {
        const list = listOf(codes).filter(code => typeof code === 'string');
        if (!list.length) return '<span class="rk-muted">None registered</span>';
        return list.map(code => {
            const known = catalogue && catalogue[code] ? catalogue[code] : null;
            return `<span class="rk-chip">${known ? `<i class="${known.icon}"></i>` : ''}${esc(known ? known.name : code.replace(/_/g, ' '))}</span>`;
        }).join('');
    }

    /**
     * The session's own view, the same in every flow: the evidence of the consent, the documents the
     * person accepted and the features they granted on one side; the connections the session ran
     * (`describe(reference, executionId)` names each one) and what it has to say about itself on the
     * other. A session without a consent says why there is none.
     */
    function audit({ results, customerId = '', describe = () => ({}) }) {
        const connections = isRecord(results?.connections) ? Object.entries(results.connections) : [];
        const consent = isRecord(results?.consent) ? results.consent : null;
        const documents = isRecord(consent?.accepted_documents) ? Object.entries(consent.accepted_documents).filter(([, doc]) => isRecord(doc)) : [];
        const features = listOf(consent?.accepted_features);
        const said = listOf(results?.messages).filter(isRecord);
        const rows = connections.map(([executionId, reference]) => safely(() => connectionRow(executionId, reference, describe(reference, executionId) || {}), [], () => ''));
        const section = (icon, title, count, body) => `
        <section class="rk-section">
            <div class="rk-section-head">${sectionLabel(icon, title, count)}</div>
            ${body}
        </section>`;
        return `
<div class="rk-page">
    ${head('fa-solid fa-shield-halved', 'Consent &amp; Audit', 'The evidence of the consent, the documents the person accepted, and what the session ran and has to say.')}
    <div class="rk-audit">
        <div class="rk-audit-main">
            ${section('fa-solid fa-file-signature', 'Consent', null, consent ? safely(consentCard, [consent, customerId]) : empty('fa-solid fa-file-circle-xmark', 'No consent recorded', 'The person accepted no consent screen in this session: it was created without one, or it ended before they accepted.'))}
            ${documents.length ? section('fa-solid fa-file-contract', 'Documents accepted', documents.length, `<div class="rk-stack">${documents.map(([key, doc]) => safely(acceptedDocument, [key, doc], () => broken(documentName(key)))).join('')}</div>`) : ''}
            ${section('fa-solid fa-circle-check', 'Features granted', features.length || null, `<div class="rk-chips" id="listConsentFeatures">${featureChips(features)}</div>`)}
        </div>
        <div class="rk-audit-side">
            ${section('fa-solid fa-network-wired', 'Engine connections', connections.length || null, `<div id="listConnections" class="rk-stack">${rows.join('') || '<p class="rk-muted">No engine connections recorded.</p>'}</div>`)}
            ${section('fa-solid fa-message', 'Session messages', said.length || null, `<div id="listMessages" class="rk-stack">${messages(said)}</div>`)}
        </div>
    </div>
</div>`;
    }

    // ---------------------------------------------------------------- the raw JSON, over the page

    /** What the viewer shows: the results it was given, so «Copy» copies exactly that. */
    let jsonOnScreen = null;

    /** JSON as the viewer colours it: keys, strings, numbers, booleans and nulls, the rest escaped. */
    function highlightJson(value) {
        const text = (typeof value === 'string' ? value : JSON.stringify(value, undefined, 4)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return text.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
            let kind = 'json-number';
            if (/^"/.test(match)) kind = /:$/.test(match) ? 'json-key' : 'json-string';
            else if (/true|false/.test(match)) kind = 'json-boolean';
            else if (/null/.test(match)) kind = 'json-null';
            return `<span class="${kind}">${match}</span>`;
        });
    }

    /** Opens the viewer over the page: the results under `name`, or `note` when there are none to show. */
    function showJson(payload, { name, note = '' }) {
        let modal = document.getElementById('jsonModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'jsonModal';
            modal.className = 'fixed inset-0 z-[100] hidden flex-col items-center justify-end md:justify-center glass-layout transition-opacity p-0 pt-6 md:p-4';
            modal.addEventListener('click', closeJson);
            modal.innerHTML = `
    <div class="relative w-full max-w-4xl h-[calc(100vh-1.5rem)] md:h-[80vh] flex flex-col bg-[#1e1e1e] rounded-t-3xl md:rounded-3xl rounded-b-none md:rounded-b-3xl shadow-2xl overflow-hidden border border-slate-700/50 border-b-0 md:border-b" onclick="event.stopPropagation()">
        <div class="flex items-center justify-between gap-3 px-4 md:px-6 py-4 border-b border-slate-700/50 bg-[#252526] shrink-0">
            <div class="flex items-center gap-3 min-w-0">
                <i class="fa-solid fa-code text-slate-400 shrink-0"></i>
                <h3 class="text-sm font-bold text-slate-200 tracking-wide font-mono truncate" id="jsonModalName"></h3>
            </div>
            <div class="flex items-center gap-3 shrink-0">
                <button id="btnCopyJson" onclick="InfoniteResults.copyJson()" class="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-600/50 hover:bg-white/10 text-slate-300 text-xs font-bold transition-colors">
                    <i class="fa-regular fa-copy"></i> COPY
                </button>
                <button onclick="InfoniteResults.closeJson()" class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
                    <i class="fa-solid fa-times text-lg"></i>
                </button>
            </div>
        </div>
        <div class="flex-1 overflow-auto custom-scrollbar p-0 bg-[#1e1e1e]">
            <pre class="m-0 p-6 text-[13px] leading-snug font-mono text-[#d4d4d4]"><code id="jsonModalContent" class="language-json"></code></pre>
        </div>
    </div>`;
            document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.classList.contains('hidden')) closeJson(); });
            document.body.appendChild(modal);
        }
        jsonOnScreen = payload || null;
        document.getElementById('jsonModalName').textContent = name;
        document.getElementById('jsonModalContent').innerHTML = payload ? highlightJson(payload) : `<span class="json-null">// ${esc(note)}</span>`;
        document.getElementById('btnCopyJson').classList.toggle('hidden', !payload);
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        document.body.style.overflow = 'hidden';
    }

    function closeJson() {
        const modal = document.getElementById('jsonModal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        document.body.style.overflow = '';
    }

    function copyJson() {
        const button = document.getElementById('btnCopyJson');
        if (!jsonOnScreen || !button) return;
        navigator.clipboard?.writeText(JSON.stringify(jsonOnScreen, null, 4)).then(() => {
            const idle = button.innerHTML;
            button.innerHTML = '<i class="fa-solid fa-check"></i> COPIED';
            button.classList.add('bg-emerald-500/20', 'text-emerald-400', 'border-emerald-500/30');
            setTimeout(() => {
                button.innerHTML = idle;
                button.classList.remove('bg-emerald-500/20', 'text-emerald-400', 'border-emerald-500/30');
            }, 2000);
        });
    }

    // ---------------------------------------------------------------- a session the API does not have

    /** Whether an error of the API says it has no such session for this application: a 404, `session_not_found`. */
    const isSessionGone = (error) => error?.status === 404 || error?.message === 'session_not_found' || error?.responseBody?.detail === 'session_not_found';

    /**
     * Why the API has no such session, said plainly. It answers the same 404 whether the session
     * expired, belongs to another application or was deleted — on purpose: whether a session exists
     * is not something it hands out. What this browser remembers narrows it down: the session's
     * `expiration_date` (`expires`), when the page saw one, says whether it has passed.
     */
    function sessionGone({ appName = '', expires = '' } = {}) {
        // a moment without a zone is UTC, the way the API keeps them
        const moment = typeof expires === 'string' && expires && !/(Z|[+-]\d\d:?\d\d)$/i.test(expires) ? `${expires}Z` : expires;
        const when = moment ? new Date(moment) : null;
        const known = Boolean(when) && !Number.isNaN(when.getTime());
        const expired = known && when <= new Date();
        const reasons = [
            known && !expired ? null : {
                icon: 'fa-hourglass-end', title: 'It expired', likely: expired,
                text: `Sessions, and all the data they retrieved, are deleted automatically when they expire, usually seven days after they were created.${expired ? ` This one expired on ${stamp(moment)}.` : ''}`,
            },
            {
                icon: 'fa-layer-group', title: 'It belongs to another application',
                text: `An application only sees the sessions it created${appName ? `, and the one selected is <b>${esc(appName)}</b>` : ''}. Check the application selected in Settings.`,
            },
            {
                icon: 'fa-trash-can', title: 'It was deleted',
                text: 'The application that created it can delete a session, and its data, through the API.',
            },
        ].filter(Boolean);
        return `
            <span class="rk-gone">
                <span class="rk-gone-lead">The API has no session with this id for the selected application. It answers the same way in ${reasons.length === 3 ? 'three' : 'two'} cases:</span>
                <span class="rk-gone-list">${reasons.map(reason => `
                    <span class="rk-gone-item${reason.likely ? ' is-likely' : ''}">
                        <i class="fa-solid ${reason.icon}"></i>
                        <span><b class="rk-gone-title">${reason.title}${reason.likely ? '<em>Most likely</em>' : ''}</b>${reason.text}</span>
                    </span>`).join('')}
                </span>
                <span class="rk-gone-code">404 · session_not_found</span>
            </span>`;
    }

    // ---------------------------------------------------------------- the person the results are about

    function initials(person) {
        const first = String(person?.name || '').trim();
        const last = String(person?.name_extra || '').trim();
        return ((first[0] || '') + (last[0] || first[1] || '')).toUpperCase() || '?';
    }

    /**
     * The banner every screen carries while the sources disagree on who the person is: the flag's
     * own words (`fallback` when it brings none), and a way to the audit. Hidden without a flag.
     */
    function identityBanner(box, { flag = null, detail = '', fallback = '' } = {}) {
        if (!box) return;
        box.classList.toggle('hidden', !flag);
        if (!flag) return;
        box.innerHTML = `
            <span class="rk-identity-icon"><i class="fa-solid fa-people-arrows"></i></span>
            <div class="rk-identity-text">
                <strong>Crossed identity</strong>
                <span>${esc(flag.message || fallback)}</span>
                ${detail ? `<small>${esc(detail)}</small>` : ''}
            </div>
            <button type="button" class="rk-identity-link" onclick="switchDashboardView('audit')">Details <i class="fa-solid fa-chevron-right"></i></button>`;
    }

    /** The chip with the person's initials and name that opens their profile (`open` is the handler's code). */
    function personChip(person, { alert = false, open = '' } = {}) {
        return `
            <button type="button" class="rk-me" onclick="${open}" title="The customer's profile">
                <span class="rk-avatar">${esc(initials(person))}${alert ? '<i class="rk-avatar-alert fa-solid fa-exclamation"></i>' : ''}</span>
                <span class="rk-me-name">${esc(titleCase(person.name || 'Customer'))}</span>
                <i class="fa-solid fa-chevron-down"></i>
            </button>`;
    }

    /** An address in one line, the way the source split it. */
    function addressLine(address) {
        if (address.full_text) return address.full_text;
        const place = [address.zip_code || address.postal_code, address.municipality || address.city].filter(Boolean).join(' ');
        const city = address.city && address.city !== address.municipality ? titleCase(address.city) : '';
        return [[address.street, address.number, address.street_extra].filter(Boolean).join(' '), place, city, address.state || address.region].filter(Boolean).join(', ');
    }

    /** A document of the person's: its kind, its number, whether it was validated and until when it is valid. */
    function documentChip(doc) {
        return `
            <div class="rk-doc"><span>${esc(String(doc.type || '').split(':').pop().toUpperCase())}</span><b>${esc(doc.value)}</b>${doc.validated ? '<i class="fa-solid fa-circle-check" title="Validated"></i>' : ''}${doc.valid_until ? `<small>Valid until ${day(doc.valid_until)}</small>` : ''}</div>`;
    }

    /**
     * The person's profile, over the page: who they are, their documents, how to reach them and where
     * they live. `flagText` explains a crossed identity when there is one; `photo`, when given, brings
     * a picture of the person (a Promise of a Blob) to put in place of the initials.
     */
    function openProfile(person, { flag = null, flagText = '', photo = null } = {}) {
        if (!person) return;
        let modal = document.getElementById('rkProfile');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'rkProfile';
            modal.className = 'rk-modal';
            modal.addEventListener('click', (event) => { if (event.target === modal) closeProfile(); });
            document.body.appendChild(modal);
            document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeProfile(); });
        }
        const documentsHtml = listOf(person.identification_numbers).filter(isRecord).map(documentChip).join('');
        const addresses = listOf(person.addresses).filter(isRecord).map(address => `
            <div class="rk-address"><i class="fa-solid fa-location-dot"></i><span>${esc(addressLine(address) || '—')}${address.title ? ` <em class="rk-tag is-quiet">${esc(address.title)}</em>` : ''}</span>${address.country ? `<img src="${flagUrl(address.country)}" alt="">` : ''}</div>`).join('');
        modal.innerHTML = `
            <div class="rk-modal-panel" role="dialog" aria-modal="true" aria-label="Customer profile">
                <button type="button" class="rk-modal-close" onclick="InfoniteResults.closeProfile()" title="Close"><i class="fa-solid fa-xmark"></i></button>
                <div class="rk-profile-head">
                    <span class="rk-avatar lg" id="rkProfileAvatar">${esc(initials(person))}</span>
                    <div class="min-w-0">
                        <h3>${esc(titleCase([person.name, person.name_extra].filter(Boolean).join(' ')))}</h3>
                        <div class="rk-profile-tags">
                            ${person.type ? `<span class="rk-tag">${person.type === 'company' ? 'Legal entity' : 'Natural person'}</span>` : ''}
                            ${person.alias ? `<span class="rk-tag is-quiet">“${esc(person.alias)}”</span>` : ''}
                        </div>
                    </div>
                </div>
                ${flag ? `<div class="rk-identity is-inline"><span class="rk-identity-icon"><i class="fa-solid fa-people-arrows"></i></span><div class="rk-identity-text"><strong>Crossed identity</strong><span>${esc(flagText)}</span></div></div>` : ''}
                <div class="rk-profile-section">
                    <span class="rk-section-label">Identity</span>
                    <div class="rk-docs">${documentsHtml || '<span class="rk-muted">No document returned.</span>'}</div>
                    <div class="rk-fields">
                        ${field('Born', day(person.birth_date))}
                        ${field('Gender', esc(titleCase(person.gender)))}
                        ${field('Civil status', esc(titleCase(person.civil_status)))}
                        ${field('Nationality', person.nationality_country ? `<img src="${flagUrl(person.nationality_country)}" alt=""> ${esc(person.nationality_country)}` : '')}
                        ${field('Residence', person.residence_country ? `<img src="${flagUrl(person.residence_country)}" alt=""> ${esc(person.residence_country)}` : '')}
                        ${person.member_since ? field('Customer since', day(person.member_since)) : ''}
                    </div>
                </div>
                <div class="rk-profile-section">
                    <span class="rk-section-label">Contact</span>
                    <div class="rk-fields is-wide">
                        ${listOf(person.emails).map(mail => field('Email', esc(mail))).join('') || field('Email', '')}
                        ${listOf(person.phones).map(phone => field('Phone', esc(phone))).join('') || field('Phone', '')}
                    </div>
                </div>
                <div class="rk-profile-section">
                    <span class="rk-section-label">Addresses</span>
                    ${addresses || '<span class="rk-muted">No address returned.</span>'}
                </div>
            </div>`;
        modal.classList.add('is-open');
        document.body.classList.add('overflow-hidden');
        showPhoto(document.getElementById('rkProfileAvatar'), photo);
    }

    /** A picture of the person, as an address the page can show: one per picture, however often it is shown. */
    const photoUrls = new WeakMap();
    function photoUrl(blob) {
        if (!photoUrls.has(blob)) photoUrls.set(blob, URL.createObjectURL(blob));
        return photoUrls.get(blob);
    }

    /**
     * Puts the person's picture in an avatar in place of the initials, once `photo` (a function that
     * gives a Promise of an image Blob or of its address) brings one; its alert badge stays. Without
     * a picture, or when it cannot be had, the initials stay.
     */
    function showPhoto(avatar, photo) {
        if (!avatar || !photo) return;
        Promise.resolve().then(photo).then(found => {
            const src = typeof found === 'string' ? found : found instanceof Blob && String(found.type).startsWith('image/') ? photoUrl(found) : '';
            if (!src || !avatar.isConnected) return;
            const badge = avatar.querySelector('.rk-avatar-alert');
            avatar.replaceChildren(Object.assign(document.createElement('img'), { src, alt: '' }));
            if (badge) avatar.append(badge);
            avatar.classList.add('has-photo');
        }).catch(() => { /* the initials stay */ });
    }

    function closeProfile() {
        document.getElementById('rkProfile')?.classList.remove('is-open');
        document.body.classList.remove('overflow-hidden');
    }

    window.InfoniteResults = {
        // text
        esc, plural, kindOf, titleCase, tidy, flagUrl, logoUrl,
        // figures
        has, money, pct, qty, share, day, stamp, term, signOf, signOfRate,
        // shapes nobody expected
        isRecord, listOf, broken, safely, empty, undrawn,
        // pieces
        head, sectionLabel, amount, fact, facts, ledger, meter, subLine, go, card, field,
        // search
        fold, leaves, spellings, termsOf, index, searchBox, searchNone, search, clearSearch,
        // documents
        openDocument, documentOf, showDocument, closeDocument, saveDocument,
        // the session and its raw JSON
        messages, audit, showJson, closeJson, copyJson, isSessionGone, sessionGone,
        // the person
        initials, identityBanner, personChip, showPhoto, addressLine, documentChip, openProfile, closeProfile, crumbs,
    };
})();
