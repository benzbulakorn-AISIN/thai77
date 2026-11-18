import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, XCircle } from 'lucide-react';

type Kind = 'success' | 'error' | 'info';
type Item = { id: number; msg: string; kind: Kind };
const ToastCtx = createContext<(msg: string, kind?: Kind) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const push = useCallback((msg: string, kind: Kind = 'info') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s.slice(-2), { id, msg, kind }]);
    setTimeout(() => setItems((s) => s.filter((i) => i.id !== id)), 3500);
  }, []);
  const Icon = { success: CheckCircle2, error: XCircle, info: Info };
  const color = { success: 'bg-green-600', error: 'bg-red-600', info: 'bg-slate-700' };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-3 z-[1000] flex flex-col items-center gap-2 px-3">
        {items.map((i) => {
          const I = Icon[i.kind];
          return (
            <div key={i.id} className={`flex max-w-md items-center gap-2 rounded-xl px-4 py-3 text-sm text-white shadow-lg ${color[i.kind]}`}>
              <I size={18} /> {i.msg}
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);
