// Can this device install the app, and how? Pure: the caller passes what the browser says.
export type InstallState = 'installed' | 'prompt' | 'ios' | 'in-app' | 'unsupported';

export type InstallEnv = {
  ua: string;
  /** opened from the home-screen icon (display-mode: standalone / navigator.standalone) */
  standalone: boolean;
  /** the browser gave us a beforeinstallprompt event (Chrome / Edge / Android) */
  hasPrompt: boolean;
  platform?: string;
  maxTouchPoints?: number;
};

/** LINE, Facebook, Instagram, WeChat, TikTok ... open links in their own viewer, which cannot install web apps */
export function isInAppBrowser(ua: string): boolean {
  return /\bLine\/|FBAN|FBAV|FB_IAB|Instagram|MicroMessenger|BytedanceWebview|musical_ly|Snapchat|; wv\)/i.test(ua);
}

/** iPhone / iPad / iPod, including iPadOS which pretends to be a Mac */
export function isIos(ua: string, platform?: string, maxTouchPoints = 0): boolean {
  return /iPhone|iPad|iPod/i.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

export function detectInstallState(env: InstallEnv): InstallState {
  if (env.standalone) return 'installed';
  if (isInAppBrowser(env.ua)) return 'in-app';
  if (env.hasPrompt) return 'prompt';
  if (isIos(env.ua, env.platform, env.maxTouchPoints ?? 0)) return 'ios';
  return 'unsupported';
}

export const IOS_STEPS = [
  'กดปุ่มแชร์ (สี่เหลี่ยมมีลูกศรชี้ขึ้น) ที่แถบด้านล่าง หรือด้านบนของ Safari',
  'เลื่อนลงแล้วเลือก “เพิ่มไปยังหน้าจอโฮม” (Add to Home Screen)',
  'ปล่อย “เปิดเป็นเว็บแอป” ไว้ แล้วกด “เพิ่ม”',
] as const;
