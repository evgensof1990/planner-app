import { createContext, useContext, useEffect, useRef, useState } from 'react';
import Icon from './icons.jsx';
import { PRIORITY_COLORS, useStore } from './store.jsx';
import { fmtLong, todayKey, relLabel } from './date.js';

export const UiCtx = createContext(null);
export const useUi = () => useContext(UiCtx);

export function Sheet({ onClose, children, full, className = '' }) {
  return (
    <div className={'overlay' + (full ? ' overlay-full' : '')} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={'sheet ' + (full ? 'sheet-full ' : '') + className}>
        {!full && <div className="sheet-handle" />}
        {children}
      </div>
    </div>
  );
}

export function SheetHeader({ title, onClose, onOk }) {
  return (
    <div className="sheet-header">
      <button className="icon-btn" onClick={onClose}>
        <Icon name="close" />
      </button>
      <div className="sheet-title">{title}</div>
      {onOk ? (
        <button className="icon-btn" onClick={onOk}>
          <Icon name="check" />
        </button>
      ) : (
        <span style={{ width: 40 }} />
      )}
    </div>
  );
}

export function TopBar({ title, sub, left, children, onTitle }) {
  return (
    <div className="topbar">
      {left}
      <div className="topbar-title" onClick={onTitle}>
        <div className="tt">{title}</div>
        {sub && <div className="ts">{sub}</div>}
      </div>
      <div className="topbar-actions">{children}</div>
    </div>
  );
}

export function IconBtn({ name, onClick, active, size, title, dot, className = "" }) {
  return (
    <button className={'icon-btn ' + className + (active ? ' active' : '')} onClick={onClick} title={title}>
      <Icon name={name} size={size} />
      {dot && <span className="dot-badge" />}
    </button>
  );
}

const CHEERS = ['🎉', '🥳', '👏', '🔥', '💪', '⭐', '😎', '🚀', '✨', '👍', '🏆', '🙌', '🤘', '💥', '🎯', '🦄', '🌈', '🍀', '😺', '🤩'];

export function Checkbox({ checked, priority = 0, onChange }) {
  const color = PRIORITY_COLORS[priority];
  const [cheer, setCheer] = useState(null);
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      className={'cb' + (checked ? ' on' : '') + (cheer ? ' cheer' : '')}
      style={color && !checked ? { borderColor: color, background: color + '22' } : undefined}
      onClick={(e) => {
        e.stopPropagation();
        clearTimeout(timer.current);
        if (!checked) {
          setCheer(CHEERS[Math.floor(Math.random() * CHEERS.length)]);
          timer.current = setTimeout(() => setCheer(null), 1100);
        } else setCheer(null);
        onChange?.();
      }}
    >
      {cheer ? <span className="cheer-emoji">{cheer}</span> : checked && <Icon name="check" size={14} stroke={2.6} />}
    </button>
  );
}

function useLongPress(onLong, onClick) {
  const timer = useRef();
  const fired = useRef(false);
  const start = useRef();
  return {
    onPointerDown: (e) => {
      fired.current = false;
      start.current = [e.clientX, e.clientY];
      const target = e.currentTarget;
      timer.current = setTimeout(() => {
        fired.current = true;
        navigator.vibrate?.(15);
        onLong(target);
      }, 480);
    },
    onPointerMove: (e) => {
      if (start.current && Math.hypot(e.clientX - start.current[0], e.clientY - start.current[1]) > 8) clearTimeout(timer.current);
    },
    onPointerUp: () => clearTimeout(timer.current),
    onPointerLeave: () => clearTimeout(timer.current),
    onClick: () => {
      if (!fired.current) onClick();
    },
    onContextMenu: (e) => {
      e.preventDefault();
      clearTimeout(timer.current);
      if (!fired.current) onLong(e.currentTarget);
      fired.current = true;
    },
  };
}

export function TaskItem({ task, showProject = true, showDate = true, indent = 0, subCount, expanded, onExpand }) {
  const { data, toggleTask } = useStore();
  const ui = useUi();
  const project = data.projects.find((p) => p.id === task.projectId);
  const parent = task.parentId && data.tasks.find((t) => t.id === task.parentId);
  const lp = useLongPress(
    (el) => ui.taskMenu(task, el),
    () => ui.openTask(task.id)
  );
  const overdue = task.date && !task.done && task.date < todayKey();
  const meta = [];
  if (showDate && task.date) meta.push(<span key="d" className={overdue ? 'red' : ''}>{fmtLong(task.date)}{task.time ? ' ' + task.time : ''}</span>);
  if (showProject) meta.push(<span key="p">{project ? project.name : 'Без проекта'}</span>);
  if (parent && indent === 0) meta.push(<span key="pa">{parent.title}</span>);
  const tags = task.tags.map((id) => data.tags.find((t) => t.id === id)).filter(Boolean);
  return (
    <div className={'task' + (task.done ? ' done' : '')} style={{ paddingLeft: 16 + indent * 28 }} {...lp}>
      <Checkbox checked={task.done} priority={task.priority} onChange={() => toggleTask(task.id)} />
      <div className="task-body">
        <div className="task-title">
          {task.title || <span className="muted">Без названия</span>}
        </div>
        {(meta.length > 0 || tags.length > 0) && (
          <div className="task-meta">
            {meta.reduce((acc, m, i) => (i ? [...acc, <span key={'s' + i} className="sep">/</span>, m] : [m]), [])}
            {tags.map((t) => (
              <span key={t.id} className="tag-chip">#{t.name}</span>
            ))}
          </div>
        )}
      </div>
      {subCount > 0 && (
        <button
          className="icon-btn sm"
          onClick={(e) => {
            e.stopPropagation();
            onExpand();
          }}
        >
          <Icon name={expanded ? 'chevU' : 'chevD'} size={18} />
        </button>
      )}
    </div>
  );
}

// Renders tasks with their subtasks nested
export function TaskTree({ tasks, all, ...rest }) {
  const [collapsed, setCollapsed] = useState({});
  const ids = new Set(tasks.map((t) => t.id));
  const roots = tasks.filter((t) => !t.parentId || !ids.has(t.parentId));
  const out = [];
  const walk = (t, depth) => {
    const kids = (all || tasks).filter((k) => k.parentId === t.id && !k.deleted && !k.archived);
    const open = !collapsed[t.id];
    out.push(<TaskItem key={t.id} task={t} indent={depth} subCount={kids.length} expanded={open} onExpand={() => setCollapsed((c) => ({ ...c, [t.id]: open }))} {...rest} />);
    if (open) kids.sort((a, b) => a.done - b.done || a.order - b.order).forEach((k) => walk(k, depth + 1));
  };
  roots.forEach((t) => walk(t, 0));
  return out;
}

export function Group({ title, right, children, defaultOpen = true, count }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="group">
      <div className="group-head" onClick={() => setOpen(!open)}>
        <div className="group-title">{title}</div>
        <div className="group-right">
          {right}
          {count !== undefined && <span className="count">{count}</span>}
          <Icon name={open ? 'chevD' : 'chevR'} size={16} />
        </div>
      </div>
      {open && children}
    </div>
  );
}

export function Empty({ text, icon = 'check' }) {
  return (
    <div className="empty">
      <div className="empty-ring">
        <Icon name={icon} size={46} stroke={1.2} />
      </div>
      <div>{text}</div>
    </div>
  );
}

export function Menu({ anchor, items, onClose }) {
  const ref = useRef();
  const [pos, setPos] = useState({ top: -999, left: -999 });
  useEffect(() => {
    const r = anchor?.getBoundingClientRect?.() || { top: 60, bottom: 60, left: window.innerWidth - 20, right: window.innerWidth - 20 };
    const m = ref.current.getBoundingClientRect();
    let top = r.bottom + 4;
    if (top + m.height > window.innerHeight - 8) top = Math.max(8, r.top - m.height - 4);
    let left = r.right - m.width;
    if (left < 8) left = Math.min(r.left, window.innerWidth - m.width - 8);
    setPos({ top, left: Math.max(8, left) });
  }, [anchor]);
  return (
    <div className="menu-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="menu" ref={ref} style={pos}>
        {items.filter(Boolean).map((it, i) =>
          it.divider ? (
            <div key={i} className="menu-div" />
          ) : (
            <button
              key={i}
              className={'menu-item' + (it.danger ? ' danger' : '') + (it.active ? ' active' : '')}
              onClick={() => {
                onClose();
                it.onClick?.();
              }}
            >
              {it.icon && <Icon name={it.icon} size={19} style={it.color ? { color: it.color } : undefined} />}
              <span>{it.label}</span>
              {it.active && <Icon name="check" size={16} className="menu-check" />}
            </button>
          )
        )}
      </div>
    </div>
  );
}

export function DateChip({ task, onClick }) {
  if (!task.date) return null;
  const overdue = !task.done && task.date < todayKey();
  return (
    <button className={'chip date-chip' + (overdue ? ' red' : '')} onClick={onClick}>
      {relLabel(task.date)}
      {task.time ? ', ' + task.time : ''}
    </button>
  );
}
