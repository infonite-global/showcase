/**
 * es-public-administration.js
 * Clean UI logic integration for the Spain Public Administration flow.
 */

const ALLOWED_MODULES = [
    'customer_information_read',
    'labor_check',
    'public_pensions',
    'vehicles_data',
    'driver_data',
    'credit_registry_data',
    'academic_data',
    'properties_data',
    'yearly_individual_tax'
];

const DEFAULT_SELECTED_MODULES = [
    'customer_information_read',
    'labor_check',
    'public_pensions'
];

document.addEventListener("DOMContentLoaded", () => {
    // 1. Render the modules dynamically based on features.js
    renderModulesGrid();

    // 2. Where the session ends: the presets every flow shares (js/session-ending.js)
    InfoniteSessionEnding.mount({
        container: 'session-ending',
        flow: 'es-public-administration',
        docs: 'https://infonite.dev/flows/spain-public-administration',
        event: 'es-public-administration:ended',
    });

    // 3. What the application holds (js/session-capabilities.js), and the widget's dialog (js/session-launcher.js)
    InfoniteCapabilities.load().then(syncReach);
    InfoniteLauncher.mount({ event: 'es-public-administration:ended', onClosed: () => renderHistory() });

    renderHistory();
});

/** Offers a production session only when the application may run one: its Sandbox switch, its tag and its notice. */
function syncReach() {
    InfoniteCapabilities.holdSandbox({
        product: 'product:es_public_administration', flow: 'Spain Public Administration', real: 'read the real administrations',
        tagId: 'espa-reach-product', noticeId: 'espa-sandbox-notice',
    });
}

/** What a session was created with: the chips every flow draws, with this flow's own — where it signs in, and how many modules it reads. */
function setupChips(settings) {
    if (!settings) return '';
    const { chip } = InfoniteLauncher;
    const own = [];
    if (Array.isArray(settings.allowed_sources) && settings.allowed_sources.length) {
        own.push(chip(`<i class="fa-solid fa-building-columns"></i> ${escapeHtml(settings.allowed_sources.join(' · ').toUpperCase())}`));
    }
    const modules = Array.isArray(settings.executions_features) ? settings.executions_features.length : 0;
    if (modules) own.push(chip(`${modules} ${modules === 1 ? 'module' : 'modules'}`));
    return InfoniteLauncher.chips(settings, own);
}

const escapeHtml = (text) => String(text ?? '').replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);

/**
 * Renders the Feature toggles inside the New Lead modal's grid container.
 */
function renderModulesGrid() {
    const gridContainer = document.getElementById("modulesGrid");
    if (!gridContainer) return;
    if (window.ES_PA_PRESET) return renderPresetModules(gridContainer, window.ES_PA_PRESET);

    if (typeof window.INFONITE_FEATURES === 'undefined') {
        gridContainer.innerHTML = '<p class="text-[10px] text-red-500 font-bold p-4">Error: Features dictionary not loaded.</p>';
        return;
    }

    let htmlContent = '';
    // Modules this demo does not enable are drawn apart, grouped in one labelled box
    let notEnabledContent = '';

    ALLOWED_MODULES.forEach(moduleCode => {
        const featureDef = window.INFONITE_FEATURES[moduleCode];
        if (!featureDef) return; // Fallback if missing
 
        const isSoon = featureDef.soon === true;
        const isChecked = !isSoon && DEFAULT_SELECTED_MODULES.includes(moduleCode) ? 'checked' : '';
        const isDisabled = isSoon ? 'disabled' : '';
        const labelClass = isSoon ? 'opacity-40 cursor-not-allowed select-none pointer-events-none' : 'cursor-pointer';
        const opc = isChecked ? 'opacity-100' : 'opacity-0';
        const bgc = isChecked ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'bg-white text-slate-300 border-black/10';
 
        // A compact row: icon, name and what it reads, and the check on the right
        const cardHtml = `
        <label class="${labelClass} block relative group h-full">
            <input class="feature-checkbox sr-only" type="checkbox" value="${featureDef.code}" ${isChecked} ${isDisabled} onchange="toggleFeatureVisual(this)"/>
            <div class="feature-card border border-black/10 rounded-2xl px-3 py-2.5 flex items-center text-left transition-all hover:bg-slate-50 hover:border-black/20 group-hover:shadow-md h-full gap-3 bg-white relative">
                <div class="w-9 h-9 rounded-xl bg-slate-50 border border-black/5 flex items-center justify-center shrink-0 transition-all">
                    <i class="${featureDef.icon} text-[var(--primary)] text-sm"></i>
                </div>
                <div class="flex-1 min-w-0 flex flex-col justify-center">
                    <h4 class="font-black text-slate-900 text-[10px] uppercase tracking-wider leading-tight">
                      ${featureDef.name}
                    </h4>
                    <p class="espa-mod-desc text-[9px] text-slate-500 font-medium leading-tight mt-0.5 truncate">${featureDef.workMessage.replace('Consulting your', '').replace('Retrieving your', '').trim()}</p>
                    <p class="espa-mod-off"><i class="fa-solid fa-ban"></i> No administration chosen returns it</p>
                </div>
                ${isSoon ? '' : `
                    <div class="indicator w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${bgc}">
                       <i class="fa-solid fa-check text-[10px] ${opc} transition-opacity check-icon"></i>
                    </div>
                `}
            </div>
        </label>
        `;
        if (isSoon) notEnabledContent += cardHtml;
        else htmlContent += cardHtml;
    });

    if (notEnabledContent) {
        htmlContent += `
        <div class="col-span-full relative mt-3 border border-dashed border-slate-300 rounded-2xl p-2 pt-5 bg-slate-50/40">
            <span class="absolute -top-2.5 left-5 px-2.5 py-0.5 bg-white border border-slate-200 rounded-full text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <i class="fa-solid fa-lock text-[8px]"></i> Not enabled for this demo
            </span>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">${notEnabledContent}</div>
        </div>`;
    }

    gridContainer.innerHTML = htmlContent;
    syncEmailRequirement();
    syncSelectedCount();
    renderModuleOptions();
    renderSources();
    syncOptionsLine();
}

/**
 * A product preset's modules: fixed, so they are shown rather than offered — one under another,
 * each saying what it reads. The checked inputs stay, hidden and locked, so the session payload is
 * built exactly as for any selection.
 */
function renderPresetModules(gridContainer, preset) {
    const title = document.getElementById('modules-title');
    const subtitle = document.getElementById('modules-subtitle');
    if (title) title.textContent = preset.modulesTitle;
    if (subtitle) subtitle.textContent = preset.modulesSubtitle;

    gridContainer.className = 'flex flex-col rounded-2xl border border-black/10 bg-white divide-y divide-black/5 overflow-hidden';
    gridContainer.innerHTML = preset.modules.map(code => {
        const featureDef = window.INFONITE_FEATURES && window.INFONITE_FEATURES[code];
        if (!featureDef) return '';
        return `
        <div class="flex items-center gap-3 px-4 py-3">
            <input class="feature-checkbox sr-only" type="checkbox" value="${featureDef.code}" checked disabled/>
            <div class="w-9 h-9 rounded-xl bg-[var(--primary-container)] flex items-center justify-center shrink-0">
                <i class="${featureDef.icon} text-[var(--primary)] text-sm"></i>
            </div>
            <div class="flex-1 min-w-0">
                <h4 class="font-black text-slate-900 text-[10px] uppercase tracking-wider leading-tight">${featureDef.name}</h4>
                <p class="text-[10px] text-slate-500 font-medium leading-snug mt-0.5">${(preset.moduleDescriptions || {})[code] || featureDef.workMessage.replace('Consulting your', '').replace('Retrieving your', '').trim()}</p>
            </div>
            <i class="fa-solid fa-circle-check text-[var(--primary)] text-sm shrink-0"></i>
        </div>`;
    }).join('');
    syncEmailRequirement();
    syncSelectedCount();
    renderModuleOptions();
    renderSources();
    syncOptionsLine();
}

/**
 * The count on the Modules header, and what its button does next: select every module the demo
 * enables, or clear them. A product preset's modules are fixed, so it has no button.
 */
function syncSelectedCount() {
    const badge = document.getElementById('modules-selected-count');
    const n = document.querySelectorAll('#modulesGrid input.feature-checkbox:checked').length;
    if (badge) badge.textContent = window.ES_PA_PRESET ? `${n} included` : `${n} selected`;
    const toggle = document.getElementById('modules-select-all');
    if (!toggle) return;
    const open = Array.from(document.querySelectorAll('#modulesGrid input.feature-checkbox:not(:disabled)'));
    toggle.style.display = window.ES_PA_PRESET || !open.length ? 'none' : '';
    toggle.innerHTML = open.length && open.every(box => box.checked)
        ? '<i class="fa-solid fa-xmark"></i> <span>Clear</span>'
        : '<i class="fa-solid fa-check-double"></i> <span>Select all</span>';
}

window.toggleAllModules = function() {
    const boxes = Array.from(document.querySelectorAll('#modulesGrid input.feature-checkbox:not(:disabled)'));
    const selectAll = boxes.some(box => !box.checked);
    boxes.forEach(box => {
        box.checked = selectAll;
        toggleFeatureVisual(box);
    });
};

// --------------------------------------------------------------------------------
// Module options: what a module can be asked for besides itself
// --------------------------------------------------------------------------------

/**
 * What each module accepts besides itself (the `configurations` of its feature, as the API takes
 * them). Every option starts at what this demo has always sent; `api` is the API's own default, so
 * an option left there is not sent — unless the demo always sent it (features.js `defaultConfig`).
 */
const MODULE_OPTIONS = {
    labor_check: [
        { key: 'from_date', kind: 'select', title: 'Contribution history from', api: '5 years ago', value: '5 years ago',
          choices: [['1 year ago', '1 year'], ['3 years ago', '3 years'], ['5 years ago', '5 years'], ['10 years ago', '10 years'], ['20 years ago', '20 years'], ['80 years ago', 'The whole career']],
          help: 'How far back the contribution bases go. One year at least: the income floor reads the last twelve months.' },
        { key: 'work_life_report', kind: 'switch', title: 'Work life report (PDF)', api: true, value: true,
          help: "The Seguridad Social's signed report, attached. The labor check reads it either way." },
        { key: 'contribution_base_report', kind: 'switch', title: 'Contribution base report (PDF)', api: false, value: true,
          help: 'The signed report of the bases, attached. The bases are read either way.' },
    ],
    yearly_individual_tax: [
        { key: 'last_n_years', kind: 'select', title: 'Fiscal years', api: 3, value: 3, number: true,
          choices: [[1, '1 year'], [2, '2 years'], [3, '3 years'], [4, '4 years'], [5, '5 years']],
          help: 'How many closed fiscal years to read, counting back from last year.' },
    ],
    driver_data: [
        { key: 'read_point_movements', kind: 'switch', title: 'Points history', api: false, value: true,
          help: "Every movement of the licence's points, not only its balance." },
    ],
    vehicles_data: [
        { key: 'simple_vehicle_report', kind: 'switch', title: 'Incidents check', api: false, value: true,
          help: "The DGT's report on each vehicle: whether the registry holds anything against it, such as a seizure, a charge or a deregistration." },
    ],
    credit_registry_data: [
        { key: 'preferred_type', kind: 'segment', title: 'Report', api: 'credit_registry_data:es_cirbe_detailed', value: 'credit_registry_data:es_cirbe_detailed',
          choices: [['credit_registry_data:es_cirbe_detailed', 'Detailed'], ['credit_registry_data:es_cirbe_aggregated', 'Aggregated']],
          help: 'Detailed: every operation, with the entity that declared it, in euros. Aggregated: the risks without entities or operation codes, in thousands of euros. A person with nothing declared only ever gets the aggregated one.' },
    ],
};

/** What the person setting up the session chose for each option, by module. */
const moduleOptions = {};

const optionValue = (code, option) => (moduleOptions[code] && option.key in moduleOptions[code] ? moduleOptions[code][option.key] : option.value);

window.setModuleOption = function(code, key, raw) {
    const option = (MODULE_OPTIONS[code] || []).find(item => item.key === key);
    if (!option) return;
    moduleOptions[code] = { ...(moduleOptions[code] || {}), [key]: option.number ? Number(raw) : raw };
    syncOptionsLine();
};

/** The `configurations` a module is requested with: what the demo always sent, with the options as they stand. */
function configurationsOf(code) {
    const config = { ...(window.INFONITE_FEATURES[code]?.defaultConfig || {}) };
    (MODULE_OPTIONS[code] || []).forEach(option => {
        const value = optionValue(code, option);
        if (option.key in config || value !== option.api) config[option.key] = value;
        else delete config[option.key];
    });
    return config;
}

/** One option: what it is and what it changes, and its control — a switch, a list or a choice of two. */
function optionRow(code, option) {
    const value = optionValue(code, option);
    const id = `opt-${code}-${option.key}`;
    const text = (label) => `<span class="min-w-0">${label}<span class="espa-opt-help">${escapeHtml(option.help)}</span></span>`;
    if (option.kind === 'switch') {
        return `
            <label class="espa-opt-row">
                ${text(`<span class="espa-opt-title">${escapeHtml(option.title)}</span>`)}
                <input type="checkbox" class="sr-only" ${value ? 'checked' : ''} onchange="setModuleOption('${code}', '${option.key}', this.checked)">
                <span class="sf-switch-track"></span>
            </label>`;
    }
    if (option.kind === 'segment') {
        return `
            <div class="espa-opt-row" role="radiogroup" aria-label="${escapeHtml(option.title)}">
                ${text(`<span class="espa-opt-title">${escapeHtml(option.title)}</span>`)}
                <span class="espa-opt-segment">${option.choices.map(([choice, label]) => `<label><input type="radio" class="sr-only" name="${id}" value="${escapeHtml(choice)}" ${choice === value ? 'checked' : ''} onchange="setModuleOption('${code}', '${option.key}', this.value)"><span>${escapeHtml(label)}</span></label>`).join('')}</span>
            </div>`;
    }
    return `
        <div class="espa-opt-row">
            ${text(`<label for="${id}" class="espa-opt-title">${escapeHtml(option.title)}</label>`)}
            <select id="${id}" class="espa-opt-select" onchange="setModuleOption('${code}', '${option.key}', this.value)">${option.choices.map(([choice, label]) => `<option value="${escapeHtml(choice)}" ${choice === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select>
        </div>`;
}

/** The line under the Modules header while a selected module has options: which, and how many differ from the defaults. */
function syncOptionsLine() {
    const line = document.getElementById('modules-options-line');
    const summary = document.getElementById('modules-options-summary');
    if (!line || !summary) return;
    const selected = Array.from(document.querySelectorAll('#modulesGrid input.feature-checkbox:checked')).map(input => input.value).filter(code => MODULE_OPTIONS[code]);
    line.classList.toggle('hidden', !selected.length);
    const changed = selected.reduce((n, code) => n + MODULE_OPTIONS[code].filter(option => optionValue(code, option) !== option.value).length, 0);
    const names = selected.map(code => window.INFONITE_FEATURES?.[code]?.name || code).join(' · ');
    summary.innerHTML = `${escapeHtml(names)} — ${changed ? `<b>${changed} changed</b>` : 'all at their defaults'}`;
}

window.openOptionsModal = function() {
    renderModuleOptions();
    const modal = document.getElementById('espaOptionsModal');
    modal?.classList.remove('hidden');
    modal?.classList.add('flex');
};

window.closeOptionsModal = function() {
    const modal = document.getElementById('espaOptionsModal');
    modal?.classList.add('hidden');
    modal?.classList.remove('flex');
    syncOptionsLine();
};

/** Every option back to where it starts. */
window.resetModuleOptions = function() {
    Object.keys(moduleOptions).forEach(code => delete moduleOptions[code]);
    renderModuleOptions();
    syncOptionsLine();
};

/** The options of the modules selected now, a group each; what was chosen survives a module going and coming back. */
function renderModuleOptions() {
    const box = document.getElementById('espa-module-options');
    if (!box) return;
    const selected = Array.from(document.querySelectorAll('#modulesGrid input.feature-checkbox:checked')).map(input => input.value);
    box.innerHTML = selected.filter(code => MODULE_OPTIONS[code]).map(code => {
        const feature = window.INFONITE_FEATURES?.[code] || { name: code, icon: 'fa-solid fa-shapes' };
        return `
            <div class="espa-opt-group">
                <span class="espa-opt-module"><i class="${feature.icon}"></i>${escapeHtml(feature.name)}</span>
                ${MODULE_OPTIONS[code].map(option => optionRow(code, option)).join('')}
            </div>`;
    }).join('') || '<p class="espa-opt-empty">The selected modules have nothing to set: each one reads what it reads.</p>';
}

// --------------------------------------------------------------------------------
// Administrations: where the person may be asked to sign in, and in which order
// --------------------------------------------------------------------------------

/**
 * The administrations a session may sign in to, as the API names them (`settings.allowed_sources`),
 * with the modules each one returns — the Seguridad Social signed in with Cl@ve brings more than
 * with an SMS, which is why it serves the CIRBE report and the DGT's products too.
 */
const SOURCES = [
    { code: 'tgss', name: 'Seguridad Social', icon: 'fa-solid fa-briefcase', returns: 'Profile, work life and pensions; signed in with Cl@ve, also the CIRBE report, the driving licence and the vehicles',
      serves: ['customer_information_read', 'labor_check', 'public_pensions', 'credit_registry_data', 'driver_data', 'vehicles_data'] },
    { code: 'aeat', name: 'Agencia Tributaria', icon: 'fa-solid fa-file-invoice-dollar', returns: 'Profile and the yearly tax situation',
      serves: ['customer_information_read', 'yearly_individual_tax'] },
    { code: 'citizen_folder', name: 'Carpeta Ciudadana', icon: 'fa-solid fa-folder-open', returns: 'Profile, driving licence, vehicles, degrees and properties',
      serves: ['customer_information_read', 'driver_data', 'vehicles_data', 'academic_data', 'properties_data'] },
    { code: 'dgt', name: 'DGT', icon: 'fa-solid fa-car', returns: 'Profile, the driving licence with its photograph, and the vehicles',
      serves: ['customer_information_read', 'driver_data', 'vehicles_data'] },
    { code: 'bde', name: 'Banco de España', icon: 'fa-solid fa-building-columns', returns: 'The CIRBE report, and nothing else',
      serves: ['credit_registry_data'] },
];

/** How the list is chosen: the application's default, or this one — its order, and which are allowed. The API's own default starts it. */
const sourcesState = { mode: 'default', order: SOURCES.map(source => source.code), on: new Set(['tgss', 'aeat', 'citizen_folder']) };

const sourceName = (code) => SOURCES.find(source => source.code === code)?.name || code;
const allowedSources = () => sourcesState.order.filter(code => sourcesState.on.has(code));

/** The selected modules no allowed administration returns: the API refuses such a session, so the form says so first. */
function uncoveredModules() {
    if (window.ES_PA_PRESET || sourcesState.mode !== 'custom') return [];
    const allowed = allowedSources();
    return Array.from(document.querySelectorAll('#modulesGrid input.feature-checkbox:checked')).map(input => input.value)
        .filter(code => !SOURCES.some(source => allowed.includes(source.code) && source.serves.includes(code)));
}

/** The modules this demo offers that no administration on the list returns: locked above, and named here. */
function lockedModules() {
    if (window.ES_PA_PRESET || sourcesState.mode !== 'custom') return [];
    const allowed = allowedSources();
    return ALLOWED_MODULES.filter(code => !window.INFONITE_FEATURES?.[code]?.soon)
        .filter(code => !SOURCES.some(source => allowed.includes(source.code) && source.serves.includes(code)));
}

function syncSourcesCoverage() {
    const note = document.getElementById('espa-sources-coverage');
    if (!note) return;
    const locked = lockedModules().map(code => window.INFONITE_FEATURES?.[code]?.name || code);
    note.classList.toggle('hidden', !locked.length);
    note.querySelector('span').textContent = locked.length
        ? `No administration on this list returns ${locked.join(', ')}: ${locked.length === 1 ? 'that module is' : 'those modules are'} locked until one that does is allowed.`
        : '';
}

/**
 * A module no administration on the list returns cannot be asked for — the API would refuse the
 * session: it is unchecked and locked, and says why, until the list serves it again.
 */
function syncModuleAvailability() {
    if (window.ES_PA_PRESET) return;
    const locked = lockedModules();
    document.querySelectorAll('#modulesGrid input.feature-checkbox').forEach(input => {
        if (window.INFONITE_FEATURES?.[input.value]?.soon) return;
        const label = input.closest('label');
        const off = locked.includes(input.value);
        if (off && input.checked) {
            input.checked = false;
            toggleFeatureVisual(input);
        }
        input.disabled = off;
        label?.classList.toggle('is-unavailable', off);
    });
    syncSelectedCount();
    syncOptionsLine();
}

/** The administrations box: a preset's fixed list, the application's default, or the list in its order. */
function renderSources() {
    const choice = document.getElementById('espa-sources-choice');
    const presetNote = document.getElementById('espa-sources-preset');
    const summary = document.getElementById('espa-sources-summary');
    const list = document.getElementById('espa-sources');
    if (!choice || !list) return;
    const preset = window.ES_PA_PRESET;
    if (preset && Array.isArray(preset.sources)) {
        choice.classList.add('hidden');
        presetNote.classList.remove('hidden');
        presetNote.innerHTML = `This product signs in at the ${escapeHtml(preset.sources.map(sourceName).join(' and '))} alone: every session is sent <code class="font-mono text-[9px] text-slate-600">allowed_sources: ${escapeHtml(JSON.stringify(preset.sources))}</code>.`;
        if (summary) summary.textContent = preset.sources.map(sourceName).join(' · ');
        return;
    }
    const custom = sourcesState.mode === 'custom';
    const allowed = allowedSources();
    document.getElementById('espa-sources-default-note')?.classList.toggle('hidden', custom);
    list.classList.toggle('hidden', !custom);
    if (summary) summary.textContent = custom ? `${allowed.length} of ${SOURCES.length}` : 'App default';
    const last = sourcesState.order.length - 1;
    list.innerHTML = custom ? sourcesState.order.map((code, i) => {
        const source = SOURCES.find(item => item.code === code);
        const on = sourcesState.on.has(code);
        return `
            <li class="espa-source${on ? '' : ' is-off'}">
                <span class="espa-source-pos" title="${on ? 'Its place in the order' : 'Not allowed'}">${on ? allowed.indexOf(code) + 1 : '–'}</span>
                <span class="espa-source-icon"><i class="${source.icon}"></i></span>
                <span class="espa-source-text"><b>${escapeHtml(source.name)}</b><small>${escapeHtml(source.returns)}</small></span>
                <span class="espa-source-move">
                    <button type="button" onclick="moveSource('${code}', -1)" ${i === 0 ? 'disabled' : ''} title="Earlier" aria-label="Move ${escapeHtml(source.name)} earlier"><i class="fa-solid fa-chevron-up"></i></button>
                    <button type="button" onclick="moveSource('${code}', 1)" ${i === last ? 'disabled' : ''} title="Later" aria-label="Move ${escapeHtml(source.name)} later"><i class="fa-solid fa-chevron-down"></i></button>
                </span>
                <label class="espa-source-switch" title="${on ? 'Allowed' : 'Not allowed'}"><input type="checkbox" class="sr-only" ${on ? 'checked' : ''} onchange="toggleSource('${code}', this.checked)" aria-label="Allow ${escapeHtml(source.name)}"><span class="sf-switch-track"></span></label>
            </li>`;
    }).join('') : '';
    syncSourcesCoverage();
    syncModuleAvailability();
}

window.setSourcesMode = function(mode) {
    sourcesState.mode = mode === 'custom' ? 'custom' : 'default';
    renderSources();
};

window.moveSource = function(code, step) {
    const from = sourcesState.order.indexOf(code);
    const to = from + step;
    if (from < 0 || to < 0 || to >= sourcesState.order.length) return;
    sourcesState.order.splice(to, 0, sourcesState.order.splice(from, 1)[0]);
    renderSources();
};

window.toggleSource = function(code, on) {
    if (on) sourcesState.on.add(code);
    else sourcesState.on.delete(code);
    renderSources();
};

// Modules whose request needs the customer's email (the CIRBE request to the Bank of Spain carries it)
const EMAIL_REQUIRED_BY = ['credit_registry_data'];

function isEmailRequired() {
    return EMAIL_REQUIRED_BY.some(code =>
        document.querySelector(`#modulesGrid input.feature-checkbox[value="${code}"]`)?.checked);
}

/**
 * While a selected module requires the email: Fixed Parameters stays open, the email field glows
 * until it is filled, and its hint says why it is required.
 */
function syncEmailRequirement() {
    const required = isEmailRequired();
    const content = document.getElementById('acc-fixed-parameters');
    const icon = document.getElementById('acc-fixed-parameters-icon');
    const input = document.getElementById('generate-fixed-user-email');
    const optionalHint = document.getElementById('generate-fixed-user-email-optional');
    const requiredHint = document.getElementById('generate-fixed-user-email-required');
    if (!content || !input) return;

    if (required) {
        content.classList.remove('hidden');
        if (icon) icon.classList.add('rotate-180');
    }
    input.required = required;
    input.classList.toggle('email-required-glow', required && !input.value.trim());
    if (optionalHint) optionalHint.classList.toggle('hidden', required);
    document.getElementById('generate-fixed-user-email-optional-note')?.classList.toggle('hidden', required);
    if (requiredHint) requiredHint.classList.toggle('hidden', !required);
}

function toggleFeatureVisual(input) {
    syncEmailRequirement();
    syncSelectedCount();
    renderModuleOptions();
    syncOptionsLine();
    const card = input.closest('label').querySelector('.indicator');
    const icon = card.querySelector('.check-icon');
    if (input.checked) {
        card.className = "indicator w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors bg-[var(--primary)] text-white border-[var(--primary)]";
        icon.classList.remove('opacity-0');
        icon.classList.add('opacity-100');
    } else {
        card.className = "indicator w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors bg-white text-slate-300 border-black/10";
        icon.classList.remove('opacity-100');
        icon.classList.add('opacity-0');
    }
}

// --------------------------------------------------------------------------------
// History Rendering
// --------------------------------------------------------------------------------

function formatDate(isoString) {
    if (!isoString) return '--';
    const d = new Date(isoString);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function formatTimeRelative(isoString) {
    if (!isoString) return { timeStr: '--', relStr: '--', isRecent: false };
    const d = new Date(isoString);
    const now = new Date();
    const diffMs = now - d;
    
    // HH:MM
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const timeStr = `${hh}:${min}`;
    
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHrs = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHrs / 24);
    
    let relStr = '';
    let isRecent = false;
    
    if (diffSecs < 60) { relStr = 'just now'; isRecent = true; }
    else if (diffMins < 30) { relStr = `${diffMins} min ago`; isRecent = true; }
    else { relStr = ''; isRecent = false; }
    
    return { timeStr, relStr, isRecent };
}

function getStatusBadge(statusCode) {
    // 1. We look up the status key directly from the global dictionary
    const ui = window.InfoniteStatusDict ? window.InfoniteStatusDict[statusCode] : null;

    if (!ui) {
        return `<div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-500/20 bg-slate-50 text-slate-700">
            <i class="fa-solid fa-circle-info text-[10px]"></i>
            <span class="text-[9px] font-black tracking-widest uppercase">${statusCode}</span>
        </div>`;
    }
    
    // 2. Check animation properties explicitly tied to the new frontend tokens we added to status.js
    const iconAnim = ui.pulse ? 'animate-pulse' : '';
    const spinClass = ui.spin ? 'fa-spin' : ''; 
    
    // 3. Fallback color handling mapping tailwind utility arrays
    let bdr = `border-${ui.col}-500/20`;
    let bg = `bg-${ui.col}-50`;
    let txt = `text-${ui.col}-600`;

    if(ui.col === 'slate') {
        txt = `text-slate-700`;
        bdr = `border-slate-500/20`; 
        bg = `bg-slate-50`;
    }

    return `<div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${bdr} ${bg} ${txt}">
        <i class="fa-solid ${ui.icon} text-[10px] ${spinClass} ${iconAnim}"></i>
        <span class="text-[9px] font-black tracking-widest uppercase">${ui.text}</span>
    </div>`;
}

window.activePollers = window.activePollers || {};

window.renderHistory = function() {
    const config = window.InfoniteConfigManager ? window.InfoniteConfigManager.getConfig() : null;
    if (!config) return;
    
    const sessions = window.InfoniteFlowsManager ? window.InfoniteFlowsManager.getSessions(config.appId, window.ES_PA_HISTORY_CONTEXT, config.widgetUrl) : [];
    const emptyState = document.getElementById('dashboardEmptyState');
    const tableState = document.getElementById('dashboardTableState');
    const tbody = document.getElementById('sessionHistory');
    
    if (!sessions || sessions.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        if (tableState) tableState.classList.add('hidden');
        if (tbody) tbody.innerHTML = '';
        const mBody = document.getElementById('sessionHistoryMobile');
        if (mBody) mBody.innerHTML = '';
        return;
    }
    
    if (emptyState) emptyState.classList.add('hidden');
    if (tableState) tableState.classList.remove('hidden');
    if (!tbody) return;
    
    let html = '';
    let mobileHtml = '';
    sessions.forEach(session => {
        const sid = session.session_id || 'Unknown';
        const cid = session.customer_id || '--';
        const status = session.infonite_state?.status_code || 'READY';
        const timeData = formatTimeRelative(session.date_created);
        const wUrl = session.widget_url || '';
        
        let displayStatus = session.infonite_state?.status_code || 'READY';
        
        const isClosed = session.infonite_state?.is_closed;
        const needsPolling = isClosed === false;
        const isErrorState = isClosed !== false && isClosed !== true;
        
        let rowBorder = 'border-l-[4px] border-l-transparent';
        if (isErrorState) {
            rowBorder = 'border-l-[4px] border-l-red-500';
        } else if (needsPolling) {
            rowBorder = 'active-session-row';
        }
        
        if (needsPolling && session.infonite_state?.ping_date) {
             let rawDate = session.infonite_state.ping_date;
             if (!rawDate.endsWith('Z') && !rawDate.includes('+')) rawDate += 'Z';
             
             const pingDate = new Date(rawDate);
             const diffSecs = (new Date() - pingDate) / 1000;
             if (diffSecs < 10) {
                 displayStatus = 'USER_ONLINE';
             } else {
                 displayStatus = 'USER_IDLE';
             }
        }
        
        let secBg = config.app_settings?.color_secondary?.main || '#3b82f6';
        let secText = config.app_settings?.color_secondary?.contrastText || '#ffffff';
        
        const badgeHtml = getStatusBadge(displayStatus);
            
        let timeUi = timeData.isRecent ? 
            `<span style="background-color: ${secBg}; color: ${secText};" class="px-1.5 py-0.5 rounded ml-1 tracking-widest leading-none">${timeData.relStr}</span>` : 
            (timeData.relStr ? `<span class="ml-1 opacity-70">(${timeData.relStr})</span>` : '');
            
        const copyActionUi = wUrl ? InfoniteLauncher.copyButton(wUrl, 'Copy URL', 'bg-white border border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-600 hover:bg-indigo-50 w-7 h-7 rounded-lg text-[10px] flex items-center justify-center transition-colors shadow-sm ml-1.5 shrink-0') : '';
        const launchActionUi = (needsPolling && wUrl) ? `
            <button class="bg-white border border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary-container)] w-7 h-7 rounded-lg text-[10px] flex items-center justify-center transition-colors shadow-sm ml-1.5 shrink-0" title="${InfoniteLauncher.opensInDialog(session.session_settings) ? 'Launch it here' : 'Launch it in a new tab: it redirects when it ends'}" onclick="launchSession('${sid}')">
               <i class="fa-solid fa-play"></i>
            </button>
        ` : '';
        const chipsHtml = setupChips(session.session_settings);
        const copySid = InfoniteLauncher.copyButton(sid, 'Copy Session ID', 'text-[10px] text-slate-400 hover:text-[var(--primary)] transition-colors opacity-0 group-hover:opacity-100');
        const copyCid = cid !== '--' ? InfoniteLauncher.copyButton(cid, 'Copy Customer ID', 'text-[10px] text-slate-400 hover:text-[var(--primary)] transition-colors opacity-0 group-hover:opacity-100') : '';

        let cancelActionUi = needsPolling ? `
            <button class="bg-white border border-red-200 text-red-500 hover:text-red-700 hover:border-red-600 hover:bg-red-50 w-7 h-7 rounded-lg text-[10px] flex items-center justify-center transition-colors shadow-sm ml-1.5 shrink-0" title="Cancel Session" onclick="cancelActiveSession('${sid}')">
               <i class="fa-solid fa-times"></i>
            </button>
        ` : '';

        let deleteActionUi = (!needsPolling && isClosed === true) ? `
            <button class="bg-white border border-red-200 text-red-500 hover:text-red-700 hover:border-red-600 hover:bg-red-50 w-7 h-7 rounded-lg text-[10px] flex items-center justify-center transition-colors shadow-sm ml-1.5 shrink-0" title="Delete Local Record" onclick="deleteLocalSession('${sid}')">
               <i class="fa-solid fa-trash-can"></i>
            </button>
        ` : '';

        let syncActionUi = isErrorState ? `
            <button class="bg-white border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-600 hover:bg-blue-50 w-7 h-7 rounded-lg text-[10px] flex items-center justify-center transition-colors shadow-sm ml-1.5 shrink-0" title="Sync Session" onclick="syncActiveSession('${sid}')">
               <i class="fa-solid fa-sync"></i>
            </button>
        ` : '';
        
        // Desktop HTML Row
        html += `
        <tr class="border-b border-black/5 hover:bg-black/[0.02] transition-colors group ${rowBorder}">
            <td class="p-4 pl-4 align-top">
               <div class="flex items-start gap-3">
                   <div class="w-8 h-8 rounded-lg bg-[var(--primary-container)] flex items-center justify-center shrink-0">
                       <i class="fa-solid fa-fingerprint text-[var(--primary)] text-[10px]"></i>
                   </div>
                   <div class="flex-1 min-w-0 pr-4">
                       <div class="flex items-center gap-1.5">
                           <h4 class="text-xs font-mono font-bold text-slate-900 truncate max-w-[150px] sm:max-w-[200px]" title="${escapeHtml(sid)}">${escapeHtml(sid)}</h4>
                           ${copySid}
                       </div>
                       <div class="flex items-center gap-1.5 mt-0.5">
                           <p class="text-[10px] text-slate-500 uppercase tracking-widest truncate max-w-[150px] sm:max-w-[200px]" title="${escapeHtml(cid)}">${escapeHtml(cid)}</p>
                           ${copyCid}
                       </div>
                       ${chipsHtml}
                   </div>
               </div>
            </td>
            <td class="p-4 align-top hidden md:table-cell">
               <h4 class="text-xs font-bold text-slate-700">${formatDate(session.date_created)}</h4>
               <p class="text-[9px] font-bold uppercase text-slate-500 mt-1 whitespace-nowrap flex items-center">${timeData.isRecent ? '' : timeData.timeStr} ${timeUi}</p>
            </td>
            <td class="p-4 align-top">
               ${badgeHtml}
            </td>
            <td class="p-4 pr-6 align-top whitespace-nowrap">
               <div class="flex items-center justify-end w-full">
                   ${syncActionUi}
                   ${cancelActionUi}
                   ${deleteActionUi}
                   ${copyActionUi}
                   ${launchActionUi}
                   <button class="bg-white border border-slate-200 text-slate-600 hover:text-[var(--primary)] hover:border-[var(--primary)] px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest flex items-center transition-colors shadow-sm ml-1.5 shrink-0" onclick="viewSession('${sid}')">
                       <i class="fa-regular fa-eye mr-1.5"></i> View
                   </button>
               </div>
            </td>
        </tr>
        `;
        
        // Mobile HTML Stacked Divider layout
        const dateStr = formatDate(session.date_created);
        const timeStrFormatted = timeData.isRecent ? timeData.relStr : `${dateStr} (${timeData.timeStr})`;
        
        mobileHtml += `
        <div class="p-4 flex flex-col gap-3">
            <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0 flex-1">
                    <div class="w-7 h-7 rounded-lg bg-[var(--primary-container)] flex items-center justify-center shrink-0">
                        <i class="fa-solid fa-fingerprint text-[var(--primary)] text-[10px]"></i>
                    </div>
                    <span class="text-xs font-mono font-bold text-slate-900 truncate" title="${escapeHtml(sid)}">${escapeHtml(sid)}</span>
                    ${InfoniteLauncher.copyButton(sid, 'Copy Session ID', 'text-[10px] text-slate-400 hover:text-[var(--primary)] transition-colors shrink-0')}
                </div>
                <div class="shrink-0">
                    <button class="bg-white border border-slate-200 text-slate-600 hover:text-[var(--primary)] hover:border-[var(--primary)] px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest flex items-center gap-1 transition-colors shadow-sm" onclick="viewSession('${sid}')">
                        <i class="fa-regular fa-eye text-[10px]"></i> View
                    </button>
                </div>
            </div>
            
            <div class="flex flex-col gap-1 pl-9">
                <div class="flex items-center gap-1.5">
                    <span class="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Customer:</span>
                    <span class="text-[10px] font-bold text-slate-600 truncate" title="${escapeHtml(cid)}">${escapeHtml(cid)}</span>
                    ${cid !== '--' ? InfoniteLauncher.copyButton(cid, 'Copy Customer ID', 'text-[9px] text-slate-400 hover:text-[var(--primary)] transition-colors shrink-0') : ''}
                </div>
                <div class="flex items-center gap-1.5 text-[9px] font-bold text-slate-400">
                    <i class="fa-regular fa-clock"></i>
                    <span>${timeStrFormatted}</span>
                </div>
                ${chipsHtml}
            </div>

            <div class="flex items-center justify-between gap-2 pt-2 border-t border-slate-100/60 mt-1">
                <!-- Left side utilities -->
                <div class="flex items-center gap-1.5">
                    ${syncActionUi}
                    ${cancelActionUi}
                    ${deleteActionUi}
                    ${copyActionUi}
                    ${launchActionUi}
                </div>
                <!-- Right side status badge -->
                <div class="shrink-0">
                    ${badgeHtml}
                </div>
            </div>
        </div>
        `;
        
        // Start polling if needed
        if (needsPolling && !window.activePollers[sid]) {
            window.activePollers[sid] = true;
            setTimeout(() => pollLoop(sid, config), 3000);
        }
    });
    tbody.innerHTML = html;
    
    const mContainer = document.getElementById('sessionHistoryMobile');
    if (mContainer) {
        mContainer.innerHTML = mobileHtml;
    }
};

window.syncActiveSession = async function(sid) {
    const config = window.InfoniteConfigManager ? window.InfoniteConfigManager.getConfig() : null;
    if (!config) return;
    try {
        if (window.InfoniteFlowsManager) {
            await window.InfoniteFlowsManager.pollSessionState(config.widgetUrl, config.secret, window.ES_PA_HISTORY_CONTEXT, sid, config.appId);
            renderHistory();
        }
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
                
                // Ensure poller stops
                if (window.activePollers[sid]) {
                    delete window.activePollers[sid];
                }
                
                if (window.InfoniteFlowsManager) {
                    let sessions = window.InfoniteFlowsManager.getSessions(config.appId, window.ES_PA_HISTORY_CONTEXT, config.widgetUrl) || [];
                    sessions = sessions.filter(s => s.session_id !== sid);
                    window.InfoniteFlowsManager.saveSessions(config.appId, window.ES_PA_HISTORY_CONTEXT, sessions, config.widgetUrl);
                    
                    renderHistory();
                }
            }
        );
};

async function pollLoop(sid, config) {
    if (!window.activePollers[sid]) return; // Stop if cancelled/cleared
    try {
        if (window.InfoniteFlowsManager) {
            const state = await window.InfoniteFlowsManager.pollSessionState(config.widgetUrl, config.secret, window.ES_PA_HISTORY_CONTEXT, sid, config.appId);
            
            // Re-render immediately to reflect realtime changes (like ping_date updating USER_ONLINE indicator)
            if (typeof renderHistory === 'function') {
                renderHistory();
            }

            if (state && state.is_closed === true) {
                // Done polling
                delete window.activePollers[sid];
                return;
            }
        }
    } catch(e) {
        // Stop polling on hard errors
        delete window.activePollers[sid];
        if (typeof renderHistory === 'function') renderHistory();
        return;
    }
    // Continue polling
    if (window.activePollers[sid]) {
        setTimeout(() => pollLoop(sid, config), 3000);
    }
}

window.cancelActiveSession = function(sid) {
        showConfirmModal(
            "Cancel Session",
            "Are you sure you want to cancel this session? The user will no longer be able to complete the verification process.",
            "Cancel Session",
            async () => {
                const config = window.InfoniteConfigManager ? window.InfoniteConfigManager.getConfig() : null;
                if (!config) return;
                delete window.activePollers[sid]; // stop local
                try {
                    if (window.InfoniteFlowsManager) {
                        await window.InfoniteFlowsManager.cancelSession(config.widgetUrl, config.secret, window.ES_PA_HISTORY_CONTEXT, sid);
                        // Re-poll immediately to update UI
                        await window.InfoniteFlowsManager.pollSessionState(config.widgetUrl, config.secret, window.ES_PA_HISTORY_CONTEXT, sid, config.appId);
                        renderHistory();
                    }
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
                // Ensure pollers stop
                window.activePollers = {};
                const config = window.InfoniteConfigManager ? window.InfoniteConfigManager.getConfig() : null;
                if (config && window.InfoniteFlowsManager) {
                    window.InfoniteFlowsManager.saveSessions(config.appId, window.ES_PA_HISTORY_CONTEXT, [], config.widgetUrl);
                    renderHistory();
                }
            }
        );
};

// --------------------------------------------------------------------------------
// UI Modals
// --------------------------------------------------------------------------------

/** While the dialog is open, its reach and its ending follow the application's details, refreshed every few seconds (js/config.js). */
let reachWatch = null;

window.openNewLeadModal = function() {
    const modal = document.getElementById('newLeadModal');
    if (!modal) return;
    // every lead is another customer: an id is generated when the field is empty
    const cidField = document.getElementById('generate-customer-id');
    if (cidField && !cidField.value) {
        cidField.value = `ES-PUBLIC-ADMINISTRATION-${Math.floor(10000000 + Math.random() * 90000000)}`;
    }
    const birth = document.getElementById('generate-fixed-birth-date');
    if (birth) birth.max = new Date().toISOString().slice(0, 10);
    // every new lead starts at the defaults, whatever was clicked for the last one
    resetLeadChoices();
    syncReach();
    InfoniteSessionEnding.sync();
    clearInterval(reachWatch);
    reachWatch = setInterval(() => { syncReach(); InfoniteSessionEnding.sync(); }, 2000);
    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

/**
 * The options and the administrations back to their defaults. Nothing chosen for one lead is kept
 * for the next, so a click nobody understood never costs the next demo its data.
 */
function resetLeadChoices() {
    Object.keys(moduleOptions).forEach(code => delete moduleOptions[code]);
    sourcesState.mode = 'default';
    sourcesState.order = SOURCES.map(source => source.code);
    sourcesState.on = new Set(['tgss', 'aeat', 'citizen_folder']);
    const radio = document.querySelector('input[name="espa-sources-mode"][value="default"]');
    if (radio) radio.checked = true;
    renderSources();
    renderModuleOptions();
    syncOptionsLine();
}

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

// Setup simple accordion toggling for Advanced Configuration
window.toggleAccordion = function(id) {
    // Fixed Parameters cannot be folded while the email it holds is required
    if (id === 'acc-fixed-parameters' && isEmailRequired()) return;
    // Modules is not an accordion on desktop: it has its own column
    if (id === 'acc-modules' && window.matchMedia('(min-width: 1024px)').matches) return;
    const content = document.getElementById(id);
    const icon = document.getElementById(id + '-icon');
    if (content && icon) {
        if (content.classList.contains('hidden')) {
            content.classList.remove('hidden');
            icon.classList.add('rotate-180');
        } else {
            content.classList.add('hidden');
            icon.classList.remove('rotate-180');
        }
    }
};

function validateSpanishDocument(doc) {
    doc = doc.trim().toUpperCase();
    if (!doc) return true;
    
    const dniRegex = /^[0-9]{8}[A-Z]$/;
    const nieRegex = /^[XYZ][0-9]{7}[A-Z]$/;
    
    if (!dniRegex.test(doc) && !nieRegex.test(doc)) {
        return false;
    }
    
    let value = doc;
    if (value.startsWith('X')) value = '0' + value.substring(1);
    else if (value.startsWith('Y')) value = '1' + value.substring(1);
    else if (value.startsWith('Z')) value = '2' + value.substring(1);
    
    const num = parseInt(value.substring(0, 8), 10);
    const letters = 'TRWAGMYFPDXBNJZSQVHLCKE';
    const calculatedLetter = letters.charAt(num % 23);
    
    return value.charAt(8) === calculatedLetter;
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
        configurations: configurationsOf(cb.value)
    }));
    if (features.length === 0) throw new Error("Select at least one module: a session must read something.");

    const settings = {
        sandbox: !!document.getElementById('generate-sandbox-mode')?.checked,
        hooks_extra_data: { session: "{session_id}", customer: "{customer_id}" },
        ...InfoniteSessionEnding.settings(),
        executions_features: features,
    };
    if (!settings.sandbox && !InfoniteCapabilities.productionAllowed('product:es_public_administration')) {
        throw new Error("This application runs Spain Public Administration in sandbox only: turn Sandbox on.");
    }
    // A product preset decides which administrations its sessions sign in to; otherwise the list chosen, when one was
    if (window.ES_PA_PRESET && Array.isArray(window.ES_PA_PRESET.sources)) {
        settings.allowed_sources = window.ES_PA_PRESET.sources;
    } else if (sourcesState.mode === 'custom') {
        const allowed = allowedSources();
        if (!allowed.length) throw new Error("Allow at least one administration, or leave the application's default.");
        const missing = uncoveredModules().map(code => window.INFONITE_FEATURES[code]?.name || code);
        if (missing.length) throw new Error(`No allowed administration returns ${missing.join(', ')}: allow one that does, or leave the module out.`);
        settings.allowed_sources = allowed;
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
    if (isEmailRequired() && !userEmail) {
        syncEmailRequirement();
        document.getElementById('generate-fixed-user-email')?.focus();
        throw new Error("Credit Registry (CIRBE) requires the customer's email: fill in User Email under Fixed Parameters.");
    }
    if (userDoc) {
        if (!validateSpanishDocument(userDoc)) throw new Error("The User Document is not a valid Spanish DNI or NIE.");
        payload.fixed_parameters = { ...(payload.fixed_parameters || {}), user_identification: userDoc };
    }
    if (userEmail) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) throw new Error("The User Email is not a valid email address.");
        payload.fixed_parameters = { ...(payload.fixed_parameters || {}), user_email: userEmail };
    }

    const birthDate = value('generate-fixed-birth-date');
    if (birthDate) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || birthDate >= new Date().toISOString().slice(0, 10)) throw new Error("The Date of Birth must be a date in the past.");
        payload.fixed_parameters = { ...(payload.fixed_parameters || {}), birth_date: birthDate };
    }

    const hours = Number(value('generate-date-limit'));
    if (hours) payload.date_limit = new Date(Date.now() + hours * 3600 * 1000).toISOString();

    return payload;
}

window.buildLeadPayload = buildLeadPayload;

/** The session the New Lead dialog has just created, for its Launch button. */
let lastCreated = null;

window.launchCreated = () => lastCreated && InfoniteLauncher.launch(lastCreated.widget_url, lastCreated.settings);

window.launchSession = function(sid) {
    const config = window.InfoniteConfigManager ? window.InfoniteConfigManager.getConfig() : null;
    const session = (window.InfoniteFlowsManager.getSessions(config?.appId, window.ES_PA_HISTORY_CONTEXT, config?.widgetUrl) || [])
        .find(s => s.session_id === sid);
    if (session) InfoniteLauncher.launch(session.widget_url, session.session_settings);
};

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
        const result = await InfoniteFlowsManager.initSession(config.widgetUrl, config.secret, config.appId, window.ES_PA_HISTORY_CONTEXT, payload);
        if (!result || !result.widget_url) throw new Error("Invalid response received from the server.");

        try {
            await InfoniteFlowsManager.pollSessionState(config.widgetUrl, config.secret, window.ES_PA_HISTORY_CONTEXT, result.session_id, config.appId);
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
// Active Session Redirect
// --------------------------------------------------------------------------------

window.viewSession = function(sid) {
    if (!sid) return;
    window.location.href = `es-public-administration-results.html?session_id=${sid}${window.esPaPresetQuery('&')}`;
};

// --------------------------------------------------------------------------------
// Import External Session Functionality
// --------------------------------------------------------------------------------

window.openImportModal = function() {
    const modal = document.getElementById('importSessionModal');
    if (modal) {
        document.getElementById('import-session-id').value = '';
        showImportFormView();
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
};

window.closeImportSessionModal = function() {
    const modal = document.getElementById('importSessionModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
};

function showImportFormView() {
    document.getElementById('import-form-view').classList.remove('hidden');
    document.getElementById('import-form-view').classList.add('flex');
    document.getElementById('import-loading-view').classList.add('hidden');
    document.getElementById('import-success-view').classList.add('hidden');
    document.getElementById('import-error-view').classList.add('hidden');
}

window.showImportFormView = showImportFormView; // Expose to global scope for retry button

window.submitImportSession = async function() {
    const config = window.InfoniteConfigManager ? window.InfoniteConfigManager.getConfig() : null;
    if (!config) {
        alert("Configuration is not loaded yet.");
        return;
    }

    const sessionId = document.getElementById('import-session-id').value.trim();

    if (!sessionId) {
        alert("Please enter a valid Session ID.");
        return;
    }

    // Switch to Loading View
    document.getElementById('import-form-view').classList.add('hidden');
    document.getElementById('import-loading-view').classList.remove('hidden');
    document.getElementById('import-loading-view').classList.add('flex');

    try {
        // Fetch session state (first fetch to check existence)
        const stateData = await window.InfoniteFlowsManager.pollSessionState(
            config.widgetUrl,
            config.secret,
            window.ES_PA_HISTORY_CONTEXT,
            sessionId
        );

        if (!stateData) {
            throw new Error("Invalid or empty response from server.");
        }

        // The session's settings come with it: they draw its chips and decide how it launches
        let settings = null;
        try {
            settings = await window.InfoniteFlowsManager.fetchSessionSettings(config.widgetUrl, config.secret, window.ES_PA_HISTORY_CONTEXT, sessionId);
        } catch (e) {
            console.warn("Could not retrieve the session settings:", e);
        }

        const sessions = window.InfoniteFlowsManager.getSessions(config.appId, window.ES_PA_HISTORY_CONTEXT, config.widgetUrl) || [];
        const record = {
            session_id: sessionId,
            app_id: config.appId,
            customer_id: stateData.customer_id || 'Imported',
            widget_url: '',  // unknown: the session was not created here
            infonite_state: stateData,
            date_created: stateData.date_created || new Date().toISOString(),
            ...(settings ? { session_settings: settings } : {}),
        };
        const existing = sessions.findIndex(s => s.session_id === sessionId);
        if (existing !== -1) sessions[existing] = record;
        else sessions.unshift(record);
        window.InfoniteFlowsManager.saveSessions(config.appId, window.ES_PA_HISTORY_CONTEXT, sessions, config.widgetUrl);

        // Switch to Success View
        document.getElementById('import-loading-view').classList.add('hidden');
        document.getElementById('import-success-view').classList.remove('hidden');
        document.getElementById('import-success-view').classList.add('flex');

        renderHistory();
    } catch (err) {
        console.error("Import failed:", err);
        let errorMsg = "Could not fetch the session state. Make sure the Session ID is correct and belongs to the active environment.";
        if (err.statusText) {
            errorMsg = `Server response: ${err.status} ${err.statusText}`;
        } else if (err.message) {
            errorMsg = err.message;
        }
        document.getElementById('import-error-msg').textContent = errorMsg;

        // Switch to Error View
        document.getElementById('import-loading-view').classList.add('hidden');
        document.getElementById('import-error-view').classList.remove('hidden');
        document.getElementById('import-error-view').classList.add('flex');
    }
};