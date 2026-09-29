export type VisitorStatus = 'signed-in' | 'signed-out' | 'pre-registered';

export interface VisitEntry {
  id: string;
  signInTime: number;
  signOutTime?: number;
  purpose: string;
  visiting: string;
  visitorType?: string;
  status: VisitorStatus;
}

export interface Visitor {
  id: string;
  name: string;
  purpose: string; // Latest purpose
  visiting: string; // Latest visiting
  visitorType?: string; // Latest visitorType
  idType?: string;
  idNumber?: string;
  visitorNumber?: string;
  visitor_number?: string;
  contactNumber?: string;
  address?: string;
  notes?: string;
  photoDataUrl?: string | null;
  photo?: string | null;
  photo_url?: string | null;
  signInTime: number; // Latest signInTime
  signOutTime?: number; // Latest signOutTime
  status: VisitorStatus; // Latest status
  eventId?: string;
  history?: VisitEntry[]; // All visits
}

export interface User {
  id: string;
  fullName: string;
  username: string;
  password?: string;
  role: string;
  status: 'Active' | 'Inactive';
  lastLogin?: number;
  lastLogout?: number;
}

export interface AutoLogoutSettings {
  enabled: boolean;
  automaticLogoutEnabled?: boolean;
  durationValue: number;
  durationUnit: 'minutes' | 'hours';
  warningDurationValue: number;
  warningDurationUnit: 'seconds' | 'minutes';
  isConfigured?: boolean;
}

export const DEFAULT_AUTO_LOGOUT_SETTINGS: AutoLogoutSettings = {
  enabled: true,
  automaticLogoutEnabled: true,
  durationValue: 2,
  durationUnit: 'minutes',
  warningDurationValue: 10,
  warningDurationUnit: 'seconds',
  isConfigured: false
};

export function getStoredAutoLogoutSettings(): AutoLogoutSettings {
  try {
    const raw = localStorage.getItem('auto_logout_settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        const isEnabled = parsed.automaticLogoutEnabled !== undefined
          ? Boolean(parsed.automaticLogoutEnabled)
          : (parsed.enabled !== undefined ? Boolean(parsed.enabled) : true);
        const isConfigured = Boolean(parsed.isConfigured);

        return {
          enabled: isEnabled,
          automaticLogoutEnabled: isEnabled,
          durationValue: Number(parsed.durationValue) > 0 ? Number(parsed.durationValue) : 2,
          durationUnit: parsed.durationUnit === 'hours' ? 'hours' : 'minutes',
          warningDurationValue: Number(parsed.warningDurationValue) > 0 ? Number(parsed.warningDurationValue) : 10,
          warningDurationUnit: parsed.warningDurationUnit === 'minutes' ? 'minutes' : 'seconds',
          isConfigured
        };
      }
    }

    // Direct key in localStorage
    const directVal = localStorage.getItem('automaticLogoutEnabled');
    if (directVal !== null) {
      const isEnabled = directVal === 'true' || directVal === '1';
      return {
        ...DEFAULT_AUTO_LOGOUT_SETTINGS,
        enabled: isEnabled,
        automaticLogoutEnabled: isEnabled,
        isConfigured: true
      };
    }
  } catch (err) {
    console.warn('Error reading stored auto-logout settings:', err);
  }
  return { ...DEFAULT_AUTO_LOGOUT_SETTINGS };
}

export interface SchoolEvent {
  id: string;
  event_name?: string;
  name?: string;
  date: string;
  location: string;
  description: string;
  registration_link?: string;
  link?: string;
  status: 'active' | 'inactive';
}


