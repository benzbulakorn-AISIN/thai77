import { Star } from 'lucide-react';

export function StarRating({ value, onChange, size = 30 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <div role="radiogroup" aria-label="คะแนน" className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} ดาว`} disabled={!onChange}
          onClick={() => onChange?.(value === n ? 0 : n)}
          className="flex h-11 w-11 items-center justify-center rounded-full disabled:cursor-default">
          <Star size={size} className={n <= value ? 'fill-amber-400 text-amber-400' : 'text-muted'} />
        </button>
      ))}
    </div>
  );
}

export function Stars({ value, size = 14 }: { value: number | null; size?: number }) {
  if (!value) return null;
  return (
    <span className="inline-flex" aria-label={`${value} ดาว`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} className={n <= value ? 'fill-amber-400 text-amber-400' : 'text-line'} />
      ))}
    </span>
  );
}
