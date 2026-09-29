import React, { useState, useRef, useEffect } from 'react';
import { Calendar, MapPin, Camera, Upload, RefreshCw, Check, Download, Share2, Copy, CheckCheck, Sparkles, ChevronDown } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { Visitor, SchoolEvent } from '../../types';
import { getNextIdNumber } from '../../utils/idSequence';
import { API } from '../../api';
import { consolidateVisitors, registerOrUpdateVisitor } from '../../utils/visitorManager';
import { formatManilaDate } from '../../utils/dateUtils';
import { validateEventStatus } from '../../utils/eventValidation';
import { isInAppBrowser } from '../../utils/browserDetection';
import { OpenBrowserView } from './OpenBrowserView';

interface EventRegistrationProps {
  eventId: string;
}

export function EventRegistration({ eventId }: EventRegistrationProps) {
  const [event, setEvent] = useState<SchoolEvent | null>(null);
  const [isEventActive, setIsEventActive] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // In-App Browser Detection State (Facebook Messenger, Instagram, etc.)
  const [inApp] = useState<boolean>(() => isInAppBrowser());

  // Form State
  const [name, setName] = useState('');
  const [visitorType, setVisitorType] = useState('');
  const [idType, setIdType] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [address, setAddress] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [registeredVisitorId, setRegisteredVisitorId] = useState<string | null>(null);
  const [registeredVisitorNumber, setRegisteredVisitorNumber] = useState<string | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Camera State
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedTempImage, setCapturedTempImage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Restore pre-registered visitor pass from URL query parameters if present
  // (Prevents data loss and avoids regeneration when opening from Messenger into external browser)
  useEffect(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const urlVisNum = searchParams.get('vis_num') || searchParams.get('reg_num');
      const urlQrData = searchParams.get('qr_data') || searchParams.get('reg_id');
      const urlVisName = searchParams.get('vis_name') || searchParams.get('name') || '';
      const urlVisId = searchParams.get('vis_id');

      if (urlQrData) {
        let decoded = urlQrData;
        try {
          if (decoded.includes('%')) {
            decoded = decodeURIComponent(decoded);
          }
          const parsed = JSON.parse(decoded);
          const num = parsed.visitor_number || urlVisNum || '';
          setRegisteredVisitorId(decoded);
          setRegisteredVisitorNumber(num);
          setSuccess(true);
          return;
        } catch (e) {
          // If not valid JSON, fall back to urlVisNum
        }
      }

      if (urlVisNum) {
        const qrPayload = JSON.stringify({
          type: 'pre_registration',
          id: urlVisId ? (parseInt(urlVisId, 10) || urlVisId) : 0,
          visitor_number: urlVisNum,
          name: urlVisName.trim()
        });
        setRegisteredVisitorId(qrPayload);
        setRegisteredVisitorNumber(urlVisNum);
        setSuccess(true);
      }
    } catch (err) {
      console.warn('Error reading registration state from URL:', err);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadEvent = async () => {
      setLoading(true);
      // Perform authoritative shared event validation (works identically for QR scans and direct links)
      const validation = await validateEventStatus(eventId);
      if (!isMounted) return;

      if (validation.isValid && validation.event && validation.isActive) {
        setEvent(validation.event);
        setIsEventActive(true);
      } else if (validation.event) {
        setEvent(validation.event);
        setIsEventActive(false);
      } else {
        setEvent(null);
        setIsEventActive(false);
      }
      setLoading(false);
    };

    loadEvent();
    return () => {
      isMounted = false;
    };
  }, [eventId]);

  // Handle camera video stream binding with iOS Safari compatibility
  useEffect(() => {
    if (videoRef.current && stream && !capturedTempImage) {
      const video = videoRef.current;
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');
      video.muted = true;
      
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(e => {
          console.warn('Video auto-play interrupted or waiting for user gesture on iOS:', e);
        });
      }
    }
  }, [stream, isCameraOpen, capturedTempImage]);

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  // Convert QR Code Canvas to image data URL when registration succeeds
  useEffect(() => {
    if (success && registeredVisitorId) {
      const timer = setTimeout(() => {
        const canvas = document.getElementById('registration-qr') as HTMLCanvasElement;
        if (canvas) {
          try {
            const dataUrl = canvas.toDataURL('image/png');
            setQrImageUrl(dataUrl);
          } catch (e) {
            console.warn('Could not generate QR image data URL:', e);
          }
        }
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [success, registeredVisitorId]);

  const startCamera = async () => {
    setError('');
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera is not supported on this browser. You can use Upload Photo instead.');
      }

      let mediaStream: MediaStream;
      try {
        // Primary constraints optimal for front-facing selfie cameras on iOS & Android
        mediaStream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
      } catch (specErr) {
        // Fallback for older iOS Safari or restricted webviews
        console.warn('Attempting basic camera fallback constraints:', specErr);
        mediaStream = await navigator.mediaDevices.getUserMedia({ 
          video: true,
          audio: false
        });
      }

      setStream(mediaStream);
      setIsCameraOpen(true);
      setCapturedTempImage(null);
    } catch (err: any) {
      console.error('Error accessing camera:', err);
      alert('Unable to access camera on your device. Please ensure camera permissions are allowed in your browser settings, or use the "Upload Photo" option.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsCameraOpen(false);
    setCapturedTempImage(null);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 480;
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(video, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        setCapturedTempImage(dataUrl);
      }
    }
  };

  const retakePhoto = () => {
    setCapturedTempImage(null);
  };

  const usePhoto = () => {
    setPhotoDataUrl(capturedTempImage);
    stopCamera();
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type - allow all images including HEIC / camera photos on iOS
    if (!file.type.startsWith('image/') && !file.name.match(/\.(jpg|jpeg|png|webp|heic|heif)$/i)) {
      setError('Please select a valid image file (JPG, JPEG, PNG).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        const img = new Image();
        img.onload = () => {
          const maxDim = 800;
          let width = img.width;
          let height = img.height;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.88);
            setPhotoDataUrl(optimizedDataUrl);
          } else {
            setPhotoDataUrl(result);
          }
          setError('');
        };
        img.onerror = () => {
          setPhotoDataUrl(result);
          setError('');
        };
        img.src = result;
      }
    };
    reader.readAsDataURL(file);

    if (e.target) {
      e.target.value = '';
    }
  };

  const getSharedStorage = () => {
    try {
      if (window.opener && window.opener.localStorage) {
        return window.opener.localStorage;
      }
    } catch (e) {
      // Ignore cross-origin issues
    }
    return window.localStorage;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name || !name.trim()) {
      setError('Please enter your full name.');
      return;
    }

    if (!visitorType) {
      setError('Please select a visitor type.');
      return;
    }

    if (!idType) {
      setError('Please select an ID type.');
      return;
    }

    if (!photoDataUrl) {
      setError('A visitor photo is required before registration can be submitted.');
      return;
    }

    setSubmitting(true);

    try {
      // Re-validate event status immediately before sending registration payload
      const currentValidation = await validateEventStatus(eventId);
      if (!currentValidation.isActive) {
        setIsEventActive(false);
        setError('This event registration link is currently inactive or no longer accepting submissions.');
        setSubmitting(false);
        return;
      }

      const res = await fetch('/api/public/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: event?.id,
          full_name: name.trim(),
          visitor_type: visitorType,
          id_type: idType,
          id_number: '',
          contact_number: contactNumber.trim(),
          address: address.trim(),
          purpose: 'Event Attendance',
          visit_info: event?.event_name || (event as any)?.name || 'Event',
          status: 'pre-registered',
          registration_type: 'Online Registration',
          photoDataUrl: photoDataUrl
        })
      });

      let data: any = null;
      if (res.ok) {
        data = await res.json();
      } else {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || 'Failed to submit registration. Please try again.');
      }

      if (data && (data.id || data.visitor_number)) {
        const visNum = data.visitor_number || (data.id ? String(data.id).padStart(4, '0') : '0001');
        const qrPayload = JSON.stringify({
          type: 'pre_registration',
          id: data.id,
          visitor_number: visNum,
          name: name.trim()
        });
        
        setRegisteredVisitorId(qrPayload);
        setRegisteredVisitorNumber(visNum);
        setSuccess(true);

        // Update URL query parameters immediately via history.replaceState
        // so if the visitor opens the native Messenger menu ("Open in Safari" / "Open in Chrome")
        // or reloads, the exact registration result is maintained without losing data or regenerating
        try {
          const currentUrl = new URL(window.location.href);
          currentUrl.searchParams.set('event', eventId);
          currentUrl.searchParams.set('vis_num', visNum);
          currentUrl.searchParams.set('vis_id', String(data.id));
          currentUrl.searchParams.set('vis_name', name.trim());
          currentUrl.searchParams.set('qr_data', qrPayload);
          window.history.replaceState(null, '', currentUrl.toString());
        } catch (e) {
          console.warn('Could not update history state:', e);
        }

        // Update local storage so visitor appears instantly if on same browser window
        try {
          const storage = getSharedStorage();
          const existingLogsStr = storage.getItem('school-visitor-log');
          let existingLogs: Visitor[] = [];
          if (existingLogsStr) {
            try { existingLogs = JSON.parse(existingLogsStr); } catch (e) {}
          }

          const { updatedVisitors } = registerOrUpdateVisitor(existingLogs, {
            name: name.trim(),
            idNumber: visNum,
            visitorType: visitorType,
            idType: idType,
            contactNumber: contactNumber,
            address: address,
            purpose: 'Event Attendance',
            visiting: event?.event_name || (event as any)?.name || 'Event',
            photoDataUrl: data.photoPath || photoDataUrl,
            status: 'pre-registered',
            signInTime: Date.now(),
            generateNextIdNumber: () => getNextIdNumber(existingLogs)
          });

          storage.setItem('school-visitor-log', JSON.stringify(consolidateVisitors(updatedVisitors)));
        } catch (e) {
          console.error('Error updating local storage:', e);
        }

        // Dispatch events to notify open tabs/windows
        window.dispatchEvent(new CustomEvent('visitor-registered'));
        if (window.opener) {
          try {
            window.opener.dispatchEvent(new CustomEvent('visitor-registered'));
          } catch (e) {
            // Ignore cross-origin issues
          }
        }
      }
    } catch (err: any) {
      console.error('Registration error:', err);
      setError(err.message || 'An error occurred during registration.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    return formatManilaDate(dateStr);
  };

  // Cross-Platform QR Code Saving (iOS Safari Native Share / Android / Desktop)
  const handleSaveOrShareQRCode = async () => {
    const canvas = document.getElementById('registration-qr') as HTMLCanvasElement;
    if (!canvas) return;

    const fileName = `visitor-qr-${registeredVisitorNumber || 'code'}.png`;

    // 1. Try iOS Safari & Modern Mobile Web Share API with File (Allows "Save Image" to Apple Photos)
    try {
      if (typeof navigator !== 'undefined' && navigator.canShare && typeof navigator.share === 'function') {
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
        if (blob) {
          const file = new File([blob], fileName, { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: `Visitor QR Code - ${registeredVisitorNumber || ''}`,
              text: `Rosemont Hills Montessori College - Visitor QR Code: ${registeredVisitorNumber || ''}`
            });
            return;
          }
        }
      }
    } catch (shareErr: any) {
      if (shareErr.name === 'AbortError') return; // User closed share sheet normally
      console.warn('Web Share API was skipped or unavailable, using download fallback:', shareErr);
    }

    // 2. Direct Blob / Anchor Download Fallback (Chrome, Android, Edge, Firefox, Desktop Safari)
    try {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (blob) {
        const blobUrl = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = blobUrl;
        downloadLink.download = fileName;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        setTimeout(() => {
          document.body.removeChild(downloadLink);
          URL.revokeObjectURL(blobUrl);
        }, 300);
        return;
      }

      // 3. Direct data URL fallback
      const dataUrl = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.href = dataUrl;
      downloadLink.download = fileName;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      setTimeout(() => {
        document.body.removeChild(downloadLink);
      }, 300);
    } catch (dlErr) {
      console.error('Download QR Code error:', dlErr);
    }
  };

  const handleCopyNumber = () => {
    if (registeredVisitorNumber) {
      navigator.clipboard.writeText(registeredVisitorNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getRegistrationResultUrl = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('event', eventId);
      if (registeredVisitorNumber) {
        url.searchParams.set('vis_num', registeredVisitorNumber);
      }
      if (registeredVisitorId) {
        url.searchParams.set('qr_data', registeredVisitorId);
        try {
          const parsed = JSON.parse(registeredVisitorId);
          if (parsed.name) url.searchParams.set('vis_name', parsed.name);
          if (parsed.id) url.searchParams.set('vis_id', String(parsed.id));
        } catch (e) {}
      }
      url.searchParams.delete('iab');
      url.searchParams.delete('sim_iab');
      return url.toString();
    } catch (e) {
      return window.location.href;
    }
  };

  if (inApp) {
    return <OpenBrowserView />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-app-bg flex items-center justify-center text-muted-fg font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-medium">Loading event details...</p>
        </div>
      </div>
    );
  }

  if (!event || !isEventActive || event.status === 'inactive') {
    return (
      <div className="min-h-screen bg-app-bg flex items-center justify-center flex-col p-6 text-center font-sans">
        <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
          <Calendar size={32} />
        </div>
        <h1 className="text-2xl font-bold text-main-fg mb-2">Link is unavailable</h1>
        <p className="text-muted-fg max-w-md text-sm font-medium">
          This event registration link is currently inactive or no longer accepting submissions.
        </p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-app-bg flex items-center justify-center flex-col p-4 sm:p-6 text-center font-sans">
        <div className="w-16 h-16 bg-emerald-600 rounded-full flex items-center justify-center text-white mb-5 shadow-lg animate-in zoom-in-95 duration-200">
          <Check size={32} strokeWidth={3} />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-main-fg mb-2 tracking-tight">Registration submitted successfully!</h1>
        <p className="text-muted-fg font-medium max-w-md mb-6 text-sm sm:text-base leading-relaxed">
          Your pre-registration has been saved to the school records. Please present this QR code to security upon arrival.
        </p>
        
        {registeredVisitorId && (
          <div className="bg-card-bg p-6 sm:p-8 rounded-2xl shadow-xl border border-app-border mb-6 flex flex-col items-center w-full max-w-md">
            
            {/* QR Display Area (Canvas + Crisp Image for Touch/Hold & Click) */}
            <div className="bg-white p-4 rounded-2xl shadow-inner border border-slate-200 relative group">
              <QRCodeCanvas 
                id="registration-qr"
                value={registeredVisitorId} 
                size={220}
                level="H"
                includeMargin={true}
                className="rounded-lg"
              />
              {qrImageUrl && (
                <img 
                  src={qrImageUrl} 
                  alt="Registration QR Code" 
                  className="absolute inset-0 w-full h-full p-4 object-contain rounded-2xl cursor-pointer"
                  title="Long press or right click to save photo"
                />
              )}
            </div>

            {registeredVisitorNumber && (
              <div className="mt-5 flex items-center gap-2 bg-app-bg px-4 py-2 rounded-xl border border-app-border">
                <span className="text-xs sm:text-sm font-medium text-muted-fg">Registration No:</span>
                <span className="text-base sm:text-lg text-blue-600 dark:text-blue-400 font-mono font-bold tracking-wider">
                  {registeredVisitorNumber}
                </span>
                <button
                  type="button"
                  onClick={handleCopyNumber}
                  className="ml-1 p-1 text-icon-fg hover:text-main-fg transition-colors"
                  title="Copy Number"
                >
                  {copied ? <CheckCheck size={16} className="text-emerald-500" /> : <Copy size={16} />}
                </button>
              </div>
            )}

            {/* Save / Share QR Code Action */}
            <div className="mt-6 w-full space-y-3">
              <button 
                type="button"
                onClick={handleSaveOrShareQRCode}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl transition-colors text-sm sm:text-base font-semibold shadow-md shadow-blue-500/20 cursor-pointer"
              >
                <Share2 size={18} />
                Save / Share QR Code
              </button>

              <p className="text-[12px] sm:text-[13px] text-muted-fg font-medium leading-relaxed">
                💡 <span className="font-semibold text-main-fg">iPhone / Mobile Tip:</span> Tap the button above to save to your Photos or Files, or tap & hold the QR image above.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app-bg py-8 sm:py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-2xl mx-auto">
        
        {/* Header Information */}
        <div className="text-center mb-8 sm:mb-10">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white mx-auto mb-4 shadow-lg">
            <Calendar size={32} strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-main-fg mb-1 tracking-tight">{event.event_name || (event as any).name}</h1>
          <p className="text-muted-fg text-sm sm:text-[15px] font-semibold mb-3">Online Visitor Pre-Registration</p>
          
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs sm:text-sm text-muted-fg font-medium mb-3">
            <div className="flex items-center gap-1.5 bg-card-bg border border-app-border px-3 py-1.5 rounded-lg shadow-sm">
              <Calendar size={15} className="text-blue-600 dark:text-blue-400" />
              {formatDate(event.date)}
            </div>
            {event.location && (
              <div className="flex items-center gap-1.5 bg-card-bg border border-app-border px-3 py-1.5 rounded-lg shadow-sm">
                <MapPin size={15} className="text-red-500" />
                {event.location}
              </div>
            )}
          </div>
          
          {event.description && (
            <p className="text-xs sm:text-sm text-main-fg max-w-xl mx-auto leading-relaxed mt-2">
              {event.description}
            </p>
          )}
        </div>

        {/* Registration Form */}
        <div className="bg-card-bg rounded-2xl shadow-sm border border-app-border overflow-hidden p-5 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Photo Section */}
            <div className="border border-dashed border-app-border rounded-xl p-5 sm:p-6 flex flex-col items-center justify-center bg-app-bg mb-6">
              <div className="flex items-center gap-2 text-label-fg font-bold text-sm mb-4">
                Visitor Photo <span className="text-red-500">*</span>
              </div>
              
              <div className="w-28 h-28 bg-hover-bg rounded-full flex items-center justify-center overflow-hidden border-4 border-card-bg shadow-sm mb-4">
                {photoDataUrl ? (
                  <img src={photoDataUrl} alt="Visitor" className="w-full h-full object-cover" />
                ) : (
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                )}
              </div>
              
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button 
                  type="button" 
                  onClick={startCamera}
                  className="flex items-center gap-2 px-4 py-2.5 bg-card-bg border border-app-border text-main-fg text-sm font-semibold rounded-lg hover:bg-hover-bg transition-colors shadow-sm active:scale-95"
                >
                  <Camera size={16} className="text-blue-600 dark:text-blue-400" />
                  {photoDataUrl ? 'Retake Photo' : 'Take Photo'}
                </button>
                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 bg-card-bg border border-app-border text-main-fg text-sm font-semibold rounded-lg hover:bg-hover-bg transition-colors shadow-sm active:scale-95"
                >
                  <Upload size={16} className="text-emerald-600 dark:text-emerald-400" />
                  Upload Photo
                </button>
                <input 
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
              </div>
            </div>

            {/* Form Fields - 16px font-size prevents iOS Safari Auto-Zoom */}
            <div className="space-y-4 sm:space-y-5">
              <div>
                <label className="block text-sm font-semibold text-label-fg mb-1.5">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-app-bg border border-app-border focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3.5 py-2.5 text-base sm:text-sm text-main-fg outline-none transition-colors placeholder:text-muted-fg font-medium" 
                  placeholder="As shown on ID" 
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                <div>
                  <label className="block text-sm font-semibold text-label-fg mb-1.5">
                    Visitor Type <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <select 
                      value={visitorType}
                      onChange={(e) => setVisitorType(e.target.value)}
                      className="w-full bg-app-bg border border-app-border focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3.5 py-2.5 text-base sm:text-sm text-main-fg outline-none appearance-none transition-colors font-medium cursor-pointer pr-10"
                      required
                    >
                      <option value="" disabled>Select visitor type</option>
                      <option value="Parent/Guardian">Parent/Guardian</option>
                      <option value="Student">Student</option>
                      <option value="Faculty/Teacher">Faculty/Teacher</option>
                      <option value="Staff">Staff</option>
                      <option value="School Official">School Official</option>
                      <option value="Guest">Guest</option>
                      <option value="Applicant">Applicant</option>
                      <option value="Alumni">Alumni</option>
                      <option value="Contractor">Contractor</option>
                      <option value="Service Provider">Service Provider</option>
                      <option value="Vendor/Supplier">Vendor/Supplier</option>
                      <option value="Delivery/Courier">Delivery/Courier</option>
                      <option value="Government Official">Government Official</option>
                      <option value="Emergency/Medical">Emergency/Medical</option>
                      <option value="Other">Other</option>
                    </select>
                    <ChevronDown size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-fg pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-label-fg mb-1.5">
                    ID Type <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <select 
                      value={idType}
                      onChange={(e) => setIdType(e.target.value)}
                      className="w-full bg-app-bg border border-app-border focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3.5 py-2.5 text-base sm:text-sm text-main-fg outline-none appearance-none transition-colors font-medium cursor-pointer pr-10"
                      required
                    >
                      <option value="" disabled>Select ID type</option>
                      <option value="School ID">School ID</option>
                      <option value="Driver's License">Driver's License</option>
                      <option value="National ID (PhilSys)">National ID (PhilSys)</option>
                      <option value="Passport">Passport</option>
                      <option value="UMID">UMID</option>
                      <option value="SSS ID">SSS ID</option>
                      <option value="PhilHealth ID">PhilHealth ID</option>
                      <option value="Postal ID">Postal ID</option>
                      <option value="PRC ID">PRC ID</option>
                      <option value="Company/Work ID">Company/Work ID</option>
                      <option value="Government Agency ID">Government Agency ID</option>
                      <option value="Senior Citizen ID">Senior Citizen ID</option>
                      <option value="PWD ID">PWD ID</option>
                      <option value="Other Valid ID">Other Valid ID</option>
                      <option value="No ID / Not Available">No ID / Not Available</option>
                    </select>
                    <ChevronDown size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-fg pointer-events-none" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-label-fg mb-1.5">Contact Number</label>
                <input 
                  type="tel" 
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                  className="w-full bg-app-bg border border-app-border focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3.5 py-2.5 text-base sm:text-sm text-main-fg outline-none transition-colors placeholder:text-muted-fg font-medium" 
                  placeholder="e.g. 0917 123 4567" 
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-label-fg mb-1.5">Address</label>
                <textarea 
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-app-bg border border-app-border focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3.5 py-2.5 text-base sm:text-sm text-main-fg outline-none resize-y transition-colors placeholder:text-muted-fg font-medium" 
                  rows={3} 
                  placeholder="Complete home or office address"
                ></textarea>
              </div>
            </div>

            {error && (
              <div className="p-3.5 bg-red-500/10 text-red-600 dark:text-red-400 text-sm font-medium rounded-xl border border-red-500/30">
                {error}
              </div>
            )}

            <button 
              type="submit" 
              disabled={submitting}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white text-base font-semibold rounded-xl transition-all shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer"
            >
              {submitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Submitting Registration...
                </>
              ) : (
                'Submit Registration'
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Camera Capture Modal */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-card-bg border border-app-border rounded-xl overflow-hidden w-full max-w-lg shadow-2xl">
            <div className="px-6 py-4 border-b border-app-border flex justify-between items-center bg-th-bg">
              <h3 className="text-base font-bold text-main-fg">
                {capturedTempImage ? 'Review Photo' : 'Take Photo'}
              </h3>
              <button 
                type="button"
                onClick={stopCamera} 
                className="text-icon-fg hover:text-main-fg transition-colors p-1 rounded-lg hover:bg-hover-bg"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            
            <div className="p-5 sm:p-6">
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center mb-6 shadow-inner border border-app-border">
                {capturedTempImage ? (
                  <img src={capturedTempImage} alt="Captured" className="w-full h-full object-cover" />
                ) : (
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className="w-full h-full object-cover"
                  ></video>
                )}
                <canvas ref={canvasRef} className="hidden" />
              </div>

              <div className="flex items-center justify-center gap-4">
                {capturedTempImage ? (
                  <>
                    <button 
                      type="button"
                      onClick={retakePhoto} 
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-app-bg border border-app-border text-label-fg font-semibold rounded-lg hover:bg-hover-bg transition-colors"
                    >
                      <RefreshCw size={18} />
                      Retake
                    </button>
                    <button 
                      type="button"
                      onClick={usePhoto} 
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-sm"
                    >
                      <Check size={18} />
                      Use Photo
                    </button>
                  </>
                ) : (
                  <button 
                    type="button"
                    onClick={capturePhoto} 
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-sm"
                  >
                    <Camera size={18} />
                    Capture
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

