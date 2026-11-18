import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { THEMES, type ColorMode } from './themes';
import { useTheme } from './ThemeProvider';

const MODES: { id: ColorMode; label: string; Icon: typeof Sun }[] = [
  { id: 'light', label: 'สว่าง', Icon: Sun },
  { id: 'dark', label: 'มืด', Icon: Moon },
  { id: 'system', label: 'ตามเครื่อง', Icon: Monitor },
];

export function ThemePicker() {
  const { theme, mode, setTheme, setMode } = useTheme();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {THEMES.map((t) => (
          <button key={t.id} type="button" onClick={() => setTheme(t.id)}
            className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 text-left text-sm
              ${theme === t.id ? 'border-primary ring-2 ring-primary' : 'border-line'}`}>
            <span className="h-6 w-6 shrink-0 rounded-full" style={{ background: t.swatch }} />
            <span className="flex-1">{t.label}</span>
            {theme === t.id && <Check size={18} className="text-primary" />}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {MODES.map(({ id, label, Icon }) => (
          <button key={id} type="button" onClick={() => setMode(id)}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border text-sm
              ${mode === id ? 'border-primary bg-primary text-on-primary' : 'border-line'}`}>
            <Icon size={18} /> {label}
          </button>
        ))}
      </div>
    </div>
  );
}
