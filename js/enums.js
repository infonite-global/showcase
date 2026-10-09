window.INFONITE_ENUMS = {
  ACADEMIC_DATA_TYPES: {
    'academic_data:secondary_general': { label: 'Secondary General Education', icon: 'fa-school' },
    'academic_data:secondary_vocational': { label: 'Vocational Training and Professional Studies', icon: 'fa-tools' },
    'academic_data:higher_bachelor': { label: 'Bachelor or Equivalent Level', icon: 'fa-graduation-cap' },
    'academic_data:higher_master': { label: 'Master or Equivalent Level', icon: 'fa-user-graduate' },
    'academic_data:higher_doctorate': { label: 'Doctoral or Equivalent Level', icon: 'fa-microscope' },
    'academic_data:health_specialization': { label: 'Specialized Health Residency', icon: 'fa-user-doctor' },
    'academic_data:professional_certification': { label: 'Professional Competence Certification', icon: 'fa-certificate' },
    'academic_data:non_formal_education': { label: 'Non-Formal Education and Lifelong Learning', icon: 'fa-book-open' }
  },
  WORK_RELATION_TYPES: {
    'employee': { label: 'Employee', icon: 'fa-building' },
    'self_employed': { label: 'Self Employed', icon: 'fa-user-tie' },
    'public_employee': { label: 'Public Employee', icon: 'fa-landmark' },
    'vacations': { label: 'Paid Vacations', icon: 'fa-umbrella-beach' },
    'unemployment_benefits': { label: 'Unemployment Benefits', icon: 'fa-hand-holding-dollar' },
    'other': { label: 'Other', icon: 'fa-briefcase' },
    'unknown': { label: 'Unknown', icon: 'fa-circle-question' }
  },
  // VehicleIncidentFlag (core): what the registry flags on a vehicle. Every one is a red flag.
  VEHICLE_INCIDENT_FLAGS: {
    'seizure': { label: 'Seizure', icon: 'fa-gavel', text: 'Seized by a court or an administration: the vehicle answers for a debt.' },
    'seal': { label: 'Seal', icon: 'fa-lock', text: 'Under an order that immobilises it.' },
    'financing_charge': { label: 'Financing charge', icon: 'fa-building-columns', text: 'A financial institution holds a charge on it, such as a retention of title.' },
    'temporary_deregistration': { label: 'Temporarily deregistered', icon: 'fa-circle-pause', text: 'Off the road for now: it may not circulate.' },
    'permanent_deregistration': { label: 'Permanently deregistered', icon: 'fa-ban', text: 'Off the road for good: it can never circulate again.' },
    'theft_deregistration': { label: 'Reported stolen', icon: 'fa-user-secret', text: 'Deregistered after being reported stolen.' },
    'transfer_deregistration': { label: 'Transfer pending', icon: 'fa-right-left', text: 'Deregistered while a change of owner is pending.' }
  }
};
