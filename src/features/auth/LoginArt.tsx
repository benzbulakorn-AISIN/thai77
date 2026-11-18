import { useState } from 'react';
import { ILLUSTRATION_EXTS, illustrationUrl } from '../art/illustrations';

// remember (for this visit) that no image file exists, so we do not retry 3 failing requests every time
let noImageFile = false;

/** Line illustration of a trip route (follows the theme colours). Used when there is no login image file. */
function RouteArt() {
  const pin = (x: number, y: number, fill: string) => (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 0 C-3 -8 -10 -13 -10 -21 A10 10 0 1 1 10 -21 C10 -13 3 -8 0 0Z" fill={fill} stroke="#ffffff" strokeWidth="2" />
      <circle cx="0" cy="-21" r="3.6" fill="#ffffff" />
    </g>
  );
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-2xl border border-line bg-surface-2">
      <svg viewBox="0 0 320 130" className="block h-auto w-full" role="presentation">
        <defs>
          <linearGradient id="login-art-sky" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--primary)" stopOpacity="0.18" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0.16" />
          </linearGradient>
        </defs>
        <rect width="320" height="130" fill="url(#login-art-sky)" />
        <g fill="none" stroke="var(--primary)" strokeOpacity="0.2" strokeWidth="1.2">
          <path d="M-10 100 C50 70 90 120 150 95 S260 70 330 100" />
          <path d="M-10 114 C60 87 100 128 160 110 S270 88 330 116" />
          <path d="M-10 86 C40 55 95 100 150 78 S255 52 330 84" />
        </g>
        <path d="M30 98 C70 40 110 120 150 70 S230 20 285 52" fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 9" />
        {pin(30, 98, 'var(--primary)')}
        {pin(150, 70, '#F59E0B')}
        {pin(212, 30, '#EF4444')}
        {pin(285, 52, '#10B981')}
        <g transform="translate(236 14) rotate(-12)">
          <path d="M0 0 L26 -10 L9 5 L6 14 L1 3Z" fill="var(--surface)" stroke="var(--primary)" strokeWidth="1.6" strokeLinejoin="round" />
        </g>
      </svg>
    </div>
  );
}

/** Login picture: public/img/login.(webp|jpg|png) if present (AI illustration, labelled), otherwise the line art. */
export function LoginArt() {
  const [attempt, setAttempt] = useState(noImageFile ? ILLUSTRATION_EXTS.length : 0);
  const url = illustrationUrl(import.meta.env.BASE_URL, 'login', attempt);
  if (!url) return <RouteArt />;
  return (
    <div className="relative aspect-[16/8] overflow-hidden rounded-2xl bg-surface-2">
      <img
        src={url}
        alt="ภาพประกอบการเดินทางท่องเที่ยวในประเทศไทย"
        decoding="async"
        onError={() => {
          if (attempt + 1 >= ILLUSTRATION_EXTS.length) noImageFile = true;
          setAttempt((a) => a + 1);
        }}
        className="h-full w-full object-cover"
      />
      <span className="absolute left-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[11px] text-white">ภาพประกอบ</span>
    </div>
  );
}
