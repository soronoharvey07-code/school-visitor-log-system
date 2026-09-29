/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Menu, X, Shield, LayoutDashboard, UserPlus, Users, Calendar, BarChart2, Settings, LogOut, Eye, EyeOff, AlertCircle, Clock, Loader2 } from 'lucide-react';
import rhmcLogo from './assets/images/rhmc-logo.webp';
import { API } from './api';
import { DashboardView } from './components/views/DashboardView';
import { AdminView } from './components/views/AdminView';
import { RegisterView } from './components/views/RegisterView';
import { AllVisitorsView } from './components/views/AllVisitorsView';
import { EventView } from './components/views/EventView';
import { ReportsView } from './components/views/ReportsView';
import { SettingsView } from './components/views/SettingsView';
import { EventRegistration } from './components/views/EventRegistration';
import { StatsRow } from './components/StatsRow';
import { User, AutoLogoutSettings, getStoredAutoLogoutSettings } from './types';
import { consolidateVisitors } from './utils/visitorManager';
import { syncIdSequence, resetIdSequence } from './utils/idSequence';
import { formatManilaTime, formatManilaFullDate, parseToMs, parseOptionalToMs } from './utils/dateUtils';

type Tab = 'dashboard' | 'admin' | 'register' | 'visitors' | 'all-visitors' | 'event' | 'reports' | 'settings';

const initialUsers: User[] = [
  {
    id: '1',
    fullName: 'Admin',
    username: 'Admin2026',
    password: 'RHMC_2026',
    role: 'Admin',
    status: 'Active',
  },
  {
    id: '2',
    fullName: 'Security Personnel',
    username: 'Guard',
    password: '2026_RHMC',
    role: 'Guard',
    status: 'Active',
  }
];

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return true; // default to dark
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const [currentTab, setCurrentTab] = useState<Tab>('dashboard');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showAutoLogoutModal, setShowAutoLogoutModal] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningCountdown, setWarningCountdown] = useState(15);
  const [showInvalidCredentialsModal, setShowInvalidCredentialsModal] = useState(false);
  const [loginErrorTitle, setLoginErrorTitle] = useState('Invalid Credentials');
  const [loginErrorMessage, setLoginErrorMessage] = useState('Username or password is incorrect. Please try again.');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const isLoggingInRef = useRef(false);
  const [showPassword, setShowPassword] = useState(false);
  const [time, setTime] = useState(new Date('2026-07-07T13:37:24'));
  const menuRef = useRef<HTMLDivElement>(null);
  
  const [users, setUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem('school-users');
    return saved ? JSON.parse(saved) : initialUsers;
  });

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    // Clear any persistent tokens from localStorage so reopening the app requires login
    localStorage.removeItem('token');
    localStorage.removeItem('school-current-user');
    localStorage.removeItem('auth_login_time');

    const token = sessionStorage.getItem('token');
    if (!token) {
      sessionStorage.removeItem('school-current-user');
      return null;
    }
    const saved = sessionStorage.getItem('school-current-user');
    return saved ? JSON.parse(saved) : null;
  });

  // Auto-Logout settings state (persists across app restarts in localStorage & database)
  const [autoLogoutSettings, setAutoLogoutSettings] = useState<AutoLogoutSettings>(getStoredAutoLogoutSettings);

  // Public Event Registration route check
  const params = new URLSearchParams(window.location.search);
  let eventIdParam = params.get('event');
  
  if (!eventIdParam && window.location.pathname.startsWith('/register/')) {
    eventIdParam = window.location.pathname.split('/register/')[1];
  }

  if (eventIdParam) {
    eventIdParam = eventIdParam.split('?')[0].split('#')[0].replace(/\/+$/, '').trim();
    if (!eventIdParam) {
      eventIdParam = null;
    }
  }

  const isDataClearedRef = useRef(false);

  const [visitors, setVisitors] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('school-visitor-log');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return consolidateVisitors(parsed);
        }
      }
    } catch (e) {
      console.warn('Error reading initial visitors from localStorage:', e);
    }
    return [];
  });

  useEffect(() => {
    // Only save to localStorage if visitors array has items or data was explicitly cleared
    if (visitors.length > 0 || isDataClearedRef.current) {
      localStorage.setItem('school-visitor-log', JSON.stringify(visitors));
    }
  }, [visitors]);

  useEffect(() => {
    localStorage.setItem('school-users', JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('school-current-user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('school-current-user');
    }
  }, [currentUser]);

  useEffect(() => {
    const updateFromStorage = () => {
      const saved = localStorage.getItem('school-visitor-log');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            const consolidated = consolidateVisitors(parsed);
            setVisitors(consolidated);
            syncIdSequence(consolidated);
          }
        } catch (err) {}
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'school-visitor-log') {
        updateFromStorage();
      }
    };

    const handleDataCleared = () => {
      isDataClearedRef.current = true;
      setVisitors([]);
      localStorage.removeItem('school-visitor-log');
      localStorage.removeItem('svlms_deleted_visitor_ids');
      resetIdSequence();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('visitor-registered', updateFromStorage);
    window.addEventListener('data-cleared', handleDataCleared);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('visitor-registered', updateFromStorage);
      window.removeEventListener('data-cleared', handleDataCleared);
    };
  }, []);

  useEffect(() => {
    // For visual parity with the screenshots, keep the clock ticking
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  
  // --- AUTOMATIC LOGOUT INACTIVITY LIFECYCLE MANAGER ---
  // Authoritative references for session isolation & stale timer prevention
  const sessionGenerationRef = useRef<number>(0);
  const inactivityTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const activityListenersAttachedRef = useRef<boolean>(false);
  const lastActivityThrottleRef = useRef<number>(0);
  const isWarningActiveRef = useRef<boolean>(false);

  // Activity detection: mousemove, mousedown, click, keydown, scroll, touchstart
  const handleUserActivity = useCallback(() => {
    // When warning popup is visible, do NOT cancel the warning or reset the timer
    // for minor mouse movement, typing, cursor movement, scrolling, or casual hovering.
    // The warning must remain visible until the user explicitly clicks "Stay Logged In".
    if (isWarningActiveRef.current) {
      return;
    }

    const now = Date.now();
    // Throttle activity updates to at most once every 300ms for performance
    if (now - lastActivityThrottleRef.current < 300) {
      return;
    }
    lastActivityThrottleRef.current = now;
    lastActivityRef.current = now;
    sessionStorage.setItem('auth_last_activity', String(now));
  }, []);

  // Stable activity listener attachment
  const attachActivityListeners = useCallback(() => {
    if (activityListenersAttachedRef.current) return;
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(evt => {
      window.addEventListener(evt, handleUserActivity, { passive: true });
    });
    activityListenersAttachedRef.current = true;
    console.log('[AUTO-LOGOUT] Activity listeners attached');
  }, [handleUserActivity]);

  // Stable activity listener removal
  const removeActivityListeners = useCallback(() => {
    if (!activityListenersAttachedRef.current) return;
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(evt => {
      window.removeEventListener(evt, handleUserActivity);
    });
    activityListenersAttachedRef.current = false;
    console.log('[AUTO-LOGOUT] Activity listeners removed');
  }, [handleUserActivity]);

  // Stop current session timer and remove activity listeners
  const cleanupSessionTimers = useCallback((reason?: string) => {
    console.log(`[AUTO-LOGOUT] CLEANUP SESSION - Reason: ${reason || 'unspecified'}`);
    isWarningActiveRef.current = false;
    if (inactivityTimerRef.current) {
      clearInterval(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    removeActivityListeners();
    setShowWarningModal(false);
  }, [removeActivityListeners]);

  // Centralized Automatic Logout Inactivity Session Manager
  const startSessionLifecycle = useCallback((user: User, settings: AutoLogoutSettings) => {
    // 1. Clean up any previous session timer & listeners completely
    cleanupSessionTimers('initializing fresh session');

    const isEnabled = Boolean(
      settings.automaticLogoutEnabled !== undefined
        ? settings.automaticLogoutEnabled
        : settings.enabled
    );

    // If automaticLogoutEnabled === true: start timer else: do not start timer
    if (!user || !isEnabled) {
      console.log('[AUTO-LOGOUT] Session timer NOT started: user is null or automaticLogoutEnabled is false');
      return;
    }

    // 2. Increment session generation to prevent any stale async/timer callbacks
    sessionGenerationRef.current += 1;
    const currentGeneration = sessionGenerationRef.current;

    // Calculate durations
    const durationMinutes = settings.durationUnit === 'hours'
      ? settings.durationValue * 60
      : settings.durationValue;
    const durationMs = Math.max(5000, durationMinutes * 60 * 1000);

    const warningDurationSec = settings.warningDurationUnit === 'minutes'
      ? (settings.warningDurationValue || 10) * 60
      : (settings.warningDurationValue || 10);
    const warningDurationMs = Math.min(warningDurationSec * 1000, Math.max(1000, durationMs - 1000));
    const warningThresholdMs = Math.max(0, durationMs - warningDurationMs);

    // 3. Set last activity timestamp (preserve from sessionStorage if recent and unexpired, else Date.now())
    const now = Date.now();
    const storedActivity = sessionStorage.getItem('auth_last_activity');
    let initialActivity = now;
    if (storedActivity) {
      const parsed = parseInt(storedActivity, 10);
      // Only keep stored activity if it's within the session duration; otherwise start fresh
      if (!isNaN(parsed) && parsed > 0 && parsed <= now && (now - parsed < durationMs)) {
        initialActivity = parsed;
      }
    }
    lastActivityRef.current = initialActivity;
    sessionStorage.setItem('auth_last_activity', String(initialActivity));
    isWarningActiveRef.current = false;

    // 4. Attach activity listeners for this session
    attachActivityListeners();

    console.log(`[AUTO-LOGOUT] START INACTIVITY TIMER (Session #${currentGeneration}) - Duration: ${durationMinutes}m (${durationMs}ms), Warning: ${warningDurationSec}s (${warningDurationMs}ms), Threshold: ${warningThresholdMs}ms`);

    const checkInactivity = () => {
      // Stale timer guard: only execute if session generation matches
      if (sessionGenerationRef.current !== currentGeneration) {
        console.log(`[AUTO-LOGOUT] Stale timer tick ignored (Session #${currentGeneration} vs active #${sessionGenerationRef.current})`);
        if (inactivityTimerRef.current) {
          clearInterval(inactivityTimerRef.current);
          inactivityTimerRef.current = null;
        }
        return;
      }

      const currentTime = Date.now();
      const elapsed = currentTime - lastActivityRef.current;

      if (elapsed >= durationMs) {
        console.log(`[AUTO-LOGOUT] AUTOMATIC LOGOUT - Inactivity reached: ${elapsed}ms >= ${durationMs}ms (Session #${currentGeneration})`);
        isWarningActiveRef.current = false;
        cleanupSessionTimers('automatic logout reached');

        API.logout().catch(() => {});
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('school-current-user');
        sessionStorage.removeItem('auth_last_activity');
        sessionStorage.removeItem('auth_login_time');
        localStorage.removeItem('token');
        localStorage.removeItem('school-current-user');
        localStorage.removeItem('auth_last_activity');
        localStorage.removeItem('auth_login_time');

        // Note: Persistent settings in auto_logout_settings and automaticLogoutEnabled are NOT modified!
        setCurrentUser(null);
        setIsLoggingIn(false);
        isLoggingInRef.current = false;
        setShowWarningModal(false);
        setIsMenuOpen(false);
        setShowLogoutModal(false);
        setShowAutoLogoutModal(true);
      } else if (elapsed >= warningThresholdMs) {
        isWarningActiveRef.current = true;
        setShowWarningModal(true);
        const remaining = Math.max(0, Math.ceil((durationMs - elapsed) / 1000));
        setWarningCountdown(remaining);
      } else {
        isWarningActiveRef.current = false;
        setShowWarningModal(false);
      }
    };

    checkInactivity();
    inactivityTimerRef.current = setInterval(checkInactivity, 500);
  }, [attachActivityListeners, cleanupSessionTimers]);

  // Synchronize Auto-Logout settings on application startup and listen for custom update events
  useEffect(() => {
    const syncAutoLogoutSettings = async () => {
      try {
        const localSettings = getStoredAutoLogoutSettings();
        console.log('[AUTO-LOGOUT] LOAD SETTINGS - Initial local settings:', localSettings);
        const data = await API.getAutoLogoutSettings();
        if (data && typeof data === 'object') {
          console.log('[AUTO-LOGOUT] LOAD SETTINGS - Fetched on app start:', data);
          if (data.isConfigured || !localSettings.isConfigured) {
            const isEnabled = Boolean(
              data.automaticLogoutEnabled !== undefined ? data.automaticLogoutEnabled : data.enabled
            );
            const normalized: AutoLogoutSettings = {
              enabled: isEnabled,
              automaticLogoutEnabled: isEnabled,
              durationValue: Number(data.durationValue) > 0 ? Number(data.durationValue) : (localSettings.durationValue || 2),
              durationUnit: data.durationUnit === 'hours' ? 'hours' : (localSettings.durationUnit || 'minutes'),
              warningDurationValue: Number(data.warningDurationValue) > 0 ? Number(data.warningDurationValue) : (localSettings.warningDurationValue || 10),
              warningDurationUnit: data.warningDurationUnit === 'minutes' ? 'minutes' : (localSettings.warningDurationUnit || 'seconds'),
              isConfigured: Boolean(data.isConfigured)
            };
            setAutoLogoutSettings(normalized);
            localStorage.setItem('auto_logout_settings', JSON.stringify(normalized));
            localStorage.setItem('automaticLogoutEnabled', String(isEnabled));
          }
        }
      } catch {
        const cached = getStoredAutoLogoutSettings();
        console.log('[AUTO-LOGOUT] LOAD SETTINGS - Fallback cached settings:', cached);
        setAutoLogoutSettings(cached);
      }
    };

    syncAutoLogoutSettings();

    const handleSettingsUpdated = (e: any) => {
      if (e.detail && typeof e.detail === 'object') {
        const isEnabled = Boolean(
          e.detail.automaticLogoutEnabled !== undefined ? e.detail.automaticLogoutEnabled : e.detail.enabled
        );
        const normalized: AutoLogoutSettings = {
          enabled: isEnabled,
          automaticLogoutEnabled: isEnabled,
          durationValue: Number(e.detail.durationValue) > 0 ? Number(e.detail.durationValue) : 2,
          durationUnit: e.detail.durationUnit === 'hours' ? 'hours' : 'minutes',
          warningDurationValue: Number(e.detail.warningDurationValue) > 0 ? Number(e.detail.warningDurationValue) : 10,
          warningDurationUnit: e.detail.warningDurationUnit === 'minutes' ? 'minutes' : 'seconds',
          isConfigured: true
        };
        console.log('[AUTO-LOGOUT] auto-logout-updated received in App:', normalized);
        setAutoLogoutSettings(normalized);
        localStorage.setItem('auto_logout_settings', JSON.stringify(normalized));
        localStorage.setItem('automaticLogoutEnabled', String(isEnabled));
      } else {
        syncAutoLogoutSettings();
      }
    };

    window.addEventListener('auto-logout-updated', handleSettingsUpdated);
    return () => window.removeEventListener('auto-logout-updated', handleSettingsUpdated);
  }, []);

  const handleUpdateAutoLogoutSettings = (newSettings: AutoLogoutSettings) => {
    const isEnabled = Boolean(
      newSettings.automaticLogoutEnabled !== undefined ? newSettings.automaticLogoutEnabled : newSettings.enabled
    );
    const normalized: AutoLogoutSettings = {
      ...newSettings,
      enabled: isEnabled,
      automaticLogoutEnabled: isEnabled,
      isConfigured: true
    };
    console.log('[AUTO-LOGOUT] UPDATE SETTINGS in App - automaticLogoutEnabled:', isEnabled);
    setAutoLogoutSettings(normalized);
    localStorage.setItem('auto_logout_settings', JSON.stringify(normalized));
    localStorage.setItem('automaticLogoutEnabled', String(isEnabled));
  };

  // Automatic Logout Timer lifecycle tied strictly to authenticated user & autoLogoutSettings
  useEffect(() => {
    if (currentUser) {
      startSessionLifecycle(currentUser, autoLogoutSettings);
    } else {
      cleanupSessionTimers('user not logged in');
    }

    return () => {
      cleanupSessionTimers('session lifecycle cleanup');
    };
  }, [currentUser, autoLogoutSettings, startSessionLifecycle, cleanupSessionTimers]);

  const handleStayLoggedIn = () => {
    console.log('[AUTO-LOGOUT] User clicked "Stay Logged In" -> Resetting inactivity timer');
    const now = Date.now();
    isWarningActiveRef.current = false;
    lastActivityRef.current = now;
    sessionStorage.setItem('auth_last_activity', String(now));
    setShowWarningModal(false);
  };
  const handleKeepLoggedIn = handleStayLoggedIn;

  const handleWarningLogout = () => {
    console.log('[AUTO-LOGOUT] User clicked "Log Out" on warning modal');
    isWarningActiveRef.current = false;
    setShowWarningModal(false);
    handleLogout();
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isLoggingInRef.current) {
      return;
    }
    isLoggingInRef.current = true;
    setIsLoggingIn(true);

    const formData = new FormData(e.currentTarget);
    const username = (formData.get('username') as string).trim();
    const password = (formData.get('password') as string).trim();
    
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        if (res.status === 401) {
          setLoginErrorTitle('Invalid Credentials');
          setLoginErrorMessage('Username or password is incorrect. Please try again.');
        } else if (res.status === 503) {
          setLoginErrorTitle('Service Initializing');
          setLoginErrorMessage(data?.error || 'Authentication service is initializing. Please try again in a moment.');
        } else {
          setLoginErrorTitle('Login Failed');
          setLoginErrorMessage(data?.error || 'An unexpected error occurred during login. Please try again.');
        }
        setShowInvalidCredentialsModal(true);
        return;
      }

      if (!data || !data.token || !data.user) {
        setLoginErrorTitle('Login Failed');
        setLoginErrorMessage('Invalid response received from authentication server. Please try again.');
        setShowInvalidCredentialsModal(true);
        return;
      }

      sessionStorage.setItem('token', data.token);

      // Load saved Automatic Logout configuration from server
      let currentAutoLogout = getStoredAutoLogoutSettings();
      console.log('[AUTO-LOGOUT] LOAD SETTINGS - Initial from localStorage:', currentAutoLogout);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const headers: Record<string, string> = { Authorization: `Bearer ${data.token}` };
        const autoLogoutRes = await fetch('/api/settings/auto-logout', {
          headers,
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (autoLogoutRes.ok) {
          const fetchedSettings = await autoLogoutRes.json().catch(() => null);
          if (fetchedSettings && typeof fetchedSettings === 'object') {
            console.log('[AUTO-LOGOUT] LOAD SETTINGS - Fetched on login:', fetchedSettings);
            if (fetchedSettings.isConfigured || !currentAutoLogout.isConfigured) {
              const isEnabled = Boolean(
                fetchedSettings.automaticLogoutEnabled !== undefined
                  ? fetchedSettings.automaticLogoutEnabled
                  : fetchedSettings.enabled
              );
              currentAutoLogout = {
                enabled: isEnabled,
                automaticLogoutEnabled: isEnabled,
                durationValue: Number(fetchedSettings.durationValue) > 0 ? Number(fetchedSettings.durationValue) : (currentAutoLogout.durationValue || 2),
                durationUnit: fetchedSettings.durationUnit === 'hours' ? 'hours' : (currentAutoLogout.durationUnit || 'minutes'),
                warningDurationValue: Number(fetchedSettings.warningDurationValue) > 0 ? Number(fetchedSettings.warningDurationValue) : (currentAutoLogout.warningDurationValue || 10),
                warningDurationUnit: fetchedSettings.warningDurationUnit === 'minutes' ? 'minutes' : (currentAutoLogout.warningDurationUnit || 'seconds'),
                isConfigured: Boolean(fetchedSettings.isConfigured)
              };
            } else if (currentAutoLogout.isConfigured) {
              // Re-seed server if server was cold/unconfigured
              fetch('/api/settings/auto-logout', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.token}` },
                body: JSON.stringify(currentAutoLogout)
              }).catch(() => {});
            }
            localStorage.setItem('auto_logout_settings', JSON.stringify(currentAutoLogout));
            localStorage.setItem('automaticLogoutEnabled', String(currentAutoLogout.enabled));
          }
        }
      } catch (err) {
        console.warn('[AUTO-LOGOUT] Could not refresh auto-logout settings on login (using cached):', err);
      }

      const isEnabled = Boolean(
        currentAutoLogout.automaticLogoutEnabled !== undefined
          ? currentAutoLogout.automaticLogoutEnabled
          : currentAutoLogout.enabled
      );

      console.log('[AUTO-LOGOUT] LOGIN - User:', data.user?.username, 'Role:', data.user?.role, 'automaticLogoutEnabled:', isEnabled);
      setAutoLogoutSettings(currentAutoLogout);

      // Record fresh initial activity for this session
      const now = Date.now();
      sessionStorage.setItem('auth_last_activity', String(now));
      sessionStorage.setItem('school-current-user', JSON.stringify(data.user));

      // Clear any legacy persistent localStorage auth keys
      localStorage.removeItem('token');
      localStorage.removeItem('school-current-user');
      localStorage.removeItem('auth_last_activity');
      localStorage.removeItem('auth_login_time');

      setShowAutoLogoutModal(false);
      setShowWarningModal(false);

      setCurrentUser(data.user);
      
      const roleLower = (data.user?.role || '').toLowerCase();
      if (roleLower === 'admin' || roleLower === 'administrator') {
        setCurrentTab('admin');
      } else {
        setCurrentTab('dashboard');
      }
    } catch (err: any) {
      console.error('[LOGIN ERROR]', err);
      setLoginErrorTitle('Connection Error');
      setLoginErrorMessage('Unable to connect to the server. Please check your network connection and try again.');
      setShowInvalidCredentialsModal(true);
    } finally {
      isLoggingInRef.current = false;
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    console.log('[AUTO-LOGOUT] LOGOUT - Manual user logout');
    cleanupSessionTimers('manual user logout');
    API.logout().catch(() => {});
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('school-current-user');
    sessionStorage.removeItem('auth_last_activity');
    sessionStorage.removeItem('auth_login_time');
    localStorage.removeItem('token');
    localStorage.removeItem('school-current-user');
    localStorage.removeItem('auth_last_activity');
    localStorage.removeItem('auth_login_time');
    setCurrentUser(null);
    setIsLoggingIn(false);
    isLoggingInRef.current = false;
    setShowWarningModal(false);
    setShowAutoLogoutModal(false);
    setIsMenuOpen(false);
    setShowLogoutModal(false);
  };

  const handleLogoutRequest = () => {
    setIsMenuOpen(false);
    setShowLogoutModal(true);
  };


  const formatTime = (date: Date) => {
    return formatManilaTime(date);
  };

  const formatDate = (date: Date) => {
    return formatManilaFullDate(date);
  };

  const showStats = ['dashboard', 'register', 'visitors', 'all-visitors', 'reports'].includes(currentTab);

  const isAdmin = !currentUser || currentUser?.role?.toLowerCase() === 'admin' || currentUser?.role?.toLowerCase() === 'administrator';

  const menuItems = [
    ...(isAdmin ? [{ id: 'admin', label: 'Admin', icon: Shield }] : []),
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'register', label: 'Register', icon: UserPlus },
    { id: 'visitors', label: 'Visitors', icon: Users },
    { id: 'event', label: 'Event', icon: Calendar },
    { id: 'reports', label: 'Reports', icon: BarChart2 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ] as const;


  useEffect(() => {
    if (!currentUser) return;

    if (isAdmin) {
      API.getUsers().then(data => {
        if (Array.isArray(data)) {
          const normalized = data.map((u: any) => {
            const uname = String(u.username || '');
            const unameLower = uname.toLowerCase();
            let fullName = u.fullName;
            if (!fullName) {
              if (unameLower === 'admin2026' || unameLower === 'admin') {
                fullName = 'Admin';
              } else if (unameLower === 'guard') {
                fullName = 'Security Personnel';
              } else {
                fullName = uname;
              }
            }
            let role = u.role;
            if (role === 'admin' || role === 'Administrator') {
              role = 'Admin';
            }
            let status = u.status;
            if (!status) {
              status = (u.active === 0 || u.active === false) ? 'Inactive' : 'Active';
            }
            return {
              ...u,
              id: String(u.id),
              fullName,
              role,
              status
            };
          });
          setUsers(normalized);
        }
      }).catch(err => {
        console.warn('Unable to load users:', err);
      });
    }

    const fetchVisitors = () => {
      API.getVisitors().then(data => {
        if (Array.isArray(data)) {
          const mapped = data.map((v: any) => {
            let st = (v.status || '').toLowerCase();
            if (st === 'inside') st = 'signed-in';
            if (st === 'outside') st = 'signed-out';
            if (!st) st = 'pre-registered';

            const rawHistory = Array.isArray(v.history) ? v.history : [];
            const history = rawHistory.map((h: any) => ({
              id: String(h.id || ''),
              signInTime: parseToMs(h.signInTime || h.time_in || h.created_at),
              signOutTime: parseOptionalToMs(h.signOutTime || h.time_out),
              purpose: h.purpose || v.purpose || 'Visit',
              visiting: h.visiting || v.visit_info || '',
              visitorType: h.visitorType || v.visitor_type || 'Guest',
              status: h.status || st
            }));

            return {
              id: String(v.id),
              idNumber: v.visitor_number || v.id_number || v.idNumber || String(v.id),
              name: v.full_name || v.name || '',
              visitorType: v.visitor_type || v.visitorType || 'Guest',
              visiting: v.visit_info || v.visiting || 'Event',
              idType: v.id_type || v.idType || 'School ID',
              contactNumber: v.contact_number || v.contactNumber || '',
              address: v.address || '',
              purpose: v.purpose || 'Event Attendance',
              photo: v.photo_url || v.photoDataUrl || v.photo || null,
              photo_url: v.photo_url || v.photoDataUrl || v.photo || null,
              photoDataUrl: v.photo_url || v.photoDataUrl || v.photo || null,
              status: st,
              signInTime: parseToMs(v.signInTime || v.time_in || v.created_at),
              signOutTime: parseOptionalToMs(v.signOutTime || v.time_out),
              history: history.length > 0 ? history : undefined
            };
          });
          // 1. Read latest local records from localStorage
          let localList: any[] = [];
          try {
            const raw = localStorage.getItem('school-visitor-log');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) localList = parsed;
            }
          } catch (e) {}

          // 2. Read deleted visitor IDs so explicitly deleted records are not revived
          let deletedIds: string[] = [];
          try {
            const delRaw = localStorage.getItem('svlms_deleted_visitor_ids');
            if (delRaw) {
              const parsedDel = JSON.parse(delRaw);
              if (Array.isArray(parsedDel)) deletedIds = parsedDel;
            }
          } catch (e) {}
          const deletedSet = new Set(deletedIds.map(String));

          setVisitors(prev => {
            // If data was explicitly cleared, keep it cleared
            if (isDataClearedRef.current) return [];

            // Merge local storage, current in-memory state, and incoming server data
            const combined = [...localList, ...prev, ...mapped].filter(v => {
              if (!v || !v.name) return false;
              const vId = String(v.id || '');
              const vNum = String(v.idNumber || v.visitor_number || '');
              if (vId && deletedSet.has(vId)) return false;
              if (vNum && deletedSet.has(vNum)) return false;
              return true;
            });

            const consolidated = consolidateVisitors(combined);
            syncIdSequence(consolidated);

            // If local storage has visitors that the server is currently missing (e.g. Vercel serverless cold start),
            // automatically sync them to the server so reports & server endpoints stay updated
            if (mapped.length < consolidated.length && consolidated.length > 0) {
              const token = sessionStorage.getItem('token') || localStorage.getItem('token');
              if (token) {
                fetch('/api/settings/restore-data', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                  },
                  body: JSON.stringify({ visitors: consolidated })
                }).catch(() => {});
              }
            }

            return consolidated;
          });
        }
      }).catch(err => {
        console.warn('Unable to load visitors:', err);
      });
    };

    fetchVisitors();
    const interval = setInterval(fetchVisitors, 4000);
    return () => clearInterval(interval);
  }, [currentUser, isAdmin]);

  // Protect the admin route
  useEffect(() => {
    if (!isAdmin && currentTab === 'admin') {
      setCurrentTab('dashboard');
    }
  }, [currentTab, isAdmin]);

  if (eventIdParam) {
    return <EventRegistration eventId={eventIdParam} />;
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-app-bg font-sans flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-card-bg shadow-sm p-5 sm:p-8 rounded-xl border border-app-border w-full max-w-md">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mb-3 flex items-center justify-center overflow-hidden">
              <img src={rhmcLogo} alt="Rosemont Hills Montessori College Logo" className="w-full h-full object-contain" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-heading-fg">School Visitor Log System</h2>
            <p className="text-xs sm:text-sm text-muted-fg font-medium mt-1">Rosemont Hills Montessori College</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-label-fg mb-1.5">Username</label>
              <input 
                id="login-username-input"
                name="username"
                type="text" 
                required
                disabled={isLoggingIn}
                placeholder="Enter admin or guard"
                className="w-full bg-app-bg border border-app-border rounded-lg py-2.5 px-3 text-base sm:text-sm text-main-fg focus:outline-none focus:border-blue-500 placeholder:text-muted-fg disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-label-fg mb-1.5">Password</label>
              <div className="relative">
                <input 
                  id="login-password-input"
                  name="password"
                  type={showPassword ? "text" : "password"} 
                  disabled={isLoggingIn}
                  className="w-full bg-app-bg border border-app-border rounded-lg py-2.5 pl-3 pr-10 text-base sm:text-sm text-main-fg focus:outline-none focus:border-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                />
                <button
                  id="login-toggle-password-button"
                  type="button"
                  disabled={isLoggingIn}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-fg hover:text-main-fg disabled:opacity-50 transition-colors p-1 cursor-pointer"
                  title={showPassword ? "Hide password" : "Show password"}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button 
              id="login-submit-button"
              type="submit" 
              disabled={isLoggingIn}
              className="w-full min-h-[44px] bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded-lg transition-colors mt-2 shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoggingIn ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Logging in...</span>
                </>
              ) : (
                'Login'
              )}
            </button>
          </div>
        </form>

        {/* Invalid Credentials Modal Popup */}
        {showInvalidCredentialsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-card-bg border border-app-border rounded-xl shadow-2xl p-6 max-w-sm w-full text-center">
              <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-500 mx-auto mb-4 flex items-center justify-center">
                <AlertCircle size={26} />
              </div>
              <h3 className="text-lg font-bold text-main-fg mb-2">{loginErrorTitle}</h3>
              <p className="text-sm text-muted-fg mb-6 font-medium">{loginErrorMessage}</p>
              <button
                id="login-error-modal-ok-button"
                type="button"
                onClick={() => {
                  setShowInvalidCredentialsModal(false);
                  setLoginErrorTitle('Invalid Credentials');
                  setLoginErrorMessage('Username or password is incorrect. Please try again.');
                }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition-colors shadow-sm cursor-pointer"
              >
                OK
              </button>
            </div>
          </div>
        )}

        {/* Automatic Logout / Session Expired Modal */}
        {showAutoLogoutModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
            <div className="bg-card-bg border border-app-border rounded-xl shadow-2xl p-6 max-w-sm w-full text-center">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 dark:text-amber-400 mx-auto mb-4 flex items-center justify-center">
                <Clock size={26} />
              </div>
              <h3 className="text-lg font-bold text-main-fg mb-2">Session Expired</h3>
              <p className="text-sm text-muted-fg mb-6 font-medium">
                You have been automatically logged out because your session duration has expired. Please log in again to access the system.
              </p>
              <button
                type="button"
                onClick={() => setShowAutoLogoutModal(false)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition-colors shadow-sm cursor-pointer"
              >
                OK
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app-bg font-sans text-main-fg">
      <div className="max-w-[1400px] mx-auto p-3 sm:p-4 md:p-6 lg:p-8">
        
        {/* Header */}
        <header className="bg-card-bg rounded-xl border border-app-border shadow-sm px-3.5 sm:px-6 py-3 sm:py-4 mb-4 sm:mb-6 flex justify-between items-center relative">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="w-11 h-11 sm:w-14 sm:h-14 md:w-16 md:h-16 flex-shrink-0 flex items-center justify-center overflow-hidden">
              <img src={rhmcLogo} alt="Rosemont Hills Montessori College Logo" className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-lg md:text-xl lg:text-[22px] leading-tight font-bold text-heading-fg tracking-tight truncate sm:whitespace-normal">School Visitor Log System</h1>
              <p className="text-[11px] sm:text-xs md:text-sm text-muted-fg font-medium truncate">Rosemont Hills Montessori College</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 sm:gap-6 md:gap-8 shrink-0">
            <div className="text-right hidden sm:block">
              <div className="text-base sm:text-lg md:text-xl font-bold text-blue-600 dark:text-blue-400 tracking-wider">{formatTime(time)}</div>
              <div className="text-xs sm:text-[13px] text-muted-fg font-medium mt-0.5">{formatDate(time)}</div>
            </div>
            <div className="relative" ref={menuRef}>
              <button 
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="min-h-[44px] min-w-[44px] p-2 hover:bg-hover-bg rounded-lg transition-colors text-label-fg flex items-center justify-center cursor-pointer"
                aria-label="Navigation Menu"
              >
                {isMenuOpen ? <X size={26} /> : <Menu size={26} />}
              </button>
              
              {/* Dropdown Menu */}
              {isMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-[230px] max-w-[calc(100vw-2rem)] bg-card-bg border border-app-border rounded-xl shadow-2xl py-2 z-50 overflow-hidden">
                  {menuItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setCurrentTab(item.id as Tab);
                        setIsMenuOpen(false);
                      }}
                      className={`w-full min-h-[44px] flex items-center gap-3 px-4 sm:px-5 py-2.5 text-sm sm:text-[15px] font-medium transition-colors cursor-pointer ${
                        currentTab === item.id 
                          ? 'bg-hover-bg text-blue-600 dark:text-blue-400 font-semibold' 
                          : 'text-label-fg hover:bg-hover-bg'
                      }`}
                    >
                      <item.icon size={18} className={currentTab === item.id ? 'text-blue-600 dark:text-blue-400' : 'text-icon-fg'} />
                      {item.label}
                    </button>
                  ))}
                  <div className="h-px bg-app-border my-2 mx-4"></div>
                  <button onClick={handleLogoutRequest} className="w-full min-h-[44px] flex items-center gap-3 px-4 sm:px-5 py-2.5 text-sm sm:text-[15px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer">
                    <LogOut size={18} className="text-red-600 dark:text-red-400" />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {showStats && <StatsRow visitors={visitors} />}

        <main className="mb-10">
          {currentTab === 'dashboard' && <DashboardView visitors={visitors} setVisitors={setVisitors} />}
          {currentTab === 'admin' && <AdminView users={users} setUsers={setUsers} currentUser={currentUser} onLogout={handleLogout} />}
          {currentTab === 'register' && <RegisterView visitors={visitors} setVisitors={setVisitors} />}
          {(currentTab === 'visitors' || currentTab === 'all-visitors') && <AllVisitorsView visitors={visitors} setVisitors={setVisitors} />}
          {currentTab === 'event' && <EventView />}
          {currentTab === 'reports' && <ReportsView visitors={visitors} />}
          {currentTab === 'settings' && (
            <SettingsView
              isDarkMode={isDarkMode}
              setIsDarkMode={setIsDarkMode}
              userRole={currentUser.role}
              autoLogoutSettings={autoLogoutSettings}
              onUpdateAutoLogoutSettings={handleUpdateAutoLogoutSettings}
            />
          )}
        </main>
        
      </div>

      {showLogoutModal && (
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card-bg border border-app-border rounded-xl shadow-xl max-w-sm w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center flex-shrink-0">
                <LogOut size={20} />
              </div>
              <h3 className="text-lg font-bold text-main-fg">Logout Confirmation</h3>
            </div>
            <p className="text-sm text-muted-fg font-medium">
              Please save your data before logging out.
            </p>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-app-border">
              <button
                type="button"
                onClick={() => setShowLogoutModal(false)}
                className="px-4 py-2 border border-app-border hover:bg-hover-bg text-main-fg rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session Expiration Warning Modal matching reference design */}
      {showWarningModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[#1b2333] border border-[#2d374d] rounded-2xl shadow-2xl max-w-[440px] w-full overflow-hidden animate-in zoom-in-95 duration-150 p-6 sm:p-7 text-center">
            {/* Centered orange clock icon */}
            <div className="w-14 h-14 rounded-full bg-[#252e42] border-2 border-[#d97706]/70 text-[#f59e0b] mx-auto flex items-center justify-center mb-5 shadow-inner">
              <Clock size={28} strokeWidth={2.3} className="text-[#f59e0b]" />
            </div>
            
            {/* Title & Countdown Message */}
            <h3 className="text-lg sm:text-xl font-bold text-white mb-1.5 tracking-tight">
              Your session is about to expire.
            </h3>
            <p className="text-sm text-slate-300 font-normal mb-5">
              You will be logged out in{' '}
              <span className="text-[#ef4444] font-semibold">
                {warningCountdown}
              </span>{' '}
              seconds.
            </p>

            {/* Horizontal Divider */}
            <div className="border-t border-[#2a344a] w-full my-5" />

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3.5">
              <button
                type="button"
                id="warning-stay-logged-in-btn"
                onClick={handleStayLoggedIn}
                className="w-full py-3 px-4 bg-[#3b82f6] hover:bg-[#2563eb] active:bg-[#1d4ed8] text-white rounded-xl text-sm font-semibold transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50"
              >
                Stay Logged In
              </button>
              <button
                type="button"
                id="warning-logout-btn"
                onClick={handleWarningLogout}
                className="w-full py-3 px-4 bg-[#182030] hover:bg-[#212b3e] active:bg-[#121927] border border-[#2b354d] text-[#f87171] hover:text-[#ef4444] rounded-xl text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/40"
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
