/**
 * Flows Manager
 * unified interface for initializing and polling Infonite sessions.
 */

class FlowSessionManager {
    constructor() {}

    /**
     * Generates a storage key scoped to the specific API environment
     * @param {string} appId 
     * @param {string} kind 
     * @param {string} widgetUrl - Explicitly required to prevent Dev/Pro local data bleeding
     * @returns {string} The scoped storage key string
     */
    _getStorageKey(appId, kind, widgetUrl) {
        let envKey = 'default';
        if (!widgetUrl) {
            console.error("Critical Error: widgetUrl is fundamentally required for environment isolation.");
            envKey = "UNKNOWN_ENV";
        } else {
            try {
                const url = new URL(widgetUrl);
                envKey = url.host.replace(/[^a-zA-Z0-9]/g, '_');
            } catch (e) {
                // Fallback for invalid URLs but populated strings
                envKey = widgetUrl.toString().replace(/[^a-zA-Z0-9]/g, '_');
            }
        }

        return `infonite_sessions_${envKey}_${appId}_${kind}`;
    }

    /**
     * Returns an array of saved sessions for a specific app and kind.
     * @param {string} appId 
     * @param {string} kind 
     * @param {string} widgetUrl
     * @returns {Array} Array of session objects
     */
    getSessions(appId, kind, widgetUrl) {
        if (!appId || !kind) return [];
        const key = this._getStorageKey(appId, kind, widgetUrl);
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    }

    /**
     * Saves a full session array back to local storage.
     * @param {string} appId 
     * @param {string} kind 
     * @param {Array} sessions 
     * @param {string} widgetUrl
     */
    saveSessions(appId, kind, sessions, widgetUrl) {
        if (!appId || !kind) return;
        const key = this._getStorageKey(appId, kind, widgetUrl);
        localStorage.setItem(key, JSON.stringify(sessions));
    }

    /**
     * Initializes a new session via the backend API using a pre-constructed payload.
     */
    async initSession(widgetUrl, appSecret, appId, kind, payload) {
        if (!widgetUrl || !appSecret || !appId || !payload) {
            throw new Error('Widget URL, App Secret, App ID, and Payload are required to initialize a session.');
        }

        const response = await fetch(`${widgetUrl}/api/flows/${kind}/v1/manager/init`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-APP-SECRET': appSecret
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            let errorDetail = 'Failed to initialize session';
            let errorBody = null;
            try {
                errorBody = await response.json();
            } catch (e) {
                // Not JSON, ignore
            }
            
            const err = new Error(errorDetail);
            err.status = response.status;
            err.statusText = response.statusText;
            err.responseBody = errorBody;
            throw err;
        }

        const acceptancePayload = await response.json();
        
        const sessionData = {
            ...acceptancePayload, 
            app_id: appId,
            customer_id: payload.customer_id,
            infonite_state: {
                status: 'READY',
                status_code: 'READY',
                date_started: new Date().toISOString()
            },
            date_created: new Date().toISOString()
        };

        const sessions = this.getSessions(appId, kind, widgetUrl);
        sessions.unshift(sessionData);
        this.saveSessions(appId, kind, sessions, widgetUrl);

        return acceptancePayload;
    }

    /**
     * Polls the backend for the current status of a specific session and updates storage.
     */
    async pollSessionState(widgetUrl, appSecret, kind, sessionId, appId = null) {
        if (!sessionId || !appSecret || !widgetUrl) {
            throw new Error("Missing widgetUrl, appSecret, or sessionId required for polling.");
        }

        const response = await fetch(`${widgetUrl}/api/flows/${kind}/v1/manager/${sessionId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-APP-SECRET': appSecret
            }
        });

        if (!response.ok) {
            let errorDetail = `State fetch failed`;
            let errorBody = null;
            try {
                errorBody = await response.json();
            } catch (e) {}
            
            const err = new Error(errorDetail);
            err.status = response.status;
            err.statusText = response.statusText;
            err.responseBody = errorBody;
            throw err;
        }

        const stateData = await response.json();
        
        if (appId) {
            const sessions = this.getSessions(appId, kind, widgetUrl);
            const index = sessions.findIndex(s => s.session_id === sessionId);
            if (index !== -1) {
                // Ensure we have session_settings cached
                if (!sessions[index].session_settings) {
                    try {
                        sessions[index].session_settings = await this.fetchSessionSettings(widgetUrl, appSecret, kind, sessionId);
                    } catch (e) {
                        console.error('Failed to fetch session settings:', e);
                    }
                }
                
                // Ensure infonite_state structure is maintained
                sessions[index].infonite_state = stateData;
                this.saveSessions(appId, kind, sessions, widgetUrl);
            }
        }
        return stateData;
    }

    /**
     * Cancels an existing session.
     */
    async cancelSession(widgetUrl, appSecret, kind, sessionId) {
        if (!sessionId || !appSecret || !widgetUrl) throw new Error("Missing parameters");
        
        const response = await fetch(`${widgetUrl}/api/flows/${kind}/v1/manager/${sessionId}/cancel`, {
            method: 'PATCH',
            headers: { 
                'X-APP-SECRET': appSecret, 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({ reason: "Cancelled by manager" })
        });
        
        if (response.status < 200 || response.status > 299) {
            let errorDetail = `Failed to cancel session: ${response.status}`;
            try {
                const err = await response.json();
                errorDetail = err.detail || errorDetail;
            } catch (e) {}
            throw new Error(errorDetail);
        }
    }

    /**
     * Fetches the final results of a session.
     */
    async fetchSessionResults(widgetUrl, appSecret, kind, sessionId) {
        if (!sessionId || !appSecret || !widgetUrl) throw new Error("Missing parameters");
        
        const response = await fetch(`${widgetUrl}/api/flows/${kind}/v1/manager/${sessionId}/results`, {
            method: "GET",
            headers: { "X-APP-SECRET": appSecret }
        });
        
        if (!response.ok) {
            let errorDetail = `Results not available ${response.status}`;
            try {
                const err = await response.json();
                errorDetail = err.detail || errorDetail;
            } catch (e) {}
            throw new Error(errorDetail);
        }
        
        return response.json();
    }

    /**
     * Fetches backend configurations and limitations tied to a specific session.
     */
    async fetchSessionSettings(widgetUrl, appSecret, kind, sessionId) {
        if (!sessionId || !appSecret || !widgetUrl) throw new Error("Missing parameters");
        
        const response = await fetch(`${widgetUrl}/api/flows/${kind}/v1/manager/${sessionId}/settings`, {
            method: "GET",
            headers: { "X-APP-SECRET": appSecret }
        });
        
        if (!response.ok) {
            let errorDetail = `Settings not available ${response.status}`;
            try {
                const err = await response.json();
                errorDetail = err.detail || errorDetail;
            } catch (e) {}
            throw new Error(errorDetail);
        }
        
        return response.json();
    }
}

// Instantiate globally
window.InfoniteFlowsManager = new FlowSessionManager();
