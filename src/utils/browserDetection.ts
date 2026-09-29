/**
 * Utility functions to detect in-app browsers (Facebook Messenger, Facebook App, Instagram, etc.)
 * and facilitate opening pages in the device's default system browser (Chrome on Android, Safari on iOS).
 */

export function isInAppBrowser(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

  // Allow URL override for manual testing/debugging: ?iab=true or ?sim_iab=1
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('iab') === 'true' || params.get('iab') === '1' || params.get('sim_iab') === '1') {
      return true;
    }
  } catch (e) {
    // Ignore URL parse errors
  }

  const ua = (navigator.userAgent || navigator.vendor || (window as any).opera || '').toLowerCase();

  // 1. Facebook & Messenger specific User Agent tokens
  // Android Messenger: FBAN/Messenger, FBAV, Orca, FB_IAB, FB4A
  // iOS Messenger: FBAN/Messenger, FBIOS, MessengerForiOS, FBAV
  const fbTokens = ['fban/messenger', 'fbav', 'fb_iab', 'fb4a', 'fbios', 'messenger', 'orca'];
  if (fbTokens.some(token => ua.includes(token))) {
    return true;
  }

  // 2. Other common social media in-app browsers that restrict file downloads
  const otherInAppTokens = [
    'instagram',
    'line/',
    'twitter',
    'micromessenger', // WeChat
    'snapchat',
    'tiktok',
    'musical_ly',
    'bytelocale',
    'pinterest'
  ];
  if (otherInAppTokens.some(token => ua.includes(token))) {
    return true;
  }

  // 3. Android WebView detection (Chrome WebView inside apps has '; wv' or 'Version/4.0')
  const isAndroid = /android/i.test(ua);
  if (isAndroid && (ua.includes('; wv') || (ua.includes('version/') && ua.includes('chrome')))) {
    return true;
  }

  // 4. iOS WebView detection (WebKit without Safari, or standalone webview)
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  if (isIOS && !ua.includes('safari') && ua.includes('applewebkit')) {
    return true;
  }

  return false;
}

export function getDevicePlatform(): 'android' | 'ios' | 'other' {
  if (typeof navigator === 'undefined') return 'other';
  const ua = (navigator.userAgent || navigator.vendor || (window as any).opera || '').toLowerCase();
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  return 'other';
}

export function getInAppBrowserName(): string {
  if (typeof navigator === 'undefined') return 'In-App Browser';
  const ua = (navigator.userAgent || navigator.vendor || (window as any).opera || '').toLowerCase();
  
  if (ua.includes('messenger') || ua.includes('orca') || ua.includes('fban/messenger')) {
    return 'Facebook Messenger';
  }
  if (ua.includes('fb') || ua.includes('facebook')) {
    return 'Facebook App';
  }
  if (ua.includes('instagram')) {
    return 'Instagram';
  }
  if (ua.includes('line/')) {
    return 'LINE';
  }
  if (ua.includes('twitter')) {
    return 'X (Twitter)';
  }
  if (ua.includes('tiktok') || ua.includes('musical_ly')) {
    return 'TikTok';
  }
  return 'In-App Browser';
}

/**
 * Attempts to launch the system's default browser with the specified URL.
 * - On Android: Uses the Android Intent URI scheme to direct the OS to open Chrome/default browser.
 * - On iOS: In-app browsers cannot be forced via intent, so it uses window.open and returns guidance.
 */
export function openInExternalBrowser(targetUrl: string): { success: boolean; method: 'intent' | 'window' | 'manual' } {
  const platform = getDevicePlatform();

  if (platform === 'android') {
    try {
      const parsed = new URL(targetUrl, window.location.href);
      const urlWithoutScheme = `${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
      const scheme = parsed.protocol.replace(':', '') || 'https';
      
      // Standard Android Intent syntax to trigger ACTION_VIEW in default browser
      const intentUrl = `intent://${urlWithoutScheme}#Intent;scheme=${scheme};action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end;`;
      
      window.location.href = intentUrl;
      return { success: true, method: 'intent' };
    } catch (e) {
      console.warn('Android Intent trigger failed, falling back to window.open:', e);
      try {
        window.open(targetUrl, '_system');
        return { success: true, method: 'window' };
      } catch (err) {
        return { success: false, method: 'manual' };
      }
    }
  }

  // iOS or other platforms
  try {
    const opened = window.open(targetUrl, '_system') || window.open(targetUrl, '_blank');
    if (opened) {
      return { success: true, method: 'window' };
    }
  } catch (e) {
    // Ignore error
  }

  return { success: false, method: 'manual' };
}
