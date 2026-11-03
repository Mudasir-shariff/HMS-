export const queryKeys = {
  visits: {
    all: ['visits'] as const,
    list: (filters?: { doctorId?: string; status?: string; date?: string }) =>
      ['visits', 'list', filters] as const,
    detail: (id: string) => ['visits', 'detail', id] as const,
  },
  patients: {
    all: ['patients'] as const,
    search: (term?: string) => ['patients', 'search', term || ''] as const,
    detail: (id: string) => ['patients', 'detail', id] as const,
  },
  prescriptions: {
    all: ['prescriptions'] as const,
    byVisit: (visitId: string) => ['prescriptions', 'byVisit', visitId] as const,
    detail: (id: string) => ['prescriptions', 'detail', id] as const,
  },
  drugs: {
    all: ['drugs'] as const,
    active: () => ['drugs', 'active'] as const,
    detail: (id: string) => ['drugs', 'detail', id] as const,
  },
  doctors: {
    all: ['doctors'] as const,
  },
  users: {
    all: ['users'] as const,
    detail: (id: string) => ['users', 'detail', id] as const,
  },
  dispensings: {
    all: ['dispensings'] as const,
    detail: (id: string) => ['dispensings', 'detail', id] as const,
  },
  wards: {
    all: ['wards'] as const,
  },
  beds: {
    all: ['beds'] as const,
  },
  admissions: {
    all: ['admissions'] as const,
  },
  settings: {
    all: ['settings'] as const,
    current: ['settings'] as const,
  },
};
