const BASE_URL = '/api';

function getToken() {
  return sessionStorage.getItem('token') || localStorage.getItem('token');
}

let isRedirecting = false;

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = getToken();
  const headers = {
    ...options.headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
  
  const res = await fetch(`${BASE_URL}${url}`, { ...options, headers });
  const data = await res.json().catch(() => null);
  
  if (!res.ok) {
    if (res.status === 401 && url !== '/login') {
      if (!isRedirecting) {
        isRedirecting = true;
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('school-current-user');
        sessionStorage.removeItem('auth_login_time');
        localStorage.removeItem('token');
        localStorage.removeItem('school-current-user');
        localStorage.removeItem('auth_login_time');

        window.dispatchEvent(new CustomEvent('auth-unauthorized'));

        // Only redirect if not already on the login or root screen
        if (window.location.pathname !== '/' && !window.location.pathname.startsWith('/register')) {
          window.location.href = '/';
        } else {
          setTimeout(() => { isRedirecting = false; }, 1000);
        }
      }
      return null;
    }
    throw new Error(data?.error || `API Error: ${res.status}`);
  }
  
  // Successful authenticated call resets any transient redirect flag
  isRedirecting = false;
  return data;
}

export const API = {
  login: (credentials: any) => fetchWithAuth('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials)
  }),
  logout: () => fetchWithAuth('/logout', { method: 'POST' }),

  getUsers: () => fetchWithAuth('/users'),
  createUser: (user: any) => fetchWithAuth('/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user)
  }),
  updateUser: (id: string | number, user: any) => fetchWithAuth(`/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user)
  }),
  deleteUser: (id: string | number) => fetchWithAuth(`/users/${id}`, { method: 'DELETE' }),

  getVisitors: () => fetchWithAuth('/visitors'),
  createVisitor: (formData: FormData) => fetchWithAuth('/visitors', {
    method: 'POST',
    body: formData
  }),
  updateVisitor: (id: string | number, formData: FormData) => fetchWithAuth(`/visitors/${id}`, {
    method: 'PUT',
    body: formData
  }),
  deleteVisitor: (id: string | number) => fetchWithAuth(`/visitors/${id}`, { method: 'DELETE' }),
  timeInVisitor: (id: string | number) => fetchWithAuth(`/visitors/${id}/timein`, { method: 'POST' }),
  timeOutVisitor: (id: string | number) => fetchWithAuth(`/visitors/${id}/timeout`, { method: 'POST' }),

  getEvents: () => fetchWithAuth('/events'),
  createEvent: (event: any) => fetchWithAuth('/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event)
  }),
  updateEvent: (id: string | number, event: any) => fetchWithAuth(`/events/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event)
  }),
  deleteEvent: (id: string | number) => fetchWithAuth(`/events/${id}`, { method: 'DELETE' }),

  preRegister: (data: any) => fetchWithAuth('/preregister', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  getPreRegistrations: () => fetchWithAuth('/preregister'),

  getDailyReport: () => fetchWithAuth('/reports/daily'),
  getWeeklyReport: () => fetchWithAuth('/reports/weekly'),
  getMonthlyReport: () => fetchWithAuth('/reports/monthly'),
  getPublicEvent: async (id: string | number) => {
    const res = await fetch(`/api/public/events/${id}`);
    if (!res.ok) throw new Error('Event not found');
    return await res.json();
  },

  getBackup: () => fetchWithAuth('/settings/backup'),
  clearData: () => fetchWithAuth('/settings/clear-data', { method: 'POST' }),
  restoreData: (backupData: any) => fetchWithAuth('/settings/restore-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(backupData)
  }),
  getAutoLogoutSettings: async () => {
    try {
      const token = getToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${BASE_URL}/settings/auto-logout`, { headers });
      if (res.ok) {
        return await res.json();
      }
      return null;
    } catch {
      return null;
    }
  },
  updateAutoLogoutSettings: (settings: { 
    enabled: boolean; 
    automaticLogoutEnabled?: boolean;
    durationValue: number; 
    durationUnit: 'minutes' | 'hours';
    warningDurationValue: number;
    warningDurationUnit: 'seconds' | 'minutes';
    isConfigured?: boolean;
  }) => fetchWithAuth('/settings/auto-logout', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...settings,
      automaticLogoutEnabled: settings.automaticLogoutEnabled !== undefined ? settings.automaticLogoutEnabled : settings.enabled
    })
  })
};
