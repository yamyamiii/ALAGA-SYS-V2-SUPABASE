export function SignatureBlock({ signature }) {
  if (!signature) return null;
  return (
    <section
      className="document-signature page-break-avoid"
      aria-label="Signature"
    >
      <div className="w-full max-w-xs border-t border-slate-700 pt-2">
        <p className="font-semibold">{signature.name || " "}</p>
        <p className="text-xs text-slate-600">{signature.label}</p>
        <p className="mt-1 text-xs text-slate-500">{signature.detail}</p>
      </div>
    </section>
  );
}
