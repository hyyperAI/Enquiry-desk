const paths = {
  home: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" /><path d="M3 7l9 6 9-6" /></>,
  chat: <><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9h8M8 12h5" /></>,
  hotel: <><path d="M4 21V4h10v17" /><path d="M14 10h6v11" /><path d="M2 21h20" /><path d="M8 8h2M8 12h2M8 16h2" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  sliders: <><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M16.5 16.5L21 21" /></>,
  lock:<><rect x="5" y="11" width="14" height="10" /><path d="M8 11V7a4 4 0 018 0v4" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>,
  inbox: <><path d="M3 13l3-8h12l3 8v6H3z" /><path d="M3 13h5l1 3h6l1-3h5" /></>,
  doc: <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5" /><path d="M9 13h7M9 17h5" /></>,
  template: <><rect x="3" y="4" width="18" height="16" /><path d="M3 9h18M9 9v11" /></>,
  logout: <><path d="M14 4h6v16h-6" /><path d="M10 8l-4 4 4 4" /><path d="M6 12h10" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  phone: <><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2" /></>,
  close: <><path d="M6 6l12 12M18 6L6 18" /></>,
};

export function Icon({ name, size = 18, className = '' }) {
  if (name === 'spark') {
    return (
      <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {paths[name]}
    </svg>
  );
}
