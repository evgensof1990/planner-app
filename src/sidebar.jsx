import { useState } from 'react';
import Icon from './icons.jsx';
import { useUi, Sheet, SheetHeader } from './components.jsx';
import { useStore, alive } from './store.jsx';
import { todayKey } from './date.js';
import { isNative } from './notify.js';

export function Sidebar({ route }) {
  const { data, deleteTag, updateProject } = useStore();
  const ui = useUi();
  const [q, setQ] = useState('');
  const [projOpen, setProjOpen] = useState(true);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [archOpen, setArchOpen] = useState(false);
  const t = todayKey();
  const all = data.tasks.filter((x) => alive(x) && !x.done && !x.parentId);
  const inboxN = all.filter((x) => !x.projectId).length;
  const todayN = all.filter((x) => x.date && x.date <= t).length;
  const s = q.toLowerCase();
  const projects = data.projects.filter((p) => !p.archived && p.name.toLowerCase().includes(s));
  const archived = data.projects.filter((p) => p.archived);
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
        <button className="icon-btn" onClick={ui.openSettings}>
          <Icon name="settings" size={20} />
        </button>
      </div>
      <div className="side-scroll">
        <div className="search-box side">
          <Icon name="search" size={18} />
          <input placeholder="Поиск разделов и проектов" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Item icon="inbox" label="Входящие" view="inbox" count={inboxN} />
        <Item icon="star" label="Сегодня" view="today" count={todayN} />
        <Item icon="calendar" label="Планы" view="plans" />
        <Item icon="habit" label="Привычки" view="habits" />
        <Item icon="grid" label="Календарь" view="calendar" />
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
        <Item icon="filter" label="Фильтр" view="filter" />
        <div className="nav-section" onClick={() => setTagsOpen(!tagsOpen)}>
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
        </div>
        {tagsOpen &&
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
        <Item icon="trash" label="Корзина" view="trash" />
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

export function SettingsSheet({ onClose }) {
  const { data, setSettings, importData, emptyTrash } = useStore();
  const ui = useUi();
  const exportJson = () => JSON.stringify(data, null, 1);
  const download = () => {
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `planner-${todayKey()}.json`;
    a.click();
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportJson());
      ui.toast('Данные скопированы в буфер обмена');
    } catch (e) {
      ui.toast('Не удалось скопировать');
    }
  };
  const applyImport = (text) => {
    try {
      const d = JSON.parse(text);
      if (!d.tasks) throw new Error();
      ui.confirm(
        'Заменить текущие данные импортированными?',
        () => {
          importData(d);
          ui.toast('Данные импортированы');
          onClose();
        },
        'Заменить'
      );
    } catch (e) {
      ui.toast('Неверный формат данных');
    }
  };
  const fromFile = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json,.json';
    inp.onchange = async () => inp.files[0] && applyImport(await inp.files[0].text());
    inp.click();
  };
  const fromClipboard = async () => {
    try {
      applyImport(await navigator.clipboard.readText());
    } catch (e) {
      ui.prompt({ title: 'Вставьте данные (JSON)', onSave: applyImport });
    }
  };
  return (
    <Sheet onClose={onClose}>
      <SheetHeader title="Настройки" onClose={onClose} />
      <div className="pad">
        <label className="lbl">Название / имя</label>
        <input className="field" value={data.settings.name} onChange={(e) => setSettings({ name: e.target.value })} />
        <div className="lbl">Перенос данных между устройствами</div>
        <div className="hint">Данные хранятся только на этом устройстве. Чтобы перенести их на телефон или макбук, экспортируйте и импортируйте.</div>
        <div className="btn-grid">
          {!isNative && window.self === window.top && (
            <button className="btn" onClick={download}>
              <Icon name="download" size={18} /> Скачать файл
            </button>
          )}
          <button className="btn" onClick={copy}>
            <Icon name="copy" size={18} /> Копировать
          </button>
          <button className="btn" onClick={fromFile}>
            <Icon name="note" size={18} /> Импорт из файла
          </button>
          <button className="btn" onClick={fromClipboard}>
            <Icon name="restore" size={18} /> Вставить
          </button>
        </div>
        <div className="lbl">Прочее</div>
        <button className="row-btn" onClick={() => setSettings({ showCompleted: !data.settings.showCompleted })}>
          <Icon name="check" size={20} /> <span>Показывать выполненные</span>
          <span style={{ flex: 1 }} />
          <span className={'switch' + (data.settings.showCompleted ? ' on' : '')} />
        </button>
        <button className="row-btn danger" onClick={() => ui.confirm('Очистить корзину? Задачи удалятся навсегда.', emptyTrash, 'Очистить')}>
          <Icon name="trash" size={20} /> <span>Очистить корзину</span>
        </button>
        <div className="hint center">Плановик · версия 1.0</div>
      </div>
    </Sheet>
  );
}
