const INFONITE_VERSION = "v2026.3.200";

const DEFAULT_CONFIG_ITEM = {
    id: "default",
    name: "No Application",
    secret: "",
    widgetUrl: "https://widgets.infonite.tech",
    clientUrl: "https://clients.infonite.tech",
    primaryColor: "#00a76f",
    darkColor: "#1C252E",
    bannerColor: "#1C252E",
    bannerColorScheme: "dark",
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
    isMock: true,
    saturateLogo: true
};

const STORAGE_KEY = "infonite_configs";

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
        
        if (response.ok) {
            const data = await response.json();
            config.appDetails = { ...data, isOnline: true, status: data.status || 'unknown', lastError: null };
            if(data.id && data.id !== config.appId) {
                config.appId = data.id;
            }
            config.appName = data.display_name || "";
            
            // Reapply naming rule based on HostType instead of environment string
            let prefix = "[CSM]";
            if(config.hostType === "production") prefix = "[PRO]";
            if(config.hostType === "develop") prefix = "[DEV]";
            
            if (config.appName) {
                config.name = `${prefix} ${config.appName}`;
            } else {
                config.name = "Unknown App";
            }
        } else {
            // Track the explicit error if not OK (e.g 401 Unauthorized)
            config.appDetails.isOnline = false;
            config.appDetails.status = 'unreachable';
            config.appDetails.lastError = `HTTP ${response.status} - ${response.statusText || 'API Error'}`;
            config.name = "Unavailable App";
        }
    } catch (error) {
        // Network error, invalid URL, etc
        config.appDetails.isOnline = false;
        config.appDetails.status = 'unreachable';
        config.appDetails.lastError = `Network Error: ${error.message}`;
        config.name = "Unavailable App";
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
    
    if(typeof window.br_updateActiveConfigUI === 'function') window.br_updateActiveConfigUI();
    if (window.setGlobalConfig) window.setGlobalConfig(config);
}

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

    // Update config properties with base64 URIs
    config.logo_square_light_base64 = sqLight;
    config.logo_rectangle_light_base64 = rectLight;
    config.logo_square_dark_base64 = sqDark;
    config.logo_rectangle_dark_base64 = rectDark;
    
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

// Start polling
setInterval(syncActiveApp, 5000);

// Also sync immediately on load
setTimeout(syncActiveApp, 1000);

window.InfoniteConfigManager = {
    DEFAULT_CONFIG_ITEM,
    getStorageData,
    saveStorageData,
    getConfig,
    syncActiveApp,
    syncAppSettings,
    syncAppLogos,
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

window.selectBannerScheme = function(scheme) {
    if(!['light', 'dark'].includes(scheme)) return;
    
    const activeConfig = window.InfoniteConfigManager.getConfig();
    const squarePreview = document.getElementById(`preview-logo-square-${scheme}`);
    const rectPreview = document.getElementById(`preview-logo-rectangle-${scheme}`);
    const squareFallback = document.getElementById(`fallback-logo-square-${scheme}`);
    const rectFallback = document.getElementById(`fallback-logo-rectangle-${scheme}`);
    
    // Use dynamic Path for images inside flows
    const basePath = getBasePath();

    // Check if logos exist in config
    const hasSquare = activeConfig[`logo_square_${scheme}_base64`];
    const hasRect = activeConfig[`logo_rectangle_${scheme}_base64`];

    // Hide all previews and fallbacks initially
    [squarePreview, rectPreview, squareFallback, rectFallback].forEach(el => {
        if (el) el.classList.add('hidden');
    });

    // Show actual logos if available
    if (hasSquare && squarePreview) {
        squarePreview.src = activeConfig[`logo_square_${scheme}_base64`];
        squarePreview.classList.remove('hidden');
    }
    if (hasRect && rectPreview) {
        rectPreview.src = activeConfig[`logo_rectangle_${scheme}_base64`];
        rectPreview.classList.remove('hidden');
    }

    // Show fallbacks if actual logos are not available
    if(!hasSquare && squareFallback) {
        const isDarkScheme = scheme === 'dark';
        squareFallback.src = isDarkScheme ? `${basePath}assets/logo/logo-dark.svg` : `${basePath}assets/logo/logo-light.svg`;
        squareFallback.classList.remove('hidden');
    }
    
    if(!hasRect && rectFallback) {
        const isDarkScheme = scheme === 'dark';
        const rectClass = isDarkScheme ? 'fa-image text-slate-800/40 text-xl' : 'fa-image text-white/50 text-xl';
        rectFallback.className = `fa-solid ${rectClass}`;
        rectFallback.classList.remove('hidden');
    }
    
    document.querySelectorAll('.scheme-row-selector').forEach(row => {
        row.classList.remove('border-[var(--primary)]', 'ring-2', 'ring-[rgba(var(--primary-rgb),0.5)]');
        row.classList.add('border-slate-100');
        row.dataset.selected = 'false';
    });
    
    ['light', 'dark'].forEach(d => {
        const dot = document.getElementById(`radio-dot-${d}`);
        const indicator = document.getElementById(`radio-indicator-${d}`);
        if (dot) dot.classList.add('hidden');
        if (indicator) {
            indicator.classList.remove('border-[var(--primary)]');
            indicator.classList.add('border-slate-300');
        }
    });
    
    const activeRow = document.getElementById(`row-scheme-${scheme}`);
    if(activeRow) {
        activeRow.classList.remove('border-slate-100');
        activeRow.classList.add('border-[var(--primary)]', 'ring-2', 'ring-[rgba(var(--primary-rgb),0.5)]');
        activeRow.dataset.selected = 'true';
    }
    
    const activeDot = document.getElementById(`radio-dot-${scheme}`);
    const activeIndicator = document.getElementById(`radio-indicator-${scheme}`);
    if (activeDot) activeDot.classList.remove('hidden');
    if (activeIndicator) {
        activeIndicator.classList.remove('border-slate-300');
        activeIndicator.classList.add('border-[var(--primary)]');
    }
    
    updateBannerPreview();
};

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
        const bScheme = cfg.bannerColorScheme || 'light';
        const logoData = cfg[`logo_square_${bScheme}_base64`] || (window.InfoniteNavBanner ? window.InfoniteNavBanner.getDefaultLogoPath(bScheme, basePath) : `${basePath}assets/images/logo-infonite-blue.svg`);
        const bColor = cfg.bannerColor || cfg.darkColor || DEFAULT_CONFIG_ITEM.bannerColor;
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
    const isSynced = config.isSynced && config.app_settings;

    const primary = (isSynced && config.app_settings.color_primary) ? config.app_settings.color_primary.main : (config.primaryColor || DEFAULT_CONFIG_ITEM.primaryColor);
    const dark = (isSynced && config.app_settings.color_secondary) ? config.app_settings.color_secondary.main : (config.darkColor || DEFAULT_CONFIG_ITEM.darkColor);
    
    // Extracted contrast text from synced structure or implicitly calculated
    const primaryContrastText = (isSynced && config.app_settings.color_primary) ? config.app_settings.color_primary.contrastText : null;
    const darkContrastText = (isSynced && config.app_settings.color_secondary) ? config.app_settings.color_secondary.contrastText : null;

    const banner = config.bannerColor || config.darkColor || DEFAULT_CONFIG_ITEM.bannerColor;
    const bannerColorScheme = config.bannerColorScheme || DEFAULT_CONFIG_ITEM.bannerColorScheme || 'light';
    const bannerTextDark = config.bannerTextDark ?? DEFAULT_CONFIG_ITEM.bannerTextDark;

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
        const bannerArr = hexToArr(banner);
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
        root.style.setProperty('--banner-color', banner);
        root.style.setProperty('--banner-rgb', arrToRgbStr(bannerArr));
        root.style.setProperty('--banner-contrast', bannerColorScheme === 'dark' ? '#ffffff' : '#1C252E');
        root.style.setProperty('--brand-green-glow', `rgba(${arrToRgbStr(primaryArr)}, 0.1)`);

        // Force a re-render of the nav banner if it exists so it picks up the root variables
        if(window.InfoniteNavBanner && typeof window.InfoniteNavBanner.render === 'function') {
            window.InfoniteNavBanner.render();
        }

        const heroLogo = document.getElementById('hero-logo');
        if (heroLogo) {
            const fallback = document.getElementById('hero-text-fallback');
            
            heroLogo.onerror = function() {
                this.style.display = 'none';
                if(fallback) fallback.classList.remove('hidden');
            };

            const isDarkScheme = (bannerColorScheme === 'dark');
            const basePath = typeof getBasePath === 'function' ? getBasePath() : '';
            const defaultSymbolSrc = isDarkScheme ? `${basePath}assets/logo/text-logo-dark.svg` : `${basePath}assets/logo/text-logo-light.svg`;
            
            const newSrc = isDarkScheme 
                ? (config.logo_rectangle_dark_base64 || defaultSymbolSrc)
                : (config.logo_rectangle_light_base64 || defaultSymbolSrc);

            if(heroLogo.getAttribute('src') !== newSrc) {
                heroLogo.src = newSrc;
            }
            
            heroLogo.style.display = 'block';
            if(fallback) fallback.classList.add('hidden');
            
            if (config.saturateLogo !== false) {
                heroLogo.style.filter = isDarkScheme ? 'brightness(0) invert(1)' : 'brightness(0.2)';
            } else {
                heroLogo.style.filter = 'none';
            }
        }

    } catch(e) { console.error("Theme apply error:", e); }
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

window.selectBannerScheme = function(scheme) {
    if(!['light', 'dark'].includes(scheme)) return;
    
    document.querySelectorAll('.scheme-row-selector').forEach(row => {
        row.classList.remove('border-[var(--primary)]', 'ring-2', 'ring-[rgba(var(--primary-rgb),0.5)]');
        row.classList.add('border-slate-100');
        row.dataset.selected = 'false';
    });
    
    ['light', 'dark'].forEach(d => {
        const dot = document.getElementById(`radio-dot-${d}`);
        const indicator = document.getElementById(`radio-indicator-${d}`);
        if (dot) dot.classList.add('hidden');
        if (indicator) {
            indicator.classList.remove('border-[var(--primary)]');
            indicator.classList.add('border-slate-300');
        }
    });
    
    const activeRow = document.getElementById(`row-scheme-${scheme}`);
    if(activeRow) {
        activeRow.classList.remove('border-slate-100');
        activeRow.classList.add('border-[var(--primary)]', 'ring-2', 'ring-[rgba(var(--primary-rgb),0.5)]');
        activeRow.dataset.selected = 'true';
    }
    
    const activeDot = document.getElementById(`radio-dot-${scheme}`);
    const activeIndicator = document.getElementById(`radio-indicator-${scheme}`);
    if (activeDot) activeDot.classList.remove('hidden');
    if (activeIndicator) {
        activeIndicator.classList.remove('border-slate-300');
        activeIndicator.classList.add('border-[var(--primary)]');
    }
    
    updateBannerPreview();
};

function updateBannerPreview() {
    const input = document.getElementById('config-banner-color');
    if(!input) return;
    const color = input.value || '#1C252E';
    
    // Update all occurrences of the banner color preview within the scheme rows
    document.querySelectorAll('.banner-color-preview').forEach(preview => {
        preview.style.background = color;
    });
}

function openEditor(id = null) {
    const data = InfoniteConfigManager.getStorageData();
    const DEFAULT_CONFIG_ITEM = InfoniteConfigManager.DEFAULT_CONFIG_ITEM;
    const isNew = !id;
    const config = isNew ? { ...DEFAULT_CONFIG_ITEM, name: "New Environment", id: crypto.randomUUID(), secret: "", widgetUrl: "https://widgets.infonite.tech", hostType: "production", clientUrl: "https://clients.infonite.tech", isMock: false, saturateLogo: true } : data.list.find(c => c.id === id);
    
    if (!config) return; 

    window.tempSyncedConfig = null;
    
    const saveBtn = document.getElementById("saveConfigBtn");
    if (saveBtn) {
        if (isNew) {
            saveBtn.disabled = true;
            saveBtn.classList.add("opacity-50", "cursor-not-allowed");
        } else {
            saveBtn.disabled = false;
            saveBtn.classList.remove("opacity-50", "cursor-not-allowed");
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
    if (clientInput) clientInput.value = config.clientUrl;
    
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
    
    
    const pc = config.primaryColor || DEFAULT_CONFIG_ITEM.primaryColor;
    const dc = config.darkColor || DEFAULT_CONFIG_ITEM.darkColor;
    const bc = config.bannerColor || config.darkColor || DEFAULT_CONFIG_ITEM.bannerColor;
    const bScheme = config.bannerColorScheme || DEFAULT_CONFIG_ITEM.bannerColorScheme || 'light';
    
    // Map colors considering sync overrides for disabled view
    const isSynced = config.isSynced && config.app_settings;
    const actualPc = (isSynced && config.app_settings.color_primary) ? config.app_settings.color_primary.main : pc;
    const actualDc = (isSynced && config.app_settings.color_secondary) ? config.app_settings.color_secondary.main : dc;
    
    const pcSwatch = document.getElementById("swatch-primary-color");
    const pcText = document.getElementById("swatch-primary-color-text");
    const dcSwatch = document.getElementById("swatch-dark-color");
    const dcText = document.getElementById("swatch-dark-color-text");
    
    if(pcSwatch) {
        pcSwatch.style.backgroundColor = actualPc;
    }
    if(pcText) {
        pcText.textContent = actualPc;
    }
    
    if(dcSwatch) {
        dcSwatch.style.backgroundColor = actualDc;
    }
    if(dcText) {
        dcText.textContent = actualDc;
    }
    
    document.getElementById("config-banner-color").value = bc;
    document.getElementById("config-banner-color-text").value = bc;
    
    // Assign active Scheme Row
    if(typeof window.selectBannerScheme === 'function') {
        window.selectBannerScheme(bScheme);
    }
    
    // Logo Previews mapping
    const setLogoPreview = (idSuffix, base64) => {
        const previewObj = document.getElementById(`preview-logo-${idSuffix}`);
        const fallbackObj = document.getElementById(`fallback-logo-${idSuffix}`);
        if(previewObj && fallbackObj) {
            if(base64) {
                previewObj.src = base64;
                previewObj.classList.remove('hidden');
                fallbackObj.classList.add('hidden');
            } else {
                previewObj.src = '';
                previewObj.classList.add('hidden');
                fallbackObj.classList.remove('hidden');
            }
        }
    };
    
    setLogoPreview('square-light', config.logo_square_light_base64);
    setLogoPreview('rectangle-light', config.logo_rectangle_light_base64);
    setLogoPreview('square-dark', config.logo_square_dark_base64);
    setLogoPreview('rectangle-dark', config.logo_rectangle_dark_base64);
    
    updateBannerPreview();
    
    const saturateCheckbox = document.getElementById("config-saturate-logo");
    if(saturateCheckbox) {
        saturateCheckbox.checked = config.saturateLogo !== false;
        // Trigger manual visual update of custom checkbox
        if(saturateCheckbox.onchange) saturateCheckbox.onchange();
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
    
    const newConfig = {
        id: realId,
        name: isNew ? "New Environment" : (configFromList?.name || "Unnamed"),
        secret: document.getElementById("config-secret").value.trim(),
        clientUrl: "https://clients.infonite.tech", // Hardcoded
        primaryColor: (document.getElementById("swatch-primary-color-text") ? document.getElementById("swatch-primary-color-text").textContent : DEFAULT_CONFIG_ITEM.primaryColor) || DEFAULT_CONFIG_ITEM.primaryColor,
        darkColor: (document.getElementById("swatch-dark-color-text") ? document.getElementById("swatch-dark-color-text").textContent : DEFAULT_CONFIG_ITEM.darkColor) || DEFAULT_CONFIG_ITEM.darkColor,
        bannerColor: document.getElementById("config-banner-color").value || DEFAULT_CONFIG_ITEM.bannerColor,
        bannerColorScheme: document.querySelector('.scheme-row-selector[data-selected="true"]') ? document.querySelector('.scheme-row-selector[data-selected="true"]').id.replace('row-scheme-', '') : "light",
        hostType: document.getElementById("target-host-type") ? document.getElementById("target-host-type").value : "custom",
        logo_square_light_base64: window.tempSyncedConfig && window.tempSyncedConfig.logo_square_light_base64 ? window.tempSyncedConfig.logo_square_light_base64 : (configFromList ? configFromList.logo_square_light_base64 : null),
        logo_rectangle_light_base64: window.tempSyncedConfig && window.tempSyncedConfig.logo_rectangle_light_base64 ? window.tempSyncedConfig.logo_rectangle_light_base64 : (configFromList ? configFromList.logo_rectangle_light_base64 : null),
        logo_square_dark_base64: window.tempSyncedConfig && window.tempSyncedConfig.logo_square_dark_base64 ? window.tempSyncedConfig.logo_square_dark_base64 : (configFromList ? configFromList.logo_square_dark_base64 : null),
        logo_rectangle_dark_base64: window.tempSyncedConfig && window.tempSyncedConfig.logo_rectangle_dark_base64 ? window.tempSyncedConfig.logo_rectangle_dark_base64 : (configFromList ? configFromList.logo_rectangle_dark_base64 : null),
        isSynced: window.tempSyncedConfig ? window.tempSyncedConfig.isSynced : (configFromList ? configFromList.isSynced : false),
        appDetails: window.tempSyncedConfig ? window.tempSyncedConfig.appDetails : (configFromList ? configFromList.appDetails : null),
        app_settings: window.tempSyncedConfig ? window.tempSyncedConfig.app_settings : (configFromList ? configFromList.app_settings : null),
        saturateLogo: document.getElementById("config-saturate-logo") ? document.getElementById("config-saturate-logo").checked : true,
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

function deleteConfig(id) {
    const data = InfoniteConfigManager.getStorageData();
    const configToDelete = data.list.find(c => c.id === id);
    
    if (configToDelete && configToDelete.isMock) {
        alert("Cannot delete the No Application placeholder.");
        return;
    }

    showConfirmModal(
        "Delete Configuration",
        "Are you sure you want to delete this environment? This action cannot be undone.",
        "Delete",
        () => {
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

function showConfirmModal(title, message, confirmText, onConfirm, cancelText = "Cancel") {
    const modalId = 'infonite-confirm-modal';
    let modal = document.getElementById(modalId);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = `fixed inset-0 bg-black/80 backdrop-blur-sm z-[2000] flex items-center justify-center p-4 fade-in`;
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <div class="bg-white w-full max-w-sm rounded-[2rem] overflow-hidden shadow-2xl border border-slate-100 flex flex-col scale-in">
            <div class="p-6 md:p-8 flex flex-col items-center text-center">
                <div class="w-16 h-16 rounded-full bg-red-50 border border-red-100 text-red-500 flex items-center justify-center mb-6">
                    <i class="fa-solid fa-triangle-exclamation text-2xl"></i>
                </div>
                <h3 class="font-black text-lg text-slate-900 mb-2">${title}</h3>
                <p class="text-sm text-slate-500 mb-8 px-2">${message}</p>
                
                <div class="flex gap-3 w-full">
                    <button class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3.5 rounded-xl text-[10px] uppercase tracking-widest transition-colors" id="${modalId}-cancel">
                        ${cancelText}
                    </button>
                    <button class="flex-1 bg-red-500 hover:bg-red-600 text-white font-black py-3.5 rounded-xl shadow-lg shadow-red-500/30 text-[10px] uppercase tracking-widest transition-colors" id="${modalId}-confirm">
                        ${confirmText}
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById(`${modalId}-cancel`).onclick = () => modal.remove();
    document.getElementById(`${modalId}-confirm`).onclick = () => {
        modal.remove();
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
        
        // Push UI live to the swatch boxes to prove it worked in real time
        if (tempConfig.app_settings) {
             const prim = tempConfig.app_settings.color_primary ? tempConfig.app_settings.color_primary.main : '#00a76f';
             const sec = tempConfig.app_settings.color_secondary ? tempConfig.app_settings.color_secondary.main : '#1C252E';
             
             const swatchP = document.getElementById("swatch-primary-color");
             const swatchPText = document.getElementById("swatch-primary-color-text");
             if(swatchP) swatchP.style.backgroundColor = prim;
             if(swatchPText) swatchPText.textContent = prim;
             
             const swatchD = document.getElementById("swatch-dark-color");
             const swatchDText = document.getElementById("swatch-dark-color-text");
             if(swatchD) swatchD.style.backgroundColor = sec;
             if(swatchDText) swatchDText.textContent = sec;
             
             // Implicitly update banner sync preview
             const bannerP = document.getElementById("config-banner-color");
             const bannerPText = document.getElementById("config-banner-color-text");
             if(bannerP && tempConfig.app_settings.color_secondary) bannerP.value = sec;
             if(bannerPText && tempConfig.app_settings.color_secondary) {
                 bannerPText.value = sec;
                 if(typeof updateBannerPreview === 'function') updateBannerPreview();
             }
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

// Ensure UI mounts correctly immediately
document.addEventListener("DOMContentLoaded", () => {
    updateActiveConfigUI();
    applyTheme(InfoniteConfigManager.getConfig());
});
