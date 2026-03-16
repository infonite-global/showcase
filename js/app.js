const HomeView = { template: '#home-template' };
const FlowsView = { template: '#flows-template' };
// CitizenDataView and BankReaderView are defined globally in their respective files.
const routes = [
  { path: '/', component: HomeView, name: 'home' },
  { path: '/flows', component: FlowsView, name: 'flows' },
  { path: '/citizen-data', component: CitizenDataView, name: 'citizen-data' },
  { path: '/bank-reader', component: BankReaderView, name: 'bank-reader' },
];

const router = VueRouter.createRouter({
  history: VueRouter.createWebHashHistory(),
  routes
});

router.beforeEach((to, from, next) => {
  console.log(`[Vue Router] Navigating: ${from.path} -> ${to.path}`);
  next();
});
router.afterEach((to, from) => {
  console.log(`[Vue Router] Completed: ${to.path}`);
});

const globalStore = Vue.reactive({
  config: window.InfoniteConfigManager ? window.InfoniteConfigManager.getConfig() : {},
  version: window.InfoniteConfigManager ? window.InfoniteConfigManager.VERSION : 'v0.0.0',
  flows: window.INFONITE_FLOWS || {}
});

const app = Vue.createApp({
  data() {
    return {
      globalStore // Expose reactive store to all templates in the root
    };
  }
});

app.component('nav-banner', {
  template: '#nav-banner-template',
  data() {
    return {
      isMobileMenuOpen: false
    }
  },
  methods: {
    toggleMobileMenu() {
      this.isMobileMenuOpen = !this.isMobileMenuOpen;
    }
  }
});

// Make it available to all child components automatically
app.mixin({
  computed: {
    globalConfig() { return globalStore.config; },
    version() { return globalStore.version; },
    flows() { return Object.values(globalStore.flows); },
    isAppActive() { return globalStore.config?.appDetails?.isOnline === true; },
    appStatus() { return globalStore.config?.appDetails?.status || 'unreachable'; },
    appStatusTooltip() { return globalStore.config?.appDetails?.lastError || 'Active & Online'; }
  }
});

window.setGlobalConfig = (config) => {
    globalStore.config = config;
};

app.use(router);
app.mount('#app');
