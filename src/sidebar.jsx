import { useState } from 'react';
import Icon from './icons.jsx';
import { useUi } from './components.jsx';
import { useStore, alive } from './store.jsx';
import { todayKey } from './date.js';
import { isHidden } from './layout.js';

export function Sidebar({ route }) {
  const { data, deleteTag, updateProject, sync } = useStore();
  const ui = useUi();
  const [q, setQ] = useState('');
  const [projOpen, setProjOpen] = useState(true);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [archOpen, setArchOpen] = useState(false);
  const t = todayKey();
  const all = data.tasks.filter((x) => alive(x) && !x.done && !x.parentId);
  const inboxN = all.filter((x) => !x.projectId && !x.date).length;
  const todayN = all.filter((x) => x.date && x.date <= t).length;
  const s = q.toLowerCase();
  const projects = data.projects.filter((p) => !p.archived && p.name.toLowerCase().includes(s));
  const archived = data.projects.filter((p) => p.archived);
  const noProjN = all.filter((x) => !x.projectId).length;
  const hidden = data.settings.sideHidden || [];
  const show = (k) => !isHidden(hidden, k);
  const is = (v, id) => route.view === v && (id === undefined || route.id === id);
  const Item = ({ icon, emoji, label, view, id, count, onClick }) =>
    (!s || label.toLowerCase().includes(s)) && (
      <button className={'nav-item' + (is(view, id) ? ' on' : '')} onClick={onClick || (() => ui.go({ view, id }))}>
        {emoji ? <span className="emoji">{emoji}</span> : <Icon name={icon} size={21} />}
        <span className="nav-label">{label}</span>
        {count > 0 && <span className="count">{count}</span>}
      </button>
    );
  return (
    <div className="sidebar">
      <div className="account">
        <span className="avatar">{(data.settings.name || 'П')[0].toUpperCase()}</span>
        <span className="acc-name">{data.settings.name}</span>
        {sync.status !== 'off' && (
          <button className={'sync-dot ' + sync.status} onClick={sync.syncNow} title={sync.error || 'Синхронизация'}>
            <Icon name="cloud" size={18} />
          </button>
        )}
        <button className="icon-btn" onClick={ui.openSettings}>
          <Icon name="settings" size={20} />
        </button>
      </div>
      <div className="side-scroll">
        <div className="search-box side">
          <Icon name="search" size={18} />
          <input placeholder="Поиск разделов и проектов" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {show('inbox') && <Item icon="inbox" label="Входящие" view="inbox" count={inboxN} />}
        {show('today') && <Item icon="star" label="Сегодня" view="today" count={todayN} />}
        {show('plans') && <Item icon="calendar" label="Планы" view="plans" />}
        {show('calendar') && <Item icon="grid" label="Календарь" view="calendar" />}
        {show('habits') && <Item icon="habit" label="Привычки" view="habits" />}
        <div className="nav-section" onClick={() => setProjOpen(!projOpen)}>
          <Icon name="list" size={21} />
          <span className="nav-label">Мои проекты и списки</span>
          <button
            className="icon-btn sm accent"
            onClick={(e) => {
              e.stopPropagation();
              ui.editProject(null);
            }}
          >
            <Icon name="plus" size={18} />
          </button>
          <Icon name={projOpen ? 'chevD' : 'chevR'} size={16} />
        </div>
        {(projOpen || s) &&
          projects.map((p) => (
            <Item key={p.id} emoji={p.emoji} label={p.name} view="project" id={p.id} count={all.filter((x) => x.projectId === p.id).length} />
          ))}
        {archived.length > 0 && !s && (
          <>
            <div className="nav-section sub" onClick={() => setArchOpen(!archOpen)}>
              <Icon name="archive" size={19} />
              <span className="nav-label">Архив проектов</span>
              <Icon name={archOpen ? 'chevD' : 'chevR'} size={16} />
            </div>
            {archOpen &&
              archived.map((p) => (
                <button key={p.id} className="nav-item muted" onClick={() => updateProject(p.id, { archived: false })}>
                  <span className="emoji">{p.emoji}</span>
                  <span className="nav-label">{p.name}</span>
                  <Icon name="restore" size={16} />
                </button>
              ))}
          </>
        )}
        <div className="nav-div" />
        {show('filter') && <Item icon="filter" label="Фильтр" view="filter" />}
        {show('tags') && <div className="nav-section" onClick={() => setTagsOpen(!tagsOpen)}>
          <Icon name="tag" size={21} />
          <span className="nav-label">Теги</span>
          <button
            className="icon-btn sm accent"
            onClick={(e) => {
              e.stopPropagation();
              ui.prompt({ title: 'Новый тег', placeholder: 'Название тега', onSave: (n) => ui.store.addTag(n.replace(/^#/, '')) });
              setTagsOpen(true);
            }}
          >
            <Icon name="plus" size={18} />
          </button>
          <Icon name={tagsOpen ? 'chevD' : 'chevR'} size={16} />
        </div>}
        {tagsOpen && show('tags') &&
          data.tags.map((tg) => (
            <div key={tg.id} className={'nav-item' + (is('tag', tg.id) ? ' on' : '')} onClick={() => ui.go({ view: 'tag', id: tg.id })}>
              <span className="tag-hash">#</span>
              <span className="nav-label">{tg.name}</span>
              <button
                className="icon-btn sm"
                onClick={(e) => {
                  e.stopPropagation();
                  ui.confirm(`Удалить тег «${tg.name}»?`, () => deleteTag(tg.id));
                }}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
        {show('noproject') && <Item icon="noProject" label="Без проекта" view="noproject" count={noProjN} />}
        {show('someday') && <Item icon="someday" label="Когда-нибудь" view="someday" />}
        {show('archive') && <Item icon="restore" label="Архив" view="archive" />}
        {show('trash') && <Item icon="trash" label="Корзина" view="trash" />}
      </div>
      <div className="side-bottom">
        <button className="icon-btn" onClick={() => ui.closeDrawer()} title="Закрыть">
          <Icon name="menu" size={21} />
        </button>
        <button className="icon-btn" onClick={() => ui.go({ view: 'search' })} title="Поиск">
          <Icon name="search" size={21} />
        </button>
        <button className="icon-btn" onClick={() => ui.go({ view: 'pomo' })} title="Помодоро">
          <Icon name="timer" size={21} />
        </button>
        <button className="icon-btn" onClick={() => ui.go({ view: 'notifications' })} title="Напоминания">
          <Icon name="bell" size={21} />
        </button>
        <button className="icon-btn" onClick={ui.openSettings} title="Настройки">
          <Icon name="more" size={21} />
        </button>
      </div>
    </div>
  );
}

