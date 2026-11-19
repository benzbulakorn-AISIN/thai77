import { highlightParts } from './searchModel';

/** Text with the searched words marked (plain text only — React escapes everything). */
export function Highlight({ text, tokens }: { text: string; tokens: string[] }) {
  return (
    <>
      {highlightParts(text, tokens).map((p, i) =>
        p.hit
          ? <mark key={i} className="rounded bg-amber-200 px-0.5 font-semibold text-slate-900 dark:bg-amber-400/40 dark:text-inherit">{p.text}</mark>
          : <span key={i}>{p.text}</span>)}
    </>
  );
}
