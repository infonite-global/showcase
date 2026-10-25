const INFONITE_VERSION = "2026.10.2500";

const DEFAULT_CONFIG_ITEM = {
    id: "default",
    name: "No Application",
    secret: "",
    widgetUrl: "https://widgets.infonite.tech",
    primaryColor: "#00a76f",
    darkColor: "#1C252E",
    logo_square_light_base64: null,
    logo_rectangle_light_base64: null,
    logo_square_dark_base64: null,
    logo_rectangle_dark_base64: null,
    appId: "",
    appName: "",
    sessionPrefix: "",
    appDetails: null,
    app_settings: null,
    isSynced: false,
    hostType: "production",
    isMock: true
};

const STORAGE_KEY = "infonite_configs";

// The widgets service behind each named host. Production and develop are FIXED: a setup link
// or a saved environment that names one of them never carries its own URL (and one that does
// is ignored); only `custom` brings a URL, and without one it is incomplete.
const HOST_URLS = {
    production: "https://widgets.infonite.tech",
    develop: "https://widgets-dev.infonite.tech"
};

/** The host and URL an environment resolves to from what a link or a form gives; `null` when a custom host has no URL. */
function resolveHost(hostType, widgetUrl) {
    const ht = hostType === "develop" || hostType === "custom" ? hostType : "production";
    if (ht !== "custom") return { hostType: ht, widgetUrl: HOST_URLS[ht] };
    const url = (widgetUrl || "").trim();
    return url ? { hostType: ht, widgetUrl: url } : null;
}

function getStorageData() {
    const defaultData = {
        activeId: "default",
        list: [DEFAULT_CONFIG_ITEM]
    };
    
    try {
        const storedStr = localStorage.getItem(STORAGE_KEY);
        if (storedStr) {
            const parsed = JSON.parse(storedStr);
            if (!parsed.list || parsed.list.length === 0) return defaultData;
            // Upgrade legacy items if needed
            parsed.list = parsed.list.map(item => ({...DEFAULT_CONFIG_ITEM, ...item}));
            return parsed;
        }
    } catch(e) {
        console.error("Error reading config storage", e);
    }
    return defaultData;
}

function saveStorageData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    
    // Notify Vue shell of visual changes
    if (typeof window.setGlobalConfig === 'function') {
        const activeConfig = data.list.find(c => c.id === data.activeId) || data.list[0];
        window.setGlobalConfig(activeConfig);
    }
}

function getConfig() {
    const data = getStorageData();
    const active = data.list.find(c => c.id === data.activeId);
    return active || data.list[0] || DEFAULT_CONFIG_ITEM;
}

// What an environment is called: the app's name under its host pill once the app has answered,
// and "Unavailable App" only while it never has
function environmentName(config) {
    if (!config.appName) return "Unavailable App";
    let prefix = "[CSM]";
    if (config.hostType === "production") prefix = "[PRO]";
    if (config.hostType === "develop") prefix = "[DEV]";
    return `${prefix} ${config.appName}`;
}

async function syncActiveApp() {
    const config = InfoniteConfigManager.getConfig();
    if (!config || !config.widgetUrl || config.isMock) return;
    
    // Ensure appDetails object exists unconditionally
    if(!config.appDetails) config.appDetails = { status: 'unknown', isOnline: false, lastError: 'Not checked yet' };

    try {
        const response = await fetch(`${config.widgetUrl}/api/app`, {
            method: 'GET',
            headers: { 'X-APP-SECRET': config.secret }
        });
        
        const wasOnline = config.appDetails.isOnline === true;
        const lastOnlineAt = config.appDetails.lastOnlineAt || null;
        if (response.ok) {
            const data = await response.json();
            config.appDetails = { ...data, isOnline: true, status: data.status || 'unknown', lastError: null, lastOnlineAt: new Date().toISOString() };
            if(data.id && data.id !== config.appId) {
                config.appId = data.id;
            }
            config.appName = data.display_name || "";
            config.name = environmentName(config);
            // back after an outage: the look may have changed meanwhile
            if (!wasOnline && config.app_settings) {
                syncAppSettings(config, true).then((ok) => ok && syncAppLogos(InfoniteConfigManager.getConfig())).catch(() => {});
            }
        } else {
            // Track the explicit error if not OK (e.g 401 Unauthorized). The name is kept: an
            // app that answered once is still that app while it is away.
            config.appDetails.isOnline = false;
            config.appDetails.status = 'unreachable';
            config.appDetails.lastError = `HTTP ${response.status} - ${response.statusText || 'API Error'}`;
            config.appDetails.lastOnlineAt = lastOnlineAt;
            config.name = environmentName(config);
        }
    } catch (error) {
        // Network error, invalid URL, etc
        config.appDetails.isOnline = false;
        config.appDetails.status = 'unreachable';
        config.appDetails.lastError = `Network Error: ${error.message}`;
        config.appDetails.lastOnlineAt = config.appDetails.lastOnlineAt || null;
        config.name = environmentName(config);
    }
    
    // Persist and push to reactive state
    const data = getStorageData();
    const index = data.list.findIndex(c => c.id === config.id);
    if (index !== -1) {
        data.list[index] = config;
    } else {
        data.list.push(config);
    }
    saveStorageData(data);
    updateActiveConfigUI();
    renderConnectivity();
    if (window.InfoniteNavBanner && typeof window.InfoniteNavBanner.render === 'function') window.InfoniteNavBanner.render();
    
    if(typeof window.br_updateActiveConfigUI === 'function') window.br_updateActiveConfigUI();
    if (window.setGlobalConfig) window.setGlobalConfig(config);
}

// THE ENVIRONMENT'S REACH, said by the whole page (css/offline.css). The root carries it as
// `data-app-online`; while the app is unreachable a red band stands in the page's head slot
// (`#offline-slot`, one per page) saying which host is not answering, since when, and what
// that stops — and every control that needs the service is put out of reach.
function renderConnectivity() {
    // always the environment in use as persisted: a theme preview (`applyTheme` on a draft) or
    // a stale object captured before a poll must not flip what the page says about reach
    const config = InfoniteConfigManager.getConfig();
    const root = document.documentElement;
    const details = config && config.appDetails;
    let reach = 'unknown';
    if (!config || config.isMock) reach = 'mock';
    else if (details && details.isOnline === true) reach = 'online';
    else if (details && (details.status === 'unreachable' || details.isOnline === false)) reach = 'offline';
    root.dataset.appOnline = reach;

    const slot = document.getElementById('offline-slot');
    if (!slot) return;
    if (reach !== 'offline') { slot.innerHTML = ''; return; }

    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let host = config.widgetUrl || '';
    try { host = new URL(config.widgetUrl).host; } catch (e) { /* shown as given */ }
    const reason = details.lastError ? ` (${esc(details.lastError.replace(/^Network Error: /, ''))})` : '';
    let seen = 'Never seen online';
    if (details.lastOnlineAt) {
        const at = new Date(details.lastOnlineAt);
        const today = at.toDateString() === new Date().toDateString();
        seen = 'Last seen ' + (today ? at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : at.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }));
    }
    slot.innerHTML = `
        <div class="offline-bar" role="status" aria-live="polite">
            <span class="offline-bar-dot" aria-hidden="true"></span>
            <div class="offline-bar-text">
                <strong>Environment offline.</strong>
                <code>${esc(host)}</code> is not answering${reason}. Sessions cannot be created or refreshed until it is back; the look you see is the last one synced.
            </div>
            <span class="offline-bar-meta">${esc(seen)}</span>
            <button type="button" class="offline-bar-retry" onclick="this.disabled = true; InfoniteConfigManager.syncActiveApp().finally(() => { this.disabled = false; });"><i class="fa-solid fa-rotate-right"></i> Retry now</button>
        </div>`;
}
window.renderConnectivity = renderConnectivity;

async function syncAppSettings(customConfig = null, renderAfter = false) {
    const config = customConfig || InfoniteConfigManager.getConfig();
    if (!config || !config.widgetUrl || !config.secret || config.isMock) return false;
    
    try {
        const response = await fetch(`${config.widgetUrl}/api/flows/app-settings`, {
            method: 'GET',
            headers: { 'X-APP-SECRET': config.secret }
        });
        
        if (response.ok) {
            config.app_settings = await response.json();
            config.isSynced = true;
        } else {
            config.isSynced = false;
        }
    } catch (e) {
        config.isSynced = false;
        console.error("Error syncing app settings:", e);
    }
    
    // Reload data before saving in case async changes occurred
    const currentData = getStorageData();
    const index = currentData.list.findIndex(c => c.id === config.id);
    if (index !== -1) {
        currentData.list[index] = config;
        saveStorageData(currentData);
        if (renderAfter && currentData.activeId === config.id) {
            applyTheme(config);
        }
    }
    return config.isSynced;
}

async function syncAppLogos(config) {
    if (!config || !config.widgetUrl || config.isMock) return false;
    
    const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    const fetchLogo = async (variant, scheme, attempt = 1) => {
        try {
            const res = await fetch(`${config.widgetUrl}/api/flows/app-logo?variant=${variant}&color_scheme=${scheme}`, {
                headers: { 'X-APP-SECRET': config.secret }
            });
            
            if (res.status === 429 && attempt === 1) {
                console.warn(`Rate limit hit for logo ${variant} ${scheme}, retrying...`);
                await pause(1000);
                return await fetchLogo(variant, scheme, 2);
            }
            
            if (!res.ok) return null;
            const blob = await res.blob();
            if (blob.size === 0 || blob.type.includes('json')) return null;
            
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.error(`Error fetching logo ${variant} ${scheme}:`, e);
            return null;
        }
    };

    // Sequential fetching with 0.5s pause to respect rate limits
    const sqLight = await fetchLogo('square', 'light');
    await pause(500);
    const rectLight = await fetchLogo('rectangle', 'light');
    await pause(500);
    const sqDark = await fetchLogo('square', 'dark');
    await pause(500);
    const rectDark = await fetchLogo('rectangle', 'dark');

    // Update config properties with base64 URIs. A fetch that brings nothing keeps the logo
    // already held: a refresh during an outage must not blank the app's marks.
    if (sqLight) config.logo_square_light_base64 = sqLight;
    if (rectLight) config.logo_rectangle_light_base64 = rectLight;
    if (sqDark) config.logo_square_dark_base64 = sqDark;
    if (rectDark) config.logo_rectangle_dark_base64 = rectDark;
    
    // Persist to storage
    const currentData = getStorageData();
    const index = currentData.list.findIndex(c => c.id === config.id);
    if (index !== -1) {
        currentData.list[index] = config;
        saveStorageData(currentData);
        if (currentData.activeId === config.id) {
            applyTheme(config);
        }
    }
    
    return true;
}

// The environment's name in this browser's keys: its host, as the session histories spell it
// (`infonite_sessions_<host>_<appId>_<kind>`, js/flows-manager.js — keep both in step)
function environmentKey(config) {
    if (!config || !config.widgetUrl) return 'UNKNOWN_ENV';
    try { return new URL(config.widgetUrl).host.replace(/[^a-zA-Z0-9]/g, '_'); }
    catch (e) { return String(config.widgetUrl).replace(/[^a-zA-Z0-9]/g, '_'); }
}

// WHAT A FLOW KEEPS FOR AN ENVIRONMENT, beside its session history and under the same host and app:
// Financial Rider's entity selection, and how its last session ended. A key of its own rather than
// a field of the environment, so the syncs that rewrite the environment every few seconds can never
// race it away; it goes when the environment is deleted, and travels in its setup link (`fs`).
function flowSettingsKey(config, flow) {
    return config && config.appId ? `infonite_flow_settings_${environmentKey(config)}_${config.appId}_${flow}` : null;
}

function getFlowSettings(flow, config = getConfig()) {
    try {
        const key = flowSettingsKey(config, flow);
        const value = key ? JSON.parse(localStorage.getItem(key) || '{}') : {};
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (e) {
        return {};
    }
}

function saveFlowSettings(flow, settings, config = getConfig()) {
    const key = flowSettingsKey(config, flow);
    if (!key) return false;
    try {
        localStorage.setItem(key, JSON.stringify(settings || {}));
        return true;
    } catch (e) {
        return false;
    }
}

const ENGINE_CODE = /^[A-Z0-9_]{24}$/;
const ICONIFY_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * What a setup link may carry for the flows (`fs`), read as strictly as the platform reads it: only
 * Financial Rider's entity selection, and inside it only what a session request takes — the
 * layout, up to 20 engine codes first, up to 3 highlighted with a text of 2 to 24 characters.
 */
/** The flows whose last session's ending (js/session-ending.js) the setup link carries. */
const ENDING_FLOWS = ['financial-rider', 'es-public-administration'];

/**
 * A remembered ending, read as strictly as the form reads it: a known preset, a known tab, an http(s)
 * URL, short plain texts. The form checks the rest when it applies it (the URL against the
 * application's redirect URLs, the dial code against its list). Null when there is none to keep.
 */
function sanitizeEnding(ending) {
    if (!ending || typeof ending !== 'object' || !['nothing', 'redirect', 'whatsapp', 'infonite'].includes(ending.preset)) return null;
    const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
    const clean = { preset: ending.preset };
    if (['redirect', 'redirect_blank'].includes(ending.tab)) clean.tab = ending.tab;
    const url = text(ending.url, 2048);
    if (/^https?:\/\/[^\s]+$/i.test(url)) clean.url = url;
    const path = text(ending.path, 256);
    if (path && !/[\u0000-\u001f]/.test(path)) clean.path = path;
    if (typeof ending.dial === 'string' && /^\d{1,4}$/.test(ending.dial)) clean.dial = ending.dial;
    const number = text(ending.number, 20);
    if (/^[\d\s]{4,20}$/.test(number)) clean.number = number;
    const message = text(ending.text, 500);
    if (message) clean.text = message;
    return clean;
}

function sanitizeFlowSettings(raw) {
    const out = {};
    ENDING_FLOWS.forEach(flow => {
        const ending = sanitizeEnding(raw && raw[flow] && raw[flow].ending);
        if (ending) out[flow] = { ending };
    });
    const selection = raw && raw['financial-rider'] && raw['financial-rider'].selection;
    if (!selection || typeof selection !== 'object') return out;
    const clean = {};
    if (['list', '1-row-list', '2-row-list', '3-row-list'].includes(selection.engines_layout)) clean.engines_layout = selection.engines_layout;
    if (Array.isArray(selection.priority_engines)) {
        clean.priority_engines = [...new Set(selection.priority_engines.filter(code => ENGINE_CODE.test(code)))].slice(0, 20);
    }
    if (selection.featured_engines && typeof selection.featured_engines === 'object') {
        clean.featured_engines = Object.fromEntries(Object.entries(selection.featured_engines)
            .filter(([code, mark]) => ENGINE_CODE.test(code) && mark && typeof mark.text === 'string' && mark.text.trim().length >= 2)
            .slice(0, 3)
            .map(([code, mark]) => [code, {
                text: mark.text.trim().slice(0, 24),
                ...(typeof mark.icon === 'string' && ICONIFY_NAME.test(mark.icon) ? { icon: mark.icon } : {}),
                vertical_position: mark.vertical_position === 'bottom' ? 'bottom' : 'top',
                horizontal_position: ['left', 'right'].includes(mark.horizontal_position) ? mark.horizontal_position : 'center',
            }]));
    }
    out['financial-rider'] = { ...out['financial-rider'], selection: clean };
    return out;
}

// Start polling
setInterval(syncActiveApp, 5000);

// Also sync immediately on load
setTimeout(syncActiveApp, 1000);

window.InfoniteConfigManager = {
    DEFAULT_CONFIG_ITEM,
    HOST_URLS,
    resolveHost,
    getStorageData,
    saveStorageData,
    getConfig,
    syncActiveApp,
    syncAppSettings,
    syncAppLogos,
    getFlowSettings,
    saveFlowSettings,
    sanitizeFlowSettings,
    VERSION: INFONITE_VERSION
};

// --- SETTINGS UI LOGIC (Shared) ---
function updateActiveConfigUI() {
    const config = InfoniteConfigManager.getConfig();
    const label = document.getElementById("activeConfigName");
    if(label) {
        let cleanName = config.name || "Internal Dashboard";
        cleanName = cleanName.replace(/^\[(PRO|DEV|CSM)\]\s*/i, '');
        label.textContent = cleanName;
    }
}

function openSettings() {
    renderConfigList();
    showListView();
    const modal = document.getElementById("settingsModal");
    if(modal) {
        modal.classList.remove("hidden");
        modal.classList.add("flex");
    }
}

function closeSettings() {
    const modal = document.getElementById("settingsModal");
    if(modal) {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
    }
}

function getBasePath() {
    const currentPath = window.location.pathname;
    if (currentPath.endsWith('index.html') && !currentPath.includes('/flows/')) return '';
    if (currentPath.endsWith('/') && !currentPath.includes('/flows/')) return '';
    const parts = currentPath.split('/').filter(p => p.length > 0);
    let depth = 0;
    let flowIndex = parts.indexOf('flows');
    if (flowIndex !== -1) {
        depth = parts.length - flowIndex - 1;
    } else {
        depth = 1; 
    }
    return "../".repeat(Math.max(0, depth));
}

function showListView() {
    const listView = document.getElementById("settings-list-view");
    const editorView = document.getElementById("settings-editor-view");
    const headerList = document.getElementById("modal-header-actions-list");
    const headerEdit = document.getElementById("modal-header-actions-edit");
    
    if (listView) listView.classList.remove("hidden");
    if (editorView) editorView.classList.add("hidden");
    if (headerList) headerList.classList.remove("hidden");
    if (headerEdit) headerEdit.classList.add("hidden");
    
    clearEditorError();
}

function showEditorView() {
    const listView = document.getElementById("settings-list-view");
    const editorView = document.getElementById("settings-editor-view");
    const headerList = document.getElementById("modal-header-actions-list");
    const headerEdit = document.getElementById("modal-header-actions-edit");
    
    if (listView) listView.classList.add("hidden");
    if (editorView) editorView.classList.remove("hidden");
    if (headerList) headerList.classList.add("hidden");
    if (headerEdit) headerEdit.classList.remove("hidden");
    
    clearEditorError();
}

function clearEditorError() {
    const resultBox = document.getElementById("test-connection-result");
    if(!resultBox) return;
    resultBox.classList.add("hidden");
    resultBox.textContent = "";
    resultBox.className = "hidden text-[10px] mb-2 text-center font-medium p-2 rounded-lg";
}

function renderConfigList() {
    const data = InfoniteConfigManager.getStorageData();
    const container = document.getElementById("configListContainer");
    if(!container) return;
    
    const basePath = typeof getBasePath === 'function' ? getBasePath() : '';
    
    container.innerHTML = data.list.map(cfg => {
        const isActive = cfg.id === data.activeId;
        // each entry shows its dark-scheme square logo on the house dark, the app's or the house one
        const logoData = cfg.logo_square_dark_base64 || `${basePath}assets/logo/logo-dark.svg`;
        const bColor = DEFAULT_CONFIG_ITEM.darkColor;
        const logoElement = `<img src="${logoData}" class="w-full h-full object-contain" />`;
        
        let hostPill = '';
        let cleanAppName = cfg.name ? cfg.name : 'Unnamed';
        
        if (!cfg.isMock) {
            let type = 'CSM';
            let pillColor = 'border-slate-500 text-slate-500 bg-slate-500/10';
            
            if(cfg.hostType === 'production') {
                type = 'PRO';
                pillColor = 'border-emerald-500 text-emerald-500 bg-emerald-500/10';
            } else if(cfg.hostType === 'develop') {
                type = 'DEV';
                pillColor = 'border-blue-500 text-blue-500 bg-blue-500/10';
            }
            
            hostPill = `<span class="px-1.5 py-0.5 rounded text-[8px] border ${pillColor} mr-1">${type}</span>`;
            
            // Remove legacy bracket prefixes if they exist in the saved name
            cleanAppName = cleanAppName.replace(/^\[(PRO|DEV|CSM)\]\s*/i, '');
        }
        
        return `
        <div class="border ${isActive ? 'border-[var(--primary)] bg-[rgba(var(--primary-rgb),0.05)]' : 'border-black/5 bg-white'} rounded-xl p-3 flex items-center gap-3 transition-all hover:border-[rgba(var(--primary-rgb),0.30)]">
            <div class="relative cursor-pointer" onclick="setActiveConfig('${cfg.id}')">
                <div class="w-4 h-4 rounded-full border ${isActive ? 'border-[var(--primary)]' : 'border-slate-300'} flex items-center justify-center">
                    ${isActive ? '<div class="w-2 h-2 rounded-full bg-[var(--primary)]"></div>' : ''}
                </div>
            </div>
            <div class="flex items-center gap-3 min-w-0 pr-4 w-full md:w-auto">
                <div class="w-8 h-8 rounded-lg overflow-hidden shrink-0 flex items-center justify-center p-1 border border-black/5 aspect-square" style="background-color: ${bColor};">
                    ${logoElement}
                </div>
            </div>
            
            <div class="flex-1 cursor-pointer" onclick="setActiveConfig('${cfg.id}')">
                <h4 class="font-bold flex items-center text-slate-900 text-xs ${isActive ? 'text-[var(--primary)]' : ''}">${hostPill}${cleanAppName}</h4>
                <p class="text-[9px] text-slate-400 truncate max-w-[150px]">${cfg.widgetUrl}</p>
            </div>
            
            <div class="flex items-center gap-1">
                ${!cfg.isMock ? `
                <button onclick="openEditor('${cfg.id}')" class="w-7 h-7 rounded-lg hover:bg-black/5 flex items-center justify-center text-slate-400 hover:text-slate-900 transition-colors" title="Edit">
                    <i class="fa-solid fa-pen text-[10px]"></i>
                </button>
                <button onclick="deleteConfig('${cfg.id}')" class="w-7 h-7 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors" title="Delete">
                    <i class="fa-solid fa-trash-can text-[10px]"></i>
                </button>` : ''}
            </div>
        </div>
        `;
    }).join("");
}

function applyTheme(config) {
    if(!config) return;
    const DEFAULT_CONFIG_ITEM = InfoniteConfigManager.DEFAULT_CONFIG_ITEM;
    // the settings synced last, kept while the service is away
    const isSynced = !!config.app_settings;

    const primary = (isSynced && config.app_settings.color_primary) ? config.app_settings.color_primary.main : (config.primaryColor || DEFAULT_CONFIG_ITEM.primaryColor);
    const dark = (isSynced && config.app_settings.color_secondary) ? config.app_settings.color_secondary.main : (config.darkColor || DEFAULT_CONFIG_ITEM.darkColor);
    
    // Extracted contrast text from synced structure or implicitly calculated
    const primaryContrastText = (isSynced && config.app_settings.color_primary) ? config.app_settings.color_primary.contrastText : null;
    const darkContrastText = (isSynced && config.app_settings.color_secondary) ? config.app_settings.color_secondary.contrastText : null;

    const hexToArr = hex => [
        parseInt(hex.slice(1,3),16) || 0,
        parseInt(hex.slice(3,5),16) || 0,
        parseInt(hex.slice(5,7),16) || 0
    ];
    const arrToRgbStr = ([r,g,b]) => `${r}, ${g}, ${b}`;

    const luminance = ([r,g,b]) => {
        const c = [r,g,b].map(v => {
            v /= 255;
            return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2];
    };
    const contrastColor = hex => {
        try {
            return luminance(hexToArr(hex)) > 0.35 ? '#1C252E' : '#ffffff';
        } catch(e) { return '#ffffff'; }
    };

    try {
        const primaryArr = hexToArr(primary);
        const darkArr = hexToArr(dark);
        const root = document.documentElement;
        
        root.style.setProperty('--primary', primary);
        root.style.setProperty('--primary-rgb', arrToRgbStr(primaryArr));
        root.style.setProperty('--primary-contrast', primaryContrastText || contrastColor(primary));
        root.style.setProperty('--primary-container', primary + '20');
        root.style.setProperty('--on-primary-container', primary);
        root.style.setProperty('--brand-green', primary);
        root.style.setProperty('--brand-dark', dark);
        root.style.setProperty('--brand-dark-rgb', arrToRgbStr(darkArr));
        root.style.setProperty('--brand-dark-contrast', darkContrastText || contrastColor(dark));
        // the "banner" the flow screens still name is the app's accent: the secondary and its ink
        root.style.setProperty('--banner-color', dark);
        root.style.setProperty('--banner-rgb', arrToRgbStr(darkArr));
        root.style.setProperty('--banner-contrast', darkContrastText || contrastColor(dark));
        root.style.setProperty('--brand-green-glow', `rgba(${arrToRgbStr(primaryArr)}, 0.1)`);

        // The ground under the page and the scene the hero wears, as the widget would paint
        // them for this app (js/theme.js)
        if (window.InfoniteTheme) {
            const theme = window.InfoniteTheme.resolve(config);
            root.style.setProperty('--page-ground', theme.page.ground);
            root.style.setProperty('--glass-ground', window.InfoniteTheme.hexToChannel(theme.page.ground));
            root.style.setProperty('--hero-ground', theme.hero.ground);
            root.style.setProperty('--hero-c1', theme.hero.c1);
            root.style.setProperty('--hero-c2', theme.hero.c2);
            root.style.setProperty('--hero-ink', theme.hero.ink);
            root.style.setProperty('--hero-ink-foot', theme.hero.inkFoot);
            document.body.style.backgroundColor = theme.page.ground;
            renderHero(config, theme);
        }
        renderConnectivity();

        // Force a re-render of the nav banner if it exists so it picks up the root variables
        if(window.InfoniteNavBanner && typeof window.InfoniteNavBanner.render === 'function') {
            window.InfoniteNavBanner.render();
        }

    } catch(e) { console.error("Theme apply error:", e); }
}

// The hero's own pieces: the app's logo in the scene's scheme, what the app is called, and the
// chips — version, website and contact. Only the home page has a hero; elsewhere this is a no-op.
function renderHero(config, theme) {
    const scene = document.getElementById('hero-scene');
    if (!scene) return;
    const hero = theme.hero;
    scene.dataset.style = hero.style;
    scene.dataset.source = hero.source;
    scene.dataset.mode = hero.mode;

    const heroLogo = document.getElementById('hero-logo');
    const fallback = document.getElementById('hero-text-fallback');
    if (heroLogo) {
        heroLogo.onerror = function () {
            this.style.display = 'none';
            if (fallback) fallback.classList.remove('hidden');
        };
        // the logo is asked for in the scene's scheme, in the variant the app shows itself in
        // (the other variant stands in when that one is missing); the house wordmark otherwise
        const basePath = typeof getBasePath === 'function' ? getBasePath() : '';
        const other = theme.logoVariant === 'square' ? 'rectangle' : 'square';
        const own = config[`logo_${theme.logoVariant}_${hero.logoScheme}_base64`];
        const stand = config[`logo_${other}_${hero.logoScheme}_base64`];
        const houseSrc = `${basePath}assets/logo/text-logo-${hero.logoScheme}.svg`;
        const newSrc = own || stand || houseSrc;
        heroLogo.dataset.variant = own ? theme.logoVariant : stand ? other : 'rectangle';
        heroLogo.alt = theme.app && theme.app.app && theme.app.app.display_name ? theme.app.app.display_name : 'INFONITE';
        if (heroLogo.getAttribute('src') !== newSrc) heroLogo.src = newSrc;
        heroLogo.style.display = 'block';
        if (fallback) fallback.classList.add('hidden');
    }

    const app = theme.app && theme.app.app ? theme.app.app : null;
    const tagline = document.getElementById('hero-tagline');
    if (tagline) {
        tagline.textContent = app
            ? `Interactive demo environment of ${app.display_name || app.company_name || 'this application'}`
            : 'Data Extraction & Process Automation Solutions';
    }

    const chips = document.getElementById('hero-chips');
    if (chips) {
        const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const items = [`<span class="hero-chip hero-chip-version" id="hero-version">${esc(InfoniteConfigManager.VERSION)}</span>`];
        if (app) {
            if (app.company_name && app.company_name !== app.display_name) {
                items.push(`<span class="hero-chip"><i class="fa-solid fa-building"></i>${esc(app.company_name)}</span>`);
            }
            if (app.website) {
                let host = app.website;
                try { host = new URL(app.website).hostname; } catch (e) { /* shown as given */ }
                items.push(`<a class="hero-chip" href="${esc(app.website)}" target="_blank" rel="noopener"><i class="fa-solid fa-globe"></i>${esc(host)}</a>`);
            }
            if (app.contact_email) {
                items.push(`<a class="hero-chip" href="mailto:${esc(app.contact_email)}"><i class="fa-solid fa-envelope"></i>${esc(app.contact_email)}</a>`);
            }
        }
        chips.innerHTML = items.join('');
    }
}

// The special screen may apply on phones only, or on desktops only: crossing the widget's
// breakpoint re-reads the theme
if (window.InfoniteTheme && typeof window.matchMedia === 'function') {
    window.matchMedia(window.InfoniteTheme.MOBILE_QUERY).addEventListener('change', () => applyTheme(InfoniteConfigManager.getConfig()));
}

function setActiveConfig(id) {
    const data = InfoniteConfigManager.getStorageData();
    const config = data.list.find(c => c.id === id);
    if (config) {
        data.activeId = id;
        InfoniteConfigManager.saveStorageData(data);
        
        applyTheme(config);
        renderConfigList();
        updateActiveConfigUI();
        if(typeof window.br_updateActiveConfigUI === 'function') window.br_updateActiveConfigUI();
        
        // Background sync on change
        if(window.InfoniteConfigManager.syncAppSettings) {
            window.InfoniteConfigManager.syncAppSettings(config, true).then(() => {
                if(document.getElementById("settings-editor-view") && !document.getElementById("settings-editor-view").classList.contains('hidden') && id === document.getElementById("edit-config-id").value) {
                    openEditor(id); // Reload UI implicitly
                }
            });
        }
        
        // Force full page reload to reset flows and dashboard sessions
        setTimeout(() => {
            window.location.reload();
        }, 150);
    }
}

function openEditor(id = null) {
    const data = InfoniteConfigManager.getStorageData();
    const DEFAULT_CONFIG_ITEM = InfoniteConfigManager.DEFAULT_CONFIG_ITEM;
    const isNew = !id;
    const config = isNew ? { ...DEFAULT_CONFIG_ITEM, name: "New Environment", id: crypto.randomUUID(), secret: "", widgetUrl: "https://widgets.infonite.tech", hostType: "production", isMock: false } : data.list.find(c => c.id === id);
    
    if (!config) return; 

    window.tempSyncedConfig = null;
    
    const saveBtn = document.getElementById("saveConfigBtn");
    const exportBtn = document.getElementById("exportConfigBtn");
    
    if (saveBtn) {
        if (isNew) {
            saveBtn.disabled = true;
            saveBtn.classList.add("opacity-50", "cursor-not-allowed");
        } else {
            saveBtn.disabled = false;
            saveBtn.classList.remove("opacity-50", "cursor-not-allowed");
        }
    }
    
    if (exportBtn) {
        if(isNew || config.isMock) {
            exportBtn.classList.add("hidden");
            exportBtn.classList.remove("flex");
        } else {
            exportBtn.classList.remove("hidden");
            exportBtn.classList.add("flex");
        }
    }
    
    const syncBtn = document.getElementById("btn-sync-server");
    if (syncBtn) {
        syncBtn.disabled = config.isMock;
        if (config.isMock) {
            syncBtn.classList.add("opacity-50", "cursor-not-allowed");
        } else {
            syncBtn.classList.remove("opacity-50", "cursor-not-allowed");
        }
    }

    document.getElementById("editor-title").innerText = isNew ? "New Environment" : config.name;
    document.getElementById("edit-config-id").value = isNew ? "NEW_" + crypto.randomUUID() : config.id;
    
    
    const nameInput = document.getElementById("config-name");
    if (nameInput) nameInput.value = config.name;
    
    const clientInput = document.getElementById("config-client-url");
    if (clientInput) clientInput.remove(); // Safely remove if it exists
    
    document.getElementById("config-secret").value = config.secret;
    document.getElementById("config-widget-url").value = config.widgetUrl;
    
    // Extrapolate hostType for legacy configs if missing
    let loadedHostType = config.hostType;
    if(!loadedHostType) {
        if(config.widgetUrl === "https://widgets.infonite.tech") loadedHostType = "production";
        else if(config.widgetUrl === "https://widgets-dev.infonite.tech") loadedHostType = "develop";
        else loadedHostType = "custom";
    }
    
    // UI Logic for Host Selection
    const targetHostInput = document.getElementById('target-host-type');
    const customUrlContainer = document.getElementById('custom-url-container');
    const hostPillContainer = document.getElementById('host-pill-container');
    const hostCustomInput = document.getElementById('config-widget-url');
    
    if(targetHostInput) {
        targetHostInput.value = loadedHostType;
        document.querySelectorAll('.host-pill').forEach(pill => {
            if(pill.dataset.type === loadedHostType) {
                pill.classList.add('border-[var(--primary)]', 'bg-[rgba(var(--primary-rgb),0.05)]', 'text-[var(--primary)]');
                pill.classList.remove('border-black/5', 'bg-black/5', 'text-slate-400', 'hover:bg-black/10');
            } else {
                pill.classList.remove('border-[var(--primary)]', 'bg-[rgba(var(--primary-rgb),0.05)]', 'text-[var(--primary)]');
                pill.classList.add('border-black/5', 'bg-black/5', 'text-slate-400', 'hover:bg-black/10');
            }
        });
        
        if(!isNew) {
            hostPillContainer.classList.add('opacity-50', 'pointer-events-none');
        } else {
            hostPillContainer.classList.remove('opacity-50', 'pointer-events-none');
        }
        
        if(loadedHostType === 'custom') {
            customUrlContainer.classList.remove('hidden');
        } else {
            customUrlContainer.classList.add('hidden');
        }
    }
    
    
    showEditorView();
}

function selectHostType(type) {
    const targetHostInput = document.getElementById('target-host-type');
    const customUrlContainer = document.getElementById('custom-url-container');
    const hostCustomInput = document.getElementById('config-widget-url');
    
    // Only allow changing if not locked
    const hostPillContainer = document.getElementById('host-pill-container');
    if(hostPillContainer && hostPillContainer.classList.contains('pointer-events-none')) return;

    if(targetHostInput) {
        targetHostInput.value = type;
        
        document.querySelectorAll('.host-pill').forEach(pill => {
            if(pill.dataset.type === type) {
                pill.classList.add('border-[var(--primary)]', 'bg-[rgba(var(--primary-rgb),0.05)]', 'text-[var(--primary)]');
                pill.classList.remove('border-black/5', 'bg-black/5', 'text-slate-400', 'hover:bg-black/10');
            } else {
                pill.classList.remove('border-[var(--primary)]', 'bg-[rgba(var(--primary-rgb),0.05)]', 'text-[var(--primary)]');
                pill.classList.add('border-black/5', 'bg-black/5', 'text-slate-400', 'hover:bg-black/10');
            }
        });
        
        if(type === 'custom') {
            customUrlContainer.classList.remove('hidden');
            if(hostCustomInput.value === 'https://widgets.infonite.tech' || hostCustomInput.value === 'https://widgets-dev.infonite.tech') {
                hostCustomInput.value = ''; // clear fixed urls if switching to custom to avoid confusion
            }
        } else {
            customUrlContainer.classList.add('hidden');
        }
    }
}

async function saveCurrentConfig() {
    const idInput = document.getElementById("edit-config-id").value;
    const isNew = idInput.startsWith("NEW_");
    const realId = isNew ? crypto.randomUUID() : idInput;
    
    const saveBtn = document.getElementById("saveConfigBtn");
    if (saveBtn && saveBtn.disabled) {
        alert("Please Sync from Server successfully to save this configuration.");
        return;
    }
    
    const DEFAULT_CONFIG_ITEM = InfoniteConfigManager.DEFAULT_CONFIG_ITEM;
    const data = InfoniteConfigManager.getStorageData();
    
    const configFromList = data.list.find(c => c.id === idInput);
    const syncedSettings = (window.tempSyncedConfig && window.tempSyncedConfig.app_settings) || (configFromList && configFromList.app_settings) || null;
    
    const newConfig = {
        id: realId,
        name: isNew ? "New Environment" : (configFromList?.name || "Unnamed"),
        secret: document.getElementById("config-secret").value.trim(),
        // the colours are the app's, as synced; the house pair until it has answered
        primaryColor: syncedSettings?.color_primary?.main || DEFAULT_CONFIG_ITEM.primaryColor,
        darkColor: syncedSettings?.color_secondary?.main || DEFAULT_CONFIG_ITEM.darkColor,
        hostType: document.getElementById("target-host-type") ? document.getElementById("target-host-type").value : "custom",
        logo_square_light_base64: window.tempSyncedConfig && window.tempSyncedConfig.logo_square_light_base64 ? window.tempSyncedConfig.logo_square_light_base64 : (configFromList ? configFromList.logo_square_light_base64 : null),
        logo_rectangle_light_base64: window.tempSyncedConfig && window.tempSyncedConfig.logo_rectangle_light_base64 ? window.tempSyncedConfig.logo_rectangle_light_base64 : (configFromList ? configFromList.logo_rectangle_light_base64 : null),
        logo_square_dark_base64: window.tempSyncedConfig && window.tempSyncedConfig.logo_square_dark_base64 ? window.tempSyncedConfig.logo_square_dark_base64 : (configFromList ? configFromList.logo_square_dark_base64 : null),
        logo_rectangle_dark_base64: window.tempSyncedConfig && window.tempSyncedConfig.logo_rectangle_dark_base64 ? window.tempSyncedConfig.logo_rectangle_dark_base64 : (configFromList ? configFromList.logo_rectangle_dark_base64 : null),
        isSynced: window.tempSyncedConfig ? window.tempSyncedConfig.isSynced : (configFromList ? configFromList.isSynced : false),
        appDetails: window.tempSyncedConfig ? window.tempSyncedConfig.appDetails : (configFromList ? configFromList.appDetails : null),
        app_settings: window.tempSyncedConfig ? window.tempSyncedConfig.app_settings : (configFromList ? configFromList.app_settings : null),
        appId: "",
        appName: "",
        sessionPrefix: "",
        isMock: false,
    };
    
    // Resolve URL from HostType UI
    if(newConfig.hostType === "production") {
        newConfig.widgetUrl = "https://widgets.infonite.tech";
        document.getElementById("config-widget-url").value = newConfig.widgetUrl;
    } else if(newConfig.hostType === "develop") {
        newConfig.widgetUrl = "https://widgets-dev.infonite.tech";
        document.getElementById("config-widget-url").value = newConfig.widgetUrl;
    } else {
        newConfig.widgetUrl = document.getElementById("config-widget-url").value.trim();
        if(newConfig.widgetUrl === "https://widgets.infonite.tech" || newConfig.widgetUrl === "https://widgets-dev.infonite.tech") {
            // Self correcting mapping
            newConfig.hostType = newConfig.widgetUrl.includes("dev") ? "develop" : "production";
            document.getElementById("target-host-type").value = newConfig.hostType;
        }
    }

    if (saveBtn) {
        saveBtn.innerHTML = '<i class="fa-solid fa-circle-notch animate-spin"></i>';
        saveBtn.disabled = true;
    }

    if (newConfig.secret && newConfig.widgetUrl) {
        try {
            const response = await fetch(`${newConfig.widgetUrl}/api/app`, {
                method: "GET",
                headers: { "Content-Type": "application/json", "X-APP-SECRET": newConfig.secret },
            });

            if (response.ok) {
                const apiData = await response.json();
                newConfig.appId = apiData.id || "";
                newConfig.appName = apiData.display_name || "";
                
                let prefix = "[CSM]";
                if(newConfig.hostType === "production") prefix = "[PRO]";
                if(newConfig.hostType === "develop") prefix = "[DEV]";
                
                if (newConfig.appName) {
                    newConfig.name = `${prefix} ${newConfig.appName}`;
                } else {
                    newConfig.name = "Unknown App";
                }
                
                if (newConfig.appId) {
                    const domain = new URL(newConfig.widgetUrl).hostname;
                    newConfig.sessionPrefix = btoa(newConfig.appId + "@" + domain).replace(/=/g, '');
                }
            } else {
                newConfig.name = "Unavailable App";
                alert("⚠️ Validation skipped: Unauthorized or incorrect configuration (Check your URL and API Secret). The config will be saved but API calls may fail.");
            }
        } catch (e) {
            newConfig.name = "Unavailable App";
            console.error("Config API Validation err:", e);
        }
    } else {
        newConfig.name = "Unavailable App";
    }
    
    if (isNew) {
        data.list.push(newConfig);
        data.activeId = newConfig.id; 
    } else {
        const idx = data.list.findIndex(c => c.id === realId);
        if (idx !== -1) {
            if (!newConfig.appId && data.list[idx].appId) {
                newConfig.appId = data.list[idx].appId;
                newConfig.appName = data.list[idx].appName;
                newConfig.sessionPrefix = data.list[idx].sessionPrefix;
            }
            data.list[idx] = newConfig;
        }
    }
    
    InfoniteConfigManager.saveStorageData(data);
    
    const currentData = InfoniteConfigManager.getStorageData();
    if (currentData.activeId === realId || (isNew && currentData.activeId === newConfig.id)) {
        applyTheme(newConfig);
        updateActiveConfigUI();
        if(typeof window.br_updateActiveConfigUI === 'function') window.br_updateActiveConfigUI();
    }
    
    if (saveBtn) {
        saveBtn.innerText = "SAVED!";
        setTimeout(() => {
            saveBtn.innerText = "Save Environment";
            saveBtn.disabled = false;
            showListView();
            renderConfigList();
        }, 500);
    } else {
        showListView();
        renderConfigList();
    }
}

// EVERYTHING AN ENVIRONMENT LEFT IN THIS BROWSER, found by its keys: the session histories
// every flow kept for it (`infonite_sessions_<host>_<appId>_<kind>`, js/flows-manager.js) and,
// when it is the environment in use, the tokens of the sessions in flight. Deleting the
// environment is a person's decision to leave nothing behind, so the purge is run — and
// reported — rather than trusted to the flows' own "clear" buttons.
function environmentStorageKeys(config) {
    const keys = [];
    if (!config || !config.appId) return keys;
    // the same keys the flows write, spelled here too because the home page (where an
    // environment is deleted) does not load js/flows-manager.js — keep both in step. What the
    // flows keep for it beside the histories (`infonite_flow_settings_…`) goes with it.
    const envKey = environmentKey(config);
    const prefixes = [`infonite_sessions_${envKey}_${config.appId}_`, `infonite_flow_settings_${envKey}_${config.appId}_`];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && prefixes.some(prefix => key.startsWith(prefix))) keys.push(key);
    }
    return keys;
}

function countStoredSessions(keys) {
    return keys.reduce((total, key) => {
        try { const list = JSON.parse(localStorage.getItem(key) || '[]'); return total + (Array.isArray(list) ? list.length : 0); }
        catch (e) { return total; }
    }, 0);
}

function purgeEnvironmentData(config, wasActive) {
    const keys = environmentStorageKeys(config);
    keys.forEach((key) => localStorage.removeItem(key));
    if (wasActive) {
        // the live-session tokens belong to the environment in use
        ['active_session_es-public-administration', 'active_session_financial-rider', 'active_session_bank_reader'].forEach((key) => localStorage.removeItem(key));
    }
    return keys.length;
}

function deleteConfig(id) {
    const data = InfoniteConfigManager.getStorageData();
    const configToDelete = data.list.find(c => c.id === id);
    
    if (configToDelete && configToDelete.isMock) {
        alert("Cannot delete the No Application placeholder.");
        return;
    }

    const sessionKeys = environmentStorageKeys(configToDelete);
    const sessions = countStoredSessions(sessionKeys);
    const wipe = sessions > 0
        ? `Its ${sessions} stored session${sessions === 1 ? '' : 's'} and every result kept for them will be wiped from this browser as well.`
        : 'Everything it left in this browser (credentials, synced settings, logos, session history) is wiped with it.';

    showConfirmModal(
        "Delete Environment",
        `This removes the environment and its secret from this browser. ${wipe} Nothing can be recovered afterwards.`,
        "Delete everything",
        () => {
            const wasActive = data.activeId === id;
            purgeEnvironmentData(configToDelete, wasActive);
            data.list = data.list.filter(c => c.id !== id);
            
            if (data.list.length === 0) {
                // If we deleted the last real app, inject the Mock App
                data.list.push({ ...InfoniteConfigManager.DEFAULT_CONFIG_ITEM });
            }
            
            if (data.activeId === id || !data.list.find(c => c.id === data.activeId)) {
                data.activeId = data.list[0].id;
            }
            
            InfoniteConfigManager.saveStorageData(data);
            renderConfigList();
            applyTheme(InfoniteConfigManager.getConfig());
        }
    );
}

// The halo around a widget frame is the widget's own ground, so the frame has no edge: white,
// or the app's contrast ground — its contrast colour toned, or the house grey — when the synced
// application settings say the application runs in contrast mode. Only that: the theme mode is
// left alone on purpose.
function glassHaloInk(shell) {
    if (!shell) return;
    const settings = (typeof InfoniteConfigManager !== 'undefined' && InfoniteConfigManager.getConfig()?.app_settings) || null;
    const ground = settings?.contrast_mode && window.InfoniteTheme
        ? window.InfoniteTheme.contrastGround(settings.contrast_color, 'light')
        : '#FFFFFF';
    shell.style.setProperty('--halo-ink', window.InfoniteTheme ? window.InfoniteTheme.hexToChannel(ground) : '255 255 255');
}
window.glassHaloInk = glassHaloInk;

function showConfirmModal(title, message, confirmText, onConfirm, cancelText = "Cancel") {
    // A decision of no return floats mid-screen on the glass: the title and its X, one card with
    // the consequence, and the pills — the way out dark, the irreversible act in red.
    const modalId = 'infonite-confirm-modal';
    let modal = document.getElementById(modalId);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = `fixed inset-0 glass-layout z-[2000] flex flex-col overflow-y-auto custom-scrollbar`;
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="glass-column w-full max-w-2xl mx-auto my-auto px-4 sm:px-6 md:px-8 py-10 flex flex-col gap-5">
            <div class="flex items-start justify-between gap-6">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-11 h-11 rounded-full bg-red-50 border border-red-100 text-red-500 flex items-center justify-center shrink-0">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                    </div>
                    <h3 class="glass-title">${title}</h3>
                </div>
                <button class="glass-close" id="${modalId}-close" title="Close"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="bg-white border border-black/5 rounded-3xl p-6 shadow-sm">
                <p class="text-sm text-slate-600 leading-relaxed">${message}</p>
            </div>
            <div class="flex items-center justify-end gap-3">
                <button class="glass-pill" id="${modalId}-cancel">${cancelText}</button>
                <button class="glass-pill glass-pill-danger" id="${modalId}-confirm">${confirmText}</button>
            </div>
        </div>
    `;

    const dismiss = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (event) => { if (event.key === 'Escape') dismiss(); };
    document.addEventListener('keydown', onKey);
    document.getElementById(`${modalId}-close`).onclick = dismiss;
    document.getElementById(`${modalId}-cancel`).onclick = dismiss;
    document.getElementById(`${modalId}-confirm`).onclick = () => {
        dismiss();
        if (typeof onConfirm === 'function') onConfirm();
    };
}

async function handleManualSync() {
    const btn = document.getElementById("btn-sync-server");
    if (!btn || btn.disabled) return;
    
    const secret = document.getElementById("config-secret").value.trim();
    let widgetUrl = document.getElementById("config-widget-url").value.trim();
    const targetHost = document.getElementById("target-host-type").value;
    const resultBox = document.getElementById("test-connection-result");
    
    // Resolve URL from HostType UI before asserting
    if(targetHost === "production") {
        widgetUrl = "https://widgets.infonite.tech";
        document.getElementById("config-widget-url").value = widgetUrl;
    } else if(targetHost === "develop") {
        widgetUrl = "https://widgets-dev.infonite.tech";
        document.getElementById("config-widget-url").value = widgetUrl;
    }
    
    if (resultBox) {
        resultBox.classList.add("hidden");
        resultBox.className = "hidden text-[10px] mb-2 text-center font-medium p-2 rounded-lg";
    }
    
    if (!secret || !widgetUrl) {
        if(resultBox) {
            resultBox.textContent = "App Secret or Widget Domain missing";
            resultBox.classList.add("text-red-500", "bg-red-50", "block");
            resultBox.classList.remove("hidden");
        }
        return;
    }
    
    const icon = btn.querySelector("i");
    if(icon) icon.classList.add("animate-spin");
    btn.disabled = true;
    
    // Validate by fetching api/app
    let appData = null;
    let isAppValid = false;
    try {
        const response = await fetch(`${widgetUrl}/api/app`, {
            method: "GET",
            headers: { "Content-Type": "application/json", "X-APP-SECRET": secret },
        });
        if (response.ok) {
            appData = await response.json();
            isAppValid = true;
        }
    } catch(e) {
        console.warn("Failed API APP hit", e);
    }

    if (!isAppValid) {
        window.tempSyncedConfig = null;
        if(icon) icon.classList.remove("animate-spin");
        btn.disabled = false;
        
        if(resultBox) {
            resultBox.textContent = "Connection refused or Secret invalid";
            resultBox.classList.add("text-red-500", "bg-red-50", "block");
            resultBox.classList.remove("hidden", "text-green-500", "bg-green-50");
        }
        return;
    }
    
    // Temporary structure config
    const tempConfig = {
        widgetUrl: widgetUrl,
        secret: secret,
        hostType: targetHost,
        isMock: false,
        name: appData.display_name || "New Environment",
        appId: appData.id || "",
        appName: appData.display_name || "",
        sessionPrefix: ""
    };
    
    // Now heavily sync its app_settings payload
    const success = await InfoniteConfigManager.syncAppSettings(tempConfig, true);
    
    if(icon) icon.classList.remove("animate-spin");
    btn.disabled = false;
    
    if (success) {
        window.tempSyncedConfig = tempConfig;
        if(resultBox) {
            resultBox.textContent = `Synced successfully with ${tempConfig.appName || 'Server'}!`;
            resultBox.classList.add("text-green-500", "bg-green-50", "block");
            resultBox.classList.remove("hidden", "text-red-500", "bg-red-50");
        }
        const saveBtn = document.getElementById("saveConfigBtn");
        if(saveBtn) {
            saveBtn.disabled = false;
            saveBtn.classList.remove("opacity-50", "cursor-not-allowed");
        }
        
        // Background logo fetch. Force awaiting to complete the full context
        await InfoniteConfigManager.syncAppLogos(window.tempSyncedConfig);
    } else {
        window.tempSyncedConfig = null;
        if(resultBox) {
            resultBox.textContent = "Settings Sync Failed";
            resultBox.classList.add("text-red-500", "bg-red-50", "block");
            resultBox.classList.remove("hidden", "text-green-500", "bg-green-50");
        }
    }
}

// THE LOOK IS REFRESHED ONCE PER PAGE LOAD: the page paints what it holds at once, then asks
// the service for the app's settings and logos again, so a change made in the console reaches
// the demo on the next refresh and never lags behind. Nothing is dropped if the service is
// away — what was held stays on, and the page says it is offline.
async function refreshActiveAppLook() {
    const config = InfoniteConfigManager.getConfig();
    if (!config || config.isMock || !config.secret || !config.widgetUrl) return;
    const synced = await InfoniteConfigManager.syncAppSettings(config, true);
    if (synced) await InfoniteConfigManager.syncAppLogos(InfoniteConfigManager.getConfig());
}

// Ensure UI mounts correctly immediately
document.addEventListener("DOMContentLoaded", () => {
    updateActiveConfigUI();
    applyTheme(InfoniteConfigManager.getConfig());
    refreshActiveAppLook();
});

window.exportActiveConfigUrl = function() {
    const data = InfoniteConfigManager.getStorageData();
    const currentId = document.getElementById("edit-config-id").value;
    const config = data.list.find(c => c.id === currentId);
    
    if (!config || config.isMock) {
        alert("Wait until the environment is fully synchronized before exporting.");
        return;
    }
    
    // the URL travels only for a custom host; the named hosts resolve to their fixed service
    const payload = { s: config.secret, ht: config.hostType || "production" };
    if (payload.ht === "custom") payload.u = config.widgetUrl;
    // and what the flows keep for it: Financial Rider's entity selection, and each flow's last
    // session's ending, when they are saved
    const fs = {};
    ENDING_FLOWS.forEach(flow => {
        const { selection, ending } = getFlowSettings(flow, config);
        const kept = { ...(flow === 'financial-rider' && selection ? { selection } : {}), ...(ending ? { ending } : {}) };
        if (Object.keys(kept).length) fs[flow] = kept;
    });
    if (Object.keys(fs).length) payload.fs = fs;
    
    const encoded = btoa(JSON.stringify(payload));
    
    const basePath = typeof getBasePath === 'function' ? getBasePath() : '';
    let baseUrlStr = window.location.href.split('?')[0].split('#')[0];
    let appRootPath = baseUrlStr;
    const pathParts = baseUrlStr.split('/');
    if(pathParts.includes('flows')) {
       appRootPath = pathParts.slice(0, pathParts.indexOf('flows')).join('/') + '/';
    } else {
       appRootPath = baseUrlStr.substring(0, baseUrlStr.lastIndexOf('/') + 1);
    }
    
    // Base64 may carry «+», which a query string reads as a space: encode the payload.
    const url = new URL(`setup.html?c=${encodeURIComponent(encoded)}`, appRootPath);
    
    navigator.clipboard.writeText(url.href).then(() => {
        const btn = document.getElementById("exportConfigBtn");
        if(btn) {
            const originalHtml = btn.innerHTML;
            btn.innerHTML = `<i class="fa-solid fa-check text-[var(--primary)]"></i>`;
            setTimeout(() => btn.innerHTML = originalHtml, 2000);
        }
    }).catch(err => {
        console.error("Failed to copy URL", err);
        alert("Failed to copy URL to clipboard.");
    });
};
