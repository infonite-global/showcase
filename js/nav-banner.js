/**
 * Infonite Shared Navigation Banner
 * Dynamically injected into #app-nav-container
 */

(function () {
    const NavBanner = {
        init: function () {
            this.container = document.getElementById('app-nav-container');
            if (!this.container) return;

            if (window.InfoniteConfigManager) {
                this.render();
            } else {
                window.addEventListener('load', () => this.render());
            }

            // Also listen to hash changes for the index page logic
            window.addEventListener('hashchange', () => this.checkVisibility());
        },

        getBasePath: function() {
            const currentPath = window.location.pathname;
            // 1. If at the root or /index.html
            if (currentPath.endsWith('index.html') && !currentPath.includes('/flows/')) return '';
            if (currentPath.endsWith('/') && !currentPath.includes('/flows/')) return '';
            
            // 2. We are in a subfolder. Find out how deep we are relative to the 'flows' directory or project root.
            // Split path by '/', removing empty segments
            const parts = currentPath.split('/').filter(p => p.length > 0);
            
            let depth = 0;
            // Determine depth by counting segments after the project root (where index.html lives)
            // A simple heuristic: count segments starting from 'flows' if it exists.
            let flowIndex = parts.indexOf('flows');
            if (flowIndex !== -1) {
                // If the path is /path/to/project/flows/file.html, depth is 1. -> ../
                // If it is /path/to/project/flows/es-citizen-data/file.html, depth is 2. -> ../../
                depth = parts.length - flowIndex - 1; // -1 to exclude the filename itself
            } else {
                // Fallback if not strictly in /flows/ but deep: assuming 1 level down for safety
                depth = 1; 
            }
            
            // Build the relative string (e.g. "../" or "../../")
            return "../".repeat(Math.max(0, depth));
        },

        render: function () {
            if (!this.container) {
                this.container = document.getElementById('app-nav-container');
            }
            if (!this.container) return;
            
            const basePath = this.getBasePath();
            const config = window.InfoniteConfigManager ? window.InfoniteConfigManager.getConfig() : null;
            
            const bScheme = config && config.bannerColorScheme ? config.bannerColorScheme : 'light';
            const logoPath = config && config[`logo_square_${bScheme}_base64`] ? config[`logo_square_${bScheme}_base64`] : this.getDefaultLogoPath(bScheme, basePath);
            
            const bannerColor = config && config.bannerColor ? config.bannerColor : 'rgba(255, 255, 255, 0.8)';
            const isTextDark = bScheme === 'light';
            
            const textColor = isTextDark ? '#1e293b' : '#ffffff';
            const hoverBg = isTextDark ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)';
            const borderColor = isTextDark ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
            const iconColor = isTextDark ? '#64748b' : 'rgba(255,255,255,0.7)';
            
            // App connectivity status
            const isOnline = config && config.appDetails && config.appDetails.isOnline;
            const appStatus = config && config.appDetails ? (config.appDetails.status || (isOnline ? 'online' : 'offline')) : 'unverified';
            let statusColor = 'bg-slate-400';
            let statusText = 'UNVERIFIED';
            
            if (isOnline || appStatus.toLowerCase() === 'online') {
                statusColor = 'bg-green-500';
                statusText = 'ONLINE';
            } else if (appStatus.toLowerCase() === 'unreachable' || appStatus.toLowerCase() === 'offline') {
                statusColor = 'bg-red-500';
                statusText = 'OFFLINE';
            }
            const lastErrorStr = config && config.appDetails && config.appDetails.lastError ? config.appDetails.lastError.replace(/"/g, '&quot;') : '';

            const currentPath = window.location.pathname;
            const isHome = currentPath.endsWith('index.html') && basePath === '';
            const isFlows = currentPath.includes('/flows/');
            
            const homeLink = isHome ? '#' : `${basePath}index.html`;
            const flowsHash = isHome ? '#flows' : `${basePath}index.html#flows`;
            
            // Extract App Name & Host Pill
            let hostPill = '';
            let cleanAppName = config && config.name ? config.name : 'Unknown App';
            
            if (config && !config.isMock) {
                let type = 'CSM';
                let pillColor = 'border-slate-500 text-slate-500 bg-slate-500/10';
                
                if(config.hostType === 'production') {
                    type = 'PRO';
                    pillColor = 'border-emerald-500 text-emerald-500 bg-emerald-500/10';
                } else if(config.hostType === 'develop') {
                    type = 'DEV';
                    pillColor = 'border-blue-500 text-blue-500 bg-blue-500/10';
                }
                
                hostPill = `<span class="px-1.5 py-0.5 rounded text-[8px] border ${pillColor}">${type}</span>`;
                
                // Remove legacy bracket prefixes if they exist in the saved name
                cleanAppName = cleanAppName.replace(/^\[(PRO|DEV|CSM)\]\s*/i, '');
            }
            
            const positionClass = isHome ? 'fixed' : 'sticky';
            
            // Render regular top banner
            const bannerHtml = `
                <div id="nav-banner-wrapper" class="${positionClass} top-0 z-[100] transition-all duration-500 overflow-hidden pt-2 px-2 pb-2 md:pt-4 md:px-4 md:pb-2 w-full pointer-events-none" style="max-height: 0px; opacity: 0; transform: translateY(-20px);">
                    <div class="glass-panel rounded-[2rem] p-3 md:p-4 flex flex-col md:flex-row shadow-xl mx-auto max-w-7xl pointer-events-auto" 
                         style="background: ${bannerColor}; border: 1px solid ${borderColor}; flex-wrap: wrap; backdrop-filter: blur(20px);">
                         
                        <div class="flex items-center px-4 py-1 overflow-hidden shrink-0">
                          <a href="${homeLink}">
                            <img alt="Infonite Logo" src="${logoPath}" class="max-h-7 md:max-h-8 max-w-[130px] md:max-w-[180px] w-auto h-auto object-contain block" />
                          </a>
                        </div>
                        
                        <!-- Desktop Nav -->
                        <nav class="hidden md:flex items-center gap-1 md:ml-4 pl-4 h-8" style="border-left: 1px solid ${borderColor}">
                          <a href="${homeLink}" class="px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all" style="color: ${textColor}; background: ${isHome ? hoverBg : 'transparent'}">Home</a>
                          <a href="${flowsHash}" class="px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all" style="color: ${textColor}; background: ${isFlows ? hoverBg : 'transparent'}">Flows</a>
                        </nav>
                        
                        <!-- Mobile Menu Toggle -->
                        <div class="md:hidden ml-auto pl-4" style="border-left: 1px solid ${borderColor}">
                          <button class="w-8 h-8 flex items-center justify-center transition-colors rounded hover:bg-black/5" style="color: ${iconColor}" onclick="window.InfoniteNavBanner.toggleMobileMenu()">
                            <i class="fa-solid fa-bars"></i>
                          </button>
                        </div>
                        
                        <div class="flex items-center gap-4 px-4 w-full justify-between mt-4 md:mt-0 md:justify-end md:w-auto ml-auto border-t md:border-t-0 md:border-l border-[var(--nav-border-color)] pt-3 md:pt-0 pl-4" style="--nav-border-color: ${borderColor};">
                          ${config && config.isMock ? `
                            <div class="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest mr-2" style="color: ${textColor}">
                              Select an App <i class="fa-solid fa-arrow-right-long ml-1"></i>
                            </div>
                          ` : `
                            <div class="flex flex-col items-end justify-center mr-2">
                              <div class="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.2em]" style="color: ${iconColor}">
                                ${hostPill} <span id="activeConfigName">${cleanAppName}</span>
                              </div>
                              <div class="flex items-center gap-1.5 px-2 py-0.5 mt-1 rounded-md transition-colors cursor-help" style="border: 1px solid ${borderColor}" title="${lastErrorStr}">
                                <span class="w-1.5 h-1.5 rounded-full ${statusColor}"></span>
                                <span class="text-[9px] font-bold uppercase tracking-widest" style="color: ${textColor}">${statusText}</span>
                              </div>
                            </div>
                          `}
                          
                          <button class="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-105" 
                                  onclick="if(typeof openSettings === 'function') openSettings(); else window.location.href='${homeLink}'" 
                                  style="background: ${hoverBg}; border: 1px solid ${borderColor}; color: ${textColor};" title="Settings">
                            <i class="fa-solid fa-cog"></i>
                          </button>
                        </div>
                        
                        <!-- Mobile Menu Dropdown -->
                        <div id="nav-banner-mobile-menu" class="w-full hidden mt-4 flex-col gap-2" style="border-top: 1px solid ${borderColor}; pt-4;">
                            <a href="${homeLink}" class="block w-full text-center px-4 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all" style="color: ${textColor}; background: ${isHome ? hoverBg : 'transparent'}; border: 1px solid ${borderColor}">Home</a>
                            <a href="${flowsHash}" class="block w-full text-center px-4 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all" style="color: ${textColor}; background: ${isFlows ? hoverBg : 'transparent'}; border: 1px solid ${borderColor}">Flows</a>
                        </div>
                    </div>
                </div>
            `;
            
            this.container.innerHTML = bannerHtml;
            
            // Check initial visibility logic
            // On index.html, it's hidden unless hash is #flows
            // On flows pages, it's always shown
            setTimeout(() => this.checkVisibility(), 50);
        },
        
        getDefaultLogoPath: function(scheme = 'light', basePath = '') {
            const fileName = scheme === 'dark' ? 'logo-dark.svg' : 'logo-light.svg';
            return `${basePath}assets/logo/${fileName}`;
        },

        checkVisibility: function() {
            const wrapper = document.getElementById('nav-banner-wrapper');
            if(!wrapper) return;
            
            // Show floating top banner always for static scroll page layout
            wrapper.style.maxHeight = '500px'; 
            wrapper.style.opacity = '1';
            wrapper.style.transform = 'translateY(0)';
        },
        
        toggleMobileMenu: function() {
            const mobileMenu = document.getElementById('nav-banner-mobile-menu');
            if (mobileMenu) {
                if (mobileMenu.classList.contains('hidden')) {
                    mobileMenu.classList.remove('hidden');
                    mobileMenu.classList.add('flex');
                } else {
                    mobileMenu.classList.add('hidden');
                    mobileMenu.classList.remove('flex');
                }
            }
        }
    };

    window.InfoniteNavBanner = NavBanner;

    // Run automatically
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => NavBanner.init());
    } else {
        NavBanner.init();
    }
})();
