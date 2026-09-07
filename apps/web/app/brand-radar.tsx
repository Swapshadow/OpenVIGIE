export default function BrandRadar() {
  return <svg className="brand-radar" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="16" cy="16" r="7.5" stroke="currentColor" opacity=".45" />
    <circle cx="16" cy="16" r="3" stroke="currentColor" opacity=".6" />
    <path d="M16 16 24 8" stroke="currentColor" strokeWidth="1.5" />
    <circle className="radar-wave" cx="16" cy="16" r="12" stroke="currentColor" />
    <circle className="radar-wave radar-wave-delayed" cx="16" cy="16" r="12" stroke="currentColor" />
    <circle className="radar-contact" cx="24" cy="8" r="2.5" fill="#ff5b6f" />
    <circle cx="16" cy="16" r="1.5" fill="currentColor" />
  </svg>;
}
