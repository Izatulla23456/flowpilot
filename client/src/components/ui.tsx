export function Empty({ text }: { text: string }) {
  return <div className="grid h-full place-items-center p-6 text-center text-xs leading-relaxed text-slate-600">{text}</div>;
}
