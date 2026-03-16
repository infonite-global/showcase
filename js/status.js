/**
 * Infonite Shared Status Dictionary
 * Maps backend flow status enums to frontend UI components (color, icon, messaging).
 * Includes custom frontend-injected states like USER_ONLINE and USER_IDLE.
 */

const FlowStatusCode = {
    // Interaction available
    READY: { text: 'READY', col: 'blue', icon: 'fa-box' },
    // Flow is waiting for an external event
    WAITING: { text: 'WAITING', col: 'indigo', icon: 'fa-hourglass-start' },

    // FINAL STATUS
    COMPLETED: { text: 'COMPLETED', col: 'green', icon: 'fa-check', detail: 'The data extraction flow finished successfully.' },
    FAILED: { text: 'FAILED', col: 'red', icon: 'fa-triangle-exclamation', detail: 'The experience did not finish successfully.' },
    SYSTEM_CANCELLED: { text: 'SYSTEM CANCELLED', col: 'slate', icon: 'fa-ban', detail: 'The flow was automatically cancelled by the system.' },
    CLIENT_CANCELLED: { text: 'CLIENT CANCELLED', col: 'slate', icon: 'fa-ban', detail: 'You have cancelled this session.' },
    CUSTOMER_CANCELLED: { text: 'CUSTOMER CANCELLED', col: 'slate', icon: 'fa-ban', detail: 'The customer abandoned the session.' },
    TIMED_OUT: { text: 'TIMED OUT', col: 'amber', icon: 'fa-clock', detail: 'Session expired before completion.' },
    CONFIGURATION_ERROR: { text: 'CONFIG ERROR', col: 'red', icon: 'fa-triangle-exclamation', detail: 'The generated parameters were invalid.' },

    // CUSTOM FRONTEND STATES (Derived from ping_date)
    USER_ONLINE: { text: 'User online', detail: 'User is active in the experience.', col: 'emerald', icon: 'fa-user', pulse: true },
    USER_IDLE: { text: 'User idle', detail: 'User is inactive in the experience.', col: 'amber', icon: 'fa-hourglass', spin: true },
    READY: { text: 'Waiting for user', detail: 'Waiting for user to open the widget.', col: 'blue', icon: 'fa-bullseye', pulse: true }
};

window.InfoniteStatusDict = FlowStatusCode;
