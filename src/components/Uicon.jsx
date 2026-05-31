const ICONS = {
  'fi-rr-user': 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  'fi-rr-bell': 'M18 16.5c0 1.54-1.23 2.79-2.75 2.95-.4.74-1.17 1.25-2.05 1.25s-1.65-.51-2.05-1.25c-1.52-.16-2.75-1.41-2.75-2.95V11c0-3.07 1.64-5.64 4.5-6.32V4a1.5 1.5 0 1 1 3 0v.68c2.86.68 4.5 3.25 4.5 6.32v5.5z',
  'fi-rr-pencil': 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm19.71-11.04a1 1 0 0 0 0-1.41l-2.5-2.5a1 1 0 0 0-1.41 0l-2.83 2.83 3.75 3.75 2.99-2.67z',
  'fi-rr-bowl-food': 'M4 10c0 3.31 2.69 6 6 6h4c3.31 0 6-2.69 6-6H4zm0 0v1c0 2.76 2.24 5 5 5h6c2.76 0 5-2.24 5-5v-1H4zm14 0H6V8h12v2z',
  'fi-rr-clock': 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 10.5h3a1 1 0 1 1 0 2h-4a1 1 0 0 1-1-1V7.5a1 1 0 1 1 2 0V12.5z',
  'fi-rr-wallet': 'M20 7h-4V6a2 2 0 0 0-2-2H6c-1.11 0-2 .89-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1h4a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1zm-4 9H6V6h8v2h2v8z',
  'fi-rr-sign-out': 'M16 13v-2h-4V8l-5 4 5 4v-3h4zM4 4h8v2H6v12h6v2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  'fi-rr-chart-pie': 'M11 2v9h9A9 9 0 0 0 11 2zm-1 0A9 9 0 0 0 2 11h9V2zm1 11h8.93A8.97 8.97 0 0 1 12 21v-8z',
  'fi-rr-restaurant': 'M6 2l1 7H5l1 7h2l1-7H8l1-7H6zm9 0l-2 7h2l-1 7h2l-1-7h2l-1-7h-2zm-3 0h-2v7h2V2z',
  'fi-rr-cocktail': 'M8 2h8v2h-1v5.5a1.5 1.5 0 0 1-3 0V4H11v5.5a1.5 1.5 0 0 1-3 0V4H8V2zm-2 9h12l-2.5 8H8.5L6 11z',
  'fi-rr-ice-cream': 'M12 2a5 5 0 0 0-5 5c0 1.42.68 2.69 1.75 3.5A5.002 5.002 0 0 0 6 14h12a5.002 5.002 0 0 0-2.75-3.5A4.98 4.98 0 0 0 17 7a5 5 0 0 0-5-5zm-4 12l4 6 4-6H8z',
  'fi-rr-truck': 'M3 10h13v5H3v-5zm0-2a2 2 0 0 1 2-2h9v4H3V8zm14 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  'fi-rr-lightning': 'M13 2L4 14h6v6l9-12h-6z',
  'fi-rr-phone-call': 'M6 2a1 1 0 0 0-1 1c0 7 5.8 12.8 12.8 12.8a1 1 0 0 0 1-1v-3a1 1 0 0 0-.7-.96l-3-1A1 1 0 0 0 14 9l1-3a1 1 0 0 0-.96-1H15a1 1 0 0 0-1 1l-1 3a1 1 0 0 0 .7.96l3 1a1 1 0 0 0 .96-.26V8h-1.8L12 3H6z',
  'fi-rr-mailbox': 'M4 7h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7zm2 2v7h12V9H6z',
  'fi-rr-cross': 'M6 6l12 12m0-12L6 18',
  'fi-rr-clipboard': 'M16 4h-1.5a1.5 1.5 0 0 0-3 0H10a2 2 0 0 0-2 2v14h10V6a2 2 0 0 0-2-2z',
  'fi-rr-users': 'M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-8 8a5 5 0 0 0-5 5h10a5 5 0 0 0-5-5z',
  'fi-rr-user-group': 'M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-8 8a5 5 0 0 0-5 5h10a5 5 0 0 0-5-5z',
  'fi-rr-tablet': 'M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm6 17a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  'fi-rr-dashboard': 'M3 3h18v18H3V3zm4 4h4v10H7V7zm6 6h4v4h-4v-4zm0-6h4v4h-4V7z',
  'fi-rr-chart-line': 'M3 17l4-4 4 4 6-6 4 4V3H3v14z',
  'fi-rr-list': 'M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z',
  'fi-rr-warning': 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
  'fi-rr-pause': 'M6 4h4v16H6V4zm8 0h4v16h-4V4z',
  'fi-rr-play': 'M8 5v14l11-7L8 5z',
  'fi-rr-check': 'M20 6L9 17l-5-5 1.5-1.5L9 14l9.5-9.5L20 6z',
  'fi-rr-briefcase': 'M4 7h16v12H4V7zm2-3h12v2H6V4zm3 4h2v2H9V8zm4 0h2v2h-2V8z',
  'fi-rr-credit-card': 'M2 6h20v12H2V6zm2 3h16v2H4V9zm0 4h6v2H4v-2z',
  'fi-rr-menu-burger': 'M3 7h18v2H3V7zm0 5h18v2H3v-2zm0 5h18v2H3v-2z',
}

const DEFAULT_ICON = 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z';

const Uicon = ({ icon, className = '', title }) => {
  if (!icon) return null;
  const trimmed = icon.toString().trim();
  const path = ICONS[trimmed];

  if (path) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={`uicon ${className}`}
        role="img"
        aria-label={title || trimmed}
      >
        <path d={path} />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={`uicon ${className}`}
      role="img"
      aria-label={title || `unknown icon: ${trimmed}`}
    >
      <path d={DEFAULT_ICON} />
    </svg>
  );
};

export default Uicon;
