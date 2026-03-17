/**
 * bank-reader.js
 * Clean UI logic integration for the Spain Citizen Data flow.
 */

const ALLOWED_MODULES = [
    'customer_information_read',
    'accounts_read',
    'cards_read',
    'deposits_read',
    'loans_read',
    'credits_read',
    'investment_accounts_read',
    'funds_read',
    'stocks_read',
    'pensions_read',
    'direct_debits_read'
];

const DEFAULT_SELECTED_MODULES = [
    'customer_information_read',
    'accounts_read'
];

document.addEventListener("DOMContentLoaded", () => {
    // 1. Render the modules dynamically based on features.js
    renderModulesGrid();

    // Try rendering session history on load if available
    if (typeof renderHistory === 'function') {
        renderHistory();
    }
});

/**
 * Renders the Feature toggles inside the New Lead modal's grid container.
 */
function renderModulesGrid() {
    const gridContainer = document.getElementById("modulesGrid");
    if (!gridContainer) return;

    if (typeof window.INFONITE_FEATURES === 'undefined') {
        gridContainer.innerHTML = '<p class="text-[10px] text-red-500 font-bold p-4">Error: Features dictionary not loaded.</p>';
        return;
    }

    let htmlContent = '';

    ALLOWED_MODULES.forEach(moduleCode => {
        const featureDef = window.INFONITE_FEATURES[moduleCode];
        if (!featureDef) return; // Fallback if missing

        const isChecked = DEFAULT_SELECTED_MODULES.includes(moduleCode) ? 'checked' : '';
        const opc = isChecked ? 'opacity-100' : 'opacity-0';
        const bgc = isChecked ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'bg-white text-slate-300 border-black/10';

        htmlContent += `
        <label class="cursor-pointer block relative group h-full">
            <input class="feature-checkbox sr-only" type="checkbox" value="${featureDef.code}" ${isChecked} onchange="toggleFeatureVisual(this)"/>
            <div class="feature-card border border-black/10 rounded-2xl p-4 flex flex-col items-center text-center transition-all hover:bg-black/5 hover:border-black/20 group-hover:shadow-md h-full gap-3 bg-white relative">
                <div class="w-12 h-12 rounded-xl bg-slate-50 border border-black/5 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-[var(--primary-container)] transition-all">
                    <i class="${featureDef.icon} text-[var(--primary)] text-lg"></i>
                </div>
                <div class="flex-1 flex flex-col justify-center">
                    <h4 class="font-black text-slate-900 text-[10px] uppercase tracking-widest leading-tight mb-1.5 group-hover:text-[var(--primary)] transition-colors">
                      ${featureDef.name}
                    </h4>
                    <p class="text-[9px] text-slate-500 font-medium leading-tight">${featureDef.workMessage.replace('Consulting your', '').replace('Retrieving your', '').trim()}</p>
                </div>
                <div class="absolute top-3 right-3 transition-opacity">
                     <div class="indicator w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${bgc}">
                        <i class="fa-solid fa-check text-[10px] ${opc} transition-opacity check-icon"></i>
                     </div>
                </div>
            </div>
        </label>
        `;
    });

    gridContainer.innerHTML = htmlContent;
}

function toggleFeatureVisual(input) {
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
    
    const sessions = window.InfoniteFlowsManager ? window.InfoniteFlowsManager.getSessions(config.appId, 'bank_reader', config.widgetUrl) : [];
    const emptyState = document.getElementById('dashboardEmptyState');
    const tableState = document.getElementById('dashboardTableState');
    const tbody = document.getElementById('sessionHistory');
    
    if (!sessions || sessions.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        if (tableState) tableState.classList.add('hidden');
        if (tbody) tbody.innerHTML = '';
        return;
    }
    
    if (emptyState) emptyState.classList.add('hidden');
    if (tableState) tableState.classList.remove('hidden');
    if (!tbody) return;
    
    let html = '';
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
        const rowBorder = isErrorState ? 'border-l-[4px] border-l-red-500' : 'border-l-[4px] border-l-transparent';
        
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
        
        // Ensure the tracking calculation uses the raw mapped status instead
        // The displayStatus is pushed to getStatusBadge().
        const badgeHtml = getStatusBadge(displayStatus);
            
        let timeUi = timeData.isRecent ? 
            `<span style="background-color: ${secBg}; color: ${secText};" class="px-1.5 py-0.5 rounded ml-1 tracking-widest leading-none">${timeData.relStr}</span>` : 
            (timeData.relStr ? `<span class="ml-1 opacity-70">(${timeData.relStr})</span>` : '');
            
        let copyActionUi = wUrl ? `
            <button class="bg-white border border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-600 hover:bg-indigo-50 w-7 h-7 rounded-lg text-[10px] flex items-center justify-center transition-colors shadow-sm ml-1.5 shrink-0" title="Copy URL" onclick="navigator.clipboard.writeText('${wUrl}'); const i=this.querySelector('i'); i.className='fa-solid fa-check text-green-500'; setTimeout(()=>i.className='fa-regular fa-copy',2000)">
               <i class="fa-regular fa-copy"></i>
            </button>
        ` : '';

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
        
        html += `
        <tr class="border-b border-black/5 hover:bg-black/[0.02] transition-colors group ${rowBorder}">
            <td class="p-4 pl-4 align-top">
               <div class="flex items-center gap-3">
                   <div class="w-8 h-8 rounded-lg bg-[var(--primary-container)] flex items-center justify-center shrink-0">
                       <i class="fa-solid fa-fingerprint text-[var(--primary)] text-[10px]"></i>
                   </div>
                   <div class="flex-1 min-w-0 pr-4">
                       <div class="flex items-center gap-1.5">
                           <h4 class="text-xs font-mono font-bold text-slate-900 truncate max-w-[150px] sm:max-w-[200px]" title="${sid}">${sid}</h4>
                           <button onclick="navigator.clipboard.writeText('${sid}'); const i=this.querySelector('i'); i.className='fa-solid fa-check text-green-500'; setTimeout(()=>i.className='fa-regular fa-copy',2000)" class="text-[10px] text-slate-400 hover:text-[var(--primary)] transition-colors opacity-0 group-hover:opacity-100" title="Copy Session ID">
                               <i class="fa-regular fa-copy"></i>
                           </button>
                       </div>
                       <p class="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5 truncate max-w-[200px] sm:max-w-[280px]" title="${cid}">${cid}</p>
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
                   <button class="bg-white border border-slate-200 text-slate-600 hover:text-[var(--primary)] hover:border-[var(--primary)] px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest flex items-center transition-colors shadow-sm ml-1.5 shrink-0" onclick="viewSession('${sid}')">
                       <i class="fa-regular fa-eye mr-1.5"></i> View
                   </button>
               </div>
            </td>
        </tr>
        `;
        
        // Start polling if needed
        if (needsPolling && !window.activePollers[sid]) {
            window.activePollers[sid] = true;
            setTimeout(() => pollLoop(sid, config), 3000);
        }
    });
    tbody.innerHTML = html;
};

window.syncActiveSession = async function(sid) {
    const config = window.InfoniteConfigManager ? window.InfoniteConfigManager.getConfig() : null;
    if (!config) return;
    try {
        if (window.InfoniteFlowsManager) {
            await window.InfoniteFlowsManager.pollSessionState(config.widgetUrl, config.secret, 'bank_reader', sid, config.appId);
            renderHistory();
        }
    } catch (e) {
        console.error("Sync failed", e);
        alert("Failed to force-sync session.");
    }
};

window.deleteLocalSession = function(sid) {
    if (typeof showConfirmModal === 'function') {
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
                    let sessions = window.InfoniteFlowsManager.getSessions(config.appId, 'bank_reader', config.widgetUrl) || [];
                    sessions = sessions.filter(s => s.session_id !== sid);
                    window.InfoniteFlowsManager.saveSessions(config.appId, 'bank_reader', sessions, config.widgetUrl);
                    
                    if (typeof renderHistory === 'function') {
                        renderHistory();
                    }
                }
            }
        );
    } else {
        alert("Modal system is not available.");
    }
};

async function pollLoop(sid, config) {
    if (!window.activePollers[sid]) return; // Stop if cancelled/cleared
    try {
        if (window.InfoniteFlowsManager) {
            const state = await window.InfoniteFlowsManager.pollSessionState(config.widgetUrl, config.secret, 'bank_reader', sid, config.appId);
            
            // Re-render immediately to reflect realtime changes (like ping_date updating USER_ONLINE indicator)
            if (typeof renderHistory === 'function') {
                renderHistory();
            }

            // Also re-render the Active Session View if we are currently looking at it
            if (window.currentViewedSession === sid && typeof renderSessionView === 'function') {
                renderSessionView(state);
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
    if (typeof showConfirmModal === 'function') {
        showConfirmModal(
            "Cancel Session",
            "Are you sure you want to cancel this session? The citizen will no longer be able to complete the verification process.",
            "Cancel Session",
            async () => {
                const config = window.InfoniteConfigManager ? window.InfoniteConfigManager.getConfig() : null;
                if (!config) return;
                delete window.activePollers[sid]; // stop local
                try {
                    if (window.InfoniteFlowsManager) {
                        await window.InfoniteFlowsManager.cancelSession(config.widgetUrl, config.secret, 'bank_reader', sid);
                        // Re-poll immediately to update UI
                        await window.InfoniteFlowsManager.pollSessionState(config.widgetUrl, config.secret, 'bank_reader', sid, config.appId);
                        renderHistory();
                    }
                } catch (e) {
                    console.error("Cancel failed", e);
                    alert("Failed to cancel session: " + JSON.stringify(e));
                }
            },
            "Keep Active"
        );
    } else {
        alert("Modal system is not available.");
    }
};

window.clearHistory = function() {
    if (typeof showConfirmModal === 'function') {
        showConfirmModal(
            "Clear Local DB",
            "This will permanently delete all session history from your browser's local storage. This action cannot be undone.",
            "Delete Database",
            () => {
                // Ensure pollers stop
                window.activePollers = {};
                const config = window.InfoniteConfigManager ? window.InfoniteConfigManager.getConfig() : null;
                if (config && window.InfoniteFlowsManager) {
                    window.InfoniteFlowsManager.saveSessions(config.appId, 'bank_reader', [], config.widgetUrl);
                    renderHistory();
                }
            }
        );
    } else {
        if (!confirm("Are you sure you want to delete all local session history? This cannot be undone.")) return;
        window.activePollers = {};
        const config = window.InfoniteConfigManager ? window.InfoniteConfigManager.getConfig() : null;
        if (config && window.InfoniteFlowsManager) {
            window.InfoniteFlowsManager.saveSessions(config.appId, 'bank_reader', [], config.widgetUrl);
            renderHistory();
        }
    }
};

// --------------------------------------------------------------------------------
// UI Modals
// --------------------------------------------------------------------------------

window.openNewLeadModal = function() {
    const modal = document.getElementById('newLeadModal');
    if (modal) {
        // Auto-generate Customer ID if empty
        const cidField = document.getElementById('generate-customer-id');
        if (cidField && !cidField.value) {
            const randomDigits = Math.floor(1000000000 + Math.random() * 9000000000).toString().substring(0, 8);
            cidField.value = `BANK-READER-${randomDigits}`;
        }

        // Setup completion URLs dropdown correctly
        populateCompletionUrls();

        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
};

function populateCompletionUrls() {
    const select = document.getElementById('generate-completion-url');
    if (!select) return;

    select.innerHTML = '';
    const config = InfoniteConfigManager.getConfig();
    const urls = config?.app_settings?.redirect_urls || [];

    if (urls.length === 0) {
        select.innerHTML = '<option value="">-- No options available in this environment --</option>';
        return;
    }

    urls.forEach(url => {
        const opt = document.createElement('option');
        opt.value = url;
        opt.textContent = url;
        select.appendChild(opt);
    });
}

window.closeNewLeadModal = function() {
    const modal = document.getElementById('newLeadModal');
    if (!modal) return;
    
    // Explicitly restore header width
    const header = document.getElementById('nl-header');
    if (header) {
        header.classList.remove('hidden');
    }

    modal.classList.add('opacity-0', 'invisible');
    modal.classList.remove('opacity-100', 'visible');
    
    const panel = document.getElementById('newLeadPanel');
    if (panel) {
        panel.classList.add('translate-y-full');
        panel.classList.remove('translate-y-0');
    }

    // Reset views for next open after transition
    setTimeout(() => {
        document.getElementById('nl-success-view').classList.add('hidden');
        document.getElementById('nl-success-view').classList.remove('flex');
        document.getElementById('nl-error-view').classList.add('hidden');
        document.getElementById('nl-error-view').classList.remove('flex');
        
        document.getElementById('nl-form-view').classList.remove('hidden');
        document.getElementById('nl-form-view').classList.add('flex');
        document.getElementById('nl-footer-actions').classList.remove('hidden');
        document.getElementById('nl-footer-actions').classList.add('flex');
    }, 300);
};

// Setup simple accordion toggling for Advanced Configuration
window.toggleAccordion = function(id) {
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

        // 1. Collect Payload Properties
        const customerId = document.getElementById('generate-customer-id').value.trim();
        const aesKey = document.getElementById('generate-aes-key').value.trim();
        const completionMode = document.getElementById('generate-completion-mode').value;
        const completionUrl = document.getElementById('generate-completion-url').value;
        const pathInput = document.getElementById('generate-completion-path');
        const completionPath = pathInput ? pathInput.value.trim() : '';
        const tokenizedAccessToggle = document.getElementById('generate-tokenized-access');
        const tokenizedAccess = tokenizedAccessToggle ? tokenizedAccessToggle.checked : true;

        // 2. Collect Features
        const checkboxes = document.querySelectorAll('#modulesGrid input.feature-checkbox:checked');
        const selectedFeatures = Array.from(checkboxes).map(cb => {
            const def = window.INFONITE_FEATURES[cb.value];
            return {
                code: cb.value,
                configurations: def ? def.defaultConfig : {}
            };
        });

        if (selectedFeatures.length === 0) {
            throw new Error("You must select at least one module module to generate a session.");
        }

        // 3. Assemble Strict Payload
        const payload = {
            customer_id: customerId,
            settings: {
                tokenized_access: tokenizedAccess,
                allowed_engines: window.INFONITE_ES_BANKS_ENGINES || [],
                executions_hooks_extra_data: {
                    "customer": "{customer_id}",
                    "fixed": "1"
                },
                completion_mode: completionMode,
                completion_extra_data: {
                    "session": "{session_id}",
                    "status": "{status_code}",
                    "staticName": "staticValue"
                },
                executions_features: selectedFeatures
            }
        };

        if (aesKey !== "") {
            payload.settings.aes_key = aesKey;
        }

        if (completionMode === "redirect") {
            if (!completionUrl) throw new Error("A valid completion URL is required if mode is set to redirect.");
            let finalUrl = completionUrl;
            if (completionPath) {
                finalUrl = finalUrl.replace(/\/$/, '') + '/' + completionPath.replace(/^\//, '');
            }
            payload.settings.completion_url = finalUrl;
        }

        // 4. Dispatch using FlowManager
        const result = await InfoniteFlowsManager.initSession(
            config.widgetUrl,
            config.secret,
            config.appId,
            "bank_reader",
            payload
        );

        if (result && result.widget_url) {
            // Store token actively locally as current
            localStorage.setItem(`active_session_bank_reader`, result.session_token);
            
            // Poll session status once IMMEDIATELY to update the underlying session state from Infonite
            if(window.InfoniteFlowsManager && window.InfoniteFlowsManager.pollSessionState) {
               try {
                   await window.InfoniteFlowsManager.pollSessionState(config.widgetUrl, config.secret, 'bank_reader', result.session_id, config.appId);
               } catch (e) {
                   console.error("Initial polling failed:", e);
               }
            }
            
            const header = document.getElementById('nl-header');
            if (header) {
                header.classList.add('hidden');
                header.classList.remove('flex');
            }
            
            // Show Success UI
            document.getElementById('nl-form-view').classList.add('hidden');
            document.getElementById('nl-form-view').classList.remove('flex');
            document.getElementById('nl-footer-actions').classList.add('hidden');
            document.getElementById('nl-footer-actions').classList.remove('flex');
            
            document.getElementById('nl-success-url').value = result.widget_url;
            document.getElementById('nl-success-view').classList.remove('hidden');
            document.getElementById('nl-success-view').classList.add('flex');
            
            // Re-render the history table in the dashboard to show the new lead
            if (typeof renderHistory === 'function') {
                renderHistory();
            }
            
            // The User must manually dismiss the Success Modal, no auto-close.
            
        } else {
            throw new Error("Invalid response received from the server.");
        }

    } catch (err) {
        console.error("Session Generation Error:", err);
        
        let displayMsg = err.message || "An unknown error occurred.";
        
        if (err.status) {
            displayMsg = `HTTP ${err.status} - ${err.statusText || 'Error'}\n`;
            
            if (err.responseBody && err.responseBody.detail) {
                if (Array.isArray(err.responseBody.detail)) {
                   displayMsg += "\nValidation Errors:\n";
                   err.responseBody.detail.forEach(d => {
                       const loc = d.loc ? d.loc.join('.') : 'unknown';
                       displayMsg += `- [${loc}]: ${d.msg}\n`;
                   });
                } else {
                   displayMsg += `\nDetail: ${JSON.stringify(err.responseBody.detail, null, 2)}`;
                }
            } else if (err.responseBody) {
                displayMsg += `\nResponse: ${JSON.stringify(err.responseBody, null, 2)}`;
            }
        }
        
        const header = document.getElementById('nl-header');
        if (header) {
            header.classList.add('hidden');
            header.classList.remove('flex');
        }
        
        // Show Error UI
        document.getElementById('nl-form-view').classList.add('hidden');
        document.getElementById('nl-form-view').classList.remove('flex');
        document.getElementById('nl-footer-actions').classList.add('hidden');
        document.getElementById('nl-footer-actions').classList.remove('flex');
        
        document.getElementById('nl-error-msg').textContent = displayMsg;
        document.getElementById('nl-error-view').classList.remove('hidden');
        document.getElementById('nl-error-view').classList.add('flex');
        
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
    window.location.href = `bank-reader-results.html?session_id=${sid}`;
};