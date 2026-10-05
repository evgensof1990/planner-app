const P = {
  menu: 'M4 7h16M4 12h16M4 17h16',
  inbox: 'M4 5h16v14H4z M4 14h4.5l1.5 2h4l1.5-2H20',
  star: 'M12 3.8l2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z',
  calendar: 'M4 6h16v14H4z M4 10.5h16 M8.5 3.5v4 M15.5 3.5v4',
  plus: 'M12 5v14M5 12h14',
  search: 'M10.8 17.6a6.8 6.8 0 100-13.6 6.8 6.8 0 000 13.6z M20 20l-4.3-4.3',
  timer: 'M12 20.5a7.5 7.5 0 100-15 7.5 7.5 0 000 15z M12 9v4l2.5 2 M9.5 2.5h5',
  bell: 'M6 16.5V11a6 6 0 0112 0v5.5l1.5 1.5h-15z M10 20.5h4',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6z M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8',
  chevL: 'M15 5l-7 7 7 7',
  chevR: 'M9 5l7 7-7 7',
  chevD: 'M6 9l6 6 6-6',
  chevU: 'M6 15l6-6 6 6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6 6l12 12M18 6L6 18',
  tag: 'M3.5 12.3V4.5h7.8l9.2 9.2-7.8 7.8z M8 9.6a1.4 1.4 0 100-2.8 1.4 1.4 0 000 2.8z',
  noProject: 'M3.5 7h4l9 10h4 M3.5 17h4l2.7-3 M13.8 10l2.7-3h4 M18.5 5l2 2-2 2 M18.5 15l2 2-2 2',
  send: 'M4 12l16-8-6 16-2.5-6.5z',
  flag: 'M6 21V4 M6 4.5h11l-2 4 2 4H6',
  trash: 'M5 7h14 M10 7V4.5h4V7 M7 7l1 13h8l1-13',
  filter: 'M4 6h16 M7 12h10 M10 18h4',
  grid: 'M4.5 4.5h6v6h-6z M13.5 4.5h6v6h-6z M4.5 13.5h6v6h-6z M13.5 13.5h6v6h-6z',
  habit: 'M12 20a8 8 0 100-16 8 8 0 000 16z M12 8a4 4 0 104 4',
  pause: 'M9 7v10 M15 7v10',
  reset: 'M5.2 12a6.8 6.8 0 106.8-6.8H8.5 M10.5 2.8L8 5.2l2.5 2.5',
  chart: 'M5 20v-7 M10 20V6 M15 20v-9 M20 20V9',
  list: 'M9 6h11M9 12h11M9 18h11 M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  kanban: 'M4 4h4.5v16H4z M10 4h4.5v10H10z M16 4h4v13h-4z',
  sun: 'M12 16a4 4 0 100-8 4 4 0 000 8z M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  moon: 'M19 14.5A7.5 7.5 0 019.5 5a7.5 7.5 0 109.5 9.5z',
  someday: 'M4 18a8 8 0 0116 0 M8 18a4 4 0 018 0',
  clock: 'M12 20a8 8 0 100-16 8 8 0 000 16z M12 8v4l3 2',
  edit: 'M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4',
  archive: 'M4 5h16v4H4z M5 9v10h14V9 M10 13h4',
  layers: 'M12 4l8 4-8 4-8-4z M4 12l8 4 8-4 M4 16l8 4 8-4',
  expand: 'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5',
  sort: 'M7 4v16 M4 7l3-3 3 3 M17 20V4 M14 17l3 3 3-3',
  open: 'M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6',
  sub: 'M6 4v9h12 M15 10l3 3-3 3',
  download: 'M12 4v11 M7 10.5l5 5 5-5 M5 20h14',
  copy: 'M8.5 8.5h11v11h-11z M4.5 15.5v-11h11',
  note: 'M6 3.5h8.5l4 4v13H6z M14 3.5v4.5h4.5',
  restore: 'M5.2 12a6.8 6.8 0 106.8-6.8H8.5 M10.5 2.8L8 5.2l2.5 2.5 M12 9v3.5l2.5 1.5',
  folder: 'M3.5 6.5h6l2 2h9v10h-17z',
  cloud: 'M7 18.5h10.5a4 4 0 00.6-7.95A6 6 0 006.6 9.6 4.5 4.5 0 007 18.5z',
  sync: 'M4.5 12a7.5 7.5 0 0113-5.1L19.5 9 M19.5 4.5V9H15 M19.5 12a7.5 7.5 0 01-13 5.1L4.5 15 M4.5 19.5V15H9',
  stopwatch: 'M12 21a7.5 7.5 0 100-15 7.5 7.5 0 000 15z M12 10v3.5 M10 2.5h4 M18.5 6l1.5-1.5',
};

export default function Icon({ name, size = 22, stroke = 1.7, style, className }) {
  if (name === 'more' || name === 'dots') {
    const v = name === 'more';
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" style={style} className={className} fill="currentColor">
        {[6, 12, 18].map((c) => (v ? <circle key={c} cx="12" cy={c} r="1.6" /> : <circle key={c} cx={c} cy="12" r="1.6" />))}
      </svg>
    );
  }
  if (name === 'play') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" style={style} className={className} fill="currentColor">
        <path d="M9 6.5v11l9-5.5z" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={style} className={className} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      <path d={P[name] || ''} />
    </svg>
  );
}
