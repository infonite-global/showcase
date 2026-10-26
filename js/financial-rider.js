/**
 * financial-rider.js
 * The Financial Rider flow: the session history, and the New Lead dialog where every setting a
 * session takes is chosen by hand. Written from js/es-public-administration.js; a fix to the shared
 * parts (history, polling, import) is carried to the other by hand.
 */

window.FR_HISTORY_CONTEXT = 'financial-rider';

// What a session can read: the families of the financial position, and the customer profile
const FR_MODULES = [
    'customer_information_read',
    'accounts_read',
    'cards_read',
    'deposits_read',
    'loans_read',
    'direct_debits_read',
    'investment_accounts_read',
    'funds_read',
    'stocks_read',
    'pensions_read'
];

const FR_DEFAULT_MODULES = ['customer_information_read', 'accounts_read', 'cards_read', 'loans_read'];

// The markets and the kinds of entity a session can offer — the API's closed vocabularies
const FR_MARKETS = [
    { code: 'ES', name: 'Spain' },
    { code: 'CO', name: 'Colombia' }
];

const FR_ENTITY_TYPES = [
    { code: 'retail', name: 'Retail', hint: 'Banking for individuals', icon: 'fa-solid fa-user' },
    { code: 'corporate', name: 'Corporate', hint: 'Banking for companies', icon: 'fa-solid fa-briefcase' },
    { code: 'private', name: 'Private', hint: 'Private banking', icon: 'fa-solid fa-gem' },
    { code: 'investment', name: 'Investment', hint: 'Investment services', icon: 'fa-solid fa-chart-line' },
    { code: 'retailer_service', name: 'Retailer services', hint: 'Card issuers and consumer finance', icon: 'fa-solid fa-store' }
];

// One market per demo session: the API takes several, the demo offers them one at a time
const FR_DEFAULT_MARKET = 'ES';
const FR_DEFAULT_ENTITY_TYPES = ['retail'];
const FR_MAX_CONNECTIONS = [1, 2, 3];

document.addEventListener("DOMContentLoaded", () => {
    renderModulesGrid();
    renderEntitiesControls();
    InfoniteSessionEnding.mount({ container: 'session-ending', ...FR_ENDING });
    renderSelectionSummary();
    loadCapabilities();
    if (typeof renderHistory === 'function') {
        renderHistory();
    }
});

// --------------------------------------------------------------------------------
// The New Lead form
// --------------------------------------------------------------------------------

/** The feature toggles, drawn from js/features.js. */
function renderModulesGrid() {
    const gridContainer = document.getElementById("modulesGrid");
    if (!gridContainer) return;

    if (typeof window.INFONITE_FEATURES === 'undefined') {
        gridContainer.innerHTML = '<p class="text-[10px] text-red-500 font-bold p-4">Error: Features dictionary not loaded.</p>';
        return;
    }

    gridContainer.innerHTML = FR_MODULES.map(moduleCode => {
        const featureDef = window.INFONITE_FEATURES[moduleCode];
        if (!featureDef) return '';
        const isChecked = FR_DEFAULT_MODULES.includes(moduleCode);
        return `
        <label class="cursor-pointer block relative group h-full">
            <input class="feature-checkbox sr-only" type="checkbox" value="${featureDef.code}" ${isChecked ? 'checked' : ''} onchange="toggleFeatureVisual(this)"/>
            <div class="feature-card border border-black/10 rounded-2xl px-3 py-2.5 flex items-center text-left transition-all hover:bg-slate-50 hover:border-black/20 group-hover:shadow-md h-full gap-3 bg-white relative">
                <div class="w-9 h-9 rounded-xl bg-slate-50 border border-black/5 flex items-center justify-center shrink-0 transition-all">
                    <i class="${featureDef.icon} text-[var(--primary)] text-sm"></i>
                </div>
                <div class="flex-1 min-w-0 flex flex-col justify-center">
                    <h4 class="font-black text-slate-900 text-[10px] uppercase tracking-wider leading-tight">${featureDef.name}</h4>
                    <p class="text-[9px] text-slate-500 font-medium leading-tight mt-0.5 truncate">${featureDef.workMessage.replace('Retrieving your', '').trim()}</p>
                </div>
                <div class="indicator w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${isChecked ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'bg-white text-slate-300 border-black/10'}">
                   <i class="fa-solid fa-check text-[10px] ${isChecked ? 'opacity-100' : 'opacity-0'} transition-opacity check-icon"></i>
                </div>
            </div>
        </label>`;
    }).join('');
    syncSelectedCount();
}

/** The count on the Modules header, and what its button does next: select every module, or clear them. */
function syncSelectedCount() {
    const total = document.querySelectorAll('#modulesGrid input.feature-checkbox').length;
    const n = document.querySelectorAll('#modulesGrid input.feature-checkbox:checked').length;
    const badge = document.getElementById('modules-selected-count');
    if (badge) badge.textContent = `${n} selected`;
    const toggle = document.getElementById('modules-select-all');
    if (toggle) {
        toggle.innerHTML = total && n === total
            ? '<i class="fa-solid fa-xmark"></i> <span>Clear</span>'
            : '<i class="fa-solid fa-check-double"></i> <span>Select all</span>';
    }
}

window.toggleAllModules = function() {
    const boxes = Array.from(document.querySelectorAll('#modulesGrid input.feature-checkbox'));
    const selectAll = boxes.some(box => !box.checked);
    boxes.forEach(box => {
        box.checked = selectAll;
        toggleFeatureVisual(box);
    });
};

function toggleFeatureVisual(input) {
    syncSelectedCount();
    const card = input.closest('label').querySelector('.indicator');
    const icon = card.querySelector('.check-icon');
    card.className = input.checked
        ? "indicator w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors bg-[var(--primary)] text-white border-[var(--primary)]"
        : "indicator w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors bg-white text-slate-300 border-black/10";
    icon.classList.toggle('opacity-100', input.checked);
    icon.classList.toggle('opacity-0', !input.checked);
}

/** A chip that toggles one value of a multiple choice. */
function choiceChip(group, value, label, checked, icon = '', hint = '') {
    return `
    <label class="fr-chip cursor-pointer" title="${hint}">
        <input type="checkbox" class="sr-only" data-group="${group}" value="${value}" ${checked ? 'checked' : ''} onchange="syncEntities()"/>
        <span class="fr-chip-face">${icon ? `<i class="${icon} text-[10px]"></i>` : ''}${label}</span>
    </label>`;
}

/** A chip that picks the one value of a single choice: choosing it lets go of the others. */
function radioChip(group, value, label, checked, flag = '') {
    return `
    <label class="fr-chip cursor-pointer">
        <input type="radio" class="sr-only" name="fr-${group}" data-group="${group}" value="${value}" ${checked ? 'checked' : ''} onchange="syncEntities()"/>
        <span class="fr-chip-face">${flag ? `<img class="fr-flag" src="${flagUrl(flag)}" alt="" draggable="false">` : ''}${label}</span>
    </label>`;
}

/** Markets, kinds of entity, the connection limit and the engine list. */
function renderEntitiesControls() {
    const markets = document.getElementById('fr-markets');
    if (markets) {
        markets.innerHTML = FR_MARKETS.map(m => radioChip('market', m.code, m.name, m.code === FR_DEFAULT_MARKET, m.code)).join('');
    }
    const types = document.getElementById('fr-entity-types');
    if (types) {
        types.innerHTML = FR_ENTITY_TYPES.map(t =>
            choiceChip('entity_type', t.code, t.name, FR_DEFAULT_ENTITY_TYPES.includes(t.code), t.icon, t.hint)
        ).join('');
    }
    const limit = document.getElementById('fr-max-connections');
    if (limit) {
        limit.innerHTML = FR_MAX_CONNECTIONS.map(n => `
            <label class="fr-segment cursor-pointer">
                <input type="radio" class="sr-only" name="fr-max-connections" value="${n}" ${n === 3 ? 'checked' : ''} onchange="syncEntities()"/>
                <span class="fr-segment-face">${n}</span>
            </label>`).join('');
    }
    syncEntities();
}

/** The entities mode in use: the catalogue narrowed by filters, or one named engine. */
function entitiesMode() {
    return document.querySelector('input[name="fr-entities-mode"]:checked')?.value || 'catalogue';
}

function checkedValues(group) {
    return Array.from(document.querySelectorAll(`input[data-group="${group}"]:checked`)).map(cb => cb.value);
}

/** Keeps the Entities card in step with its choices: which half shows, and the engine's face. */
function syncEntities() {
    const named = entitiesMode() === 'named';
    document.getElementById('fr-catalogue-fields')?.classList.toggle('hidden', named);
    document.getElementById('fr-named-fields')?.classList.toggle('hidden', !named);

    const chosen = chosenEngine();
    syncEngineTrigger(chosen);

    const summary = document.getElementById('fr-entities-summary');
    if (summary) {
        if (named) {
            summary.textContent = chosen ? `One entity · ${chosen.name || chosen.engine_code}` : 'One entity · not chosen';
        } else {
            const max = document.querySelector('input[name="fr-max-connections"]:checked')?.value || '3';
            const kinds = checkedValues('entity_type').map(code => FR_ENTITY_TYPES.find(t => t.code === code)?.name || code);
            const kindsText = kinds.length > 2 ? `${kinds.length} kinds` : (kinds.join(' + ') || 'No kind');
            summary.textContent = `${checkedValues('market').join(', ') || 'No market'} · ${kindsText} · up to ${max}`;
        }
    }
}

window.syncEntities = syncEntities;

// --------------------------------------------------------------------------------
// The engine catalogue: the Direct Executions API's own list, read with the app's secret
// --------------------------------------------------------------------------------

/** The engines the picker offers, for one environment — and where they came from. */
const FR_CATALOGUE = { environment: null, engines: [], source: null, loading: null };

/** The environment a session runs in, and so the engines it may name. */
function sessionEnvironment() {
    return document.getElementById('generate-sandbox-mode')?.checked ? 'sandbox' : 'production';
}

/** Reads the financial engines of an environment, once per environment. */
function loadEngineCatalogue(environment) {
    if (FR_CATALOGUE.environment === environment && (FR_CATALOGUE.engines.length || FR_CATALOGUE.loading)) {
        return FR_CATALOGUE.loading || Promise.resolve(FR_CATALOGUE);
    }
    FR_CATALOGUE.environment = environment;
    FR_CATALOGUE.engines = [];
    FR_CATALOGUE.loading = (async () => {
        Object.assign(FR_CATALOGUE, await fetchEngineList(environment));
        FR_CATALOGUE.loading = null;
        return FR_CATALOGUE;
    })();
    return FR_CATALOGUE.loading;
}

/** The engine the form names, with what the catalogue knows of it. */
function chosenEngine() {
    const reference = document.getElementById('fr-engine-reference')?.value;
    if (!reference) return null;
    return FR_CATALOGUE.engines.find(e => e.reference === reference) || { reference, engine_code: reference.split('-')[0], name: null };
}

function syncEngineTrigger(engine) {
    const trigger = document.getElementById('fr-engine-trigger');
    if (!trigger) return;
    const logo = document.getElementById('fr-engine-logo');
    const placeholder = document.getElementById('fr-engine-logo-placeholder');
    trigger.classList.toggle('is-chosen', !!engine);
    logo.classList.toggle('hidden', !engine);
    placeholder.classList.toggle('hidden', !!engine);
    if (engine) logo.src = engineLogoUrl(engine.reference);
    document.getElementById('fr-engine-name').textContent = engine ? (engine.name || engine.engine_code) : 'Choose the entity';
    document.getElementById('fr-engine-ref').textContent = engine ? engine.reference : 'From the engine catalogue';
    document.getElementById('fr-engine-action').textContent = engine ? 'Change' : 'Choose';
}

/** Lowercase and without accents, so "sabadell" finds "Sabadell" and "cajamar" finds "Cajamar". */
const normalize = (text) => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

window.openEnginePicker = async function() {
    const modal = document.getElementById('enginePickerModal');
    const search = document.getElementById('engine-picker-search');
    search.value = '';
    document.getElementById('engine-picker-grid').innerHTML =
        '<div class="col-span-full flex items-center justify-center gap-3 py-16 text-slate-400 text-[10px] font-black uppercase tracking-widest"><i class="fa-solid fa-circle-notch fa-spin text-[var(--primary)]"></i> Reading the engine catalogue</div>';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    const environment = sessionEnvironment();
    document.getElementById('engine-picker-subtitle').textContent =
        `The ${environment} engines your application can run.`;
    await loadEngineCatalogue(environment);
    renderEnginePicker();
    search.focus();
};

window.closeEnginePicker = function() {
    const modal = document.getElementById('enginePickerModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
};

window.renderEnginePicker = function() {
    const grid = document.getElementById('engine-picker-grid');
    const query = normalize(document.getElementById('engine-picker-search').value.trim());
    const selected = document.getElementById('fr-engine-reference').value;
    const engines = FR_CATALOGUE.engines.filter(engine => !query || normalize([
        engine.name, engine.reference, engine.engine_code, ...(engine.keywords || []), ...(engine.markets || [])
    ].join(' ')).includes(query));

    const notice = document.getElementById('engine-picker-notice');
    const fallback = String(FR_CATALOGUE.source || '').startsWith('fallback:');
    notice.classList.toggle('hidden', !fallback);
    if (fallback) {
        notice.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span>The catalogue could not be read from <code>${FR_CATALOGUE.source.slice('fallback:'.length)}</code>, so this is the demo's own list: references only.</span>`;
    }
    document.getElementById('engine-picker-count').textContent =
        query ? `${engines.length} of ${FR_CATALOGUE.engines.length}` : `${engines.length} engines`;

    if (!engines.length) {
        grid.innerHTML = `<div class="col-span-full flex flex-col items-center gap-3 py-16 text-center">
            <div class="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 text-xl"><i class="fa-solid fa-magnifying-glass"></i></div>
            <p class="text-xs font-bold text-slate-600">No engine matches “${document.getElementById('engine-picker-search').value.trim()}”</p>
        </div>`;
        return;
    }
    grid.innerHTML = engines.map(engine => {
        const isSelected = engine.reference === selected;
        const kinds = (engine.sub_categories || []).map(sub => String(sub).split(':')[1]).filter(Boolean);
        const tags = [...(engine.markets || []).slice(0, 4), ...kinds.slice(0, 2)].map(tag => `<span class="fr-tag">${tag.replace('_', ' ')}</span>`).join('');
        return `
        <button type="button" class="fr-engine-tile ${isSelected ? 'is-selected' : ''}" onclick="pickEngine('${engine.reference}')">
            <span class="fr-engine-logo">
                <img src="${engineLogoUrl(engine.reference)}" alt="" onerror="const box = this.parentElement; this.remove(); box.insertAdjacentHTML('beforeend', '<i class=&quot;fa-solid fa-building-columns&quot;></i>')">
            </span>
            <span class="flex-1 min-w-0">
                <span class="block text-xs font-black text-slate-900 truncate">${engine.name || engine.engine_code}</span>
                <span class="block text-[9px] font-mono text-slate-400 truncate mt-0.5">${engine.reference}</span>
                ${tags ? `<span class="flex flex-wrap gap-1 mt-1.5">${tags}</span>` : ''}
            </span>
            ${isSelected ? '<i class="fa-solid fa-circle-check text-[var(--primary)] text-base shrink-0"></i>' : ''}
        </button>`;
    }).join('');
};

window.pickEngine = function(reference) {
    document.getElementById('fr-engine-reference').value = reference;
    closeEnginePicker();
    syncEntities();
};

// --------------------------------------------------------------------------------
// What the application holds: the capabilities every flow reads the same way, js/session-capabilities.js
// --------------------------------------------------------------------------------

function loadCapabilities() {
    InfoniteCapabilities.load().then(syncReach);
}

/** Offers only what the application may run, and says why when it does not: Sandbox, then Recurring access. */
function syncReach() {
    const sandbox = document.getElementById('generate-sandbox-mode');
    const recurring = document.getElementById('generate-recurring-access');
    if (!sandbox || !recurring) return;

    // SANDBOX: held on for a sandbox application, or one without Financial Rider in production
    InfoniteCapabilities.holdSandbox({
        product: 'product:financial_rider', flow: 'Financial Rider', real: 'open sessions on real banks',
        tagId: 'fr-reach-product', noticeId: 'fr-sandbox-notice',
    });

    // RECURRING ACCESS: in production only with tokenized access granted; in sandbox, always
    const tokenizedInProduction = InfoniteCapabilities.reachesProduction('login:tokenized_access') && InfoniteCapabilities.appInProduction();
    const recurringAllowed = tokenizedInProduction || sandbox.checked;
    if (!recurringAllowed) recurring.checked = false;
    recurring.disabled = !recurringAllowed;
    document.getElementById('fr-reach-recurring').classList.toggle('hidden', tokenizedInProduction);
    InfoniteCapabilities.notice('fr-recurring-notice', recurringAllowed ? null : {
        text: 'Recurring access runs in sandbox only for this application: turn Sandbox on to try it, or ask for tokenized access in the Console to use it in production.',
        ...InfoniteCapabilities.request('login:tokenized_access'),
    });
}

/** The session's environment changed: its reach, and the engines it may name, change with it. */
window.onSandboxChange = function() {
    syncReach();
    if (document.getElementById('fr-engine-reference').value) {
        // a production engine is not a sandbox one: the choice is made again from the new list
        document.getElementById('fr-engine-reference').value = '';
        syncEntities();
        document.getElementById('fr-engine-ref').textContent = `The ${sessionEnvironment()} engines are others: choose again`;
    }
};

// --------------------------------------------------------------------------------
// Where the session ends: the presets every flow shares, js/session-ending.js
// --------------------------------------------------------------------------------

const FR_ENDING = { flow: 'financial-rider', docs: 'https://infonite.dev/flows/financial-rider', event: 'financial-rider:ended' };

// --------------------------------------------------------------------------------
// The entity selection: how the selection screen shows the entities. Saved in this browser with
// the environment, for Financial Rider only, and sent with every session the demo creates
// --------------------------------------------------------------------------------

const FR_LAYOUTS = [
    { value: 'list', name: 'List', hint: 'One entity per row', rows: 0 },
    { value: '1-row-list', name: '1 row', hint: 'A row of tiles first', rows: 1 },
    { value: '2-row-list', name: '2 rows', hint: "The platform's default", rows: 2 },
    { value: '3-row-list', name: '3 rows', hint: 'Mostly tiles', rows: 3 },
];
const FR_DEFAULT_LAYOUT = '2-row-list';
const FR_MAX_FIRST = 20;        // MAX_PRIORITY_ENGINES in the core
const FR_MAX_HIGHLIGHTED = 3;   // MAX_FEATURED_ENGINES in the core
const FR_HIGHLIGHT_TEXT = 'Recomendado';

/** The icons a highlight can wear: Iconify names the widget draws offline, shown here by their Font Awesome twins. */
const FR_HIGHLIGHT_ICONS = [
    { value: '', fa: 'fa-solid fa-star', name: "A star, the widget's own" },
    { value: 'solar:like-bold', fa: 'fa-solid fa-thumbs-up', name: 'Like' },
    { value: 'solar:heart-bold', fa: 'fa-solid fa-heart', name: 'Heart' },
    { value: 'solar:rocket-bold', fa: 'fa-solid fa-rocket', name: 'Rocket' },
    { value: 'solar:cup-star-bold', fa: 'fa-solid fa-trophy', name: 'Cup' },
    { value: 'solar:verified-check-bold', fa: 'fa-solid fa-circle-check', name: 'Verified' },
    { value: 'solar:bolt-circle-bold', fa: 'fa-solid fa-bolt', name: 'Bolt' },
    { value: 'solar:tag-bold', fa: 'fa-solid fa-tag', name: 'Tag' },
    { value: 'solar:stopwatch-bold', fa: 'fa-solid fa-stopwatch', name: 'Stopwatch, for «el más rápido»' },
];

/** The dialog's state: the draft it edits, the catalogue it offers, and what is being dragged. */
const FR_SEL = { draft: null, entries: [], source: null, loading: null, query: '', market: 'all', drag: null };

/** The selection saved for this environment, or null: what every Financial Rider session of the demo sends. */
const savedSelection = () => window.InfoniteConfigManager?.getFlowSettings('financial-rider').selection || null;

function storeSelection(selection) {
    const settings = window.InfoniteConfigManager.getFlowSettings('financial-rider');
    if (selection) settings.selection = { ...selection, saved_at: new Date().toISOString() };
    else delete settings.selection;
    return window.InfoniteConfigManager.saveFlowSettings('financial-rider', settings);
}

/** What a saved selection sends: the three fields a session request takes, exactly as saved. */
function selectionSettings(selection) {
    return {
        engines_layout: selection.engines_layout || FR_DEFAULT_LAYOUT,
        priority_engines: [...(selection.priority_engines || [])],
        featured_engines: Object.fromEntries(Object.entries(selection.featured_engines || {}).map(([code, mark]) => [code, {
            text: mark.text,
            ...(mark.icon ? { icon: mark.icon } : {}),
            vertical_position: mark.vertical_position || 'top',
            horizontal_position: mark.horizontal_position || 'center',
        }])),
    };
}

/** One line on what is saved, under the button in the Entities card — its scope said every time. */
function renderSelectionSummary() {
    const hint = document.getElementById('fr-selection-summary');
    if (!hint) return;
    const saved = savedSelection();
    if (!saved) {
        hint.textContent = "Not arranged: sessions use the application's own";
        return;
    }
    const layout = FR_LAYOUTS.find(l => l.value === saved.engines_layout)?.name || FR_LAYOUTS[2].name;
    const first = (saved.priority_engines || []).length;
    const marks = Object.keys(saved.featured_engines || {}).length;
    hint.textContent = `Saved for Financial Rider · ${layout} · ${first} first · ${marks} highlighted`;
}

/** Every financial entity the application may offer, production's and sandbox's, once per page. */
function loadSelectionEntries() {
    if (FR_SEL.entries.length) return Promise.resolve();
    if (FR_SEL.loading) return FR_SEL.loading;
    FR_SEL.loading = (async () => {
        const lists = await Promise.all(['production', 'sandbox'].map(fetchEngineList));
        const byCode = new Map();
        lists.forEach(({ engines }, i) => engines.forEach(engine => {
            const code = engine.engine_code || String(engine.reference || '').split('-')[0];
            if (code && !byCode.has(code)) byCode.set(code, { code, name: engine.name || code, markets: engine.markets || [], sandbox: i === 1 });
        }));
        FR_SEL.entries = [...byCode.values()];
        FR_SEL.source = lists[0].source;
        FR_SEL.loading = null;
    })();
    return FR_SEL.loading;
}

const entryOf = (code) => FR_SEL.entries.find(entry => entry.code === code) || { code, name: code, markets: [] };

window.openSelectionModal = async function() {
    const saved = savedSelection();
    FR_SEL.draft = {
        engines_layout: saved?.engines_layout || FR_DEFAULT_LAYOUT,
        priority_engines: [...(saved?.priority_engines || [])],
        featured_engines: JSON.parse(JSON.stringify(saved?.featured_engines || {})),
    };
    FR_SEL.query = '';
    document.getElementById('sel-search').value = '';
    FR_SEL.market = checkedValues('market')[0] || 'all';
    showSelectionError(null);
    const modal = document.getElementById('selectionModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    renderSelection();
    await loadSelectionEntries();
    renderSelection();
};

window.closeSelectionModal = function(save) {
    if (save) {
        const problem = selectionProblem(FR_SEL.draft);
        if (problem) return showSelectionError(problem);
        storeSelection(cleanSelection(FR_SEL.draft));
    }
    const modal = document.getElementById('selectionModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    renderSelectionSummary();
};

window.resetSelection = function() {
    showConfirmModal(
        'Reset the selection',
        "Forget the selection saved for Financial Rider with this environment? Its sessions then use the application's own layout, order and highlights.",
        'Reset',
        () => {
            storeSelection(null);
            closeSelectionModal(false);
        }
    );
};

function showSelectionError(message) {
    const box = document.getElementById('sel-error');
    box.classList.toggle('hidden', !message);
    if (message) box.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span>${escapeHtml(message)}</span>`;
}

/** Why a draft cannot be saved, in the words of the limits the platform holds it to; null when it can. */
function selectionProblem(draft) {
    if (draft.priority_engines.length > FR_MAX_FIRST) return `Up to ${FR_MAX_FIRST} entities can go first.`;
    const marks = Object.entries(draft.featured_engines);
    if (marks.length > FR_MAX_HIGHLIGHTED) return `Up to ${FR_MAX_HIGHLIGHTED} entities can be highlighted.`;
    const wrong = marks.find(([, mark]) => {
        const length = (mark.text || '').trim().length;
        return length < 2 || length > 24;
    });
    return wrong ? `The highlight of ${entryOf(wrong[0]).name} needs a text of 2 to 24 characters.` : null;
}

function cleanSelection(draft) {
    return selectionSettings({
        ...draft,
        featured_engines: Object.fromEntries(Object.entries(draft.featured_engines).map(([code, mark]) => [code, { ...mark, text: mark.text.trim() }])),
    });
}

const selectionLogo = (code) => `<span class="fr-sel-logo"><img src="${engineLogoUrl(code)}" alt="" loading="lazy" draggable="false" onerror="this.replaceWith(Object.assign(document.createElement('i'), {className: 'fa-solid fa-building-columns'}))"></span>`;

function starButton(code) {
    const on = !!FR_SEL.draft.featured_engines[code];
    const full = !on && Object.keys(FR_SEL.draft.featured_engines).length >= FR_MAX_HIGHLIGHTED;
    const title = on ? 'Highlighted: press to stop' : (full ? `Up to ${FR_MAX_HIGHLIGHTED} highlighted` : 'Highlight it');
    return `<button type="button" class="fr-sel-icon is-star ${on ? 'is-on' : ''}" title="${title}" onclick="toggleHighlight('${code}')" ${full ? 'disabled' : ''}><i class="fa-${on ? 'solid' : 'regular'} fa-star"></i></button>`;
}

function renderSelection() {
    const draft = FR_SEL.draft;
    if (!draft) return;

    // the scope, said where it is saved
    const config = window.InfoniteConfigManager.getConfig();
    document.getElementById('sel-scope-app').textContent = config?.name || config?.appName || 'this environment';
    const saved = savedSelection();
    const state = document.getElementById('sel-scope-state');
    state.classList.toggle('is-saved', !!saved);
    state.innerHTML = saved
        ? `<i class="fa-solid fa-floppy-disk"></i> Saved ${escapeHtml(new Date(saved.saved_at || Date.now()).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}`
        : "<i class=\"fa-regular fa-circle\"></i> Not saved: the application's own";
    document.getElementById('sel-reset').classList.toggle('hidden', !saved);

    document.getElementById('sel-layouts').innerHTML = FR_LAYOUTS.map(layout => `
        <label class="fr-layout">
            <input type="radio" name="sel-layout" value="${layout.value}" class="sr-only" ${draft.engines_layout === layout.value ? 'checked' : ''} onchange="setSelectionLayout('${layout.value}')">
            <span class="fr-layout-face">
                <span class="fr-lp">${'<span class="fr-lp-row"><i></i><i></i><i></i></span>'.repeat(layout.rows)}${'<span class="fr-lp-line"></span>'.repeat(Math.max(1, 4 - layout.rows))}</span>
                <span class="fr-layout-name">${layout.name}</span>
                <span class="fr-layout-hint">${layout.hint}</span>
            </span>
        </label>`).join('');

    renderSelectionFirst();
    renderSelectionHighlighted();
    renderSelectionCatalogue();
}

function renderSelectionFirst() {
    const codes = FR_SEL.draft.priority_engines;
    const count = document.getElementById('sel-first-count');
    count.textContent = `${codes.length} of ${FR_MAX_FIRST}`;
    count.classList.toggle('is-full', codes.length >= FR_MAX_FIRST);
    document.getElementById('sel-first').innerHTML = codes.length
        ? codes.map((code, i) => `
            <li class="fr-sel-row is-first" draggable="true" data-code="${code}" data-zone="first" ondragstart="selDragStart(event)" ondragend="selDragEnd(event)">
                <span class="fr-sel-grip" title="Drag to reorder"><i class="fa-solid fa-grip-vertical"></i></span>
                <span class="fr-sel-index">${i + 1}</span>
                ${selectionLogo(code)}
                <span class="fr-sel-name"><b>${escapeHtml(entryOf(code).name)}</b><small>${code}</small></span>
                ${starButton(code)}
                <button type="button" class="fr-sel-icon" title="Move up" onclick="moveFirst('${code}', -1)" ${i === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-up"></i></button>
                <button type="button" class="fr-sel-icon" title="Move down" onclick="moveFirst('${code}', 1)" ${i === codes.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-down"></i></button>
                <button type="button" class="fr-sel-icon is-remove" title="Back to the catalogue's order" onclick="unpinEntity('${code}')"><i class="fa-solid fa-xmark"></i></button>
            </li>`).join('')
        : '<li class="fr-sel-empty"><i class="fa-solid fa-arrow-down-wide-short"></i> None first: the catalogue\'s own order. Drop entities here, or press + on one.</li>';
}

function renderSelectionHighlighted() {
    const marks = Object.entries(FR_SEL.draft.featured_engines);
    const count = document.getElementById('sel-highlighted-count');
    count.textContent = `${marks.length} of ${FR_MAX_HIGHLIGHTED}`;
    count.classList.toggle('is-full', marks.length >= FR_MAX_HIGHLIGHTED);
    const spot = (code, mark, vertical, horizontal) => {
        const on = (mark.vertical_position || 'top') === vertical && (mark.horizontal_position || 'center') === horizontal;
        const left = { left: 22, center: 50, right: 78 }[horizontal];
        return `<button type="button" class="fr-hl-spot ${on ? 'is-on' : ''}" style="left: ${left}%; top: ${vertical === 'top' ? 0 : 100}%" title="${vertical} ${horizontal}" onclick="setHighlightPlace('${code}', '${vertical}', '${horizontal}')"></button>`;
    };
    document.getElementById('sel-highlighted').innerHTML = marks.length
        ? marks.map(([code, mark]) => `
            <div class="fr-hl">
                <div class="fr-hl-head">
                    ${selectionLogo(code)}
                    <span class="fr-sel-name"><b>${escapeHtml(entryOf(code).name)}</b><small>${code}</small></span>
                    <button type="button" class="fr-sel-icon is-remove" title="Stop highlighting it" onclick="toggleHighlight('${code}')"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="fr-hl-fields">
                    <div class="flex flex-col gap-2 min-w-0">
                        <span class="fr-field-label">Text, 2 to 24 characters</span>
                        <input type="text" class="fr-input fr-hl-text" maxlength="24" value="${escapeHtml(mark.text)}" oninput="setHighlightText('${code}', this)">
                        <span class="fr-field-label">Icon</span>
                        <div class="fr-hl-icons">${FR_HIGHLIGHT_ICONS.map(icon => `<button type="button" class="fr-hl-icon ${(mark.icon || '') === icon.value ? 'is-on' : ''}" title="${icon.name}" onclick="setHighlightIcon('${code}', '${icon.value}')"><i class="${icon.fa}"></i></button>`).join('')}</div>
                    </div>
                    <div class="flex flex-col gap-2">
                        <span class="fr-field-label">Where on the tile</span>
                        <div class="fr-hl-tile">${['top', 'bottom'].map(v => ['left', 'center', 'right'].map(h => spot(code, mark, v, h)).join('')).join('')}</div>
                    </div>
                </div>
            </div>`).join('')
        : '<div class="fr-sel-empty"><i class="fa-regular fa-star"></i> None highlighted. Mark an entity with its star.</div>';
}

function renderSelectionCatalogue() {
    const markets = document.getElementById('sel-markets');
    markets.innerHTML = [{ code: 'all', name: 'All markets' }, ...FR_MARKETS].map(m => `
        <label class="fr-chip cursor-pointer">
            <input type="radio" class="sr-only" name="sel-market" value="${m.code}" ${FR_SEL.market === m.code ? 'checked' : ''} onchange="selMarket('${m.code}')"/>
            <span class="fr-chip-face">${m.code !== 'all' ? `<img class="fr-flag" src="${flagUrl(m.code)}" alt="" draggable="false">` : ''}${m.name}</span>
        </label>`).join('');

    const notice = document.getElementById('sel-catalogue-notice');
    const fallback = String(FR_SEL.source || '').startsWith('fallback:');
    notice.classList.toggle('hidden', !fallback);
    if (fallback) notice.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span>The catalogue could not be read from <code>${escapeHtml(FR_SEL.source.slice('fallback:'.length))}</code>, so this is the demo's own list: codes only.</span>`;

    const list = document.getElementById('sel-catalogue');
    if (FR_SEL.loading && !FR_SEL.entries.length) {
        list.innerHTML = '<li class="fr-sel-empty"><i class="fa-solid fa-circle-notch fa-spin"></i> Reading the engine catalogue</li>';
        return;
    }
    const query = normalize(FR_SEL.query.trim());
    const entries = FR_SEL.entries.filter(entry =>
        (FR_SEL.market === 'all' || entry.markets.includes(FR_SEL.market)) &&
        (!query || normalize([entry.name, entry.code, ...entry.markets].join(' ')).includes(query)));
    document.getElementById('sel-catalogue-count').textContent = `${entries.length}`;
    const first = FR_SEL.draft.priority_engines;
    const full = first.length >= FR_MAX_FIRST;
    list.innerHTML = entries.length
        ? entries.map(entry => {
            const place = first.indexOf(entry.code);
            const tags = [...entry.markets.slice(0, 3), ...(entry.sandbox ? ['sandbox'] : [])].map(tag => `<span class="fr-tag">${tag}</span>`).join('');
            return `
            <li class="fr-sel-row" draggable="true" data-code="${entry.code}" data-zone="catalogue" ondragstart="selDragStart(event)" ondragend="selDragEnd(event)">
                <span class="fr-sel-grip" title="Drag it to the list"><i class="fa-solid fa-grip-vertical"></i></span>
                ${selectionLogo(entry.code)}
                <span class="fr-sel-name"><b>${escapeHtml(entry.name)}</b><small>${entry.code}</small>${tags ? `<span class="flex flex-wrap gap-1 mt-1">${tags}</span>` : ''}</span>
                ${starButton(entry.code)}
                ${place >= 0
                    ? `<span class="fr-sel-place" title="It goes first, at this place">#${place + 1}</span>`
                    : `<button type="button" class="fr-sel-icon is-add" title="${full ? `Up to ${FR_MAX_FIRST} first` : 'Put it first'}" onclick="pinEntity('${entry.code}')" ${full ? 'disabled' : ''}><i class="fa-solid fa-plus"></i></button>`}
            </li>`;
        }).join('')
        : `<li class="fr-sel-empty">No entity matches “${escapeHtml(FR_SEL.query.trim())}”</li>`;
}

window.setSelectionLayout = (value) => { FR_SEL.draft.engines_layout = value; };
window.selSearch = (value) => { FR_SEL.query = value; renderSelectionCatalogue(); };
window.selMarket = (value) => { FR_SEL.market = value; renderSelectionCatalogue(); };

/** Puts an entity first, at a place (the end when none is given); one already first moves there. */
window.pinEntity = function(code, index = null) {
    const first = FR_SEL.draft.priority_engines;
    const from = first.indexOf(code);
    if (from < 0 && first.length >= FR_MAX_FIRST) return showSelectionError(`Up to ${FR_MAX_FIRST} entities can go first.`);
    if (from >= 0) first.splice(from, 1);
    let at = index === null ? first.length : index;
    if (from >= 0 && index !== null && from < index) at -= 1;
    first.splice(Math.max(0, Math.min(at, first.length)), 0, code);
    showSelectionError(null);
    renderSelectionFirst();
    renderSelectionCatalogue();
};

window.unpinEntity = function(code) {
    FR_SEL.draft.priority_engines = FR_SEL.draft.priority_engines.filter(c => c !== code);
    renderSelectionFirst();
    renderSelectionCatalogue();
};

window.moveFirst = function(code, step) {
    const first = FR_SEL.draft.priority_engines;
    const from = first.indexOf(code);
    const to = from + step;
    if (from < 0 || to < 0 || to >= first.length) return;
    [first[from], first[to]] = [first[to], first[from]];
    renderSelectionFirst();
    renderSelectionCatalogue();
};

window.toggleHighlight = function(code) {
    const marks = FR_SEL.draft.featured_engines;
    if (marks[code]) {
        delete marks[code];
    } else {
        if (Object.keys(marks).length >= FR_MAX_HIGHLIGHTED) return showSelectionError(`Up to ${FR_MAX_HIGHLIGHTED} entities can be highlighted.`);
        marks[code] = { text: FR_HIGHLIGHT_TEXT, vertical_position: 'top', horizontal_position: 'center' };
    }
    showSelectionError(null);
    renderSelectionFirst();
    renderSelectionHighlighted();
    renderSelectionCatalogue();
};

// The text is kept as it is typed: drawing the editor again would take the cursor away
window.setHighlightText = function(code, input) {
    FR_SEL.draft.featured_engines[code].text = input.value;
    const length = input.value.trim().length;
    input.classList.toggle('is-invalid', length < 2 || length > 24);
};

window.setHighlightIcon = function(code, icon) {
    FR_SEL.draft.featured_engines[code].icon = icon || undefined;
    renderSelectionHighlighted();
};

window.setHighlightPlace = function(code, vertical, horizontal) {
    Object.assign(FR_SEL.draft.featured_engines[code], { vertical_position: vertical, horizontal_position: horizontal });
    renderSelectionHighlighted();
};

// DRAG AND DROP: a row of either list is dragged; the first list takes it at the place pointed at,
// and the catalogue takes a first one back. The arrows and the + do the same without a pointer.
window.selDragStart = function(event) {
    const row = event.currentTarget;
    FR_SEL.drag = { code: row.dataset.code, from: row.dataset.zone };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', row.dataset.code);
    row.classList.add('is-dragging');
};

window.selDragEnd = function(event) {
    event.currentTarget.classList.remove('is-dragging');
    FR_SEL.drag = null;
    clearDropMarks();
};

function dropIndex(event) {
    const rows = [...document.querySelectorAll('#sel-first .fr-sel-row')];
    const at = rows.findIndex(row => {
        const box = row.getBoundingClientRect();
        return event.clientY < box.top + box.height / 2;
    });
    return at < 0 ? rows.length : at;
}

function clearDropMarks() {
    document.getElementById('sel-first')?.classList.remove('is-drop-target');
    document.querySelectorAll('#sel-first .drop-before, #sel-first .drop-after').forEach(row => row.classList.remove('drop-before', 'drop-after'));
}

window.selDragOver = function(event) {
    if (!FR_SEL.drag) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    clearDropMarks();
    const rows = [...document.querySelectorAll('#sel-first .fr-sel-row')];
    const at = dropIndex(event);
    if (!rows.length) document.getElementById('sel-first').classList.add('is-drop-target');
    else if (at < rows.length) rows[at].classList.add('drop-before');
    else rows[rows.length - 1].classList.add('drop-after');
};

window.selDragLeave = function(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) clearDropMarks();
};

window.selDrop = function(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!FR_SEL.drag) return;
    const { code } = FR_SEL.drag;
    const at = dropIndex(event);
    FR_SEL.drag = null;
    clearDropMarks();
    pinEntity(code, at);
};

window.selDragOverCatalogue = function(event) {
    if (FR_SEL.drag?.from !== 'first') return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
};

window.selDropCatalogue = function(event) {
    if (FR_SEL.drag?.from !== 'first') return;
    event.preventDefault();
    const { code } = FR_SEL.drag;
    FR_SEL.drag = null;
    clearDropMarks();
    unpinEntity(code);
};

// --------------------------------------------------------------------------------
// Launching the widget from the demo
// --------------------------------------------------------------------------------

// The widget, opened from the demo the way every flow opens it (js/session-launcher.js): it closes
// a moment after `financial-rider:ended`, and the history reads the session again
InfoniteLauncher.mount({ event: 'financial-rider:ended', onClosed: () => renderHistory() });

/** The session the New Lead dialog has just created, for its Launch button. */
let lastCreated = null;

window.launchCreated = () => lastCreated && InfoniteLauncher.launch(lastCreated.widget_url, lastCreated.settings);

window.launchSession = function(sid) {
    const config = window.InfoniteConfigManager ? window.InfoniteConfigManager.getConfig() : null;
    const session = (window.InfoniteFlowsManager.getSessions(config?.appId, window.FR_HISTORY_CONTEXT, config?.widgetUrl) || [])
        .find(s => s.session_id === sid);
    if (session) InfoniteLauncher.launch(session.widget_url, session.session_settings);
};

// --------------------------------------------------------------------------------
// History Rendering
// --------------------------------------------------------------------------------

function formatDate(isoString) {
    if (!isoString) return '--';
    const d = new Date(isoString);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTimeRelative(isoString) {
    if (!isoString) return { timeStr: '--', relStr: '--', isRecent: false };
    const d = new Date(isoString);
    const diffSecs = Math.floor((new Date() - d) / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (diffSecs < 60) return { timeStr, relStr: 'just now', isRecent: true };
    if (diffMins < 30) return { timeStr, relStr: `${diffMins} min ago`, isRecent: true };
    return { timeStr, relStr: '', isRecent: false };
}

function getStatusBadge(statusCode) {
    const ui = window.InfoniteStatusDict ? window.InfoniteStatusDict[statusCode] : null;
    if (!ui) {
        return `<div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-500/20 bg-slate-50 text-slate-700">
            <i class="fa-solid fa-circle-info text-[10px]"></i>
            <span class="text-[9px] font-black tracking-widest uppercase">${statusCode}</span>
        </div>`;
    }
    const tone = ui.col === 'slate'
        ? 'border-slate-500/20 bg-slate-50 text-slate-700'
        : `border-${ui.col}-500/20 bg-${ui.col}-50 text-${ui.col}-600`;
    return `<div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${tone}">
        <i class="fa-solid ${ui.icon} text-[10px] ${ui.spin ? 'fa-spin' : ''} ${ui.pulse ? 'animate-pulse' : ''}"></i>
        <span class="text-[9px] font-black tracking-widest uppercase">${ui.text}</span>
    </div>`;
}

/** What the session was created with, as small chips: read from its settings once they are known. */
/** What a session was created with: the chips every flow draws, with Financial Rider's own — its entity, or its markets and how many. */
function setupChips(settings) {
    if (!settings) return '';
    const { chip } = InfoniteLauncher;
    const own = [];
    if (settings.engine_reference) {
        own.push(chip(`<img src="${engineLogoUrl(settings.engine_reference)}" class="w-3 h-3 rounded-sm" alt=""> ${escapeHtml(settings.engine_reference.split('-')[0])}`));
    } else {
        if (settings.markets?.length) own.push(chip(escapeHtml(settings.markets.join(' · '))));
        if (settings.max_connections) own.push(chip(`Up to ${Number(settings.max_connections)}`));
    }
    if (settings.tokenized_access) own.push(chip('<i class="fa-solid fa-rotate"></i> Recurring', 'bg-[var(--primary-container)] text-[var(--primary)] border-transparent'));
    return InfoniteLauncher.chips(settings, own);
}

window.activePollers = window.activePollers || {};

const copyButton = (value, title, extra = '') =>
    InfoniteLauncher.copyButton(value, title, `text-[10px] text-slate-400 hover:text-[var(--primary)] transition-colors ${extra}`);

window.renderHistory = function() {
    const config = window.InfoniteConfigManager ? window.InfoniteConfigManager.getConfig() : null;
    if (!config) return;

    const sessions = window.InfoniteFlowsManager ? window.InfoniteFlowsManager.getSessions(config.appId, window.FR_HISTORY_CONTEXT, config.widgetUrl) : [];
    const emptyState = document.getElementById('dashboardEmptyState');
    const tableState = document.getElementById('dashboardTableState');
    const tbody = document.getElementById('sessionHistory');
    const mBody = document.getElementById('sessionHistoryMobile');

    if (!sessions || sessions.length === 0) {
        emptyState?.classList.remove('hidden');
        tableState?.classList.add('hidden');
        if (tbody) tbody.innerHTML = '';
        if (mBody) mBody.innerHTML = '';
        return;
    }

    emptyState?.classList.add('hidden');
    tableState?.classList.remove('hidden');
    if (!tbody) return;

    let html = '';
    let mobileHtml = '';
    sessions.forEach(session => {
        const sid = session.session_id || 'Unknown';
        const cid = session.customer_id || '--';
        const timeData = formatTimeRelative(session.date_created);
        const wUrl = session.widget_url || '';
        let displayStatus = session.infonite_state?.status_code || 'READY';

        const isClosed = session.infonite_state?.is_closed;
        const needsPolling = isClosed === false;
        const isErrorState = isClosed !== false && isClosed !== true;

        let rowBorder = 'border-l-[4px] border-l-transparent';
        if (isErrorState) rowBorder = 'border-l-[4px] border-l-red-500';
        else if (needsPolling) rowBorder = 'active-session-row';

        if (needsPolling && session.infonite_state?.ping_date) {
            let rawDate = session.infonite_state.ping_date;
            if (!rawDate.endsWith('Z') && !rawDate.includes('+')) rawDate += 'Z';
            displayStatus = (new Date() - new Date(rawDate)) / 1000 < 10 ? 'USER_ONLINE' : 'USER_IDLE';
        }

        const secBg = config.app_settings?.color_secondary?.main || '#3b82f6';
        const secText = config.app_settings?.color_secondary?.contrastText || '#ffffff';
        const badgeHtml = getStatusBadge(displayStatus);
        const timeUi = timeData.isRecent
            ? `<span style="background-color: ${secBg}; color: ${secText};" class="px-1.5 py-0.5 rounded ml-1 tracking-widest leading-none">${timeData.relStr}</span>`
            : (timeData.relStr ? `<span class="ml-1 opacity-70">(${timeData.relStr})</span>` : '');
        const chips = setupChips(session.session_settings);

        const actionButton = (icon, title, onclick, tone) =>
            `<button class="bg-white border ${tone} w-7 h-7 rounded-lg text-[10px] flex items-center justify-center transition-colors shadow-sm ml-1.5 shrink-0" title="${title}" onclick="${onclick}"><i class="${icon}"></i></button>`;
        const launchActionUi = (needsPolling && wUrl)
            ? actionButton('fa-solid fa-play', InfoniteLauncher.opensInDialog(session.session_settings) ? 'Launch it here' : 'Launch it in a new tab: it redirects when it ends', `launchSession('${sid}')`, 'border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary-container)]')
            : '';
        const copyActionUi = wUrl ? InfoniteLauncher.copyButton(wUrl, 'Copy URL', 'bg-white border border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-600 hover:bg-indigo-50 w-7 h-7 rounded-lg text-[10px] flex items-center justify-center transition-colors shadow-sm ml-1.5 shrink-0') : '';
        const cancelActionUi = needsPolling ? actionButton('fa-solid fa-times', 'Cancel Session', `cancelActiveSession('${sid}')`, 'border-red-200 text-red-500 hover:text-red-700 hover:border-red-600 hover:bg-red-50') : '';
        const deleteActionUi = (!needsPolling && isClosed === true) ? actionButton('fa-solid fa-trash-can', 'Delete Local Record', `deleteLocalSession('${sid}')`, 'border-red-200 text-red-500 hover:text-red-700 hover:border-red-600 hover:bg-red-50') : '';
        const syncActionUi = isErrorState ? actionButton('fa-solid fa-sync', 'Sync Session', `syncActiveSession('${sid}')`, 'border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-600 hover:bg-blue-50') : '';
        const viewButton = (extra) =>
            `<button class="bg-white border border-slate-200 text-slate-600 hover:text-[var(--primary)] hover:border-[var(--primary)] px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest flex items-center transition-colors shadow-sm ${extra}" onclick="viewSession('${sid}')"><i class="fa-regular fa-eye mr-1.5"></i> View</button>`;

        html += `
        <tr class="border-b border-black/5 hover:bg-black/[0.02] transition-colors group ${rowBorder}">
            <td class="p-4 pl-4 align-top">
               <div class="flex items-start gap-3">
                   <div class="w-8 h-8 rounded-lg bg-[var(--primary-container)] flex items-center justify-center shrink-0">
                       <i class="fa-solid fa-fingerprint text-[var(--primary)] text-[10px]"></i>
                   </div>
                   <div class="flex-1 min-w-0 pr-4">
                       <div class="flex items-center gap-1.5">
                           <h4 class="text-xs font-mono font-bold text-slate-900 truncate max-w-[150px] sm:max-w-[200px]" title="${sid}">${sid}</h4>
                           ${copyButton(sid, 'Copy Session ID', 'opacity-0 group-hover:opacity-100')}
                       </div>
                       <div class="flex items-center gap-1.5 mt-0.5">
                           <p class="text-[10px] text-slate-500 uppercase tracking-widest truncate max-w-[150px] sm:max-w-[200px]" title="${cid}">${cid}</p>
                           ${cid !== '--' ? copyButton(cid, 'Copy Customer ID', 'opacity-0 group-hover:opacity-100') : ''}
                       </div>
                       ${chips}
                   </div>
               </div>
            </td>
            <td class="p-4 align-top hidden md:table-cell">
               <h4 class="text-xs font-bold text-slate-700">${formatDate(session.date_created)}</h4>
               <p class="text-[9px] font-bold uppercase text-slate-500 mt-1 whitespace-nowrap flex items-center">${timeData.isRecent ? '' : timeData.timeStr} ${timeUi}</p>
            </td>
            <td class="p-4 align-top">${badgeHtml}</td>
            <td class="p-4 pr-6 align-top whitespace-nowrap">
               <div class="flex items-center justify-end w-full">
                   ${syncActionUi}${cancelActionUi}${deleteActionUi}${copyActionUi}${launchActionUi}${viewButton('ml-1.5 shrink-0')}
               </div>
            </td>
        </tr>`;

        const timeStrFormatted = timeData.isRecent ? timeData.relStr : `${formatDate(session.date_created)} (${timeData.timeStr})`;
        mobileHtml += `
        <div class="p-4 flex flex-col gap-3">
            <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0 flex-1">
                    <div class="w-7 h-7 rounded-lg bg-[var(--primary-container)] flex items-center justify-center shrink-0">
                        <i class="fa-solid fa-fingerprint text-[var(--primary)] text-[10px]"></i>
                    </div>
                    <span class="text-xs font-mono font-bold text-slate-900 truncate" title="${sid}">${sid}</span>
                    ${copyButton(sid, 'Copy Session ID', 'shrink-0')}
                </div>
                <div class="shrink-0">${viewButton('gap-1')}</div>
            </div>
            <div class="flex flex-col gap-1 pl-9">
                <div class="flex items-center gap-1.5">
                    <span class="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Customer:</span>
                    <span class="text-[10px] font-bold text-slate-600 truncate" title="${cid}">${cid}</span>
                </div>
                <div class="flex items-center gap-1.5 text-[9px] font-bold text-slate-400">
                    <i class="fa-regular fa-clock"></i><span>${timeStrFormatted}</span>
                </div>
                ${chips}
            </div>
            <div class="flex items-center justify-between gap-2 pt-2 border-t border-slate-100/60 mt-1">
                <div class="flex items-center gap-1.5">${syncActionUi}${cancelActionUi}${deleteActionUi}${copyActionUi}${launchActionUi}</div>
                <div class="shrink-0">${badgeHtml}</div>
            </div>
        </div>`;

        if (needsPolling && !window.activePollers[sid]) {
            window.activePollers[sid] = true;
            setTimeout(() => pollLoop(sid, config), 3000);
        }
    });
    tbody.innerHTML = html;
    if (mBody) mBody.innerHTML = mobileHtml;
};

window.syncActiveSession = async function(sid) {
    const config = window.InfoniteConfigManager ? window.InfoniteConfigManager.getConfig() : null;
    if (!config) return;
    try {
        await window.InfoniteFlowsManager.pollSessionState(config.widgetUrl, config.secret, window.FR_HISTORY_CONTEXT, sid, config.appId);
        renderHistory();
    } catch (e) {
        console.error("Sync failed", e);
        alert("Failed to force-sync session.");
    }
};

window.deleteLocalSession = function(sid) {
    showConfirmModal(
        "Delete Session",
        "Are you sure you want to permanently delete this session from your local storage? This action cannot be undone.",
        "Delete Session",
        () => {
            const config = window.InfoniteConfigManager ? window.InfoniteConfigManager.getConfig() : null;
            if (!config) return;
            delete window.activePollers[sid];
            const sessions = (window.InfoniteFlowsManager.getSessions(config.appId, window.FR_HISTORY_CONTEXT, config.widgetUrl) || [])
                .filter(s => s.session_id !== sid);
            window.InfoniteFlowsManager.saveSessions(config.appId, window.FR_HISTORY_CONTEXT, sessions, config.widgetUrl);
            renderHistory();
        }
    );
};

async function pollLoop(sid, config) {
    if (!window.activePollers[sid]) return;
    try {
        const state = await window.InfoniteFlowsManager.pollSessionState(config.widgetUrl, config.secret, window.FR_HISTORY_CONTEXT, sid, config.appId);
        renderHistory();
        if (state && state.is_closed === true) {
            delete window.activePollers[sid];
            return;
        }
    } catch (e) {
        delete window.activePollers[sid];
        renderHistory();
        return;
    }
    if (window.activePollers[sid]) setTimeout(() => pollLoop(sid, config), 3000);
}

window.cancelActiveSession = function(sid) {
    showConfirmModal(
        "Cancel Session",
        "Are you sure you want to cancel this session? The user will no longer be able to connect their banks.",
        "Cancel Session",
        async () => {
            const config = window.InfoniteConfigManager ? window.InfoniteConfigManager.getConfig() : null;
            if (!config) return;
            delete window.activePollers[sid];
            try {
                await window.InfoniteFlowsManager.cancelSession(config.widgetUrl, config.secret, window.FR_HISTORY_CONTEXT, sid);
                await window.InfoniteFlowsManager.pollSessionState(config.widgetUrl, config.secret, window.FR_HISTORY_CONTEXT, sid, config.appId);
                renderHistory();
            } catch (e) {
                console.error("Cancel failed", e);
                alert("Failed to cancel session: " + (e.message || JSON.stringify(e)));
            }
        },
        "Keep Active"
    );
};

window.clearHistory = function() {
    showConfirmModal(
        "Clear Local DB",
        "This will permanently delete all session history from your browser's local storage. This action cannot be undone.",
        "Delete Database",
        () => {
            window.activePollers = {};
            const config = window.InfoniteConfigManager ? window.InfoniteConfigManager.getConfig() : null;
            if (config) {
                window.InfoniteFlowsManager.saveSessions(config.appId, window.FR_HISTORY_CONTEXT, [], config.widgetUrl);
                renderHistory();
            }
        }
    );
};

// --------------------------------------------------------------------------------
// UI Modals
// --------------------------------------------------------------------------------

/** The application's details are refreshed every few seconds (js/config.js): while the dialog is open, its reach and its redirect URLs follow them. */
let reachWatch = null;

window.openNewLeadModal = function() {
    const modal = document.getElementById('newLeadModal');
    if (!modal) return;
    const cidField = document.getElementById('generate-customer-id');
    if (cidField && !cidField.value) {
        cidField.value = `FINANCIAL-RIDER-${Math.floor(10000000 + Math.random() * 90000000)}`;
    }
    InfoniteSessionEnding.sync();
    syncReach();
    renderSelectionSummary();
    loadCapabilities();
    clearInterval(reachWatch);
    reachWatch = setInterval(() => { syncReach(); InfoniteSessionEnding.sync(); }, 2000);
    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

/** Shows one of the dialog's three faces: the form, the created session or the failure. */
function showLeadView(view) {
    const isForm = view === 'form';
    document.getElementById('nl-header')?.classList.toggle('hidden', !isForm);
    document.getElementById('nl-form-view').classList.toggle('hidden', !isForm);
    document.getElementById('nl-form-view').classList.toggle('flex', isForm);
    document.getElementById('nl-footer-actions').classList.toggle('hidden', !isForm);
    document.getElementById('nl-footer-actions').classList.toggle('flex', isForm);
    ['success', 'error'].forEach(name => {
        const el = document.getElementById(`nl-${name}-view`);
        el.classList.toggle('hidden', view !== name);
        el.classList.toggle('flex', view === name);
    });
}

window.showLeadView = showLeadView;

window.closeNewLeadModal = function() {
    const modal = document.getElementById('newLeadModal');
    if (!modal) return;
    clearInterval(reachWatch);
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    showLeadView('form');
};

window.toggleAccordion = function(id) {
    // Modules is not an accordion on desktop: it has its own column
    if (id === 'acc-modules' && window.matchMedia('(min-width: 1024px)').matches) return;
    const content = document.getElementById(id);
    const icon = document.getElementById(id + '-icon');
    if (!content || !icon) return;
    const opening = content.classList.contains('hidden');
    content.classList.toggle('hidden', !opening);
    icon.classList.toggle('rotate-180', opening);
};

function validateSpanishDocument(doc) {
    doc = doc.trim().toUpperCase();
    if (!doc) return true;
    if (!/^[0-9]{8}[A-Z]$/.test(doc) && !/^[XYZ][0-9]{7}[A-Z]$/.test(doc)) return false;
    let value = doc;
    if (value.startsWith('X')) value = '0' + value.substring(1);
    else if (value.startsWith('Y')) value = '1' + value.substring(1);
    else if (value.startsWith('Z')) value = '2' + value.substring(1);
    return value.charAt(8) === 'TRWAGMYFPDXBNJZSQVHLCKE'.charAt(parseInt(value.substring(0, 8), 10) % 23);
}

/** Whether a text is a base64 key of exactly 32 bytes. */
function isAesKey(text) {
    try { return atob(text).length === 32; } catch (e) { return false; }
}

/**
 * The session request, read from the form — what POST /manager/init receives. Anything the form
 * leaves at its default is not sent, so the application's own defaults apply.
 */
function buildLeadPayload() {
    const value = (id) => (document.getElementById(id)?.value || '').trim();

    const features = Array.from(document.querySelectorAll('#modulesGrid input.feature-checkbox:checked')).map(cb => ({
        code: cb.value,
        configurations: window.INFONITE_FEATURES[cb.value]?.defaultConfig || {}
    }));
    if (features.length === 0) throw new Error("Select at least one module: a session must read something.");

    const settings = {
        sandbox: !!document.getElementById('generate-sandbox-mode')?.checked,
        tokenized_access: !!document.getElementById('generate-recurring-access')?.checked,
        executions_features: features,
        hooks_extra_data: { session: "{session_id}", customer: "{customer_id}" },
        ...InfoniteSessionEnding.settings(),
    };

    if (!settings.sandbox && !InfoniteCapabilities.productionAllowed('product:financial_rider')) {
        throw new Error("This application runs Financial Rider in sandbox only: turn Sandbox on.");
    }
    if (settings.tokenized_access && !settings.sandbox && !InfoniteCapabilities.reachesProduction('login:tokenized_access')) {
        throw new Error("Recurring access is enabled in sandbox only for this application: turn Sandbox on or switch it off.");
    }

    if (entitiesMode() === 'named') {
        const reference = value('fr-engine-reference');
        if (!reference) throw new Error("Choose the entity the session connects, or go back to the catalogue.");
        settings.engine_reference = reference;
        settings.max_connections = 1;
    } else {
        settings.markets = checkedValues('market');
        settings.entity_types = checkedValues('entity_type');
        if (settings.markets.length === 0) throw new Error("Select the market the entities come from.");
        if (settings.entity_types.length === 0) throw new Error("Select at least one kind of entity.");
        settings.max_connections = Number(document.querySelector('input[name="fr-max-connections"]:checked')?.value || 3);
        // how the selection screen shows them, when one is saved for Financial Rider with this environment
        const selection = savedSelection();
        if (selection) Object.assign(settings, selectionSettings(selection));
    }

    const aesKey = value('generate-aes-key');
    if (aesKey) {
        if (!isAesKey(aesKey)) throw new Error("The AES key must be 32 bytes, base64-encoded: use Randomize.");
        settings.aes_key = aesKey;
    }

    const payload = { customer_id: value('generate-customer-id'), settings };
    if (!payload.customer_id) throw new Error("The Customer ID is required.");

    const userDoc = value('generate-fixed-user-document').toUpperCase();
    const userEmail = value('generate-fixed-user-email');
    if (userDoc) {
        if (!validateSpanishDocument(userDoc)) throw new Error("The User Document is not a valid Spanish DNI or NIE.");
        payload.fixed_parameters = { ...(payload.fixed_parameters || {}), user_identification: userDoc };
    }
    if (userEmail) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) throw new Error("The User Email is not a valid email address.");
        payload.fixed_parameters = { ...(payload.fixed_parameters || {}), user_email: userEmail };
    }

    const hours = Number(value('generate-date-limit'));
    if (hours) payload.date_limit = new Date(Date.now() + hours * 3600 * 1000).toISOString();

    return payload;
}

window.buildLeadPayload = buildLeadPayload;

window.generateLeadSession = async function() {
    const btn = document.getElementById('generateLeadBtn');
    const originalContent = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> <span>Initializing...</span>`;
    btn.disabled = true;
    btn.classList.add('opacity-70');

    try {
        const config = InfoniteConfigManager.getConfig();
        if (!config || !config.widgetUrl) throw new Error("No active environment specified.");
        if (!config.secret || !config.appId) throw new Error("Missing App Credentials in environment settings.");

        const payload = buildLeadPayload();
        const result = await InfoniteFlowsManager.initSession(config.widgetUrl, config.secret, config.appId, window.FR_HISTORY_CONTEXT, payload);
        if (!result || !result.widget_url) throw new Error("Invalid response received from the server.");

        try {
            await InfoniteFlowsManager.pollSessionState(config.widgetUrl, config.secret, window.FR_HISTORY_CONTEXT, result.session_id, config.appId);
        } catch (e) {
            console.error("Initial polling failed:", e);
        }

        // The next lead is another customer: its id is generated again when the dialog opens.
        // Where this one ends is remembered: the next lead starts from it
        document.getElementById('generate-customer-id').value = '';
        InfoniteSessionEnding.remember();
        document.getElementById('nl-success-url').value = result.widget_url;
        lastCreated = { widget_url: result.widget_url, settings: { completion_mode: payload.settings.completion_mode } };
        document.getElementById('nl-success-launch-hint').textContent = InfoniteLauncher.hint(lastCreated.settings);
        // The ticket of a recurring access is shown here and nowhere else
        document.getElementById('nl-success-ticket-box').classList.toggle('hidden', !result.ticket);
        document.getElementById('nl-success-ticket').value = result.ticket || '';
        showLeadView('success');
        renderHistory();
    } catch (err) {
        console.error("Session Generation Error:", err);
        let displayMsg = err.message || "An unknown error occurred.";
        if (err.status) {
            displayMsg = `HTTP ${err.status} - ${err.statusText || 'Error'}\n`;
            const detail = err.responseBody?.detail;
            if (Array.isArray(detail)) {
                displayMsg += "\nValidation Errors:\n" + detail.map(d => `- [${d.loc ? d.loc.join('.') : 'unknown'}]: ${d.msg}`).join('\n');
            } else if (detail) {
                displayMsg += `\nDetail: ${JSON.stringify(detail, null, 2)}`;
            } else if (err.responseBody) {
                displayMsg += `\nResponse: ${JSON.stringify(err.responseBody, null, 2)}`;
            }
        }
        document.getElementById('nl-error-msg').textContent = displayMsg;

        // A missing capability gets its own explanation instead of the raw answer
        const detail = err.responseBody?.detail;
        const missingCapability = typeof detail === 'string' && detail.startsWith('insufficient_capabilities@');
        document.getElementById('nl-error-generic').classList.toggle('hidden', missingCapability);
        document.getElementById('nl-error-permission').classList.toggle('hidden', !missingCapability);
        document.getElementById('nl-error-permission').classList.toggle('flex', missingCapability);
        if (missingCapability) {
            document.getElementById('nl-error-permission-product').textContent =
                detail.slice('insufficient_capabilities@'.length).replace(/^product:/, '');
        }
        showLeadView('error');
    } finally {
        btn.innerHTML = originalContent;
        btn.disabled = false;
        btn.classList.remove('opacity-70');
    }
};

// --------------------------------------------------------------------------------
// A session's results: their own page (financial-rider-results.html)
// --------------------------------------------------------------------------------

window.viewSession = function(sid) {
    if (sid) window.location.href = `financial-rider-results.html?session_id=${encodeURIComponent(sid)}`;
};

// --------------------------------------------------------------------------------
// Import External Session Functionality
// --------------------------------------------------------------------------------

window.openImportModal = function() {
    const modal = document.getElementById('importSessionModal');
    if (!modal) return;
    document.getElementById('import-session-id').value = '';
    showImportFormView();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

window.closeImportSessionModal = function() {
    const modal = document.getElementById('importSessionModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
};

function showImportFormView() {
    document.getElementById('import-form-view').classList.remove('hidden');
    document.getElementById('import-form-view').classList.add('flex');
    ['loading', 'success', 'error'].forEach(name => document.getElementById(`import-${name}-view`).classList.add('hidden'));
}

window.showImportFormView = showImportFormView;

function showImportView(name) {
    ['form', 'loading', 'success', 'error'].forEach(view => {
        const el = document.getElementById(`import-${view}-view`);
        el.classList.toggle('hidden', view !== name);
        el.classList.toggle('flex', view === name);
    });
}

window.submitImportSession = async function() {
    const config = window.InfoniteConfigManager ? window.InfoniteConfigManager.getConfig() : null;
    if (!config) return alert("Configuration is not loaded yet.");
    const sessionId = document.getElementById('import-session-id').value.trim();
    if (!sessionId) return alert("Please enter a valid Session ID.");

    showImportView('loading');
    try {
        const stateData = await window.InfoniteFlowsManager.pollSessionState(config.widgetUrl, config.secret, window.FR_HISTORY_CONTEXT, sessionId);
        if (!stateData) throw new Error("Invalid or empty response from server.");

        const sessions = window.InfoniteFlowsManager.getSessions(config.appId, window.FR_HISTORY_CONTEXT, config.widgetUrl) || [];
        const record = {
            session_id: sessionId,
            app_id: config.appId,
            customer_id: stateData.customer_id || 'Imported',
            widget_url: '',  // unknown: the session was not created here
            infonite_state: stateData,
            date_created: stateData.date_created || new Date().toISOString()
        };
        try {
            record.session_settings = await window.InfoniteFlowsManager.fetchSessionSettings(config.widgetUrl, config.secret, window.FR_HISTORY_CONTEXT, sessionId);
        } catch (e) {
            console.warn("Could not retrieve the session settings:", e);
        }
        const existing = sessions.findIndex(s => s.session_id === sessionId);
        if (existing !== -1) sessions[existing] = record;
        else sessions.unshift(record);
        window.InfoniteFlowsManager.saveSessions(config.appId, window.FR_HISTORY_CONTEXT, sessions, config.widgetUrl);

        showImportView('success');
        renderHistory();
    } catch (err) {
        console.error("Import failed:", err);
        document.getElementById('import-error-msg').textContent = err.statusText
            ? `Server response: ${err.status} ${err.statusText}`
            : (err.message || "Could not fetch the session state. Make sure the Session ID is correct and belongs to the active environment.");
        showImportView('error');
    }
};
