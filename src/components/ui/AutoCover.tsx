import type { CSSProperties } from 'react';
import { CategoryIcon } from '../../features/places/categoryIcons';
import { coverPalette } from '../../features/covers/coverGradient';

const RATIO = { '16/9': '16 / 9', '4/3': '4 / 3', '1/1': '1 / 1', '3/1': '3 / 1' } as const;

type Props = {
  /** stable id (place id, trip id ...) -> same cover every time */
  seed: string;
  /** base colour: category colour or region colour */
  color?: string | null;
  /** Lucide icon name (see CategoryIcon) */
  icon?: string | null;
  title?: string;
  subtitle?: string;
  ratio?: keyof typeof RATIO;
  rounded?: boolean;
  /** show the small "ภาพประกอบ" tag (use when it stands in for a real photo) */
  badge?: boolean;
  className?: string;
};

/** Generated cover: gradient + soft shapes + big category icon. No image files, no copyright issues. */
export function AutoCover({ seed, color, icon, title, subtitle, ratio = '16/9', rounded = true, badge = false, className = '' }: Props) {
  const p = coverPalette(seed, color);
  const style: CSSProperties = {
    aspectRatio: RATIO[ratio],
    backgroundImage: `linear-gradient(${p.angle}deg, ${p.from}, ${p.to})`,
  };
  return (
    <div role="img" aria-label={title ? `ภาพปก ${title}` : 'ภาพปกประกอบ'} style={style}
      className={`relative isolate w-full overflow-hidden ${rounded ? 'rounded-2xl' : ''} ${className}`}>
      <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        {p.blobs.map((b, i) => <circle key={i} cx={b.cx} cy={b.cy} r={b.r} fill="#ffffff" fillOpacity={b.opacity} />)}
      </svg>
      <div aria-hidden="true" className="absolute right-[7%] top-1/2 aspect-square w-[32%] max-w-40 -translate-y-1/2 text-white/30">
        <CategoryIcon name={icon} size={64} className="h-full w-full" />
      </div>
      {(title || subtitle) && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3 pt-8 text-white">
          {title && <p className="truncate font-semibold leading-tight">{title}</p>}
          {subtitle && <p className="truncate text-xs text-white/90">{subtitle}</p>}
        </div>
      )}
      {badge && <span className="absolute left-2 top-2 rounded-full bg-black/45 px-2 py-0.5 text-[11px] text-white">ภาพประกอบ</span>}
    </div>
  );
}
