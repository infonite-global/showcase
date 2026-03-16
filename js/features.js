/**
 * Centralized definition of Infonite Features and Flows.
 * These orchestrate the behavior, configuration defaults, and semantic UI data
 * for all interactive demos like Bank Reader and Citizen Data.
 */

// -------------------------------------------------------------
// 1. Feature Specifications
// Maps the backend's FeatureType enums to frontend UI elements,
// wording, and default configurations.
// -------------------------------------------------------------
const INFONITE_FEATURES = {
    // ---- Financial Features ----
    accounts_read: {
        code: 'accounts_read',
        name: 'Financial Accounts Read',
        workMessage: 'Retrieving your accounts',
        icon: 'fa-solid fa-piggy-bank',
        defaultConfig: {
            "read_holders": true,
            "read_transactions": true,
            "from_date": "60 days ago",
            "to_date": "today"
        }
    },
    cards_read: {
        code: 'cards_read',
        name: 'Financial Cards Read',
        workMessage: 'Retrieving your cards',
        icon: 'fa-solid fa-credit-card',
        defaultConfig: {
            "read_transactions": true,
            "from_date": "60 days ago",
            "to_date": "today",
            "filter_by_type": ["credit", "prepaid"]
        }
    },
    deposits_read: {
        code: 'deposits_read',
        name: 'Financial Deposits Read',
        workMessage: 'Retrieving your deposits',
        icon: 'fa-solid fa-vault',
        defaultConfig: {}
    },
    loans_read: {
        code: 'loans_read',
        name: 'Financial Loans Read',
        workMessage: 'Retrieving your loans',
        icon: 'fa-solid fa-hand-holding-dollar',
        defaultConfig: {}
    },
    credits_read: {
        code: 'credits_read',
        name: 'Financial Credits Read',
        workMessage: 'Retrieving your credits',
        icon: 'fa-solid fa-money-check-dollar',
        defaultConfig: {}
    },
    investment_accounts_read: {
        code: 'investment_accounts_read',
        name: 'Investment Accounts Read',
        workMessage: 'Retrieving your investment accounts',
        icon: 'fa-solid fa-chart-line',
        defaultConfig: {}
    },
    funds_read: {
        code: 'funds_read',
        name: 'Investment Funds Read',
        workMessage: 'Retrieving your funds',
        icon: 'fa-solid fa-money-bill-trend-up',
        defaultConfig: {}
    },
    stocks_read: {
        code: 'stocks_read',
        name: 'Investment Stocks Read',
        workMessage: 'Retrieving your stocks',
        icon: 'fa-solid fa-chart-simple',
        defaultConfig: {}
    },
    pensions_read: {
        code: 'pensions_read',
        name: 'Pension Plans Read',
        workMessage: 'Retrieving your pension plans',
        icon: 'fa-solid fa-umbrella',
        defaultConfig: {}
    },
    accounts_certificates: {
        code: 'accounts_certificates',
        name: 'Account Certificates Read',
        workMessage: 'Retrieving your account certificates',
        icon: 'fa-solid fa-file-invoice',
        defaultConfig: {}
    },
    direct_debits_read: {
        code: 'direct_debits_read',
        name: 'Direct Debits Read',
        workMessage: 'Retrieving your direct debits',
        icon: 'fa-solid fa-money-bill-transfer',
        defaultConfig: {}
    },

    // ---- Logged User Information ----
    customer_information_read: {
        code: 'customer_information_read',
        name: 'Customer Information Read',
        workMessage: 'Retrieving your personal information',
        icon: 'fa-solid fa-id-card',
        defaultConfig: {}
    },
    source_contracts_read: {
        code: 'source_contracts_read',
        name: 'Source Contracts Read',
        workMessage: 'Retrieving your source contracts', // default fallback
        icon: 'fa-solid fa-file-signature',
        defaultConfig: {}
    },

    // ---- Cloud Provider ----
    cloud_resource_read: {
        code: 'cloud_resource_read',
        name: 'Cloud Provider Resource Read',
        workMessage: 'Retrieving your cloud resources',
        icon: 'fa-solid fa-cloud',
        defaultConfig: {}
    },

    // ---- Accounting ----
    supplier_invoices_read: {
        code: 'supplier_invoices_read',
        name: 'Supplier Invoices Read',
        workMessage: 'Retrieving your supplier invoices',
        icon: 'fa-solid fa-file-invoice-dollar',
        defaultConfig: {}
    },
    client_invoices_read: {
        code: 'client_invoices_read',
        name: 'Client Invoices Read',
        workMessage: 'Retrieving your client invoices',
        icon: 'fa-solid fa-file-invoice-dollar',
        defaultConfig: {}
    },

    // ---- Public (Spain mostly for now) ----
    labor_check: {
        code: 'labor_check',
        name: 'Labor Check',
        workMessage: 'Consulting your labor information',
        icon: 'fa-solid fa-briefcase',
        defaultConfig: {}
    },
    public_pensions: {
        code: 'public_pensions',
        name: 'Public Pensions',
        workMessage: 'Consulting your public pensions',
        icon: 'fa-solid fa-building-columns',
        defaultConfig: {}
    },
    public_document_verification: {
        code: 'public_document_verification',
        name: 'Public Document Verification',
        workMessage: 'Verifying your documents',
        icon: 'fa-solid fa-certificate',
        defaultConfig: {}
    },
    yearly_tax_situation: {
        code: 'yearly_tax_situation',
        name: 'Yearly Tax Situation',
        workMessage: 'Consulting your tax situation',
        icon: 'fa-solid fa-file-invoice-dollar',
        defaultConfig: {}
    },
    citizen_data: {
        code: 'citizen_data',
        name: 'Public Citizen Data',
        workMessage: 'Consulting your citizen data',
        icon: 'fa-solid fa-passport',
        defaultConfig: {}
    },
    driver_data: {
        code: 'driver_data',
        name: 'Driver & Vehicles Data',
        workMessage: 'Consulting your driver data',
        icon: 'fa-solid fa-car',
        defaultConfig: {}
    },
    academic_data: {
        code: 'academic_data',
        name: 'Academic Data',
        workMessage: 'Consulting your academic data',
        icon: 'fa-solid fa-graduation-cap',
        defaultConfig: {}
    }
};

// -------------------------------------------------------------
// 2. Flows Specifications
// Defines the high-level interactive experiences and their paths.
// -------------------------------------------------------------
const INFONITE_FLOWS = {
    bank_reader: {
        kind: 'bank_reader',
        name: 'Financial Data Reader',
        shortName: 'Bank Reader',
        icon: 'fa-solid fa-building-columns',
        description: 'Seamless financial data aggregation and identity verification module.',
        route: '/bank-reader',
        // Example array of what a standard init could look like
        defaultFeatures: [
            'customer_information_read', 
            'accounts_read', 
            'cards_read'
        ]
    },
    es_citizen_data: {
        kind: 'es_citizen_data',
        name: 'Spain Citizen Data',
        shortName: 'Citizen Data',
        icon: 'fa-solid fa-id-card-clip',
        description: 'Access and retrieve verified public administration data including labor, driving, and tax records instantly.',
        route: '/citizen-data',
        defaultFeatures: [
            'customer_information_read', 
            'citizen_data', 
            'driver_data', 
            'labor_check', 
            'yearly_tax_situation',
            'academic_data'
        ]
    }
};

window.INFONITE_FEATURES = INFONITE_FEATURES;
window.INFONITE_FLOWS = INFONITE_FLOWS;
