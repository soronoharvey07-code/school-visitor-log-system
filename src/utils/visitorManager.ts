import { Visitor, VisitEntry } from '../types';

/**
 * Normalizes and consolidates a list of visitors so each unique person
 * (matched by name or idNumber) has a single Visitor profile with complete Visit History.
 */
export function consolidateVisitors(visitorsList: Visitor[]): Visitor[] {
  if (!Array.isArray(visitorsList)) return [];

  const map = new Map<string, Visitor>();

  // Process in chronological order so original Visitor ID is preserved
  const sorted = [...visitorsList].sort((a, b) => (a.signInTime || 0) - (b.signInTime || 0));

  for (const item of sorted) {
    if (!item) continue;
    const rawName = item.name || (item as any).full_name || '';
    if (!rawName.trim()) continue;
    const normName = rawName.trim().toLowerCase().replace(/\s+/g, ' ');
    const cleanId = String(item.id || '').trim();
    const cleanContact = item.contactNumber ? String(item.contactNumber).trim() : '';
    const cleanIdType = item.idType ? String(item.idType).trim() : '';
    const cleanIdNum = item.idNumber ? String(item.idNumber).trim() : '';
    const rawVisNum = String(item.visitorNumber || item.idNumber || (item as any).visitor_number || '').trim();
    const cleanVisNum = rawVisNum.replace(/^0+/, '');
    
    // Find if there's already an entry in map (match by name, id, visitor number, contact number, or ID type + ID number)
    let existingKey: string | null = null;
    if (map.has(normName)) {
      existingKey = normName;
    } else {
      for (const [k, v] of map.entries()) {
        const vRawName = v.name || (v as any).full_name || '';
        const vNormName = vRawName.trim().toLowerCase().replace(/\s+/g, ' ');
        if (vNormName === normName) {
          existingKey = k;
          break;
        }

        const vId = String(v.id || '').trim();
        if (cleanId && vId && cleanId === vId) {
          existingKey = k;
          break;
        }

        const vVisNum = String(v.visitorNumber || v.idNumber || (v as any).visitor_number || '').trim().replace(/^0+/, '');
        if (cleanVisNum && vVisNum && cleanVisNum === vVisNum) {
          existingKey = k;
          break;
        }

        if (cleanContact && v.contactNumber && String(v.contactNumber).trim() === cleanContact) {
          existingKey = k;
          break;
        }

        if (cleanIdType && cleanIdNum && v.idType === cleanIdType && v.idNumber && String(v.idNumber).trim() === cleanIdNum) {
          existingKey = k;
          break;
        }
      }
    }

    const currentVisitEntry: VisitEntry = {
      id: String(item.id || Date.now()),
      signInTime: item.signInTime || Date.now(),
      signOutTime: item.signOutTime,
      purpose: item.purpose || 'Visit',
      visiting: item.visiting || '',
      visitorType: item.visitorType || 'Guest',
      status: item.status || 'signed-in'
    };

    const photoVal = item.photo_url || item.photoDataUrl || (item as any).photo || null;

    if (!existingKey) {
      // First visit for this person
      const initialHistory: VisitEntry[] = Array.isArray(item.history) && item.history.length > 0
        ? item.history
        : [currentVisitEntry];

      map.set(normName, {
        ...item,
        name: rawName.trim(),
        photo_url: photoVal,
        photoDataUrl: photoVal,
        photo: photoVal,
        history: initialHistory
      });
    } else {
      // Returning visitor: merge visits under the original profile
      const primary = map.get(existingKey)!;
      const existingHistory = primary.history || [];

      // Check if current visit is already logged in history
      const itemHistory = Array.isArray(item.history) ? item.history : [currentVisitEntry];
      const mergedHistory = [...existingHistory];

      for (const h of itemHistory) {
        const isDup = mergedHistory.some(existingH => 
          existingH.id === h.id || 
          (existingH.signInTime === h.signInTime && existingH.purpose === h.purpose) ||
          (h.status === 'pre-registered' && existingH.status === 'pre-registered' && existingH.visiting === h.visiting)
        );
        if (!isDup) {
          mergedHistory.push(h);
        }
      }

      // Retain existing photo if already present; only fallback to new photo if existing was empty
      const mergedPhoto = primary.photo_url || primary.photoDataUrl || (primary as any).photo || photoVal || null;

      map.set(existingKey, {
        ...primary, // Keep original ID, Visitor ID (#0001)
        name: primary.name || rawName.trim(),
        purpose: item.purpose || primary.purpose,
        visiting: item.visiting || primary.visiting,
        visitorType: item.visitorType || primary.visitorType,
        photo_url: mergedPhoto,
        photoDataUrl: mergedPhoto,
        photo: mergedPhoto,
        contactNumber: item.contactNumber || primary.contactNumber,
        address: item.address || primary.address,
        idType: item.idType || primary.idType,
        idNumber: primary.idNumber || item.idNumber,
        visitorNumber: primary.visitorNumber || item.visitorNumber || primary.idNumber,
        status: item.status || primary.status,
        signInTime: item.signInTime || primary.signInTime,
        signOutTime: item.signOutTime !== undefined ? item.signOutTime : primary.signOutTime,
        history: mergedHistory
      });
    }
  }

  return Array.from(map.values());
}

/**
 * Registers a visit for a visitor (walk-in or online pre-registration).
 * If returning visitor, keeps existing Visitor ID and updates profile history.
 * If new visitor, creates new profile with new Visitor ID.
 */
export function registerOrUpdateVisitor(
  visitors: Visitor[],
  newVisitData: {
    name: string;
    idNumber?: string;
    visitorType?: string;
    idType?: string;
    contactNumber?: string;
    address?: string;
    purpose?: string;
    visiting?: string;
    photoDataUrl?: string | null;
    status?: 'signed-in' | 'signed-out' | 'pre-registered';
    signInTime?: number;
    signOutTime?: number;
    generateNextIdNumber: () => string;
  }
): { updatedVisitors: Visitor[]; visitor: Visitor; isReturning: boolean } {
  const normName = newVisitData.name.trim().toLowerCase();
  const cleanContact = newVisitData.contactNumber ? newVisitData.contactNumber.trim() : '';
  const cleanIdType = newVisitData.idType ? newVisitData.idType.trim() : '';
  const cleanIdNum = newVisitData.idNumber ? newVisitData.idNumber.trim() : '';
  
  // Find matching existing visitor by name, contact number, or ID type + ID number
  const existing = visitors.find(v => {
    if (v.name && v.name.trim().toLowerCase() === normName) return true;
    if (cleanContact && v.contactNumber && v.contactNumber.trim() === cleanContact) return true;
    if (cleanIdType && cleanIdNum && v.idType === cleanIdType && v.idNumber && v.idNumber.trim() === cleanIdNum) return true;
    return false;
  });

  const now = newVisitData.signInTime || Date.now();
  const visitStatus = newVisitData.status || 'signed-in';

  if (existing) {
    // Returning visitor!
    const visitEntry: VisitEntry = {
      id: String(Date.now()),
      signInTime: now,
      signOutTime: newVisitData.signOutTime,
      purpose: newVisitData.purpose || existing.purpose,
      visiting: newVisitData.visiting || existing.visiting,
      visitorType: newVisitData.visitorType || existing.visitorType,
      status: visitStatus
    };

    const existingHistory = Array.isArray(existing.history) && existing.history.length > 0
      ? existing.history
      : [{
          id: existing.id,
          signInTime: existing.signInTime,
          signOutTime: existing.signOutTime,
          purpose: existing.purpose,
          visiting: existing.visiting,
          visitorType: existing.visitorType,
          status: existing.status
        }];

    // Prevent duplicate visit entry if same person pre-registers for the same event multiple times
    const isDupPreReg = visitStatus === 'pre-registered' && existingHistory.some(h => 
      h.status === 'pre-registered' && (h.visiting === newVisitData.visiting || h.purpose === newVisitData.purpose)
    );
    const updatedHistory = isDupPreReg ? existingHistory : [...existingHistory, visitEntry];

    // Keep existing photo; if none existed, use the newly provided photo
    const retainedPhoto = existing.photoDataUrl || existing.photo || existing.photo_url || newVisitData.photoDataUrl || null;

    const updatedVisitor: Visitor = {
      ...existing,
      // Keep original Visitor ID (#0001) and profile ID
      purpose: newVisitData.purpose || existing.purpose,
      visiting: newVisitData.visiting || existing.visiting,
      visitorType: newVisitData.visitorType || existing.visitorType,
      idType: newVisitData.idType || existing.idType,
      contactNumber: newVisitData.contactNumber || existing.contactNumber,
      address: newVisitData.address || existing.address,
      photoDataUrl: retainedPhoto,
      photo: retainedPhoto,
      photo_url: retainedPhoto,
      status: visitStatus,
      signInTime: now,
      signOutTime: newVisitData.signOutTime,
      history: updatedHistory
    };

    const updatedVisitors = visitors.map(v => v.id === existing.id ? updatedVisitor : v);
    return { updatedVisitors, visitor: updatedVisitor, isReturning: true };
  } else {
    // New visitor!
    const newVisitorId = newVisitData.generateNextIdNumber();
    const newId = String(Date.now());
    
    const visitEntry: VisitEntry = {
      id: newId,
      signInTime: now,
      signOutTime: newVisitData.signOutTime,
      purpose: newVisitData.purpose || 'Visit',
      visiting: newVisitData.visiting || '',
      visitorType: newVisitData.visitorType || 'Guest',
      status: visitStatus
    };

    const newVisitor: Visitor = {
      id: newId,
      idNumber: newVisitorId,
      name: newVisitData.name.trim(),
      visitorType: newVisitData.visitorType || 'Guest',
      visiting: newVisitData.visiting || '',
      idType: newVisitData.idType || 'School ID',
      contactNumber: newVisitData.contactNumber || '',
      address: newVisitData.address || '',
      purpose: newVisitData.purpose || 'Visit',
      photoDataUrl: newVisitData.photoDataUrl || null,
      photo: newVisitData.photoDataUrl || null,
      photo_url: newVisitData.photoDataUrl || null,
      status: visitStatus,
      signInTime: now,
      signOutTime: newVisitData.signOutTime,
      history: [visitEntry]
    };

    return { updatedVisitors: [newVisitor, ...visitors], visitor: newVisitor, isReturning: false };
  }
}
