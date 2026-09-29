import express from 'express';
import fs from 'fs';
import path from 'path';
import { dbRun, dbAll, dbGet } from '../db/init.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

function getEnvAutoLogout(): boolean | undefined {
  const envVal = process.env.AUTOMATIC_LOGOUT_ENABLED ?? process.env.AUTO_LOGOUT_ENABLED;
  if (envVal !== undefined && envVal !== '') {
    const clean = String(envVal).trim().toLowerCase();
    if (clean === 'true' || clean === '1' || clean === 'on' || clean === 'yes') return true;
    if (clean === 'false' || clean === '0' || clean === 'off' || clean === 'no') return false;
  }
  return undefined;
}

// 1. Get Auto-Logout settings (Publicly accessible on application startup before authentication)
router.get('/auto-logout', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  const envVal = getEnvAutoLogout();

  try {
    const row = (await dbGet<any>(
      "SELECT value FROM system_settings WHERE key = 'auto_logout' LIMIT 1"
    )) || (await dbGet<any>(
      "SELECT value FROM system_settings WHERE key = 'automaticLogoutEnabled' LIMIT 1"
    )) || (await dbGet<any>(
      "SELECT value FROM system_settings WHERE key = 'automatic_logout_enabled' LIMIT 1"
    ));

    if (row && row.value) {
      let parsed: any = null;
      try {
        parsed = JSON.parse(row.value);
      } catch {
        if (row.value === 'true' || row.value === '1') parsed = { enabled: true, automaticLogoutEnabled: true };
        else if (row.value === 'false' || row.value === '0') parsed = { enabled: false, automaticLogoutEnabled: false };
      }

      if (parsed && typeof parsed === 'object') {
        const isDbEnabled = parsed.automaticLogoutEnabled !== undefined
          ? Boolean(parsed.automaticLogoutEnabled)
          : Boolean(parsed.enabled);

        const isConfigured = parsed.isConfigured === true;
        // If user already saved a configured setting, preserve isDbEnabled; otherwise fallback to env
        const finalEnabled = (envVal !== undefined && !isConfigured) ? envVal : isDbEnabled;

        return res.json({
          enabled: finalEnabled,
          automaticLogoutEnabled: finalEnabled,
          durationValue: Number(parsed.durationValue) > 0 ? Number(parsed.durationValue) : 2,
          durationUnit: parsed.durationUnit === 'hours' ? 'hours' : 'minutes',
          warningDurationValue: Number(parsed.warningDurationValue) > 0 ? Number(parsed.warningDurationValue) : 10,
          warningDurationUnit: parsed.warningDurationUnit === 'minutes' ? 'minutes' : 'seconds',
          isConfigured
        });
      }
    }

    const defaultEnabled = envVal !== undefined ? envVal : true;
    res.json({
      enabled: defaultEnabled,
      automaticLogoutEnabled: defaultEnabled,
      durationValue: 2,
      durationUnit: 'minutes',
      warningDurationValue: 10,
      warningDurationUnit: 'seconds',
      isConfigured: false
    });
  } catch (err: any) {
    console.error('Error fetching auto-logout settings:', err);
    const defaultEnabled = envVal !== undefined ? envVal : true;
    res.json({
      enabled: defaultEnabled,
      automaticLogoutEnabled: defaultEnabled,
      durationValue: 2,
      durationUnit: 'minutes',
      warningDurationValue: 10,
      warningDurationUnit: 'seconds',
      isConfigured: false
    });
  }
});

// All following routes require active authenticated session
router.use(authenticate);

// Update Auto-Logout settings (Admin only)
router.put('/auto-logout', requireAdmin, async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  try {
    const { enabled, automaticLogoutEnabled, durationValue, durationUnit, warningDurationValue, warningDurationUnit } = req.body;
    const isEnabled = Boolean(
      automaticLogoutEnabled !== undefined ? automaticLogoutEnabled : (enabled !== undefined ? enabled : false)
    );

    let parsedValue = parseInt(durationValue, 10);
    if (isNaN(parsedValue) || parsedValue <= 0) {
      parsedValue = 30;
    }
    const unit = durationUnit === 'hours' ? 'hours' : 'minutes';

    let parsedWarningValue = parseInt(warningDurationValue, 10);
    if (isNaN(parsedWarningValue) || parsedWarningValue <= 0) {
      parsedWarningValue = 30;
    }
    const warningUnit = warningDurationUnit === 'minutes' ? 'minutes' : 'seconds';

    const newSettings = {
      enabled: isEnabled,
      automaticLogoutEnabled: isEnabled,
      durationValue: parsedValue,
      durationUnit: unit,
      warningDurationValue: parsedWarningValue,
      warningDurationUnit: warningUnit,
      isConfigured: true,
      updatedAt: Date.now()
    };

    const serialized = JSON.stringify(newSettings);
    await dbRun(
      'INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ['auto_logout', serialized]
    );
    await dbRun(
      'INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ['automaticLogoutEnabled', serialized]
    ).catch(() => {});

    res.json({
      success: true,
      message: 'Automatic logout settings saved successfully.',
      settings: newSettings
    });
  } catch (err: any) {
    console.error('Error updating auto-logout settings:', err);
    res.status(500).json({ error: err.message || 'Failed to update auto-logout settings' });
  }
});

// Helper to convert any photo (local file path, remote URL, or base64) to a self-contained base64 data URI
async function getPhotoAsDataUrl(photoPath: string | null | undefined): Promise<string | null> {
  if (!photoPath || typeof photoPath !== 'string') return null;
  const trimmed = photoPath.trim();
  if (!trimmed) return null;

  // Already a base64 data URI
  if (trimmed.startsWith('data:image/')) return trimmed;

  // Check local file on disk
  try {
    const cleanPath = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
    const fullPath = path.isAbsolute(trimmed) ? trimmed : path.join(process.cwd(), cleanPath);
    if (fs.existsSync(fullPath)) {
      const ext = path.extname(fullPath).toLowerCase().replace('.', '') || 'png';
      const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
      const fileBuffer = fs.readFileSync(fullPath);
      return `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
    }
  } catch (err) {
    console.warn('Error reading local photo file for backup:', photoPath, err);
  }

  // If it's a remote URL (e.g. from previous environment or CDN), fetch and embed as base64
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const resp = await fetch(trimmed, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (resp.ok) {
        const contentType = resp.headers.get('content-type') || 'image/jpeg';
        const arrayBuf = await resp.arrayBuffer();
        const base64 = Buffer.from(arrayBuf).toString('base64');
        return `data:${contentType};base64,${base64}`;
      }
    } catch (fetchErr) {
      console.warn('Could not fetch remote photo URL during backup:', trimmed, fetchErr);
    }
  }

  return trimmed;
}

function safeParseDateToMs(val: any): number {
  if (val === null || val === undefined || val === '') return Date.now();
  if (typeof val === 'number') return isNaN(val) ? Date.now() : val;
  if (val instanceof Date) return val.getTime();

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return Date.now();

    if (/^\d{10,15}$/.test(trimmed)) {
      const num = parseInt(trimmed, 10);
      if (!isNaN(num)) return num;
    }

    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(trimmed)) {
      const iso = trimmed.replace(' ', 'T') + 'Z';
      const parsed = new Date(iso).getTime();
      if (!isNaN(parsed)) return parsed;
    }

    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(trimmed)) {
      const parsed = new Date(trimmed + 'Z').getTime();
      if (!isNaN(parsed)) return parsed;
    }

    const parsed = new Date(trimmed).getTime();
    if (!isNaN(parsed)) return parsed;
  }

  return Date.now();
}

function safeParseOptionalDateToMs(val: any): number | undefined {
  if (val === null || val === undefined || val === '' || val === 'null' || val === 'undefined') {
    return undefined;
  }
  if (typeof val === 'string' && !val.trim()) {
    return undefined;
  }
  return safeParseDateToMs(val);
}

// Helper to retrieve all visitors with complete visit histories from the database
async function getAllVisitorsWithHistory(): Promise<any[]> {
  const rawVisitors = await dbAll<any>('SELECT * FROM visitors ORDER BY id DESC');
  const rawVisits = await dbAll<any>('SELECT * FROM visits ORDER BY id ASC');

  const visitsMap: Record<string, any[]> = {};
  if (Array.isArray(rawVisits)) {
    for (const v of rawVisits) {
      const vKey = String(v.visitor_id);
      if (!visitsMap[vKey]) visitsMap[vKey] = [];
      visitsMap[vKey].push({
        id: String(v.id),
        visitorType: v.visitor_type || 'Guest',
        visiting: v.visit_info || '',
        purpose: v.purpose || 'Visit',
        status: v.status || 'signed-in',
        signInTime: safeParseDateToMs(v.time_in || v.created_at),
        signOutTime: safeParseOptionalDateToMs(v.time_out)
      });
    }
  }

  const visitors = await Promise.all((rawVisitors || []).map(async (v: any) => {
    const photoDataUrl = await getPhotoAsDataUrl(v.photo);
    const vKey = String(v.id);
    const parsedSignIn = safeParseDateToMs(v.time_in || v.created_at);
    const parsedSignOut = safeParseOptionalDateToMs(v.time_out);
    const history = visitsMap[vKey] || [{
      id: String(v.id),
      visitorType: v.visitor_type || 'Guest',
      visiting: v.visit_info || '',
      purpose: v.purpose || 'Visit',
      status: v.status || 'signed-in',
      signInTime: parsedSignIn,
      signOutTime: parsedSignOut
    }];

    return {
      id: String(v.id),
      idNumber: v.visitor_number || v.id_number || String(v.id),
      visitorNumber: v.visitor_number || String(v.id),
      name: v.full_name,
      visitorType: v.visitor_type || 'Guest',
      visiting: v.visit_info || 'Walk-in Visit',
      idType: v.id_type || 'School ID',
      contactNumber: v.contact_number || '',
      address: v.address || '',
      purpose: v.purpose || 'Visit',
      photo: photoDataUrl,
      photo_url: photoDataUrl,
      photoDataUrl: photoDataUrl,
      registrationType: v.registration_type || 'Walk-in',
      status: v.status || 'signed-in',
      signInTime: parsedSignIn,
      signOutTime: parsedSignOut,
      createdAt: v.created_at,
      history
    };
  }));

  return visitors;
}

// Generate complete system backup payload with all photos converted to base64 Data URLs
router.get('/backup', async (req, res) => {
  try {
    const rawEvents = await dbAll<any>('SELECT * FROM events ORDER BY id ASC');
    const rawPreRegs = await dbAll<any>('SELECT * FROM pre_registrations ORDER BY id ASC');
    const visitors = await getAllVisitorsWithHistory();

    const autoLogoutRow = await dbGet<any>('SELECT value FROM system_settings WHERE key = ?', ['auto_logout']);
    const autoLogoutSettings = autoLogoutRow && autoLogoutRow.value ? JSON.parse(autoLogoutRow.value) : null;

    const events = (rawEvents || []).map((e: any) => ({
      id: e.id,
      name: e.event_name,
      eventName: e.event_name,
      description: e.description || '',
      location: e.location || '',
      date: e.date,
      registrationLink: e.registration_link || `/register/${e.id}`,
      status: e.status || 'active'
    }));

    res.json({
      version: '1.0',
      timestamp: new Date().toISOString(),
      visitors,
      events,
      preRegistrations: rawPreRegs || [],
      autoLogoutSettings
    });
  } catch (err: any) {
    console.error('Error creating backup:', err);
    res.status(500).json({ error: err.message || 'Failed to create backup' });
  }
});

// Permanently clear all visitors, visits, events, pre-registrations and reports
router.post('/clear-data', async (req, res) => {
  try {
    // 1. Delete records from all transactional and log tables
    await dbRun('DELETE FROM visits');
    await dbRun('DELETE FROM visitors');
    await dbRun('DELETE FROM pre_registrations');
    await dbRun('DELETE FROM events');

    // 2. Reset SQLite autoincrement sequences for cleared tables so counters start from 1 (#0001)
    try {
      await dbRun("DELETE FROM sqlite_sequence WHERE name IN ('visitors', 'visits', 'events', 'pre_registrations')");
    } catch (seqErr) {
      console.warn('sqlite_sequence reset note:', seqErr);
    }

    // 3. Clean up uploaded photo files from uploads directory
    try {
      const uploadsDir = path.join(process.cwd(), 'uploads');
      if (fs.existsSync(uploadsDir)) {
        const files = fs.readdirSync(uploadsDir);
        for (const file of files) {
          const filePath = path.join(uploadsDir, file);
          if (fs.lstatSync(filePath).isFile()) {
            fs.unlinkSync(filePath);
          }
        }
      }
    } catch (fileErr) {
      console.warn('Uploads cleanup note:', fileErr);
    }

    // Notice: The `users` table is strictly preserved, keeping Admin and Guard accounts intact.

    res.json({
      success: true,
      message: 'All visitor records, visit logs, events, pre-registrations, and report logs have been permanently cleared. Visitor counter reset to #0001.'
    });
  } catch (err: any) {
    console.error('Error clearing data:', err);
    res.status(500).json({ error: err.message || 'Failed to clear system data' });
  }
});

// Safe helper to generate next visitor number (0001 reserved; starts at 0002)
async function getNextSafeVisitorNumber(): Promise<string> {
  const allVisitors = await dbAll<any>('SELECT visitor_number FROM visitors');
  let maxNum = 1; // 0001 is permanently reserved
  if (Array.isArray(allVisitors)) {
    for (const v of allVisitors) {
      if (v.visitor_number) {
        const num = parseInt(String(v.visitor_number).replace(/\D/g, ''), 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }
  }
  return (maxNum + 1).toString().padStart(4, '0');
}

// Restore and merge data from backup payload without deleting or replacing current data
router.post('/restore-data', async (req, res) => {
  try {
    const { visitors, events, preRegistrations } = req.body;

    // 1. Merge Events
    if (Array.isArray(events)) {
      for (const ev of events) {
        const eventName = (ev.name || ev.event_name || ev.eventName || '').trim();
        const date = ev.date;
        if (!eventName || !date) continue;
        const desc = ev.description || '';
        const loc = ev.location || '';
        const status = ev.status || 'active';
        
        const existingEvent = await dbGet<any>(
          'SELECT id FROM events WHERE LOWER(TRIM(event_name)) = LOWER(TRIM(?)) AND date = ?',
          [eventName, date]
        );

        if (!existingEvent) {
          const resInsert = await dbRun(
            'INSERT INTO events (event_name, description, location, date, status) VALUES (?, ?, ?, ?, ?)',
            [eventName, desc, loc, date, status]
          );
          if (resInsert.lastID) {
            const regLink = ev.registrationLink || ev.registration_link || `/register/${resInsert.lastID}`;
            await dbRun('UPDATE events SET registration_link = ? WHERE id = ?', [regLink, resInsert.lastID]);
          }
        }
      }
    }

    // 2. Merge Pre-Registrations
    if (Array.isArray(preRegistrations)) {
      // Introspect pre_registrations table columns dynamically to guarantee error-free insertion
      const colInfo = await dbAll<any>('PRAGMA table_info(pre_registrations)').catch(() => []);
      const colSet = new Set(Array.isArray(colInfo) ? colInfo.map(c => c.name) : []);

      // Verify and guarantee all required columns exist in pre_registrations
      const requiredPrCols = [
        { name: 'visit_info', type: 'TEXT' },
        { name: 'id_type', type: 'TEXT' },
        { name: 'id_number', type: 'TEXT' },
        { name: 'contact_number', type: 'TEXT' },
        { name: 'email', type: 'TEXT' },
        { name: 'address', type: 'TEXT' },
        { name: 'visitor_type', type: 'TEXT' },
        { name: 'purpose', type: 'TEXT' },
        { name: 'photo', type: 'TEXT' },
        { name: 'registration_type', type: "TEXT DEFAULT 'Online Registration'" },
        { name: 'status', type: "TEXT DEFAULT 'pre-registered'" },
        { name: 'qr_code', type: 'TEXT' },
        { name: 'visitor_number', type: 'TEXT' }
      ];

      for (const col of requiredPrCols) {
        if (!colSet.has(col.name)) {
          await dbRun(`ALTER TABLE pre_registrations ADD COLUMN ${col.name} ${col.type}`).catch(() => {});
          colSet.add(col.name);
        }
      }

      for (const pr of preRegistrations) {
        const fullName = (pr.full_name || pr.name || '').trim();
        const eventId = pr.event_id || pr.eventId;
        if (!fullName || !eventId) continue;

        const existingPR = await dbGet<any>(
          'SELECT id FROM pre_registrations WHERE event_id = ? AND LOWER(TRIM(full_name)) = LOWER(TRIM(?))',
          [eventId, fullName]
        );

        const vType = pr.visitor_type || pr.visitorType || 'Guest';
        const vInfo = pr.visit_info || pr.visiting || '';
        const idType = pr.id_type || pr.idType || 'School ID';
        const idNum = pr.id_number || pr.idNumber || '';
        const contact = pr.contact_number || pr.contactNumber || '';
        const email = pr.email || '';
        const address = pr.address || '';
        const purpose = pr.purpose || 'Event Attendance';
        const photo = pr.photo || pr.photo_url || pr.photoDataUrl || null;
        const regType = pr.registration_type || pr.registrationType || 'Online Registration';
        const status = pr.status || 'pre-registered';
        const qrCode = pr.qr_code || pr.qrCode || '';
        const visNum = pr.visitor_number || pr.visitorNumber || '';

        if (!existingPR) {
          const rowData: Record<string, any> = {
            event_id: eventId,
            full_name: fullName,
            visitor_type: vType,
            visit_info: vInfo,
            id_type: idType,
            id_number: idNum,
            contact_number: contact,
            email: email,
            address: address,
            purpose: purpose,
            photo: photo,
            registration_type: regType,
            status: status,
            qr_code: qrCode,
            visitor_number: visNum
          };

          const colsToInsert: string[] = [];
          const valuesToInsert: any[] = [];
          for (const [colKey, colVal] of Object.entries(rowData)) {
            if (colSet.has(colKey)) {
              colsToInsert.push(colKey);
              valuesToInsert.push(colVal);
            }
          }

          if (colsToInsert.length > 0) {
            const placeholders = colsToInsert.map(() => '?').join(', ');
            await dbRun(
              `INSERT INTO pre_registrations (${colsToInsert.join(', ')}) VALUES (${placeholders})`,
              valuesToInsert
            );
          }
        } else {
          // If pre-registration already exists, backfill any missing details from the backup
          const updates: string[] = [];
          const updateVals: any[] = [];
          if (vInfo && colSet.has('visit_info')) {
            updates.push('visit_info = COALESCE(NULLIF(visit_info, ""), ?)');
            updateVals.push(vInfo);
          }
          if (email && colSet.has('email')) {
            updates.push('email = COALESCE(NULLIF(email, ""), ?)');
            updateVals.push(email);
          }
          if (photo && colSet.has('photo')) {
            updates.push('photo = COALESCE(photo, ?)');
            updateVals.push(photo);
          }
          if (visNum && colSet.has('visitor_number')) {
            updates.push('visitor_number = COALESCE(NULLIF(visitor_number, ""), ?)');
            updateVals.push(visNum);
          }
          if (qrCode && colSet.has('qr_code')) {
            updates.push('qr_code = COALESCE(NULLIF(qr_code, ""), ?)');
            updateVals.push(qrCode);
          }
          if (contact && colSet.has('contact_number')) {
            updates.push('contact_number = COALESCE(NULLIF(contact_number, ""), ?)');
            updateVals.push(contact);
          }
          if (address && colSet.has('address')) {
            updates.push('address = COALESCE(NULLIF(address, ""), ?)');
            updateVals.push(address);
          }

          if (updates.length > 0) {
            updateVals.push(existingPR.id);
            await dbRun(`UPDATE pre_registrations SET ${updates.join(', ')} WHERE id = ?`, updateVals).catch(() => {});
          }
        }
      }
    }

    // 3. Merge Visitors & Visits
    if (Array.isArray(visitors)) {
      for (const v of visitors) {
        const fullName = (v.name || v.full_name || '').trim();
        if (!fullName) continue;

        let visNum = String(v.idNumber || v.visitor_number || v.visitorNumber || '').trim();
        const vType = v.visitorType || v.visitor_type || 'Guest';
        const vInfo = v.visiting || v.visit_info || 'Walk-in Visit';
        const idType = v.idType || v.id_type || 'School ID';
        const idNum = v.idNumber || v.id_number || visNum;
        const contact = v.contactNumber || v.contact_number || '';
        const address = v.address || '';
        const purpose = v.purpose || 'Visit';
        const status = v.status || 'signed-in';
        const regType = v.registrationType || v.registration_type || 'Walk-in';
        
        // Handle photo restoration: ensure complete Base64 data URL is retained in DB
        const rawPhoto = v.photo_url || v.photoDataUrl || v.photo || v.photoPath || v.image || v.image_url || null;
        let persistentPhoto: string | null = null;

        if (rawPhoto && typeof rawPhoto === 'string') {
          const trimmedPhoto = rawPhoto.trim();
          if (trimmedPhoto.startsWith('data:image/')) {
            persistentPhoto = trimmedPhoto;
          } else {
            persistentPhoto = await getPhotoAsDataUrl(trimmedPhoto);
          }
        }

        const timeIn = v.signInTime ? new Date(v.signInTime).toISOString() : (v.timeIn || v.time_in || new Date().toISOString());
        const timeOut = v.signOutTime ? new Date(v.signOutTime).toISOString() : (v.timeOut || v.time_out || null);

        // Check if this person already exists in current DB by ID, visitor number, full name, contact, or ID credentials
        let existing: any = null;

        if (v.id) {
          existing = await dbGet<any>('SELECT * FROM visitors WHERE id = ?', [v.id]);
        }

        if (!existing && visNum) {
          existing = await dbGet<any>('SELECT * FROM visitors WHERE visitor_number = ?', [visNum]);
        }

        if (!existing && fullName) {
          existing = await dbGet<any>(
            `SELECT * FROM visitors WHERE LOWER(TRIM(full_name)) = LOWER(TRIM(?)) ORDER BY id ASC LIMIT 1`,
            [fullName]
          );
        }

        if (!existing && contact && contact.trim()) {
          existing = await dbGet<any>(
            `SELECT * FROM visitors WHERE contact_number IS NOT NULL AND contact_number != '' AND TRIM(contact_number) = TRIM(?) ORDER BY id ASC LIMIT 1`,
            [contact.trim()]
          );
        }

        if (!existing && idType && idNum && idNum.trim()) {
          existing = await dbGet<any>(
            `SELECT * FROM visitors WHERE id_type = ? AND id_number IS NOT NULL AND id_number != '' AND TRIM(id_number) = TRIM(?) ORDER BY id ASC LIMIT 1`,
            [idType.trim(), idNum.trim()]
          );
        }

        let visitorId: number;
        let finalVisNum: string;

        if (existing) {
          visitorId = existing.id;
          finalVisNum = existing.visitor_number;

          // Do not overwrite existing/newer visitor details with older backup data; only fill missing photo
          if (!existing.photo && persistentPhoto) {
            await dbRun(`UPDATE visitors SET photo = ? WHERE id = ?`, [persistentPhoto, visitorId]);
          }
          if (!existing.contact_number && contact) {
            await dbRun(`UPDATE visitors SET contact_number = ? WHERE id = ?`, [contact, visitorId]);
          }
          if (!existing.address && address) {
            await dbRun(`UPDATE visitors SET address = ? WHERE id = ?`, [address, visitorId]);
          }
        } else {
          // New visitor from backup being added to existing data
          if (!visNum) {
            finalVisNum = await getNextSafeVisitorNumber();
          } else {
            // Check if this ID number is already taken by another visitor in DB
            const numberTaken = await dbGet<any>('SELECT id FROM visitors WHERE visitor_number = ?', [visNum]);
            if (numberTaken) {
              finalVisNum = await getNextSafeVisitorNumber();
            } else {
              finalVisNum = visNum;
            }
          }

          const result = await dbRun(`
            INSERT INTO visitors (
              visitor_number, visitor_type, visit_info, id_type, id_number,
              full_name, contact_number, address, purpose, photo, registration_type, status,
              time_in, time_out
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            finalVisNum, vType, vInfo, idType, idNum || finalVisNum,
            fullName, contact, address, purpose, persistentPhoto, regType, status,
            timeIn, timeOut
          ]);

          visitorId = result.lastID;
        }

        // Merge visit history for this visitor
        const visitsToMerge = Array.isArray(v.history) && v.history.length > 0
          ? v.history
          : [{
              visitorType: vType,
              visiting: vInfo,
              purpose,
              status,
              signInTime: v.signInTime,
              signOutTime: v.signOutTime,
              time_in: timeIn,
              time_out: timeOut
            }];

        for (const h of visitsToMerge) {
          const hTimeIn = h.signInTime ? new Date(h.signInTime).toISOString() : (h.time_in || timeIn);
          const hTimeOut = h.signOutTime ? new Date(h.signOutTime).toISOString() : (h.time_out || null);

          // Check if this specific visit is already recorded in visits table
          const existingVisit = await dbGet<any>(
            `SELECT id FROM visits WHERE visitor_id = ? AND time_in = ?`,
            [visitorId, hTimeIn]
          );

          if (!existingVisit) {
            await dbRun(`
              INSERT INTO visits (visitor_id, visitor_number, visitor_type, visit_info, purpose, status, registration_type, time_in, time_out)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              visitorId,
              finalVisNum,
              h.visitorType || vType,
              h.visiting || vInfo,
              h.purpose || purpose,
              h.status || 'signed-in',
              regType,
              hTimeIn,
              hTimeOut
            ]);
          }
        }
      }
    }

    // 4. Optionally restore Auto-Logout settings if included in backup
    if (req.body.autoLogoutSettings && typeof req.body.autoLogoutSettings === 'object') {
      const s = req.body.autoLogoutSettings;
      const isEnabled = Boolean(
        s.automaticLogoutEnabled !== undefined ? s.automaticLogoutEnabled : s.enabled
      );
      const newSettings = {
        enabled: isEnabled,
        automaticLogoutEnabled: isEnabled,
        durationValue: Number(s.durationValue) > 0 ? Number(s.durationValue) : 30,
        durationUnit: s.durationUnit === 'hours' ? 'hours' : 'minutes',
        warningDurationValue: Number(s.warningDurationValue) > 0 ? Number(s.warningDurationValue) : 30,
        warningDurationUnit: s.warningDurationUnit === 'minutes' ? 'minutes' : 'seconds',
        isConfigured: true,
        updatedAt: Date.now()
      };
      const serialized = JSON.stringify(newSettings);
      await dbRun(
        'INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        ['auto_logout', serialized]
      ).catch((err) => console.warn('Could not restore auto-logout settings:', err));
      await dbRun(
        'INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        ['automaticLogoutEnabled', serialized]
      ).catch(() => {});
    }

    // Retrieve full merged dataset from database
    const allMergedVisitors = await getAllVisitorsWithHistory();
    const allEvents = await dbAll<any>('SELECT * FROM events ORDER BY id ASC');

    res.json({
      success: true,
      message: 'Backup data merged successfully with existing data',
      visitors: allMergedVisitors,
      events: allEvents
    });
  } catch (err: any) {
    console.error('Error restoring data:', err);
    res.status(500).json({ error: err.message || 'Failed to restore data' });
  }
});

export default router;
