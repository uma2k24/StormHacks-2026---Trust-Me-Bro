export function AppBar() {
  return (
    <header className="appbar">
      <div className="appbar-inner">
        <div className="brand">
          <svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="17.5" fill="#41CBBC" stroke="#0F2E33" strokeWidth="3" />
            <g fill="#0F2E33">
              <rect x="9.5" y="16" width="3.6" height="8" rx="1.8" />
              <rect x="15.5" y="10.5" width="3.6" height="19" rx="1.8" />
              <rect x="21.5" y="14" width="3.6" height="12" rx="1.8" />
              <rect x="27.5" y="17.5" width="3.6" height="5" rx="1.8" />
            </g>
          </svg>
          <span className="brand-name display">Morning Radio</span>
        </div>
      </div>
    </header>
  );
}
