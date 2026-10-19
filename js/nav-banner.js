/**
 * Infonite Shared Navigation Banner
 * Dynamically injected into #app-nav-container
 *
 * A floating pill of glass over whatever the page puts under it: the hero on the home page
 * (fixed to the viewport on a desktop, pinned to the hero's top edge on a phone), the flow
 * head elsewhere (part of the page). It never takes an app colour as its ground — the glass
 * is the surface below, thinned out, in that surface's scheme — so no visual setting an app
 * picks can make it unreadable (js/theme.js, `nav`). The one app colour on it is the primary,
 * with the ink the app sent for it, on the active link.
 *
 * A container that carries `data-nav-position="static"` keeps the bar in the flow of its
 * parent (a sticky head that already floats on its own).
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
                // If it is /path/to/project/flows/es-public-administration/file.html, depth is 2. -> ../../
                depth = parts.length - flowIndex - 1; // -1 to exclude the filename itself
            } else {
                // Fallback if not strictly in /flows/ but deep: assuming 1 level down for safety
                depth = 1; 
            }
            
            // Build the relative string (e.g. "../" or "../../")
            return "../".repeat(Math.max(0, depth));
        },

        /** Where the bar sits for this page and width, honouring a container that keeps it static. */
        positionClass: function (isHome) {
            if (this.container && this.container.dataset.navPosition === 'static') return 'relative';
            const isMobile = window.innerWidth < 768;
            return isHome ? (isMobile ? 'absolute' : 'fixed') : (isMobile ? 'relative' : 'sticky');
        },

        render: function () {
            if (!this.container) {
                this.container = document.getElementById('app-nav-container');
            }
            if (!this.container) return;
            
            const basePath = this.getBasePath();
            const config = window.InfoniteConfigManager ? window.InfoniteConfigManager.getConfig() : null;

            const currentPath = window.location.pathname;
            // the home page is the root, whether the URL names index.html or not
            const isHome = basePath === '';
            const isFlows = currentPath.includes('/flows/');

            // The glass: the surface below, thinned out, in its scheme (js/theme.js)
            const theme = window.InfoniteTheme ? window.InfoniteTheme.resolve(config) : null;
            const nav = theme
                ? window.InfoniteTheme.nav(theme, isHome ? 'hero' : 'page')
                : { scheme: 'light', ground: '#FFFFFF', ink: '#1C252E', primary: { main: '#00a76f', ink: '#FFFFFF' }, logoScheme: 'light' };
            const isDark = nav.scheme === 'dark';
            const mix = (pct) => `color-mix(in srgb, ${nav.ink} ${pct}%, transparent)`;

            const glassBg = `color-mix(in srgb, ${nav.ground} ${isDark ? 62 : 74}%, transparent)`;
            const textColor = nav.ink;
            const mutedColor = mix(60);
            const hoverBg = mix(isDark ? 10 : 6);
            const borderColor = mix(isDark ? 14 : 9);
            const shadow = isDark ? '0 12px 32px rgb(0 0 0 / 0.28)' : '0 12px 32px rgb(28 37 46 / 0.10)';
            const activeStyle = `color: ${nav.primary.ink}; background: ${nav.primary.main};`;
            const linkStyle = (active) => active ? activeStyle : `color: ${textColor}; background: transparent;`;

            const logoPath = config && config[`logo_square_${nav.logoScheme}_base64`]
                ? config[`logo_square_${nav.logoScheme}_base64`]
                : this.getDefaultLogoPath(nav.logoScheme, basePath);
            
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
            
            const positionClass = this.positionClass(isHome);

            // The bar is asked to render on every poll of the app (every few seconds, and in a
            // burst when a background tab comes back). It is repainted only when something it
            // shows has changed, and a repaint after the first never replays the entrance.
            const signature = JSON.stringify([nav, logoPath, statusText, lastErrorStr, cleanAppName, hostPill, isHome, isFlows, positionClass, config && config.isMock]);
            if (signature === this.lastSignature && document.getElementById('nav-banner-wrapper')) return;
            const first = !this.lastSignature;
            this.lastSignature = signature;
            const entrance = first ? 'max-height: 0px; opacity: 0; transform: translateY(-20px);' : 'max-height: 500px; opacity: 1; transform: translateY(0);';
            const clip = first ? ' overflow-hidden' : '';
            
            // Render regular top banner
            const bannerHtml = `
                <div id="nav-banner-wrapper" class="${positionClass} top-0 z-[100] transition-all duration-500${clip} pt-2 px-2 pb-2 md:pt-4 md:px-4 md:pb-2 w-full pointer-events-none" style="${entrance}" data-scheme="${nav.scheme}">
                    <div class="rounded-[2rem] p-3 md:p-4 flex flex-row items-center mx-auto max-w-7xl pointer-events-auto" 
                         style="background: ${glassBg}; border: 1px solid ${borderColor}; box-shadow: ${shadow}; -webkit-backdrop-filter: blur(20px) saturate(1.2); backdrop-filter: blur(20px) saturate(1.2); color: ${textColor}; flex-wrap: wrap;">
                         
                        <div class="flex items-center px-4 py-1 overflow-hidden shrink-0">
                          <a href="${homeLink}">
                            <img alt="Infonite Logo" src="${logoPath}" class="max-h-7 md:max-h-8 max-w-[130px] md:max-w-[180px] w-auto h-auto object-contain block" />
                          </a>
                        </div>
                        
                        <!-- Desktop Nav -->
                        <nav class="hidden md:flex items-center gap-1 md:ml-4 pl-4 h-8" style="border-left: 1px solid ${borderColor}">
                          <a href="${homeLink}" class="nav-link px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all" style="${linkStyle(isHome)}">Home</a>
                          <a href="${flowsHash}" class="nav-link px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all" style="${linkStyle(isFlows)}">Flows</a>
                        </nav>
                        
                        <!-- Mobile Menu Toggle -->
                        <div class="md:hidden ml-auto pr-2">
                          <button class="w-8 h-8 flex items-center justify-center transition-colors rounded-lg" style="color: ${mutedColor}" onclick="window.InfoniteNavBanner.toggleMobileMenu()">
                            <i class="fa-solid fa-bars text-lg"></i>
                          </button>
                        </div>
                        
                        <!-- Desktop Status & Settings (Hidden on Mobile) -->
                        <div class="hidden md:flex items-center gap-4 px-4 w-auto ml-auto pl-4" style="border-left: 1px solid ${borderColor};">
                          ${config && config.isMock ? `
                            <div class="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest mr-2" style="color: ${textColor}">
                              Select an App <i class="fa-solid fa-arrow-right-long ml-1"></i>
                            </div>
                          ` : `
                            <div class="flex flex-col items-end justify-center mr-2">
                              <div class="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.2em]" style="color: ${mutedColor}">
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
                        
                        <!-- Mobile Menu Dropdown (Includes Navigation Links, Status, and Settings) -->
                        <div id="nav-banner-mobile-menu" class="w-full hidden mt-3 flex-col gap-3 pt-3 border-t md:hidden" style="border-top-color: ${borderColor};">
                            <a href="${homeLink}" class="block w-full text-center px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all" style="${linkStyle(isHome)} border: 1px solid ${borderColor}">Home</a>
                            <a href="${flowsHash}" class="block w-full text-center px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all" style="${linkStyle(isFlows)} border: 1px solid ${borderColor}">Flows</a>
                            
                            ${config && !config.isMock ? `
                              <div class="flex items-center justify-between px-4 py-2 rounded-xl border" style="border-color: ${borderColor}; background: ${hoverBg}">
                                <div class="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.1em]" style="color: ${textColor}">
                                  ${hostPill} <span>${cleanAppName}</span>
                                </div>
                                <div class="flex items-center gap-1.5 px-2 py-0.5 rounded-md" style="border: 1px solid ${borderColor}">
                                  <span class="w-1.5 h-1.5 rounded-full ${statusColor}"></span>
                                  <span class="text-[9px] font-bold uppercase tracking-widest" style="color: ${textColor}">${statusText}</span>
                                </div>
                              </div>
                            ` : ''}
                            
                            <button class="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all font-bold text-[10px] uppercase tracking-widest" 
                                    onclick="if(typeof openSettings === 'function') openSettings(); else window.location.href='${homeLink}'" 
                                    style="background: ${hoverBg}; border: 1px solid ${borderColor}; color: ${textColor};">
                              <i class="fa-solid fa-cog"></i> Settings
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            this.container.innerHTML = bannerHtml;

            // The inactive links light up on hover with the ink thinned out, never with a colour
            this.container.querySelectorAll('.nav-link').forEach((link) => {
                if (link.style.background !== 'transparent') return;
                link.addEventListener('mouseenter', () => { link.style.background = hoverBg; });
                link.addEventListener('mouseleave', () => { link.style.background = 'transparent'; });
            });
            
            // Add dynamic positioning class resize handler
            const updatePositionClass = () => {
                const wrapper = document.getElementById('nav-banner-wrapper');
                if (wrapper) {
                    wrapper.classList.remove('relative', 'fixed', 'sticky', 'absolute');
                    wrapper.classList.add(this.positionClass(isHome));
                }
            };
            window.removeEventListener('resize', window._infoniteNavResizeHandler);
            window._infoniteNavResizeHandler = updatePositionClass;
            window.addEventListener('resize', updatePositionClass);
            
            // The entrance, once
            if (first) setTimeout(() => this.checkVisibility(), 50);
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

            // Remove overflow-hidden after transition to prevent shadow clipping
            setTimeout(() => {
                wrapper.classList.remove('overflow-hidden');
            }, 500);
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
