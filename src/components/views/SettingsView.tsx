import React, { useRef, useState, useEffect } from 'react';
import { Settings, Moon, Sun, Database, Download, Upload, Trash2, CheckCircle2, AlertTriangle, X, Check, Loader2, ShieldCheck, Clock, Save } from 'lucide-react';
import { API } from '../../api';
import { resetIdSequence, syncIdSequence } from '../../utils/idSequence';
import { consolidateVisitors } from '../../utils/visitorManager';
import { getManilaDateString } from '../../utils/dateUtils';
import { getStoredAutoLogoutSettings, AutoLogoutSettings } from '../../types';

interface SettingsViewProps {
  isDarkMode?: boolean;
  setIsDarkMode?: React.Dispatch<React.SetStateAction<boolean>>;
  userRole?: string;
  autoLogoutSettings?: AutoLogoutSettings;
  onUpdateAutoLogoutSettings?: (settings: AutoLogoutSettings) => Promise<void> | void;
}

export function SettingsView({
  isDarkMode = true,
  setIsDarkMode,
  userRole,
  autoLogoutSettings: propAutoLogoutSettings,
  onUpdateAutoLogoutSettings
}: SettingsViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // Authoritative Automatic Logout state initialized from props or persistent storage
  const initialSettings = propAutoLogoutSettings || getStoredAutoLogoutSettings();
  const [autoLogoutEnabled, setAutoLogoutEnabled] = useState(
    initialSettings.automaticLogoutEnabled !== undefined ? initialSettings.automaticLogoutEnabled : initialSettings.enabled
  );
  const [durationValue, setDurationValue] = useState<number>(initialSettings.durationValue || 2);
  const [durationUnit, setDurationUnit] = useState<'minutes' | 'hours'>(initialSettings.durationUnit || 'minutes');
  const [warningDurationValue, setWarningDurationValue] = useState<number>(initialSettings.warningDurationValue || 10);
  const [warningDurationUnit, setWarningDurationUnit] = useState<'seconds' | 'minutes'>(initialSettings.warningDurationUnit || 'seconds');
  const [isSavingAutoLogout, setIsSavingAutoLogout] = useState(false);

  const isAdmin = Boolean(userRole && (userRole.toLowerCase() === 'admin' || userRole.toLowerCase() === 'administrator'));

  // Sync whenever parent propAutoLogoutSettings changes
  useEffect(() => {
    if (propAutoLogoutSettings) {
      const isEnabled = propAutoLogoutSettings.automaticLogoutEnabled !== undefined
        ? propAutoLogoutSettings.automaticLogoutEnabled
        : propAutoLogoutSettings.enabled;
      setAutoLogoutEnabled(isEnabled);
      setDurationValue(propAutoLogoutSettings.durationValue || 2);
      setDurationUnit(propAutoLogoutSettings.durationUnit || 'minutes');
      setWarningDurationValue(propAutoLogoutSettings.warningDurationValue || 10);
      setWarningDurationUnit(propAutoLogoutSettings.warningDurationUnit || 'seconds');
    }
  }, [propAutoLogoutSettings]);

  // Sync with custom broadcast events
  useEffect(() => {
    const handleBroadcast = (e: any) => {
      if (e.detail && typeof e.detail === 'object') {
        const isEnabled = Boolean(
          e.detail.automaticLogoutEnabled !== undefined ? e.detail.automaticLogoutEnabled : e.detail.enabled
        );
        console.log('[AUTO-LOGOUT] auto-logout-updated received in SettingsView:', e.detail);
        setAutoLogoutEnabled(isEnabled);
        if (e.detail.durationValue) setDurationValue(Number(e.detail.durationValue));
        if (e.detail.durationUnit) setDurationUnit(e.detail.durationUnit);
        if (e.detail.warningDurationValue) setWarningDurationValue(Number(e.detail.warningDurationValue));
        if (e.detail.warningDurationUnit) setWarningDurationUnit(e.detail.warningDurationUnit);
      }
    };
    window.addEventListener('auto-logout-updated', handleBroadcast);

    return () => {
      window.removeEventListener('auto-logout-updated', handleBroadcast);
    };
  }, []);

  const showNotification = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3500);
  };

  const handleSaveAutoLogout = async (
    overrideEnabled?: boolean,
    overrideVal?: number,
    overrideUnit?: 'minutes' | 'hours',
    overrideWarnVal?: number,
    overrideWarnUnit?: 'seconds' | 'minutes'
  ) => {
    const enabledToSave = overrideEnabled !== undefined ? overrideEnabled : autoLogoutEnabled;
    const valToSave = Math.max(1, overrideVal !== undefined ? overrideVal : durationValue);
    const unitToSave = overrideUnit !== undefined ? overrideUnit : durationUnit;
    const warnValToSave = Math.max(1, overrideWarnVal !== undefined ? overrideWarnVal : warningDurationValue);
    const warnUnitToSave = overrideWarnUnit !== undefined ? overrideWarnUnit : warningDurationUnit;

    // Validate that warning duration is strictly less than total logout duration
    const totalDurationSec = unitToSave === 'hours' ? valToSave * 3600 : valToSave * 60;
    const totalWarnSec = warnUnitToSave === 'minutes' ? warnValToSave * 60 : warnValToSave;

    if (enabledToSave && totalWarnSec >= totalDurationSec) {
      showNotification('Warning duration must be less than the total logout duration.');
      return;
    }

    const payload: AutoLogoutSettings = {
      enabled: enabledToSave,
      automaticLogoutEnabled: enabledToSave,
      durationValue: valToSave,
      durationUnit: unitToSave,
      warningDurationValue: warnValToSave,
      warningDurationUnit: warnUnitToSave,
      isConfigured: true
    };

    console.log('[AUTO-LOGOUT] SAVE SETTINGS - Settings:', payload);

    try {
      setIsSavingAutoLogout(true);
      // Immediately write authoritative state to local storage & parent
      localStorage.setItem('auto_logout_settings', JSON.stringify(payload));
      localStorage.setItem('automaticLogoutEnabled', String(enabledToSave));
      if (onUpdateAutoLogoutSettings) {
        await onUpdateAutoLogoutSettings(payload);
      }
      await API.updateAutoLogoutSettings(payload);
      window.dispatchEvent(new CustomEvent('auto-logout-updated', { detail: payload }));
      showNotification('Automatic logout settings saved successfully.');
    } catch (err: any) {
      console.warn('API save error, saving to local persistent cache:', err);
      localStorage.setItem('auto_logout_settings', JSON.stringify(payload));
      localStorage.setItem('automaticLogoutEnabled', String(enabledToSave));
      if (onUpdateAutoLogoutSettings) {
        await onUpdateAutoLogoutSettings(payload);
      }
      window.dispatchEvent(new CustomEvent('auto-logout-updated', { detail: payload }));
      showNotification('Automatic logout settings saved.');
    } finally {
      setIsSavingAutoLogout(false);
    }
  };

  const handleBackup = async () => {
    try {
      let backupData: any = null;
      try {
        backupData = await API.getBackup();
      } catch (e) {
        console.warn('API getBackup failed, assembling fallback:', e);
      }

      if (!backupData || !backupData.visitors) {
        const rawVisitors = await API.getVisitors().catch(() => []);
        const events = await API.getEvents().catch(() => []);

        // Convert any non-base64 photos to base64 Data URLs on the client
        const visitors = await Promise.all(
          (rawVisitors || []).map(async (v: any) => {
            const rawPhoto = v.photo_url || v.photoDataUrl || v.photo || null;
            let finalPhoto = rawPhoto;

            if (rawPhoto && typeof rawPhoto === 'string' && !rawPhoto.startsWith('data:image/')) {
              try {
                const resp = await fetch(rawPhoto);
                if (resp.ok) {
                  const blob = await resp.blob();
                  finalPhoto = await new Promise<string>((resolve) => {
                    const r = new FileReader();
                    r.onloadend = () => resolve(r.result as string);
                    r.readAsDataURL(blob);
                  });
                }
              } catch (err) {
                console.warn('Could not fetch photo blob:', err);
              }
            }

            return {
              ...v,
              photo: finalPhoto,
              photo_url: finalPhoto,
              photoDataUrl: finalPhoto
            };
          })
        );

        backupData = {
          version: '1.0',
          timestamp: new Date().toISOString(),
          visitors,
          events
        };
      }

      // Ensure every visitor in the backup JSON has photo, photo_url, and photoDataUrl populated
      if (Array.isArray(backupData.visitors)) {
        backupData.visitors = backupData.visitors.map((v: any) => {
          const photoVal = v.photo_url || v.photoDataUrl || v.photo || null;
          return {
            ...v,
            photo: photoVal,
            photo_url: photoVal,
            photoDataUrl: photoVal
          };
        });
      }

      if (!backupData.autoLogoutSettings) {
        backupData.autoLogoutSettings = getStoredAutoLogoutSettings();
      }

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `visitor-log-backup-${getManilaDateString()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showNotification('System backup downloaded successfully (with persistent photo data).');
    } catch (err) {
      alert('Failed to generate backup file.');
    }
  };

  const handleLoadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        setIsRestoring(true);
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        if (parsed && (parsed.visitors || parsed.events || Array.isArray(parsed))) {
          let payload = Array.isArray(parsed) ? { visitors: parsed, events: [] } : parsed;
          
          // Normalize visitors array so photo_url, photoDataUrl, and photo are cross-referenced
          if (Array.isArray(payload.visitors)) {
            payload.visitors = payload.visitors.map((v: any) => {
              const photoVal = v.photo_url || v.photoDataUrl || v.photo || v.photoPath || v.image || v.image_url || null;
              return {
                ...v,
                photo: photoVal,
                photo_url: photoVal,
                photoDataUrl: photoVal
              };
            });
          }

          // Restore and merge into SQLite Database and recreate image files on disk
          const response = await API.restoreData(payload);
          let mergedVisitors = response?.visitors;

          if (!Array.isArray(mergedVisitors) || mergedVisitors.length === 0) {
            mergedVisitors = consolidateVisitors(payload.visitors || []);
          }

          // Update localStorage caches with the full merged visitor list & photos
          if (mergedVisitors) {
            localStorage.setItem('school-visitor-log', JSON.stringify(mergedVisitors));
            syncIdSequence(mergedVisitors);
          }

          if (response?.events && Array.isArray(response.events)) {
            localStorage.setItem('schoolEvents', JSON.stringify(response.events));
          } else if (payload.events && Array.isArray(payload.events)) {
            const currentEvStr = localStorage.getItem('schoolEvents');
            let currentEvents: any[] = [];
            if (currentEvStr) {
              try { currentEvents = JSON.parse(currentEvStr); } catch (e) {}
            }
            const existingKeys = new Set(currentEvents.map(e => `${(e.name || e.event_name || '').toLowerCase()}_${e.date}`));
            const mergedEvents = [...currentEvents];
            for (const ev of payload.events) {
              const key = `${(ev.name || ev.event_name || '').toLowerCase()}_${ev.date}`;
              if (!existingKeys.has(key)) {
                existingKeys.add(key);
                mergedEvents.push(ev);
              }
            }
            localStorage.setItem('schoolEvents', JSON.stringify(mergedEvents));
          }

          // Restore Auto-Logout settings if included in backup (safe backwards compatibility)
          if (payload.autoLogoutSettings && typeof payload.autoLogoutSettings === 'object') {
            const restored = payload.autoLogoutSettings;
            const rEnabled = Boolean(restored.enabled);
            const rVal = Number(restored.durationValue) > 0 ? Number(restored.durationValue) : 30;
            const rUnit = restored.durationUnit === 'hours' ? 'hours' : 'minutes';
            const rWarnVal = Number(restored.warningDurationValue) > 0 ? Number(restored.warningDurationValue) : 30;
            const rWarnUnit = restored.warningDurationUnit === 'minutes' ? 'minutes' : 'seconds';
            setAutoLogoutEnabled(rEnabled);
            setDurationValue(rVal);
            setDurationUnit(rUnit);
            setWarningDurationValue(rWarnVal);
            setWarningDurationUnit(rWarnUnit);
            handleSaveAutoLogout(rEnabled, rVal, rUnit, rWarnVal, rWarnUnit);
          }

          // Trigger sync across components
          window.dispatchEvent(new CustomEvent('visitor-registered'));
          window.dispatchEvent(new CustomEvent('id-sequence-updated'));

          showNotification('Backup data merged successfully with existing data.');
        } else {
          alert('Invalid backup file format.');
        }
      } catch (err: any) {
        console.error('Error loading backup:', err);
        alert('Error restoring backup file: ' + (err.message || 'Invalid format'));
      } finally {
        setIsRestoring(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleConfirmClear = async () => {
    try {
      setIsClearing(true);

      // 1. Permanently delete from SQLite backend tables (visitors, visits, events, pre_registrations, sequences, uploads)
      await API.clearData();

      // 2. Clean up client-side persistence and caches
      localStorage.removeItem('school-visitor-log');
      localStorage.removeItem('schoolEvents');
      resetIdSequence();

      // 3. Notify all listeners and components across the app to refresh cleanly
      window.dispatchEvent(new CustomEvent('data-cleared'));
      window.dispatchEvent(new CustomEvent('visitor-registered'));

      // 4. Close confirmation modal and show prominent success modal
      setShowClearModal(false);
      setShowSuccessModal(true);
    } catch (err: any) {
      console.error('Error clearing data:', err);
      alert('Failed to clear database data: ' + (err.message || 'Server error'));
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="w-full bg-card-bg rounded-xl border border-app-border shadow-sm overflow-hidden flex flex-col transition-all">
      <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-app-border flex justify-between items-center bg-th-bg">
        <div className="flex items-center gap-2">
          <Settings size={18} className="text-blue-600 dark:text-blue-400 shrink-0" />
          <h2 className="text-base font-semibold text-main-fg">Settings</h2>
        </div>
        <span className="text-xs sm:text-sm font-medium text-muted-fg">System Configuration</span>
      </div>
      
      {message && (
        <div className="mx-4 sm:mx-6 mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-medium rounded-lg text-sm flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 size={16} />
          <span>{message}</span>
        </div>
      )}

      <div className="p-4 sm:p-6 space-y-5 sm:space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-2.5 sm:mb-3">
            <Moon size={16} className="text-blue-600 dark:text-blue-400 shrink-0" />
            <h3 className="text-sm font-semibold text-blue-600 dark:text-blue-400">Appearance</h3>
          </div>
          <div className="bg-app-bg border border-app-border rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="pr-2 sm:pr-4">
              <h4 className="font-semibold text-main-fg mb-1">Dark Mode</h4>
              <p className="text-xs sm:text-sm text-muted-fg">Uses a dark theme to reduce eye strain in low-light environments.</p>
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-app-border/40">
              <span className={`flex items-center gap-1.5 text-xs sm:text-sm font-semibold ${isDarkMode ? 'text-yellow-400' : 'text-slate-600'}`}>
                {isDarkMode ? <Moon size={14} className="fill-current" /> : <Sun size={14} />}
                {isDarkMode ? 'Dark' : 'Light'}
              </span>
              <button 
                onClick={() => setIsDarkMode && setIsDarkMode(!isDarkMode)}
                className={`relative inline-block w-11 h-6 rounded-full transition-colors cursor-pointer ${isDarkMode ? 'bg-[#3b82f6]' : 'bg-slate-300 dark:bg-slate-700'}`}
                aria-label="Toggle dark mode"
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${isDarkMode ? 'left-6' : 'left-1'}`}></div>
              </button>
            </div>
          </div>
        </div>

        <hr className="border-t border-app-border" />

        <div>
          <div className="flex items-center gap-2 mb-2.5 sm:mb-3">
            <Database size={16} className="text-blue-600 dark:text-blue-400 shrink-0" />
            <h3 className="text-sm font-semibold text-blue-600 dark:text-blue-400">Data Management</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 mb-3">
            <button 
              onClick={handleBackup}
              disabled={isClearing || isRestoring}
              className="flex-1 sm:flex-none min-h-[40px] flex items-center justify-center gap-2 px-4 sm:px-5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <Download size={16} />
              Backup
            </button>
            <button 
              onClick={handleLoadClick}
              disabled={isClearing || isRestoring}
              className="flex-1 sm:flex-none min-h-[40px] flex items-center justify-center gap-2 px-4 sm:px-5 py-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {isRestoring ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              Load
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept=".json" 
              className="hidden" 
            />
            <button 
              onClick={() => setShowClearModal(true)}
              disabled={isClearing || isRestoring}
              className="w-full sm:w-auto min-h-[40px] flex items-center justify-center gap-2 px-4 sm:px-5 py-2 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <Trash2 size={16} />
              Clear Data
            </button>
          </div>
          <p className="text-xs sm:text-sm text-muted-fg font-medium">Backup all system data • Restore from a backup file • Reset to clean state</p>
        </div>

        {isAdmin && (
          <>
            <hr className="border-t border-app-border" />

            <div id="automatic-logout-section">
              <div className="flex items-center gap-2 mb-3">
                <Clock size={16} className="text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-semibold text-blue-600 dark:text-blue-400">Automatic Logout</h3>
              </div>

              <div className="bg-app-bg border border-app-border rounded-xl p-4 sm:p-5 space-y-4">
                {/* Enable/Disable Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="pr-2 sm:pr-4">
                    <h4 className="font-semibold text-main-fg mb-1">Enable Automatic Logout</h4>
                    <p className="text-xs sm:text-sm text-muted-fg">
                      Automatically logs out both Admin and Security Personnel/Guard sessions when the configured time expires.
                    </p>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-app-border/40">
                    <span
                      id="auto-logout-status-badge"
                      className={`text-xs sm:text-sm font-semibold ${autoLogoutEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-fg'}`}
                    >
                      Automatic Logout: {autoLogoutEnabled ? 'ON' : 'OFF'}
                    </span>
                    <button
                      id="auto-logout-toggle-btn"
                      type="button"
                      onClick={() => {
                        const previous = autoLogoutEnabled;
                        const newEnabled = !previous;
                        console.log('[AUTO-LOGOUT] TOGGLE CHANGE - Previous:', previous, 'New:', newEnabled);
                        setAutoLogoutEnabled(newEnabled);
                        handleSaveAutoLogout(newEnabled, durationValue, durationUnit, warningDurationValue, warningDurationUnit);
                      }}
                      className={`relative inline-block w-11 h-6 rounded-full transition-colors cursor-pointer ${autoLogoutEnabled ? 'bg-[#3b82f6]' : 'bg-slate-300 dark:bg-slate-700'}`}
                      aria-label={`Toggle automatic logout, currently Automatic Logout: ${autoLogoutEnabled ? 'ON' : 'OFF'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${autoLogoutEnabled ? 'left-6' : 'left-1'}`}></div>
                    </button>
                  </div>
                </div>

                {/* Duration Configuration */}
                <div className="pt-3 border-t border-app-border space-y-5">
                  {/* 2. Logout Duration */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 items-end">
                    <div>
                      <label className="block text-xs sm:text-sm font-semibold text-label-fg mb-1.5" htmlFor="auto-logout-duration-input">
                        Logout Duration
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          id="auto-logout-duration-input"
                          type="number"
                          min="1"
                          max={durationUnit === 'hours' ? 24 : 1440}
                          value={durationValue}
                          onChange={(e) => {
                            const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                            setDurationValue(val);
                          }}
                          className="w-24 sm:w-28 bg-card-bg border border-app-border rounded-lg py-2 px-3 text-sm text-main-fg focus:outline-none focus:border-blue-500 font-semibold text-center"
                        />
                        <div className="inline-flex rounded-lg border border-app-border bg-card-bg p-1">
                          <button
                            type="button"
                            id="unit-minutes-btn"
                            onClick={() => {
                              setDurationUnit('minutes');
                            }}
                            className={`px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                              durationUnit === 'minutes'
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-muted-fg hover:text-main-fg'
                            }`}
                          >
                            Minutes
                          </button>
                          <button
                            type="button"
                            id="unit-hours-btn"
                            onClick={() => {
                              setDurationUnit('hours');
                            }}
                            className={`px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                              durationUnit === 'hours'
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-muted-fg hover:text-main-fg'
                            }`}
                          >
                            Hours
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                      <span className="text-xs text-muted-fg font-medium mr-1">Presets:</span>
                      {[
                        { label: '15m', val: 15, unit: 'minutes' as const },
                        { label: '30m', val: 30, unit: 'minutes' as const },
                        { label: '1h', val: 1, unit: 'hours' as const },
                        { label: '2h', val: 2, unit: 'hours' as const },
                        { label: '4h', val: 4, unit: 'hours' as const },
                        { label: '8h', val: 8, unit: 'hours' as const }
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => {
                            setDurationValue(preset.val);
                            setDurationUnit(preset.unit);
                          }}
                          className={`px-2 py-1 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${
                            durationValue === preset.val && durationUnit === preset.unit
                              ? 'bg-blue-600/10 border-blue-600/40 text-blue-600 dark:text-blue-400'
                              : 'bg-card-bg border-app-border text-muted-fg hover:text-main-fg hover:bg-hover-bg'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 3. Warning Duration (Last Setting) */}
                  <div className="pt-4 border-t border-app-border">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 items-end">
                      <div>
                        <label className="block text-xs sm:text-sm font-semibold text-label-fg mb-1" htmlFor="auto-logout-warning-duration-input">
                          Warning Duration
                        </label>
                        <p className="text-xs text-muted-fg mb-2">
                          How long before automatic logout the warning popup appears.
                        </p>
                        <div className="flex items-center gap-2">
                          <input
                            id="auto-logout-warning-duration-input"
                            type="number"
                            min="1"
                            max={warningDurationUnit === 'minutes' ? 60 : 3600}
                            value={warningDurationValue}
                            onChange={(e) => {
                              const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                              setWarningDurationValue(val);
                            }}
                            className="w-24 sm:w-28 bg-card-bg border border-app-border rounded-lg py-2 px-3 text-sm text-main-fg focus:outline-none focus:border-blue-500 font-semibold text-center"
                          />
                          <div className="inline-flex rounded-lg border border-app-border bg-card-bg p-1">
                            <button
                              type="button"
                              id="warn-unit-seconds-btn"
                              onClick={() => {
                                setWarningDurationUnit('seconds');
                              }}
                              className={`px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                                warningDurationUnit === 'seconds'
                                  ? 'bg-blue-600 text-white shadow-sm'
                                  : 'text-muted-fg hover:text-main-fg'
                              }`}
                            >
                              Seconds
                            </button>
                            <button
                              type="button"
                              id="warn-unit-minutes-btn"
                              onClick={() => {
                                setWarningDurationUnit('minutes');
                              }}
                              className={`px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                                warningDurationUnit === 'minutes'
                                  ? 'bg-blue-600 text-white shadow-sm'
                                  : 'text-muted-fg hover:text-main-fg'
                              }`}
                            >
                              Minutes
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                        <span className="text-xs text-muted-fg font-medium mr-1">Presets:</span>
                        {[
                          { label: '10s', val: 10, unit: 'seconds' as const },
                          { label: '15s', val: 15, unit: 'seconds' as const },
                          { label: '30s', val: 30, unit: 'seconds' as const },
                          { label: '45s', val: 45, unit: 'seconds' as const },
                          { label: '1m', val: 1, unit: 'minutes' as const },
                          { label: '2m', val: 2, unit: 'minutes' as const }
                        ].map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => {
                              setWarningDurationValue(preset.val);
                              setWarningDurationUnit(preset.unit);
                            }}
                            className={`px-2 py-1 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${
                              warningDurationValue === preset.val && warningDurationUnit === preset.unit
                                ? 'bg-blue-600/10 border-blue-600/40 text-blue-600 dark:text-blue-400'
                                : 'bg-card-bg border-app-border text-muted-fg hover:text-main-fg hover:bg-hover-bg'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-app-border">
                    <div className="text-xs text-muted-fg font-medium flex items-center gap-1.5">
                      <ShieldCheck size={14} className="text-blue-600 dark:text-blue-400 shrink-0" />
                      <span>
                        Applies to both <strong>Admin</strong> & <strong>Security Personnel</strong> sessions.
                      </span>
                    </div>

                    <button
                      id="save-auto-logout-btn"
                      type="button"
                      onClick={() => handleSaveAutoLogout(autoLogoutEnabled, durationValue, durationUnit, warningDurationValue, warningDurationUnit)}
                      disabled={isSavingAutoLogout}
                      className="w-full sm:w-auto min-h-[38px] flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                    >
                      {isSavingAutoLogout ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <Save size={14} />
                          <span>Save</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Confirmation Modal */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 dark:bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-card-bg border border-app-border rounded-xl w-full max-w-[460px] shadow-2xl overflow-hidden flex flex-col">
            <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-app-border flex justify-between items-center bg-th-bg">
              <div className="flex items-center gap-2 text-red-500">
                <AlertTriangle size={18} />
                <h3 className="text-base font-bold text-main-fg">Confirm Clear Data</h3>
              </div>
              <button 
                onClick={() => !isClearing && setShowClearModal(false)} 
                disabled={isClearing}
                className="text-icon-fg hover:text-heading-fg transition-colors p-1 rounded-lg hover:bg-hover-bg disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="p-4 sm:p-6 space-y-3">
              <p className="text-sm font-medium text-label-fg leading-relaxed">
                Are you sure you want to clear the system data?
              </p>
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs text-red-600 dark:text-red-400 space-y-1.5 font-medium">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertTriangle size={14} />
                  The following data will be permanently removed:
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-slate-700 dark:text-slate-300 ml-1">
                  <li>All visitor & visit records</li>
                  <li>Events and pre-registration records</li>
                  <li>Generated reports data</li>
                  <li>Visitor ID sequence counter (will reset to #0001)</li>
                </ul>
              </div>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5 pt-1">
                <ShieldCheck size={14} className="shrink-0" />
                <span>Admin/Guard user accounts & settings will NOT be deleted.</span>
              </p>
            </div>

            <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-th-bg border-t border-app-border flex justify-end items-center gap-3">
              <button 
                type="button"
                onClick={() => setShowClearModal(false)}
                disabled={isClearing}
                className="px-4 py-2 bg-transparent border border-app-border text-label-fg font-medium rounded-lg hover:bg-hover-bg transition-colors text-sm disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={handleConfirmClear}
                disabled={isClearing}
                className="flex items-center gap-2 px-5 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors shadow-sm text-sm disabled:opacity-50 cursor-pointer"
              >
                {isClearing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Clearing...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    <span>Clear Data</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 dark:bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-card-bg border border-app-border rounded-xl w-full max-w-[440px] shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-app-border flex justify-between items-center bg-th-bg">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-500">
                <CheckCircle2 size={18} />
                <h3 className="text-base font-bold text-main-fg">Data Cleared Successfully</h3>
              </div>
              <button 
                onClick={() => setShowSuccessModal(false)} 
                className="text-icon-fg hover:text-heading-fg transition-colors p-1 rounded-lg hover:bg-hover-bg"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                  <Check size={20} className="stroke-[2.5]" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-main-fg">Database Cleared</h4>
                  <p className="text-xs text-muted-fg font-medium">All transactional and event records have been removed.</p>
                </div>
              </div>

              <div className="bg-app-bg border border-app-border rounded-lg p-3 text-xs space-y-1.5 text-label-fg font-medium">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <Check size={14} className="shrink-0" />
                  <span>All visitor profiles and visit logs permanently erased</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <Check size={14} className="shrink-0" />
                  <span>Event & pre-registration data cleared</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <Check size={14} className="shrink-0" />
                  <span>Visitor ID sequence reset to <strong>#0001</strong></span>
                </div>
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                  <Check size={14} className="shrink-0" />
                  <span>User accounts and system preferences preserved</span>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-th-bg border-t border-app-border flex justify-end items-center">
              <button 
                type="button"
                onClick={() => setShowSuccessModal(false)}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-sm text-sm"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
