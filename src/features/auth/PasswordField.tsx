import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Check, Circle, Eye } from 'lucide-react';
import { checkPassword, MIN_PASSWORD } from './passwordRules';

type Props = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: 'current-password' | 'new-password';
  /** show the live checklist (used when choosing a NEW password) */
  showRules?: boolean;
  disabled?: boolean;
};

/** Password input. Press and HOLD the eye button to peek at the password; letting go hides it again. */
export function PasswordField({ label, value, onChange, autoComplete, showRules = false, disabled }: Props) {
  const id = useId();
  const [show, setShow] = useState(false);
  const check = checkPassword(value);
  const hide = () => setShow(false);

  const rules: { ok: boolean; text: string; required: boolean }[] = [
    { ok: check.length, text: `อย่างน้อย ${MIN_PASSWORD} ตัวอักษร`, required: true },
    { ok: check.letter, text: 'มีตัวอักษร', required: false },
    { ok: check.digit, text: 'มีตัวเลข', required: false },
  ];

  return (
    <div>
      <label htmlFor={id} className="block text-sm">{label}</label>
      <div className="relative mt-1">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="input pr-14"
        />
        <button
          type="button"
          aria-label="แสดงรหัสผ่านขณะกดค้าง"
          aria-pressed={show}
          disabled={disabled}
          onPointerDown={(e: PointerEvent<HTMLButtonElement>) => { e.preventDefault(); setShow(true); }}
          onPointerUp={hide}
          onPointerLeave={hide}
          onPointerCancel={hide}
          onBlur={hide}
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setShow(true); } }}
          onKeyUp={hide}
          className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 touch-none select-none items-center justify-center rounded-full text-muted hover:bg-surface-2"
        >
          <Eye size={20} className={show ? 'text-primary' : ''} />
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">กดปุ่มรูปตาค้างไว้เพื่อดูรหัสผ่าน</p>
      {showRules && (
        <ul className="mt-2 space-y-1 text-xs" aria-live="polite">
          {rules.map((r) => (
            <li key={r.text} className={`flex items-center gap-2 ${r.ok ? 'text-green-700 dark:text-green-400' : 'text-muted'}`}>
              {r.ok ? <Check size={14} /> : <Circle size={14} />}
              <span>{r.text}{r.required ? '' : ' (แนะนำ)'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
