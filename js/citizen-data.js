      // --- CONFIGURATION & CONSTANTS ---
      // --- CONFIGURATION MANAGEMENT ---

      const DEFAULT_CONFIG_ITEM = InfoniteConfigManager.DEFAULT_CONFIG_ITEM;
      let currentSessionId = null;
      (async () => {
        const active = InfoniteConfigManager.getConfig();
        if (active) {
            await InfoniteConfigManager.syncAppSettings(active, false);
            applyTheme(active);
        }
      })();
      
      function getStorageData() {
        return InfoniteConfigManager.getStorageData();
      }
      
      // Routing Logic
      function handleRouting() {
          const hashPath = window.location.hash;
          let sessionId = null;
          
          if (hashPath && hashPath.length > 1) {
              const cleanedHash = hashPath.substring(1);
              if (cleanedHash.includes('session=')) {
                  const urlParams = new URLSearchParams(cleanedHash.includes('?') ? cleanedHash.substring(cleanedHash.indexOf('?')) : cleanedHash);
                  sessionId = urlParams.get('session');
              } else {
                  sessionId = cleanedHash;
              }
          }
          
          const homeView = document.getElementById("homeView");
          const sessionView = document.getElementById("sessionMainView");
          
          if (!sessionId) {
              // HOME STATE
              if(homeView) homeView.classList.remove("hidden");
              if(sessionView) sessionView.classList.add("hidden");
              stopPolling();
              currentSessionId = null;
              resetUI();
          } else {
              // SESSION STATE
              if(homeView) homeView.classList.add("hidden");
              if(sessionView) sessionView.classList.remove("hidden");
              
              // Only restore if different from current to avoid loops/double fetch
              if (currentSessionId !== sessionId) {
                  restoreSessionById(sessionId);
              }
          }
      }
      
      function restoreSessionById(sessionId) {
           const sessions = JSON.parse(localStorage.getItem(getSessionStorageKey()) || "[]");
           const session = sessions.find(s => s.session_id === sessionId);
           
           if (session) {
                // Check if session is recent (< 5 seconds) to determine if we should wait
                const isRecent = session.timestamp && (new Date() - new Date(session.timestamp) < 5000);
                restoreSession(session.session_id, session.widget_url, session.environment_name, !isRecent);
            } else {
                console.warn("Session ID not found in history:", sessionId);
                
                // Switch UI immediately
                document.getElementById("errorBox").classList.add("hidden");
                
                
                
                
                document.getElementById("activeSessionState").classList.remove("hidden");
                document.getElementById("monitoringSection").classList.remove("hidden");
                document.getElementById("resultsDashboard").classList.add("hidden");
                
                document.getElementById("monitoringSessionId").textContent = `ID: ${sessionId}`;
                // If not in local history, we assume it's external/old, so immediate poll
                startPolling(sessionId, true); 
            }
      }
      


      function isAppHealthy() {
          const config = getConfig();
          return config && config.appDetails && config.appDetails.status === 'active';
      }

      async function syncSessionStatus(sessionObj) {
          const config = getConfig();
          if (!config.secret || !config.widgetUrl) return false;
          
          try {
              const managerUrl = `${config.widgetUrl}${MANAGER_ENDPOINT}`;
              const response = await fetch(`${managerUrl}/${sessionObj.session_id}`, {
                  headers: { "X-APP-SECRET": config.secret }
              });
              
              if (response.ok) {
                  const data = await response.json();
                  const oldSig = sessionObj.infonite_state ? (sessionObj.infonite_state.ping_date + "-" + sessionObj.infonite_state.status_code) : null;
                  const newSig = data.ping_date + "-" + data.status_code;
                  
                  if (oldSig !== newSig || !sessionObj.infonite_state) {
                      sessionObj.infonite_state = data;
                      return true;
                  }
              } else {
                  // If API returns an error, wipe local infonite_state and store a dummy error state to render it
                  sessionObj.infonite_state = {
                      status: 'ERROR',
                      status_code: 'ERROR',
                      is_closed: true, // Stop polling this broken session
                      error_message: `HTTP ${response.status}`,
                      date_started: new Date().toISOString()
                  };
                  return true;
              }
          } catch(e) {
              console.warn("API state sync failed for session", sessionObj.session_id);
              sessionObj.infonite_state = {
                  status: 'ERROR',
                  status_code: 'ERROR',
                  is_closed: true, // Stop polling
                  error_message: "Network Error",
                  date_started: new Date().toISOString()
              };
              return true;
          }
          return false;
      }

      async function pollDashboardSessions() {
          const dashboardView = document.getElementById("dashboardView");
          if (!dashboardView || dashboardView.classList.contains("hidden")) return;
          
          let sessions = getSessions();
          let changed = false;
          
          for (let i = 0; i < sessions.length; i++) {
              let s = sessions[i];
              const iState = s.infonite_state || {};
              const isClosed = iState.is_closed === true;
              
              // Skip polling if already conclusively finalized
              if (isClosed || ['CLIENT_CANCELLED', 'SYSTEM_CANCELLED', 'COMPLETED', 'FAILED', 'ERROR'].includes(iState.status_code || iState.status)) {
                  continue;
              }
              
              const wasChanged = await syncSessionStatus(sessions[i]);
              if (wasChanged) changed = true;
          }
          
          if (changed) {
              localStorage.setItem(getSessionStorageKey(), JSON.stringify(sessions));
              // only render if we're actually looking at the dashboard table
              if (!document.getElementById("dashboardView").classList.contains("hidden")) {
                  renderHistory();
              }
          }
      }

      window.addEventListener("hashchange", handleRouting);
      window.addEventListener("DOMContentLoaded", () => {
         renderHistory();
         handleRouting();
         setInterval(pollDashboardSessions, 3000);
      });
      
      
      // Configuration UI functions moved to config.js

      let currentPdfUrl = null;

      async function viewWorkLifePdf(id) {
        const config = getConfig();
        const modal = document.getElementById("pdfModal");
        const frame = document.getElementById("pdfFrame");
        const loader = document.getElementById("pdfLoading");

        modal.classList.remove("hidden");
        modal.classList.add("flex");
        loader.classList.remove("hidden");
        frame.classList.add("hidden");

        try {
          // The ID passed must be the specific connection_id for the TGSS robot
          const url = `${config.clientUrl}/api/executions/results/${id}/public/v1/labor-check/work-life-report`;
          const response = await fetch(url, {
            method: "GET",
            headers: {
              "X-APP-SECRET": config.secret,
            },
          });

          if (!response.ok) throw new Error("Could not retrieve PDF");

          const blob = await response.blob();
          currentPdfUrl = URL.createObjectURL(blob);

          frame.src = currentPdfUrl;
          frame.classList.remove("hidden");
          loader.classList.add("hidden");
        } catch (error) {
          console.error(error);
          alert("Error loading PDF: " + error.message);
          closePdfModal();
        }
      }

      function closePdfModal() {
        const modal = document.getElementById("pdfModal");
        const frame = document.getElementById("pdfFrame");

        modal.classList.add("hidden");
        modal.classList.remove("flex");
        frame.src = "";

        if (currentPdfUrl) {
          URL.revokeObjectURL(currentPdfUrl);
          currentPdfUrl = null;
        }
      }

      function openWidgetModal() {
        const url = document.getElementById("resultUrl").value;
        if (!url) return;
        
        const modal = document.getElementById("widgetModal");
        const frame = document.getElementById("widgetFrame");
        const loader = document.getElementById("widgetLoading");
        
        // Setup listener for iframe load to hide loader
        frame.onload = function() {
            loader.classList.add("hidden");
        };
        
        // Show loader initially
        loader.classList.remove("hidden");
        
        modal.classList.remove("hidden");
        modal.classList.add("flex");
        
        // Add completion mode parameters if not already present
        let finalUrl = url;
        try {
            const urlObj = new URL(url);
            // In postMessage completion mode, the widget should send events back to us
            // Note: The widget itself handles completion_mode from the server context,
            // but for iframe previewing, we often need post_message to know when to close.
            // But since the user configures this at generation, we just load the URL as is.
            finalUrl = urlObj.toString();
        } catch (e) {
            console.error("Invalid URL", e);
        }
        
        frame.src = finalUrl;
      }

      function closeWidgetModal() {
        const modal = document.getElementById("widgetModal");
        const frame = document.getElementById("widgetFrame");

        modal.classList.add("hidden");
        modal.classList.remove("flex");
        frame.src = ""; // Clear iframe to stop processes/media inside
      }

      const MANAGER_ENDPOINT = "/api/flows/es_citizen_data/v1/manager";
      let pollingInterval = null;

      // Flow configuration is now managed via INFONITE_FLOWS within features.js

      // --- STORAGE & HISTORY ---
      
      let lastPingDate = null;
      let monitoringTicker = null;
      let isSessionStarted = false;

      function getSessionStorageKey() {
        const config = getConfig();
        if (config && window.InfoniteFlowsManager) {
            return window.InfoniteFlowsManager._getStorageKey(config.appId, 'es_citizen_data', config.widgetUrl);
        }
        return "infonite_sessions_es_citizen_data_unknown";
      }

      function getSessions() {
        return JSON.parse(localStorage.getItem(getSessionStorageKey()) || "[]");
      }

      function saveSession(session) {
        let sessions = getSessions();
        const currentConfig = getConfig();
        sessions.unshift({
          ...session,
          config_id: currentConfig.id,
          environment_name: currentConfig.name || "Unknown",
          timestamp: new Date().toISOString(),
          infonite_state: {
            status_code: 'READY',
            status: 'READY',
            is_closed: false
          }
        });
        // Keep only last 10
        sessions = sessions.slice(0, 10);
        localStorage.setItem(getSessionStorageKey(), JSON.stringify(sessions));
        renderHistory();
      }

      function deleteSession(sessionId, event) {
        if (event) event.stopPropagation();
        
        showConfirmModal(
            "Delete Session",
            `This will permanently remove session ${sessionId} from your local dashboard history. Proceed?`,
            () => {
                let sessions = getSessions();
                sessions = sessions.filter((s) => s.session_id !== sessionId);
                localStorage.setItem(getSessionStorageKey(), JSON.stringify(sessions));
                renderHistory();
            }
        );
      }

      // --- DASHBOARD UI & NAVIGATION ---

      function openNewLeadModal() {
          document.getElementById('newLeadModal').classList.remove('hidden');
      }

      function closeNewLeadModal() {
          document.getElementById('newLeadModal').classList.add('hidden');
      }

      function goToDashboard() {
          if (window.location.hash !== "#/citizen-data" && window.location.hash !== "#/citizen-data/") {
              window.location.hash = "#/citizen-data";
          }
          const smv = document.getElementById("sessionMainView");
          const dbv = document.getElementById("dashboardView");
          if(smv) smv.classList.add("hidden");
          if(dbv) dbv.classList.remove("hidden");
          renderHistory(); // Refresh to catch any background updates
      }

      function renderHistory() {
        const tbody = document.getElementById("sessionHistory");
        const dashboardEmpty = document.getElementById("dashboardEmptyState");
        const dashboardTable = document.getElementById("dashboardTableState");
        const sessions = getSessions();

        if (!tbody) return;

        if (sessions.length === 0) {
            dashboardEmpty.classList.remove("hidden");
            dashboardTable.classList.add("hidden");
            return;
        }

        dashboardEmpty.classList.add("hidden");
        dashboardTable.classList.remove("hidden");

        tbody.innerHTML = sessions
          .map((s) => {
              const sId = s.session_id || s.id;
              if (!sId) return "";
              const shortId = typeof sId === 'string' ? (sId.split('_').pop() || sId) : sId;
              
              const sDate = new Date(s.timestamp);
              const formattedDate = sDate.getFullYear() + '-' + String(sDate.getMonth() + 1).padStart(2, '0') + '-' + String(sDate.getDate()).padStart(2, '0');
              
              // Determine display status based natively on infonite_state
              let statusBadge = '';
              let cancelAction = '';
              const iState = s.infonite_state || {};
              const isClosed = iState.is_closed === true;
              let finalStatus = (iState.status_code || iState.status || 'READY').toUpperCase();
              
              if (isClosed || ['CLIENT_CANCELLED', 'SYSTEM_CANCELLED', 'COMPLETED', 'FAILED', 'ERROR'].includes(finalStatus)) {
                  if (finalStatus === 'CLIENT_CANCELLED' || finalStatus === 'SYSTEM_CANCELLED') {
                      statusBadge = `<span class="bg-red-500/10 text-red-600 border border-red-500/10 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest"><i class="fa-solid fa-ban mr-1"></i> Cancelled</span>`;
                  } else if (finalStatus === 'FAILED') {
                      statusBadge = `<span class="bg-red-500/10 text-red-600 border border-red-500/10 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest"><i class="fa-solid fa-circle-xmark mr-1"></i> Failed</span>`;
                  } else if (finalStatus === 'ERROR') {
                      const errMsg = iState.error_message || 'API Error';
                      statusBadge = `<span class="bg-rose-500/10 text-rose-600 border border-rose-500/10 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest" title="${errMsg}"><i class="fa-solid fa-triangle-exclamation mr-1"></i> ${errMsg}</span>`;
                  } else if (finalStatus === 'COMPLETED') {
                      statusBadge = `<span class="bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/10 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest"><i class="fa-solid fa-check mr-1"></i> Completed</span>`;
                  } else {
                      // Fallback for unmapped or custom terminal states
                      const meta = (typeof STATUS_META !== 'undefined' && STATUS_META[finalStatus]) || { name: finalStatus, icon: 'fa-solid fa-circle-info', color: '#94a3b8'};
                      statusBadge = `<span class="border px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest" style="background-color: color-mix(in srgb, ${meta.color} 10%, transparent); color: ${meta.color}; border-color: color-mix(in srgb, ${meta.color} 10%, transparent);"><i class="${meta.icon} mr-1"></i> ${meta.name}</span>`;
                  }
                  
                  cancelAction = `
                      <button onclick="event.stopPropagation(); deleteSession('${sId}', event)" class="text-[8px] text-slate-400 hover:text-red-500 transition-colors uppercase font-bold tracking-widest bg-white hover:bg-red-50 px-2 py-1 rounded border border-black/5 hover:border-red-500/20">
                          <i class="fa-solid fa-trash-can mr-1"></i> Delete
                      </button>
                  `;
              } else {
                  if (iState.date_started) {
                      const now = new Date();
                      const lastPing = iState.ping_date ? new Date(iState.ping_date) : now;
                      const diffSeconds = Math.floor((now - lastPing) / 1000);
                      
                      if (diffSeconds > 10) {
                          statusBadge = `<span class="bg-amber-500/10 text-amber-600 border border-amber-500/10 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest"><i class="fa-solid fa-user-slash mr-1"></i> Inactive</span>`;
                      } else {
                          statusBadge = `<span class="bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/10 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest shadow-[0_0_8px_rgba(var(--primary-rgb),0.2)] animate-pulse"><i class="fa-solid fa-user-clock mr-1"></i> User Active</span>`;
                      }
                  } else if (typeof STATUS_META !== 'undefined' && STATUS_META[finalStatus]) {
                      const meta = STATUS_META[finalStatus];
                      statusBadge = `<span class="border px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest" style="background-color: color-mix(in srgb, ${meta.color} 10%, transparent); color: ${meta.color}; border-color: color-mix(in srgb, ${meta.color} 10%, transparent);"><i class="${meta.icon} mr-1"></i> ${meta.name}</span>`;
                  } else {
                      statusBadge = `<span class="bg-slate-500/10 text-slate-600 border border-slate-500/10 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest"><i class="fa-solid fa-fingerprint mr-1"></i> Waiting</span>`;
                  }
                  
                  cancelAction = `
                      <button onclick="event.stopPropagation(); cancelSession('${sId}')" class="text-[8px] text-slate-400 hover:text-red-500 transition-colors uppercase font-bold tracking-widest bg-white hover:bg-red-50 px-2 py-1 rounded border border-black/5 hover:border-red-500/20">
                          <i class="fa-solid fa-xmark mr-1"></i> Cancel
                      </button>
                  `;
              }

              return `
              <tr class="hover:bg-black/[0.02] transition-colors cursor-pointer group" onclick="restoreSession('${sId}', '${s.widget_url}', '${s.environment_name || ""}')">
                  <td class="p-4 first:pl-6 border-b border-black/5 w-1/3">
                      <div class="flex items-center gap-3">
                          <div class="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-white transition-colors group-hover:shadow-sm shrink-0">
                              <i class="fa-solid fa-folder-open text-xs"></i>
                          </div>
                          <div class="flex flex-col overflow-hidden text-ellipsis whitespace-nowrap">
                              <span class="font-mono text-xs font-bold text-slate-900 overflow-hidden text-ellipsis">${shortId}</span>
                              <span class="text-[9px] font-bold text-slate-500 uppercase tracking-tight mt-0.5 overflow-hidden text-ellipsis">${s.customer_id || "test-customer-1234"}</span>
                          </div>
                      </div>
                  </td>
                  <td class="p-4 hidden md:table-cell border-b border-black/5">
                      <div class="flex flex-col">
                          <span class="text-[10px] font-bold text-slate-900">${formattedDate}</span>
                          <span class="text-[9px] text-slate-400 font-mono">${timeAgo(s.timestamp)}</span>
                      </div>
                  </td>
                  <td class="p-4 border-b border-black/5">
                      ${statusBadge}
                  </td>
                  <td class="p-4 last:pr-6 text-right border-b border-black/5">
                      <div class="flex justify-end items-center gap-2">
                          <button onclick="event.stopPropagation(); navigator.clipboard.writeText('${s.widget_url}').then(() => { const i = this.querySelector('i'); const old = i.className; i.className='fa-solid fa-check text-[var(--primary)]'; setTimeout(()=>i.className=old, 1500); })" class="text-[8px] text-slate-400 hover:text-[var(--primary)] transition-colors uppercase font-bold tracking-widest bg-white hover:bg-[var(--primary)]/5 px-2 py-1 rounded border border-black/5 hover:border-[var(--primary)]/20" title="Copy Session Link">
                              <i class="fa-solid fa-link mr-1"></i> Copy
                          </button>
                          ${cancelAction}
                          <i class="fa-solid fa-chevron-right text-[10px] text-slate-300 group-hover:text-[var(--primary)] transition-colors ml-1"></i>
                      </div>
                  </td>
              </tr>
          `;
          })
          .join("");
      }

      function cancelSession(sessionId) {
          showConfirmModal(
              "Cancel Session",
              `Are you sure you want to cancel session ${sessionId}?`,
              async () => {
                  try {
                      const config = getConfig();
                      const managerUrl = `${config.widgetUrl}${MANAGER_ENDPOINT}`;
                      
                      // Call API to cancel the session
                      const response = await fetch(`${managerUrl}/${sessionId}/cancel`, {
                          method: 'PATCH',
                          headers: { 
                              "X-APP-SECRET": config.secret,
                              "Content-Type": "application/json"
                          },
                          body: JSON.stringify({ reason: "Cancelled by manager" })
                      });
                      
                      if (!response.ok) {
                          const errorMsg = await parseApiError(response);
                          alert(`Failed to cancel session: ${errorMsg}`);
                          return;
                      }
                      
                      // Trigger a fresh sync from the API instead of manually patching local fields
                      let sessions = getSessions();
                      const idx = sessions.findIndex(s => s.session_id === sessionId);
                      if (idx !== -1) {
                          // Unset older redundant properties if they exist
                          delete sessions[idx].status;
                          delete sessions[idx].is_closed;
                          delete sessions[idx].completed;
                          
                          await syncSessionStatus(sessions[idx]);
                          localStorage.setItem(getSessionStorageKey(), JSON.stringify(sessions));
                          renderHistory();
                      }
                      
                      // Also update detail view UI if the user cancels from within the view logic
                      const cancelBtn = document.getElementById("cancelSessionBtn");
                      if (cancelBtn) cancelBtn.classList.add("hidden");
                      
                  } catch (e) {
                      console.error("Cancel API error", e);
                      alert("Server connection failed while attempting to cancel.");
                  }
              }
          );
      }

      function promptCancelSession() {
          if (currentSessionId) {
              cancelSession(currentSessionId).then(() => {
                  if(getSessions().find(s => s.session_id === currentSessionId)?.status === 'CLIENT_CANCELLED') {
                      fetchResults(currentSessionId, 'CLIENT_CANCELLED');
                  }
              });
          }
      }

       function restoreSession(sessionId, widgetUrl, envName, immediate = true) {
        closeNewLeadModal(); // Ensure dialog is closed if they were generating
        document.getElementById("dashboardView").classList.add("hidden");
        document.getElementById("sessionMainView").classList.remove("hidden");
        stopPolling();
        document.getElementById("errorBox").classList.add("hidden"); // Hide error box on restore
        document
          .getElementById("activeSessionState")
          .classList.remove("hidden");
        document.getElementById("monitoringSection").classList.remove("hidden");
        document.getElementById("resultsDashboard").classList.add("hidden");

        document.getElementById("resultUrl").value = widgetUrl;
        
        const openLinkBtn = document.getElementById("openLinkBtn");
        // On restore, default to modal behavior for Launch button
        openLinkBtn.onclick = openWidgetModal;

        const sessionDisplay = document.getElementById("monitoringSessionId");
        const envDisplay = document.getElementById("monitoringEnvName");
        const resultIdDisplay = document.getElementById("resultSessionId");
        const resultEnvDisplay = document.getElementById("resultEnvName");
        
        const finalEnvName = envName || getConfig().name || "Unknown";

        if(sessionDisplay) sessionDisplay.textContent = `ID: ${sessionId}`;
        if(envDisplay) envDisplay.textContent = `ENV: ${finalEnvName}`;
        if(resultIdDisplay) resultIdDisplay.textContent = sessionId;
        if(resultEnvDisplay) resultEnvDisplay.textContent = finalEnvName;

        startPolling(sessionId, immediate);
        
        // Check session local status to determine logic
        const localSession = getSessions().find(s => s.session_id === sessionId);
        const cancelBtn = document.getElementById("cancelSessionBtn");
        
        if (localSession?.infonite_state?.is_closed) {
            // It's already done (or cancelled), bypass polling and force final render
            stopPolling();
            if (cancelBtn) cancelBtn.classList.add("hidden");
            // If it's merely completed, try to fetch results. If it's cancelled, fetch specific cancelled UI state.
            const terminalStatus = localSession.infonite_state.status_code || localSession.infonite_state.status || 'COMPLETED';
            fetchResults(sessionId, terminalStatus);
        } else {
            // Only show delete/cancel button if it's pending/active
            if (cancelBtn) cancelBtn.classList.remove("hidden");
            if (!window.location.hash.includes(`session=${sessionId}`)) {
                window.location.hash = `#/citizen-data?session=${sessionId}`;
            }
        }
      }

      function timeAgo(date) {
        const seconds = Math.floor((new Date() - new Date(date)) / 1000);
        if (seconds < 60) return "Now";
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h`;
        return new Date(date).toLocaleDateString();
      }

      // --- FUNCIONES PRINCIPALES ---

      function toggleCompletionUrl() {
        const mode = document.getElementById('completionModeSelect').value;
        const container = document.getElementById('completionUrlContainer');
        if (mode === 'redirect') {
            container.classList.remove('hidden');
        } else {
            container.classList.add('hidden');
        }
      }

      async function parseApiError(response) {
        let errorDetail = null;
        try {
            const errorData = await response.json();
            errorDetail = errorData.detail;
        } catch (e) {
            // Fallback to text if not JSON
            try {
               errorDetail = await response.text();
            } catch(e2) {}
        }
        
        console.warn("Parsed API Error Detail:", errorDetail);

        if (errorDetail === "flow_not_enabled_for_this_app") {
            return "This application does not have the requested flow enabled. Contact support or check configuration.";
        }
        if (errorDetail === "invalid_application_secret") {
            return "Invalid credentials: The configured 'Secret' is incorrect.";
        }
        if (errorDetail === "session_not_found") {
            let hashId = "";
            if (window.location.hash.includes('?')) {
                const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
                hashId = urlParams.get('session') || "";
            }
            return `Session ${hashId ? `"${hashId}" ` : ""}is no longer available or belongs to another configuration. It is not accessible.`;
        }
        
        // Return original detail or generic
        return errorDetail || `Unknown Error (${response.status})`;
      }

      async function generateLink() {
        // Collect Features
        const checkboxes = document.querySelectorAll(
          ".feature-checkbox:checked"
        );
        const selectedFeatures = Array.from(checkboxes).map((cb) => cb.value);

        if (selectedFeatures.length === 0) {
          showError("Select at least one module.");
          return;
        }

          if (!isAppHealthy()) {
            showError("API Connection Offline. Please check your network or App Secret configuration.");
            return;
        }

        document.getElementById("errorBox").classList.add("hidden");

        // Prepare Request using Central Configuration
        const requestBody = JSON.parse(JSON.stringify(INFONITE_FLOWS.es_citizen_data.defaultPayload));
        const overrideId = document.getElementById("customerIdInput")?.value?.trim();
        requestBody.customer_id = overrideId || `${INFONITE_FLOWS.es_citizen_data.id}-test-${Math.random().toString(36).substr(2, 10)}`;
        requestBody.settings.executions_features = selectedFeatures;

        const completionMode = document.getElementById("completionModeSelect")?.value || "redirect";
        requestBody.settings.completion_mode = completionMode;
        if (completionMode === "redirect") {
            const userCompletionUrl = document.getElementById("completionUrlInput")?.value;
            if (userCompletionUrl) {
                requestBody.settings.completion_url = userCompletionUrl;
            }
        } else {
            delete requestBody.settings.completion_url;
        }

        // Loading State
        const submitBtns = [document.getElementById("generateBtnDesktop"), document.getElementById("generateBtnMobile")];
        submitBtns.forEach(btn => { 
            if(btn) { 
                btn.disabled = true; 
                btn.classList.add("opacity-75", "cursor-not-allowed"); 
                // Swap icon to spinner safely
                const icon = btn.querySelector('i.fa-solid');
                if (icon) {
                    icon.dataset.origClass = icon.className;
                    icon.className = "fa-solid fa-circle-notch fa-spin text-[10px]";
                }
            }
        });

        try {
          const config = getConfig();
          const managerUrl = `${config.widgetUrl}${MANAGER_ENDPOINT}`;
          currentSessionId = null;

          // 1. INIT SESSION
          console.log("Sending init request to:", `${managerUrl}/init`);
          const response = await fetch(`${managerUrl}/init`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-APP-SECRET": config.secret,
            },
            body: JSON.stringify(requestBody),
          });

          if (!response.ok) {
            const errorMessage = await parseApiError(response);
            console.error("API Error Response:", errorMessage);
            throw new Error(errorMessage);
          }

          const data = await response.json();
          console.log("Init Response Data:", data);

          if (!data.widget_url || !data.session_id) {
            throw new Error(
              "Invalid server response: Critical fields missing."
            );
          }

          // 2. SAVE & SHOW LINK
          saveSession({
            session_id: data.session_id,
            widget_url: data.widget_url,
            customer_id: requestBody.customer_id
          });

          document.getElementById("resultUrl").value = data.widget_url;
          
          const openLinkBtn = document.getElementById("openLinkBtn");
          if (completionMode === "redirect") {
              // Behave as a normal link (new tab)
              openLinkBtn.onclick = function() {
                  window.open(data.widget_url, "_blank");
              };
          } else {
              // Behave as a modal trigger
              openLinkBtn.onclick = openWidgetModal;
          }

          // 3. FINISH
          closeNewLeadModal();
          renderHistory();
        } catch (error) {
          console.error("Error in generateLink:", error);
          let userFriendlyMessage = error.message;

          if (error.message === "Failed to fetch" || error.message.includes("NetworkError")) {
              userFriendlyMessage = "Connection error. Check that the widget and client services are operational and there are no network blockers.";
          }
          
          showError(userFriendlyMessage);
        } finally {
          submitBtns.forEach(btn => { 
              if(btn) { 
                  btn.disabled = false; 
                  btn.classList.remove("opacity-75", "cursor-not-allowed"); 
                  const icon = btn.querySelector('i.fa-solid');
                  if (icon && icon.dataset.origClass) {
                      icon.className = icon.dataset.origClass;
                  }
              }
          });
        }
      }

      // Initialize History on Load
      document.addEventListener("DOMContentLoaded", renderHistory);

      let pollingAttempts = 0;
      const MAX_POLLING_ATTEMPTS = 200; // ~10 minutes

      function startPolling(sessionId, immediate = false) {
          console.log("Starting polling for session:", sessionId, "Immediate:", immediate);
        pollingAttempts = 0;
        
        // Reset State
        isSessionStarted = false;
        lastPingDate = null;
        
        // Reset Monitoring UI
        resetMonitoringUI();

        // Optional: listen for post_message events if the widget is in an iframe
        // and its completion mode happens to be post_message
        const messageListener = async (event) => {
             // In a real scenario, you'd check event.origin against config.widgetUrl
             if (event.data) {
                 if (event.data.type === 'engine_completed' || event.data.event === "es_citizen_data:ended") {
                      // Try to close widget modal if open
                      closeWidgetModal();
                      stopPolling();
                      window.removeEventListener('message', messageListener);
                      
                      // Perform final explicit poll to get definitive status from tracking
                      const config = getConfig();
                      const managerUrl = `${config.widgetUrl}${MANAGER_ENDPOINT}`;
                      
                      try {
                          const response = await fetch(`${managerUrl}/${sessionId}`, {
                              method: "GET",
                              headers: { "X-APP-SECRET": config.secret }
                          });
                          
                          if (response.ok) {
                              const statusData = await response.json();
                              const finalStatus = statusData.status_code || 'COMPLETED';
                              currentSessionId = sessionId;
                              fetchResults(sessionId, finalStatus, statusData.session_token);
                          } else {
                              // fallback if check fails
                              currentSessionId = sessionId;
                              fetchResults(sessionId, 'COMPLETED');
                          }
                      } catch (e) {
                          console.error("Error fetching final status", e);
                          currentSessionId = sessionId;
                          fetchResults(sessionId, 'COMPLETED');
                      }
                 }
             }
        };
        window.addEventListener('message', messageListener);

        const pollTask = async () => {
          pollingAttempts++;

          if (pollingAttempts > MAX_POLLING_ATTEMPTS) {
            stopPolling();
            showError(
              "Maximum wait time reached. Please try again."
            );
            return;
          }

          try {
            const config = getConfig();
            const managerUrl = `${config.widgetUrl}${MANAGER_ENDPOINT}`;

            // Check Status
            const response = await fetch(`${managerUrl}/${sessionId}`, {
              method: "GET",
              headers: { "X-APP-SECRET": config.secret },
            });

            if (!response.ok) {
              if (response.status === 401 || response.status === 403 || response.status === 404) {
                  const errorMsg = await parseApiError(response);
                  if (errorMsg.includes("Credenciales") || errorMsg.includes("flujo solicitado") || errorMsg.includes("No es accesible")) {
                      stopPolling();
                      showError(errorMsg);
                      
                      // Check for config mismatch suggestion
                      let suggestion = null;
                      const session = getSessions().find(s => s.session_id === sessionId);
                      if (session) {
                          const currentConfig = getConfig();
                          const allConfigs = getStorageData().list;
                          let targetConfig = null;
                          
                          // Smart Match
                          if (session.config_id && session.config_id !== currentConfig.id) {
                               targetConfig = allConfigs.find(c => c.id === session.config_id);
                          } else if (session.environment_name && session.environment_name !== currentConfig.name) {
                               // Fallback by name for old sessions
                               targetConfig = allConfigs.find(c => c.name === session.environment_name);
                          }
                          
                          if (targetConfig) {
                              suggestion = {
                                  id: targetConfig.id,
                                  name: targetConfig.name
                              };
                          }
                      }

                      showMonitoringError(errorMsg, suggestion); 
                      return;
                  }
              }
              console.warn(`Polling response not OK: ${response.status}`);
              return;
            }

            const statusData = await response.json();
            console.log("Poll Status:", statusData);

            if (statusData.is_closed === true) {
              closeWidgetModal();
              stopPolling();
              currentSessionId = sessionId;
              fetchResults(sessionId, statusData.status_code, statusData.session_token);
              return;
            }

            // User Activity Check
            if (statusData.date_started) {
                isSessionStarted = true;
                if (statusData.ping_date) {
                    lastPingDate = new Date(statusData.ping_date);
                }
                // If ticker not running, start it to update UI every second
                if (!monitoringTicker) {
                    startMonitoringTicker();
                }
            } else {
                 isSessionStarted = false;
                 // Ensure UI shows "waiting" state if not started
                 const title = document.getElementById("monitoringTitle");
                 if (title && title.textContent !== "Escaneando actividad...") {
                      updateMonitoringUIState("WAITING");
                 }
            }
          } catch (e) {
            console.warn("Polling error (silent):", e);
          }
        };

        if (immediate) {
            pollTask();
        }

        pollingInterval = setInterval(pollTask, 3000); // Cada 3 segundos
      }

      function stopPolling() {
        if (pollingInterval) {
          clearInterval(pollingInterval);
          pollingInterval = null;
        }
        stopMonitoringTicker();
      }
      
      function startMonitoringTicker() {
          if (monitoringTicker) clearInterval(monitoringTicker);
          updateActivityUI(); // Immediate update
          monitoringTicker = setInterval(updateActivityUI, 1000);
      }
      
      function stopMonitoringTicker() {
          if (monitoringTicker) {
              clearInterval(monitoringTicker);
              monitoringTicker = null;
          }
      }
      
      function updateActivityUI() {
          if (!isSessionStarted) return;
          
          const now = new Date();
          const lastPing = lastPingDate || now; // If no ping yet, assume active
          const diffSeconds = Math.floor((now - lastPing) / 1000);
          
          if (diffSeconds > 10) {
              updateMonitoringUIState("INACTIVE", diffSeconds);
          } else {
              updateMonitoringUIState("CONNECTED");
          }
      }
      
      function formatDuration(totalSeconds) {
          if (totalSeconds < 60) return `${totalSeconds} seconds`;
          
          const hours = Math.floor(totalSeconds / 3600);
          const minutes = Math.floor((totalSeconds % 3600) / 60);
          const seconds = totalSeconds % 60;
          
          const parts = [];
          
          if (hours > 0) {
              parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
          }
          
          if (minutes > 0) {
              parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
          }
          
          if (hours === 0 && seconds > 0) {
              parts.push(`${seconds} ${seconds === 1 ? 'second' : 'seconds'}`);
          }
          
          return parts.join(' and ');
      }
      
      function updateMonitoringUIState(state, seconds = 0) {
          const title = document.getElementById("monitoringTitle");
          const desc = document.getElementById("monitoringDesc");
          const icon = document.getElementById("monitoringIcon");
          
          if (!title || !desc || !icon) return;
          
          if (state === "CONNECTED") {
             if (title.textContent !== "User Connected") {
                title.textContent = "User Connected";
                title.className = "text-[var(--primary)] font-black text-xl tracking-tight mb-2";
                
                desc.innerHTML = `The user is interacting with the widget.<br><span class="text-[9px] opacity-70">Active synchronization</span>`;
                desc.className = "text-slate-600 font-medium text-[11px] max-w-sm mx-auto";
                
                icon.className = "fa-solid fa-user-clock text-xl text-[var(--primary)] drop-shadow-[0_0_6px_var(--primary)] animate-pulse";
             }
          } else if (state === "INACTIVE") {
              // Always update text for counter
              const timeString = formatDuration(seconds);
              title.textContent = "User Inactive";
              title.className = "text-amber-500 font-black text-xl tracking-tight mb-2";
              
              desc.innerHTML = `User not responding for <span class="font-mono font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">${timeString}</span>`;
              desc.className = "text-slate-500 text-[11px] max-w-sm mx-auto";
              
              icon.className = "fa-solid fa-user-slash text-xl text-amber-500 opacity-60";
          } else if (state === "WAITING") {
              title.textContent = "Scanning activity...";
              title.className = "text-slate-900 font-black text-xl tracking-tight mb-2";
              
              desc.textContent = "System is synchronized. Complete the flow on the user link to dump the results.";
              desc.className = "text-slate-400 text-[11px] max-w-sm mx-auto";
              
              icon.className = "fa-solid fa-fingerprint text-xl text-[var(--primary)] drop-shadow-[0_0_6px_var(--primary)]";
          }
      }

      async function fetchResults(sessionId, status, sessionToken = null) {
        try {
          const config = getConfig();
          const managerUrl = `${config.widgetUrl}${MANAGER_ENDPOINT}`;
          currentSessionId = sessionId;

          const response = await fetch(`${managerUrl}/${sessionId}/results`, {
            method: "GET",
            headers: {
              "X-APP-SECRET": config.secret,
            },
          });

          if (!response.ok) {
            const errorMsg = await parseApiError(response);
            
            if (errorMsg.includes("Credenciales") || errorMsg.includes("flujo solicitado")) {
                 showError(errorMsg);
            } else {
                 console.warn("Results not available for status:", status);
            }
            
            renderResults({}, status);
            return;
          }

          const resultData = await response.json();
          
          // Auto-save external session to history if successful
          const sessions = getSessions();
          if (!sessions.find(s => s.session_id === sessionId)) {
              // Construct URL using token if available
              let widgetUrl = config.widgetUrl; // fallback
              if (sessionToken) {
                  const baseUrl = config.widgetUrl.includes("-dev") 
                      ? "https://flows-dev.infonite.tech"
                      : "https://flows.infonite.tech";
                  widgetUrl = `${baseUrl}/?session_token=${sessionToken}`;
              }

              saveSession({
                  session_id: sessionId,
                  widget_url: widgetUrl, 
                  environment_name: config.name, // If we fetched it, it matches current config
                  timestamp: new Date().toISOString()
              });
              console.log("External session auto-saved:", sessionId);
              
              // FORCE UPDATE UI FOR NEW EXTERNAL SESSION
               document.getElementById("resultUrl").value = widgetUrl;
               
               const openLinkBtn = document.getElementById("openLinkBtn");
               // Default to modal for external session restoration if no mode is known, 
               // though they usually won't click "Launch" here anyway.
               openLinkBtn.onclick = openWidgetModal;
               
               const finalEnvName = config.name || "Unknown";
               document.getElementById("monitoringSessionId").textContent = `ID: ${sessionId}`;
               document.getElementById("monitoringEnvName").textContent = `ENV: ${finalEnvName}`;
               document.getElementById("resultSessionId").textContent = sessionId;
               document.getElementById("resultEnvName").textContent = finalEnvName;
          }

          renderResults(resultData, status);
        } catch (error) {
          console.error("fetchResults error:", error);
          renderResults({}, status); // Show dashboard with status even if results fail
        }
      }

      let currentResultsData = null;
      function renderResults(data, status = "COMPLETED") {
        console.log("Rendering results with data:", data, "Status:", status);
        currentResultsData = data;
        
        // Switch UI views
        
        document.getElementById("activeSessionState").classList.remove("hidden");
        document.getElementById("monitoringSection").classList.add("hidden");
        const dashboard = document.getElementById("resultsDashboard");
        dashboard.classList.remove("hidden");
        dashboard.classList.add("fade-in");

        // --- Update Banner Based on Status ---
        const banner = document.getElementById("statusBanner");
        const iconBox = document.getElementById("statusIconBox");
        const icon = document.getElementById("statusIcon");
        const title = document.getElementById("statusTitle");
        const desc = document.getElementById("statusDesc");

        const statusMeta = typeof STATUS_META !== 'undefined' && STATUS_META[status] 
            ? STATUS_META[status] 
            : { name: 'Unknown Status', icon: 'fa-solid fa-circle-question', color: 'var(--c60)', description: `Status code: ${status}` };

        if (status === "COMPLETED") {
          banner.className = "rounded-2xl p-4 flex items-center gap-4 transition-colors duration-500 bg-white shadow-sm";
          banner.style.background = "";
          banner.style.border = "1px solid rgba(var(--banner-rgb),0.15)";
          iconBox.className = "w-10 h-10 rounded-xl flex items-center justify-center shrink-0";
          iconBox.style.background = "var(--banner-color)";
          iconBox.style.color = "var(--banner-contrast)";
          icon.className = statusMeta.icon + " text-xl";
          title.textContent = "Capture Finished";
          title.style.color = "";
          title.className = "font-black text-sm text-slate-900";
          desc.textContent = "Security protocol completed";
          desc.className = "text-[9px] font-medium uppercase tracking-widest text-slate-400";
          desc.style.color = "";
          desc.style.opacity = "";
        } else {
          // Dynamic rendering for all other statuses via repo properties
          banner.className = "rounded-2xl p-4 flex items-center gap-4 transition-colors duration-500 bg-white shadow-sm";
          banner.style.background = "";
          banner.style.border = `1px solid color-mix(in srgb, ${statusMeta.color} 30%, transparent)`;
          
          iconBox.className = "w-10 h-10 rounded-xl flex items-center justify-center shrink-0";
          iconBox.style.background = `color-mix(in srgb, ${statusMeta.color} 15%, transparent)`;
          iconBox.style.color = statusMeta.color;
          icon.className = statusMeta.icon + " text-xl";
          
          title.textContent = statusMeta.name;
          title.style.color = statusMeta.color;
          title.className = "font-black text-sm";
          
          desc.textContent = statusMeta.description;
          desc.className = "text-[9px] font-medium uppercase tracking-widest";
          desc.style.color = `color-mix(in srgb, ${statusMeta.color} 80%, black)`;
        }
        
        // --- Features Tags (Independent Section) ---
        const featureSection = document.getElementById("featuresSection");
        if (featureSection) {
             // Path found in real data example: data.consent.accepted_features
             let features = (data.consent?.accepted_features) || [];
             
             if (!Array.isArray(features)) {
                 features = typeof features === 'string' ? features.split(',') : [];
             }
             
             // Feature Mapping (Must match selection menu)
             const featureMap = {
                 "customer_information_read": { label: "Info Cliente", icon: "fa-circle-check" },
                 "citizen_data": { label: "Carpeta Ciudadana", icon: "fa-building-columns" },
                 "driver_data": { label: "Datos DGT", icon: "fa-car-side" },
                 "labor_check": { label: "Vida Laboral", icon: "fa-briefcase" },
                 "academic_data": { label: "Datos Académicos", icon: "fa-graduation-cap" }
             };

            if (features.length > 0) {
                 featureSection.innerHTML = features.map(rawF => {
                    const f = (rawF || "").toString().trim();
                    const info = featureMap[f] || { label: f, icon: "fa-check" };
                    return `
                    <div class="flex items-center gap-2 bg-white/80 border border-black/5 px-2.5 py-1.5 rounded-xl shadow-sm">
                        <i class="fa-solid ${info.icon} text-[10px] text-[var(--primary)]"></i>
                        <span class="text-[9px] font-extrabold text-slate-800 uppercase tracking-tight">${info.label}</span>
                    </div>`;
                 }).join("");
            } else {
                 featureSection.innerHTML = "";
            }
        }



        // --- 1. Customer Profile Rendering ---
        const profile = data.data?.customer?.profile || {};
        const ids = profile.identification_numbers || [];
        
        // Find primary ID (nie/nif)
        const primaryIdObj = ids.find(id => id.type.includes("nie") || id.type.includes("nif")) || ids[0] || {};
        const nie = primaryIdObj.value || "N/A";
        const ssn = ids.find((id) => id.type.includes("ssn"))?.value || null;

        // Validation & Expiration Helper
        const isValidated = primaryIdObj.validated === true;
        const validUntil = primaryIdObj.valid_until || null; // Optional field
        let expirationHtml = "";
        
        if (validUntil) {
            const expiryDate = new Date(validUntil);
            const isExpired = expiryDate < new Date();
            expirationHtml = `
                <div class="flex items-center gap-1.5 px-2 py-1 rounded-lg ${isExpired ? 'bg-red-500/10 text-red-500 border-red-500/10' : 'bg[rgba(var(--primary-rgb),0.10)] text-[var(--primary)] border[rgba(var(--primary-rgb),0.10)]'} border text-[8px] font-black uppercase tracking-tighter">
                    <i class="fa-solid ${isExpired ? 'fa-calendar-xmark' : 'fa-calendar-check'}"></i>
                    ${isExpired ? 'Expired' : 'Valid'} (${validUntil})
                </div>
            `;
        } else {
            expirationHtml = `
                <div class="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-500/10 text-slate-500 border-slate-500/10 border text-[8px] font-black uppercase tracking-tighter">
                    <i class="fa-solid fa-calendar-minus"></i>
                    Unknown Expiration
                </div>
            `;
        }

        const name = profile.name || "-";
        const surname = profile.name_extra || "";
        const email = profile.emails?.[0] || "-";
        const phone = profile.phones?.[0] || "-";

        let customerHtml = `
                <div class="grid grid-cols-1 md:grid-cols-2 gap-8 text-[11px]">
                    <!-- Column 1: Primary Identity & Geography -->
                    <div class="space-y-4">
                        <!-- Stylized Identity Box -->
                        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3 shadow-lg text-white">
                            <div class="flex justify-between items-center">
                                <span class="text-[8px] font-bold uppercase tracking-widest text-slate-400">Official Document</span>
                                <div class="flex items-center gap-1.5 px-2 py-0.5 rounded-full ${isValidated ? 'bg-[var(--primary)]/20 text-[var(--primary)]' : 'bg-amber-500/20 text-amber-400'} text-[8px] font-black uppercase">
                                    <i class="fa-solid ${isValidated ? 'fa-circle-check' : 'fa-circle-exclamation'}"></i>
                                    ${isValidated ? 'Validated' : 'Pending'}
                                </div>
                            </div>
                            <div class="flex justify-between items-end">
                                <span class="font-mono text-lg font-black tracking-tighter text-white">${nie}</span>
                                ${expirationHtml}
                            </div>
                        </div>

                        <div class="space-y-2.5 px-1">
                            <div class="flex justify-between border-b border-black/5 pb-2">
                                <span class="text-slate-400 font-medium">Full Name</span>
                                <span class="font-bold text-slate-900 uppercase tracking-tight">${name} ${surname}</span>
                            </div>
                            <div class="flex justify-between border-b border-black/5 pb-2">
                                <span class="text-slate-400 font-medium">Nationality</span>
                                <span class="font-bold text-slate-900 flex items-center gap-2">
                                    ${
                                      profile.nationality_country
                                        ? `
                                        <img src="https://flagcdn.com/16x12/${profile.nationality_country.toLowerCase()}.png" 
                                             onerror="this.src='https://flagcdn.com/16x12/un.png'" 
                                             class="rounded-sm opacity-90 shadow-sm"
                                             alt="flag">
                                        ${profile.nationality_country}
                                    `
                                        : "N/A"
                                    }
                                </span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-slate-400 font-medium">Residence Country</span>
                                <span class="font-bold text-slate-900 flex items-center gap-2">
                                    ${
                                      profile.residence_country
                                        ? `
                                        <img src="https://flagcdn.com/16x12/${profile.residence_country.toLowerCase()}.png" 
                                             onerror="this.src='https://flagcdn.com/16x12/un.png'" 
                                             class="rounded-sm opacity-90 shadow-sm"
                                             alt="flag">
                                        ${profile.residence_country}
                                    `
                                        : "N/A"
                                    }
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Column 2: Contact, Personal & System -->
                    <div class="space-y-2.5">
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
                            <div class="flex justify-between border-b border-black/5 pb-2">
                                <span class="text-slate-400 font-medium">Phone</span>
                                <span class="text-slate-900">${phone}</span>
                            </div>
                            <div class="flex justify-between border-b border-black/5 pb-2">
                                <span class="text-slate-400 font-medium">Birth Date</span>
                                <span class="text-slate-900">${
                                  profile.birth_date || "-"
                                }</span>
                            </div>
                            <div class="flex justify-between border-b border-black/5 pb-2 sm:col-span-2">
                                <span class="text-slate-400 font-medium">Email</span>
                                <span class="text-slate-900 font-medium">${email}</span>
                            </div>
                        </div>

                        <div class="bg-black/5 p-3 rounded-xl border border-black/5 mt-2">
                             <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <p class="text-[8px] text-slate-400 font-bold uppercase tracking-widest mb-0.5">Gender</p>
                                    <p class="text-[10px] font-black uppercase text-slate-700">${
                                      profile.gender || "-"
                                    }</p>
                                </div>
                                <div>
                                    <p class="text-[8px] text-slate-400 font-bold uppercase tracking-widest mb-0.5">Civil Status</p>
                                    <p class="text-[10px] font-black uppercase text-slate-700">${
                                      profile.civil_status || "UNKNOWN"
                                    }</p>
                                </div>
                                ${
                                  ssn
                                    ? `
                                <div class="col-span-2 pt-1 border-t border-black/5">
                                    <p class="text-[8px] text-slate-400 font-bold uppercase tracking-widest mb-0.5">Social Security (SSN)</p>
                                    <p class="text-[10px] font-mono font-bold text-[var(--primary)]">${ssn}</p>
                                </div>`
                                    : ""
                                }
                             </div>
                        </div>
                    </div>
                </div>
            `;

        // --- 2. Driver Data Rendering ---
        const driver = data.data?.driver?.data || {};
        const licenses = driver.licences || driver.licenses || [];
        const movements = driver.point_movements || [];

        let licensesHtml =
          licenses.length > 0
            ? licenses
                .map(
                  (l) =>
                    `<span class="bg[rgba(var(--primary-rgb),0.10)] text-[var(--primary)] px-2 py-1 rounded-lg text-[10px] font-black border border[rgba(var(--primary-rgb),0.20)] uppercase tracking-tighter" title="Granted: ${
                      l.date || "N/A"
                    } | Expires: ${l.expires || l.expiry_date || "N/A"}">${
                      l.category || l.class || "?"
                    } <span class="text-[8px] opacity-60 ml-1">(${
                      l.date || "N/A"
                    })</span></span>`
                )
                .join(" ")
            : '<span class="text-slate-600 italic">No licenses</span>';

        const points =
          driver.point_balance !== undefined ? driver.point_balance : "-";

        let driverHtml = `
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                    <!-- Summary Stats -->
                    <div class="lg:col-span-1 space-y-4">
                        <div class="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex flex-col items-center justify-center text-center shadow-lg text-white">
                            <span class="font-black uppercase text-[8px] tracking-[0.2em] mb-2 text-slate-400">Total Points Balance</span>
                            <div class="flex items-center gap-3">
                                <span class="text-4xl font-black font-mono ${
                                  points > 0 ? "text-[var(--primary)]" : "text-red-500"
                                }">${points}</span>
                                <i class="fa-solid fa-bolt text-xl animate-pulse ${
                                  points > 0 ? "text-[var(--primary)]" : "text-red-500"
                                }"></i>
                            </div>
                        </div>
                        
                        <div class="space-y-3">
                            <div class="flex justify-between items-center border-b border-black/5 pb-2">
                                <span class="text-slate-400 font-medium">Permissions</span>
                                <div class="flex gap-1 flex-wrap justify-end">${licensesHtml}</div>
                            </div>
                            <div class="flex justify-between text-[10px]">
                                <span class="text-slate-400">Dangerous Goods</span>
                                <span class="font-black ${
                                  driver.dangerous_goods_authorized
                                    ? "text-[var(--primary)]"
                                    : "text-slate-400"
                                } uppercase">
                                    ${
                                      driver.dangerous_goods_authorized
                                        ? "YES"
                                        : "NO"
                                    }
                                </span>
                            </div>
                             <div class="flex justify-between text-[10px]">
                                <span class="text-slate-400">School Transport</span>
                                <span class="font-black ${
                                  driver.school_transport_authorized
                                    ? "text-[var(--primary)]"
                                    : "text-slate-400"
                                } uppercase">
                                    ${
                                      driver.school_transport_authorized
                                        ? "YES"
                                        : "NO"
                                    }
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Point Movements Table -->
                    <div class="lg:col-span-2">
                        <h5 class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <i class="fa-solid fa-clock-rotate-left"></i> Movement History
                        </h5>
                        <div class="overflow-hidden rounded-xl border border-black/5 bg-black/[0.01]">
                            <table class="w-full text-left border-collapse">
                                <thead>
                                    <tr class="bg-black/5 text-[8px] font-black uppercase tracking-widest text-slate-500">
                                        <th class="px-3 py-2">Date</th>
                                        <th class="px-3 py-2">Concept / Infraction</th>
                                        <th class="px-3 py-2 text-center">Variation</th>
                                        <th class="px-3 py-2 text-right">Balance</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-black/5">
                                    ${
                                      movements.length > 0
                                        ? movements
                                            .map(
                                              (m) => `
                                        <tr class="hover:bg-black/5 transition-colors">
                                            <td class="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">${
                                              m.date || m.effective_date || "-"
                                            }</td>
                                            <td class="px-3 py-2.5">
                                                <div class="font-bold text-slate-900 leading-tight">${
                                                  m.description
                                                }</div>
                                                ${
                                                  m.infraction_date
                                                    ? `<div class="text-[8px] text-slate-400 mt-0.5">Inf: ${
                                                        m.infraction_date
                                                      } | Ref: ${
                                                        m.infraction_reference ||
                                                        "-"
                                                      }</div>`
                                                    : ""
                                                }
                                            </td>
                                            <td class="px-3 py-2.5 text-center">
                                                <span class="font-mono font-black ${
                                                  m.points_delta > 0
                                                    ? "text-[var(--primary)]"
                                                    : "text-amber-600"
                                                }">
                                                    ${
                                                      m.points_delta > 0
                                                        ? "+"
                                                        : ""
                                                    }${m.points_delta}
                                                </span>
                                            </td>
                                            <td class="px-3 py-2.5 text-right font-mono font-bold text-slate-900">${
                                              m.balance_after
                                            }</td>
                                        </tr>
                                    `
                                            )
                                            .join("")
                                        : `
                                        <tr>
                                            <td colspan="4" class="px-3 py-8 text-center text-[10px] text-slate-400 italic">No recent movements recorded</td>
                                        </tr>
                                    `
                                    }
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Vehicles Section -->
                <div class="mt-6 border-t border-black/5 pt-6">
                    <h5 class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <i class="fa-solid fa-car"></i> Registered Vehicles
                    </h5>
                    ${
                      (data.data?.driver?.vehicles || []).length > 0
                        ? `<div class="grid grid-cols-1 gap-4">
                            ${(data.data?.driver?.vehicles || [])
                              .map((v) => {
                                const rawBadge = v.emission_class || "";
                                // Parse "ES:B" -> "b"
                                const badgeLabel = rawBadge.includes(":") ? rawBadge.split(":")[1].toLowerCase() : rawBadge.toLowerCase();
                                const badgeUrl = `https://estaticos.redsara.es/carpetaciudadana/3.8-ccfront//img/nuevaCarpeta/imagenes/etiqueta-ambiental-${badgeLabel}.png`;
                                
                                const isInsured = v.insurance?.is_active === true;
                                const brandSlug = (v.make || "").toLowerCase().replace(/[^a-z0-9]/g, '');
                                const brandLogoUrl = `https://cdn.simpleicons.org/${brandSlug}`;
                                
                                return `
                                <div class="bg-black/[0.015] border border-black/5 rounded-xl p-4 md:p-5 flex flex-col md:flex-row items-start gap-5 hover:bg-black/5 transition-colors group">
                                    <div class="flex items-center gap-4 w-full md:w-auto">
                                        <!-- Brand & Badge Group -->
                                        <div class="relative">
                                            <div class="w-14 h-14 bg-white rounded-lg border border-black/5 p-2 flex items-center justify-center shrink-0 shadow-sm overflow-hidden">
                                                <img src="${brandLogoUrl}" 
                                                    alt="${v.make}" 
                                                    onerror="this.src='https://cdn.simpleicons.org/transportr'; this.style.opacity='0.2'"
                                                    class="w-full h-full object-contain">
                                            </div>
                                            <div class="absolute -bottom-2 -right-2 w-8 h-8 bg-white rounded-full border border-black/5 p-0.5 shadow-sm z-10">
                                                <img src="${badgeUrl}" 
                                                    alt="${badgeLabel}"
                                                     onerror="this.style.display='none'"
                                                    class="w-full h-full object-contain">
                                            </div>
                                        </div>
                                        
                                        <div class="md:hidden flex-1">
                                             <h6 class="font-black text-slate-900 text-sm truncate uppercase tracking-tight">${
                                                v.make || "VEHICLE"
                                              } ${v.model || ""}</h6>
                                             <span class="text-[10px] font-mono font-bold text-slate-500 bg-white border border-black/10 px-2 py-0.5 rounded-md mt-1 inline-block">${
                                                v.license_plate || "NO LICENSE PLATE"
                                              }</span>
                                        </div>
                                    </div>

                                    <div class="flex-1 w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-4 gap-x-8 pt-2 md:pt-0">
                                        
                                        <!-- Col 1: Main Info -->
                                        <div class="hidden md:block">
                                            <h6 class="font-black text-slate-900 text-sm truncate uppercase tracking-tight">${
                                              v.make || "VEHICLE"
                                            } ${v.model || ""}</h6>
                                            <div class="flex items-center gap-2 mt-1.5">
                                                <span class="text-[10px] font-mono font-bold text-slate-900 bg-white border border-black/10 px-2 py-0.5 rounded-md shadow-sm">${
                                                  v.license_plate || "NO LICENSE PLATE"
                                                }</span>
                                                <span class="text-[9px] text-slate-400 font-medium px-1.5 py-0.5 border border-black/5 rounded bg-black/[0.02] uppercase">${
                                                    v.fuel_type || "N/A"
                                                }</span>
                                            </div>
                                        </div>

                                        <!-- Col 2: Insurance -->
                                        <div class="space-y-1">
                                            <p class="text-[8px] text-slate-400 font-bold uppercase tracking-widest">Insurance</p>
                                            <div class="flex items-center gap-2">
                                                <div class="w-1.5 h-1.5 rounded-full ${isInsured ? 'bg-[var(--primary)]' : 'bg-red-500'}"></div>
                                                <span class="text-[10px] font-bold uppercase ${isInsured ? 'text-[var(--primary)]' : 'text-red-500'}">
                                                    ${isInsured ? 'Insured' : 'Uninsured'}
                                                </span>
                                            </div>
                                            ${v.insurance?.company ? `<p class="text-[9px] text-slate-600 truncate max-w-[150px]" title="${v.insurance.company}">${v.insurance.company}</p>` : ''}
                                            ${v.insurance?.start_date ? `<p class="text-[8px] text-slate-400 font-mono">Since: ${v.insurance.start_date}</p>` : ''}
                                        </div>

                                        <!-- Col 3: Dates -->
                                        <div class="space-y-1">
                                             <p class="text-[8px] text-slate-400 font-bold uppercase tracking-widest">Key Dates</p>
                                             <div class="flex flex-col gap-1">
                                                ${v.inspection_expiry_date ? `
                                                <div class="flex items-center gap-2">
                                                    <i class="fa-solid fa-calendar-check text-[9px] text-slate-400 w-3 text-center"></i>
                                                    <span class="text-[9px] text-slate-600">Next Inspection: <span class="font-mono font-bold text-slate-900">${v.inspection_expiry_date}</span></span>
                                                </div>` : ''}
                                                ${v.registration_date ? `
                                                <div class="flex items-center gap-2">
                                                    <i class="fa-solid fa-file-contract text-[9px] text-slate-400 w-3 text-center"></i>
                                                    <span class="text-[9px] text-slate-600">Registered: <span class="font-mono font-bold text-slate-900">${v.registration_date}</span></span>
                                                </div>` : ''}
                                             </div>
                                        </div>
                                    </div>
                                </div>`;
                              })
                              .join("")}
                        </div>`
                        : '<div class="text-center text-slate-400 text-[10px] italic py-4 bg-black/[0.01] rounded-xl border border-dashed border-black/5">No vehicles registered in their name</div>'
                    }
                </div>
            `;

        // --- 3. Academic Data Rendering ---
        const academicData = data.data?.academic || {};
        const higherDegrees = academicData.higher_education_degrees || [];
        
        // Console Warning for unsupported types
        // Check for other keys in academicData or unsupported sub_families
        const academicKeys = Object.keys(academicData);
        if (academicKeys.length > 1 || (academicKeys.length === 1 && academicKeys[0] !== 'higher_education_degrees')) {
             console.warn("Academic Data contains unsupported types:", academicKeys.filter(k => k !== 'higher_education_degrees'));
        }

        let academicHtml = "";
        
        if (!data.data?.academic && !data.data?.academic_data) {
             academicHtml = '<div class="text-center text-slate-700 py-6 italic font-mono text-[10px]">Academic Module omitted</div>';
        } else if (higherDegrees.length === 0) {
             academicHtml = '<div class="text-center text-slate-400 py-6 italic font-mono text-[10px]">No university degrees found</div>';
        } else {
             academicHtml = '<div class="grid grid-cols-1 gap-4">';
             
             higherDegrees.forEach(degree => {
                 // Warning for non-bachelor if strict
                 if (degree.sub_family !== 'academic_data:higher_bachelor') {
                     console.warn("Unsupported degree type found:", degree.sub_family);
                     return; 
                 }
                 
                 const statusIcon = degree.completion_status === 'completed' ? 'fa-check-circle' : 'fa-spinner';
                 const statusColor = degree.completion_status === 'completed' ? 'text-[var(--primary)]' : 'text-amber-500';
                 const statusBg = degree.completion_status === 'completed' ? 'bg[rgba(var(--primary-rgb),0.10)]' : 'bg-amber-500/10';
                 
                 academicHtml += `
                    <div class="bg-black/[0.015] border border-black/5 rounded-xl p-4 flex flex-col sm:flex-row gap-4 hover:bg-black/5 transition-colors group">
                        <div class="w-12 h-12 rounded-lg bg-white border border-black/5 flex items-center justify-center shrink-0 shadow-sm">
                            <i class="fa-solid fa-graduation-cap text-xl text-slate-400 group-hover:text-[var(--primary)] transition-colors"></i>
                        </div>
                        <div class="flex-1">
                            <div class="flex justify-between items-start mb-1">
                                <h5 class="font-black text-slate-900 text-xs uppercase tracking-tight leading-snug max-w-[80%]">${degree.qualification_name}</h5>
                                <span class="${statusBg} ${statusColor} border border-transparent px-2 py-0.5 rounded-md text-[9px] font-black uppercase flex items-center gap-1.5">
                                    <i class="fa-solid ${statusIcon}"></i>
                                    ${degree.completion_status === 'completed' ? 'Graduated' : degree.completion_status}
                                </span>
                            </div>
                            <p class="text-[10px] font-bold text-slate-500 mb-2">${degree.institution_name} <span class="font-normal opacity-60">(${degree.institution_country})</span></p>
                            
                            <div class="flex flex-wrap gap-3 mt-3 pt-3 border-t border-black/5">
                                 <div class="flex items-center gap-1.5">
                                    <i class="fa-regular fa-calendar text-[9px] text-slate-400"></i>
                                    <span class="text-[9px] text-slate-600">Completion: <span class="font-mono font-bold text-slate-900">${degree.issue_date || degree.end_date || "N/A"}</span></span>
                                 </div>
                                 ${degree.official_id ? `
                                 <div class="flex items-center gap-1.5">
                                    <i class="fa-solid fa-fingerprint text-[9px] text-slate-400"></i>
                                    <span class="text-[9px] text-slate-600">Official ID: <span class="font-mono font-bold text-slate-900 bg-white px-1.5 rounded border border-black/10">${degree.official_id}</span></span>
                                 </div>` : ''}
                            </div>
                        </div>
                    </div>
                 `;
             });
             
             academicHtml += '</div>';
             
             // Check if html is empty (all filtered out)
             if (academicHtml === '<div class="grid grid-cols-1 gap-4"></div>') {
                 academicHtml = '<div class="text-center text-slate-400 py-6 italic font-mono text-[10px]">No compatible degrees found</div>';
             }
        }

        // --- 4. Employment / Labor History Rendering ---
        const labor = data.data?.employment?.labor_check || {};
        const relations = labor.work_relations_history || [];
        const contributions = labor.contribution_base_history || [];
        const activeStatus = labor.currently_active;

        let laborHtml = "";
        if (!data.data?.employment) {
          laborHtml =
            '<div class="col-span-2 text-center text-slate-700 py-4 italic font-mono text-[10px]">Work Life Module omitted</div>';
        } else {
          // Wrap in a CSS Grid for better distribution
          laborHtml += '<div class="grid grid-cols-1 md:grid-cols-2 gap-4 col-span-1 md:col-span-2">';
          
          // Summary Block
          laborHtml += `
                    <div class="space-y-4">
                        <div class="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-lg flex flex-col gap-4 text-white">
                            <div class="flex justify-between items-center">
                                <div>
                                    <p class="text-[8px] font-bold uppercase tracking-widest mb-1 text-slate-400">Total Contributions</p>
                                    <p class="text-2xl font-black leading-none text-white">${
                                      labor.social_security_days || "0"
                                    } <span class="text-[10px] font-medium text-slate-500">days</span></p>
                                </div>
                                <div class="text-right">
                                    <p class="text-[8px] font-bold uppercase tracking-widest mb-1 text-slate-400">Status</p>
                                    <span class="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                      activeStatus
                                        ? "bg-[var(--primary)]/20 text-[var(--primary)] border border-[var(--primary)]/20"
                                        : "bg-red-500/20 text-red-400 border border-red-500/20"
                                    }">
                                        <i class="fa-solid fa-power-off mr-1"></i> ${activeStatus ? "Active" : "Inactive"}
                                    </span>
                                </div>
                            </div>
                            
                            <!-- Document Attachment Logic Enclosed -->
                            ${
                              labor.work_life_report
                                ? (() => {
                                    const connections = data.connections || {};
                                    const tgssConnId = Object.keys(
                                      connections
                                    ).find((k) => k.includes("TGSS"))
                                      ? connections[
                                          Object.keys(connections).find((k) =>
                                            k.includes("TGSS")
                                          )
                                        ]
                                      : null;
                                    const targetId =
                                      tgssConnId ||
                                      currentSessionId ||
                                      data.session_id;

                                    return `
                            <div class="bg-white/5 rounded-xl p-3 border border-white/5 flex items-center justify-between mt-1 shadow-inner">
                                <div class="flex items-center gap-3">
                                    <div class="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center border border-red-500/20">
                                        <i class="fa-solid fa-file-pdf text-red-400 text-sm"></i>
                                    </div>
                                    <div>
                                        <p class="text-[10px] font-black mb-0.5 text-white">Work Life Report</p>
                                        <p class="text-[8px] uppercase tracking-widest text-slate-400">Official PDF</p>
                                    </div>
                                </div>
                                <button onclick="viewWorkLifePdf('${targetId}')"
                                   class="text-[9px] font-black bg-white hover:bg-slate-200 text-slate-900 uppercase tracking-widest px-4 py-2 rounded-lg transition-colors shadow-lg no-print">
                                    <i class="fa-solid fa-eye-peeping mr-1"></i> Open
                                </button>
                                <div class="hidden print:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--primary)]/20 bg-[var(--primary)]/10">
                                    <i class="fa-solid fa-circle-check text-[var(--primary)] text-[8px]"></i>
                                    <span class="text-[8px] font-black text-[var(--primary)] uppercase tracking-widest">Verified</span>
                                </div>
                            </div>
                        `;
                                  })()
                                : ""
                            }
                        </div>
                        
                        <div class="bg-white rounded-2xl p-4 border border-black/5 shadow-sm">
                            <h5 class="flex items-center gap-2 text-[9px] text-slate-900 font-black uppercase tracking-widest mb-4">
                               <i class="fa-solid fa-clock-rotate-left text-[var(--primary)]"></i> Latest Relations
                            </h5>
                            <div class="space-y-4">
                                ${relations
                                  .slice(0, 3)
                                  .map(
                                    (r) => `
                                    <div class="flex justify-between items-center gap-4 group">
                                        <div class="flex-1 min-w-0 flex items-center gap-3">
                                            <div class="w-8 h-8 rounded-lg bg-black/5 text-slate-400 flex items-center justify-center shrink-0 group-hover:bg-[var(--primary)]/5 group-hover:text-[var(--primary)] transition-colors">
                                               <i class="fa-solid fa-briefcase text-[10px]"></i>
                                            </div>
                                            <div class="min-w-0">
                                              <p class="text-slate-900 font-bold text-xs leading-snug truncate" title="${
                                                r.name
                                              }">${r.name}</p>
                                              <p class="text-[9px] text-slate-400 uppercase tracking-wide mt-0.5">${
                                                r.activity_start
                                              } <i class="fa-solid fa-arrow-right-long text-[8px] mx-1"></i> ${
                                      r.activity_end || "Present"
                                    }</p>
                                            </div>
                                        </div>
                                        <span class="text-[8px] bg-slate-100 text-slate-500 px-2 py-1 rounded-md font-bold uppercase tracking-widest shrink-0">${
                                          r.work_type || "Standard"
                                        }</span>
                                    </div>
                                `
                                  )
                                  .join("")}
                                ${
                                  relations.length === 0
                                    ? '<p class="text-slate-400 text-xs italic text-center py-4">No recent history</p>'
                                    : ""
                                }
                            </div>
                        </div>
                    </div>

                    <div class="space-y-4">
                        <div class="bg-white rounded-2xl p-4 border border-black/5 shadow-sm overflow-hidden h-full flex flex-col">
                            <h5 class="flex items-center gap-2 text-[9px] text-slate-900 font-black uppercase tracking-widest mb-4">
                               <i class="fa-solid fa-coins text-[var(--primary)]"></i> Contribution Base History
                            </h5>
                            <div class="space-y-3 flex-1">
                                ${contributions
                                  .slice(0, 5)
                                  .map(
                                    (c) => `
                                    <div class="flex justify-between items-center bg-black/[0.02] hover:bg-black/[0.04] transition-colors p-2.5 rounded-xl border border-black/5">
                                        <div class="flex items-center gap-2">
                                           <div class="w-6 h-6 rounded bg-white shadow-sm flex items-center justify-center text-[8px] text-slate-400">
                                              <i class="fa-regular fa-calendar"></i>
                                           </div>
                                           <span class="text-[10px] text-slate-600 font-bold uppercase tracking-widest">${new Date(
                                             c.date
                                           )
                                             .toLocaleDateString("es-ES", {
                                               month: "short",
                                               year: "numeric",
                                             })
                                             .toUpperCase()}</span>
                                        </div>
                                        <span class="text-slate-900 font-mono font-black text-xs bg-white px-2 py-1 rounded-lg border border-black/5 shadow-sm">${
                                          c.base === "pending"
                                            ? "Pending"
                                            : parseFloat(
                                                c.base?.amount
                                              ).toLocaleString("es-ES", {
                                                style: "currency",
                                                currency:
                                                  c.base?.currency || "EUR",
                                              })
                                        }</span>
                                    </div>
                                `
                                  )
                                  .join("")}
                                ${
                                  contributions.length === 0
                                    ? '<p class="text-slate-400 text-xs italic text-center py-8">No contribution data available</p>'
                                    : ""
                                }
                            </div>
                            
                            </div>
                        </div>
                    </div>
                </div>`;
        }

        // --- 4. Consent Metadata (Less Visible) ---
        const consent = data.consent || {};
        
        // --- User Agent & Device ---
        const ua = consent.user_agent || "Unknown";
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
        const deviceIcon = isMobile ? "fa-mobile-screen-button" : "fa-desktop";
        const deviceLabel = isMobile ? "MOBILE" : "DESKTOP";

        const metaHtml = `
                <!-- Metadata Rows -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2">
                    <div class="flex items-center gap-2"><i class="fa-solid fa-fingerprint text-slate-400"></i> <span class="text-[8px] text-slate-400 font-bold uppercase tracking-widest">ID:</span> <span class="font-mono text-[9px] text-slate-800">${currentSessionId || data.session_id || "-"}</span></div>
                    <div class="flex items-center gap-2"><i class="fa-solid fa-network-wired text-slate-400"></i> <span class="text-[8px] text-slate-400 font-bold uppercase tracking-widest">IP:</span> <span class="font-mono text-[9px] text-slate-800">${
                      consent.user_ip || "-"
                    }</span></div>
                    <div class="flex items-center gap-2"><i class="fa-solid fa-clock text-slate-400"></i> <span class="text-[8px] text-slate-400 font-bold uppercase tracking-widest">STAMP:</span> <span class="font-mono text-[9px] text-slate-800">${
                      consent.accepted_date
                        ? new Date(consent.accepted_date).toLocaleString()
                        : "-"
                    }</span></div>
                    
                    <div class="flex items-center gap-2 md:col-span-3 pt-2 border-t border-black/5 mt-1">
                         <i class="fa-solid ${deviceIcon} text-slate-400"></i> 
                         <span class="text-[8px] text-slate-400 font-bold uppercase tracking-widest">${deviceLabel}:</span>
                         <span class="font-mono text-[8px] text-slate-400 truncate opacity-60 italic">${ua}</span>
                    </div>
                </div>
            `;
            
        // Build Data sections based on what's available
        const sections = [];
        if (data.data?.customer?.profile) {
            sections.push({ id: 'customer_information_read', label: FEATURE_META['customer_information_read']?.name || 'Identity Profile', icon: FEATURE_META['customer_information_read']?.icon || 'fa-user-shield', color: FEATURE_META['customer_information_read']?.color || 'var(--primary)', html: customerHtml });
        }
        if (data.data?.driver) {
             sections.push({ id: 'driver_data', label: FEATURE_META['driver_data']?.name || 'History & DGT', icon: FEATURE_META['driver_data']?.icon || 'fa-car-side', color: FEATURE_META['driver_data']?.color || 'var(--primary)', html: driverHtml });
        }
        if (data.data?.academic) {
             sections.push({ id: 'academic_data', label: FEATURE_META['academic_data']?.name || 'Academic Data', icon: FEATURE_META['academic_data']?.icon || 'fa-graduation-cap', color: FEATURE_META['academic_data']?.color || 'var(--primary)', html: academicHtml });
        }
        if (data.data?.employment) {
             sections.push({ id: 'labor_check', label: FEATURE_META['labor_check']?.name || 'Work Life', icon: FEATURE_META['labor_check']?.icon || 'fa-briefcase', color: FEATURE_META['labor_check']?.color || 'var(--primary)', html: laborHtml });
        }
        // Metadata always present
        sections.push({ id: 'global_meta', label: 'Identity Audit Log', icon: 'fa-clipboard-check', color: '#64748b', html: metaHtml });
        
        const navMenu = document.getElementById("resultsNavMenu");
        const contentArea = document.getElementById("resultsContentArea");
        
        if (navMenu && contentArea) {
            let navHtml = '';
            let contentHtmlStr = '';
            
            sections.forEach((sec, idx) => {
                const isActive = idx === 0 
                  ? 'bg-black/5 text-slate-900 font-bold border-l border-black/10' 
                  : 'text-slate-500 hover:bg-black/[0.02] hover:text-slate-900 border-l border-transparent';
                const display = idx === 0 ? 'block' : 'hidden';
                
                navHtml += `
                <button onclick="switchResultTab('${sec.id}')" id="nav-btn-${sec.id}" class="w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all ${isActive} text-[10px] uppercase tracking-widest nav-btn">
                    <div class="w-7 h-7 rounded-lg bg-black/5 flex items-center justify-center text-xs shadow-sm" style="color:${sec.color};">
                        <i class="fa-solid ${sec.icon}"></i>
                    </div>
                    ${sec.label}
                </button>`;
                
                contentHtmlStr += `<div id="content-sec-${sec.id}" class="content-sec ${display} fade-in">${sec.html}</div>`;
            });
            
            navMenu.innerHTML = navHtml;
            contentArea.innerHTML = contentHtmlStr;
        }
      }
      
      // Global switch function for result tabs
      window.switchResultTab = function(tabId) {
          document.querySelectorAll(".nav-btn").forEach(btn => {
              btn.classList.remove('bg-black/5', 'text-slate-900', 'font-bold', 'border-black/10');
              btn.classList.add('text-slate-500', 'border-transparent');
          });
          document.querySelectorAll(".content-sec").forEach(sec => sec.classList.add('hidden'));
          
          const btn = document.getElementById(`nav-btn-${tabId}`);
          if (btn) {
              btn.classList.add('bg-black/5', 'text-slate-900', 'font-bold', 'border-black/10');
              btn.classList.remove('text-slate-500', 'border-transparent');
          }
          const sec = document.getElementById(`content-sec-${tabId}`);
          if (sec) sec.classList.remove('hidden');
      };
      
      // Dynamic back navigation handler
      window.handleBackNavigation = function() {
          const sessionView = document.getElementById("sessionMainView");
          
          if (sessionView && !sessionView.classList.contains("hidden")) {
              // We are inside a session detail, so "back" means go back to dashboard table
              goToDashboard();
          } else {
              // We are in the dashboard table, so "back" means leave Citizen Data completely and go to /flows
              if (typeof router !== 'undefined') {
                  router.push('/flows');
              } else {
                  window.location.hash = "#/flows";
              }
          }
      };

      // --- DEBUG MODAL ---
      function openDebugModal() {
          const content = document.getElementById("debugJsonContent");
          if (!currentResultsData) {
              content.textContent = "// No data available";
          } else {
              content.textContent = JSON.stringify(currentResultsData, null, 2);
              hljs.highlightElement(content);
          }
          
          const modal = document.getElementById("debugModal");
          modal.classList.remove("hidden");
          modal.classList.add("flex");
      }
      
      function closeDebugModal() {
          const modal = document.getElementById("debugModal");
          modal.classList.add("hidden");
          modal.classList.remove("flex");
      }
      
      function copyDebugJson() {
           if (!currentResultsData) return;
           navigator.clipboard.writeText(JSON.stringify(currentResultsData, null, 2));
           
           const btn = document.querySelector('[onclick="copyDebugJson()"]');
           const originalHTML = btn.innerHTML;
           btn.innerHTML = '<i class="fa-solid fa-check mr-2 text-green-400"></i> COPIADO';
           setTimeout(() => btn.innerHTML = originalHTML, 1500);
      }

      // --- CUSTOM EXCLUSIVE MODAL FOR DELETE/CANCEL ---
      let confirmActionCallback = null;
      
      window.showConfirmModal = function(title, text, actionCallback) {
          document.getElementById('cancelConfirmTitle').textContent = title;
          document.getElementById('cancelConfirmText').textContent = text;
          
          confirmActionCallback = actionCallback;
          
          const modal = document.getElementById('cancelConfirmModal');
          const body = document.getElementById('cancelConfirmModalBody');
          
          modal.classList.remove('hidden');
          modal.classList.add('flex');
          
          // Animate in
          setTimeout(() => {
              body.classList.remove('scale-95', 'opacity-0');
              body.classList.add('scale-100', 'opacity-100');
          }, 10);
      };
      
      window.closeCancelConfirmModal = function() {
          const modal = document.getElementById('cancelConfirmModal');
          const body = document.getElementById('cancelConfirmModalBody');
          
          body.classList.remove('scale-100', 'opacity-100');
          body.classList.add('scale-95', 'opacity-0');
          
          setTimeout(() => {
              modal.classList.add('hidden');
              modal.classList.remove('flex');
              confirmActionCallback = null;
          }, 300);
      };
      
      document.addEventListener('DOMContentLoaded', () => {
          const confirmBtn = document.getElementById('cancelConfirmActionBtn');
          if (confirmBtn) {
              confirmBtn.addEventListener('click', () => {
                  if (confirmActionCallback) confirmActionCallback();
                  closeCancelConfirmModal();
              });
          }
      });

      // --- UTILIDADES ---

      function toggleMobileMenu() {
          const menu = document.getElementById("mobileMenu");
          if (menu) {
              menu.classList.toggle("hidden");
          }
      }

      function printResults() {
          const timestamp = new Date().toLocaleString('es-ES', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit'
          });
          const stampEl = document.getElementById('printTimestamp');
          if (stampEl) stampEl.textContent = timestamp;
          
          // Set filename using session ID
          const originalTitle = document.title;
          const sessionId = currentSessionId || 'Citizen-Data-Report';
          document.title = sessionId;
          
          // Use onafterprint to restore title reliably after print dialog closes
          window.onafterprint = () => {
              document.title = originalTitle;
              window.onafterprint = null;
          };
          
          window.print();
      }

      function showError(msg) {
        const errorBox = document.getElementById("errorBox");
        document.getElementById("errorText").innerText = msg;
        errorBox.classList.remove("hidden");
        errorBox.classList.add("fade-in");
      }

      function resetUI() {
        goToDashboard();
      }
      
      function showMonitoringError(msg, suggestion = null) {
          const section = document.getElementById("monitoringSection");
          const loadingDiv = document.getElementById("monitoring-loading");
          const errorDiv = document.getElementById("monitoring-error");
          
          section.classList.remove("border[rgba(var(--primary-rgb),0.10)]", "bg-[var(--primary)]/[0.01]");
          section.classList.add("border-red-500/10", "bg-red-500/[0.01]");
          
          loadingDiv.classList.add("hidden");
          errorDiv.classList.remove("hidden");
          errorDiv.classList.add("flex");
          
          document.getElementById("monitoringErrorMsg").textContent = msg;
          
          // Handle Suggestion Button
          const existingContainer = document.getElementById("suggestionContainer");
          if (existingContainer) existingContainer.remove();
          
          if (suggestion) {
              const container = document.createElement("div");
              container.id = "suggestionContainer";
              container.className = "mt-6 bg-white border border-amber-500/20 p-5 rounded-2xl shadow-xl flex flex-col items-center gap-3 w-full max-w-xs relative overflow-hidden group hover:border-amber-500/40 transition-all mx-auto";
              
              // Decorative background glow
              const glow = document.createElement("div");
              glow.className = "absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-400 to-transparent opacity-50";
              container.appendChild(glow);
              
              const text = document.createElement("p");
              text.className = "text-[10px] text-slate-600 font-bold uppercase tracking-wide flex items-center gap-2";
              text.innerHTML = `<i class="fa-solid fa-lightbulb text-amber-500 text-sm"></i> Possible configuration detected`;
              
              const btn = document.createElement("button");
              btn.className = "w-full bg-slate-900 text-white hover:bg-[var(--primary)] font-black py-3 px-4 rounded-xl transition-all text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm transform group-hover:scale-[1.02]";
              btn.innerHTML = `Switch to "${suggestion.name}" <i class="fa-solid fa-arrow-right"></i>`;
              btn.onclick = () => applyConfigSuggestion(suggestion.id);
              
              container.appendChild(text);
              container.appendChild(btn);
              
              // Append to the error message wrapper
              document.getElementById("monitoringErrorMsg").parentElement.appendChild(container);
          }
      }
      
      function applyConfigSuggestion(configId) {
          setActiveConfig(configId);
          updateActiveConfigUI();
          // Reload to ensure clean state and retry
          window.location.reload();
      }
      
      function resetMonitoringUI() {
          const section = document.getElementById("monitoringSection");
          const loadingDiv = document.getElementById("monitoring-loading");
          const errorDiv = document.getElementById("monitoring-error");
          
          // Helper to check if elements exist (init protection)
          if(!loadingDiv || !errorDiv) return;

          section.classList.add("border[rgba(var(--primary-rgb),0.10)]", "bg-[var(--primary)]/[0.01]");
          section.classList.remove("border-red-500/10", "bg-red-500/[0.01]");
          
          loadingDiv.classList.remove("hidden");
          errorDiv.classList.add("hidden");
          errorDiv.classList.remove("flex");
          
          // Reset Text/Icon state
          updateMonitoringUIState("WAITING");
      }

      function copyToClipboard() {
        const copyText = document.getElementById("resultUrl");
        copyText.select();
        copyText.setSelectionRange(0, 99999);
        document.execCommand("copy");

        const btn = document.querySelector("button[title='Copy']");
        const originalIcon = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check text-[var(--primary)]"></i>';
        setTimeout(() => {
          btn.innerHTML = originalIcon;
        }, 1500);
      }



      function goToHome() {
        if (typeof router !== 'undefined') {
            router.push('/flows'); 
        } else {
            window.location.hash = "#/flows";
        }
      }

      function showDocTab(stepId) {
         // This function is no longer needed in the main file as docs are in iframe
         // but we keep it empty to prevent errors if something calls it.
      }

const CitizenDataView = {
  template: '#citizen-data-template',
  mounted() {
      if (typeof initConfig === 'function') initConfig();
      if (typeof renderHistory === 'function') renderHistory();
      if (typeof handleRouting === 'function') handleRouting();
      setTimeout(() => { 
          if (typeof updateActiveConfigUI === 'function') updateActiveConfigUI(); 
      }, 100);
      
      // Auto-init highlighting if needed
      if (typeof hljs !== 'undefined') hljs.highlightAll();
  },
  unmounted() {
      if (typeof stopPolling === 'function') stopPolling();
  }
};
