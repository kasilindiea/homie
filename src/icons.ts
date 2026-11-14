const paths: Record<string, string> = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/><path d="M17 3v4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  cube: '<path d="m12 3 9 5v9l-9 5-9-5V8Z"/><path d="m3 8 9 5 9-5M12 13v9m-4.5-17.5 9 5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
  import: '<path d="M12 3v12m-4-4 4 4 4-4M4 14v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="m3 3 18 18M10 5.2A12 12 0 0 1 12 5c6.5 0 10 7 10 7a19 19 0 0 1-3 3.8M6 6.4A20 20 0 0 0 2 12s3.5 7 10 7a12 12 0 0 0 5-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  sofa: '<path d="M5 12V7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v5M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v6H3ZM5 19v2m14-2v2M12 5v10"/>',
  chair: '<path d="M7 12V4h10v8M5 12h14v5H5ZM7 17v4m10-4v4M7 8h10"/>',
  table: '<path d="M3 9h18v5H3Zm3 5-1 7m13-7 1 7M7 9V5m10 4V5"/>',
  bed: '<path d="M3 19V6m18 13V9M3 15h18M6 15v-5h12v5M5 19h14M6 7h5v3M13 7h5v3"/>',
  cabinet: '<rect x="5" y="3" width="14" height="17" rx="1"/><path d="M12 3v17M9 10v3m6-3v3M7 20v2m10-2v2"/>',
  light: '<path d="m8 3-4 10h16L16 3ZM12 13v8M7 21h10m-3-8v4"/>',
  other: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/>',
  location: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  logout: '<path d="M9 4H4v16h5M9 12h12m-4-4 4 4-4 4"/>',
  edit: '<path d="m16 3 5 5-12 12-6 1 1-6ZM14 5l5 5"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
  leaf: '<path d="M20 4C11 2 3 6 5 14c2 8 15 6 15-10Z"/><path d="M4 21 16 9"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
};

export function icon(name: string, className = ''): string {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.other}</svg>`;
}

export function roomIllustration(className = ''): string {
  return `<svg class="room-illustration ${className}" viewBox="0 0 340 240" fill="none" aria-hidden="true">
    <circle cx="184" cy="108" r="91" fill="#e8ecd9"/>
    <path d="M48 213h245" stroke="#d9ddd0" stroke-width="2" stroke-linecap="round"/>
    <path d="M234 50h45v66h-45z" fill="#fafaf3" stroke="#cbd2ba" stroke-width="2"/>
    <path d="M241 57h31v52h-31z" fill="#dbe1c8"/>
    <path d="m243 96 11-21 17 34h-28z" fill="#b0bd94"/>
    <circle cx="264" cy="68" r="5" fill="#f4df9d"/>
    <path d="M74 194v17m139-17v17" stroke="#4c5b45" stroke-width="6" stroke-linecap="round"/>
    <rect x="69" y="115" width="151" height="71" rx="20" fill="#829676"/>
    <rect x="80" y="121" width="62" height="49" rx="12" fill="#9aac8d"/>
    <rect x="147" y="121" width="62" height="49" rx="12" fill="#9aac8d"/>
    <rect x="63" y="161" width="163" height="37" rx="11" fill="#657f5d"/>
    <rect x="57" y="147" width="25" height="48" rx="10" fill="#78916e"/>
    <rect x="208" y="147" width="25" height="48" rx="10" fill="#78916e"/>
    <path d="M84 175h122" stroke="#526f4d" stroke-width="2" stroke-linecap="round"/>
    <rect x="156" y="133" width="32" height="29" rx="7" transform="rotate(12 156 133)" fill="#e9d7a8"/>
    <path d="m160 143 18 15m-15-20 14 12" stroke="#d8c496" stroke-width="2"/>
    <path d="M272 177v-60" stroke="#71805a" stroke-width="3" stroke-linecap="round"/>
    <path d="M272 153c-21 0-25-14-25-22 17-1 27 8 25 22Z" fill="#869c6d"/>
    <path d="M272 140c0-18 13-26 24-25 1 15-8 26-24 25Z" fill="#a4b187"/>
    <path d="M272 127c-15-2-22-14-20-24 15 1 22 12 20 24Z" fill="#6c8557"/>
    <path d="M256 174h32l-5 36h-22z" fill="#c8bba1"/>
    <path d="M255 174h34v7h-34z" fill="#dbceb4"/>
    <path d="M41 89h13m-6.5-6.5v13" stroke="#b2bc9a" stroke-width="2" stroke-linecap="round"/>
    <circle cx="92" cy="74" r="4" fill="#d7c58c"/>
    <path d="M205 34h8m-4-4v8" stroke="#c4cfa9" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
}
