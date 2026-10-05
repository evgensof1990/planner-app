import { useState } from 'react';
import Icon from './icons.jsx';
import { useUi, Sheet, SheetHeader } from './components.jsx';
import { useStore, alive } from './store.jsx';
import { todayKey } from './date.js';
import { isNative } from './notify.js';
import { convertTickTick } from './ticktick.js';

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
        <Item icon="restore" label="Архив" view="archive" />
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
  const { data, setSettings, importData, emptyTrash, importTickTick } = useStore();
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
  const fromTickTick = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.csv,text/csv';
    inp.onchange = async () => {
      if (!inp.files[0]) return;
      try {
        const r = convertTickTick(await inp.files[0].text());
        const done = (mode) => {
          importTickTick(r, mode);
          ui.toast(`Перенесено задач: ${r.tasks.length}, проектов: ${r.projects.length}`);
          onClose();
        };
        ui.confirm(
          `В файле ${r.tasks.length} задач и ${r.projects.length} проектов. Заменить ими текущие задачи (примеры удалятся) или добавить к ним?`,
          () => done('replace'),
          'Заменить',
          { label: 'Добавить', fn: () => done('add') }
        );
      } catch (e) {
        ui.toast(e.message || 'Не удалось прочитать файл');
      }
    };
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
        <SyncSection />
        <div className="lbl">Перенос из TickTick</div>
        <div className="hint">В TickTick: Настройки → Аккаунт → «Создать резервную копию». Выберите скачанный CSV-файл.</div>
        <button className="btn wide" onClick={fromTickTick}>
          <Icon name="download" size={18} /> Импорт из TickTick (CSV)
        </button>
        <div className="lbl">Резервная копия</div>
        <div className="hint">Можно сохранить все данные в файл или буфер обмена и загрузить их обратно.</div>
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
        <button className="row-btn" onClick={() => setSettings({ autoArchive: data.settings.autoArchive === false })}>
          <Icon name="restore" size={20} /> <span>Сразу переносить выполненные в архив</span>
          <span style={{ flex: 1 }} />
          <span className={'switch' + (data.settings.autoArchive !== false ? ' on' : '')} />
        </button>
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

const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=' + encodeURIComponent('Плановик синхронизация');

function SyncSection() {
  const { sync } = useStore();
  const ui = useUi();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const connect = async () => {
    const t = token.trim();
    if (!t) return;
    setBusy(true);
    setErr(null);
    try {
      const { gistId, existing } = await sync.probe(t);
      if (existing) {
        ui.confirm(
          'В облаке уже есть данные с другого устройства. Заменить ими данные на этом устройстве? «Объединить» сохранит и то, и другое.',
          () => sync.connect(t, gistId, 'replace').then(() => ui.toast('Синхронизация включена')),
          'Заменить',
          { label: 'Объединить', fn: () => sync.connect(t, gistId, 'merge').then(() => ui.toast('Синхронизация включена')) }
        );
      } else {
        await sync.connect(t, null);
        ui.toast('Синхронизация включена');
      }
      setToken('');
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };
  const time = sync.last ? new Date(sync.last).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;
  return (
    <>
      <div className="lbl">Синхронизация</div>
      {sync.status === 'off' ? (
        <>
          <div className="hint">
            Данные синхронизируются между телефоном и макбуком через ваш аккаунт GitHub: они хранятся в приватном gist. Нужен токен с доступом только к gist, один и тот же на всех устройствах.
          </div>
          <a className="link-btn" href={TOKEN_URL} target="_blank" rel="noreferrer">
            1. Создать токен на GitHub ↗
          </a>
          <div className="hint small">Срок действия выберите «No expiration», затем нажмите «Generate token» и скопируйте его.</div>
          <input className="field" placeholder="2. Вставьте токен (ghp_…)" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" spellCheck={false} />
          {err && <div className="hint red">{err}</div>}
          <button className="btn primary wide" disabled={busy || !token.trim()} onClick={connect}>
            {busy ? 'Подключаю…' : '3. Включить синхронизацию'}
          </button>
        </>
      ) : (
        <>
          <div className={'sync-status ' + sync.status}>
            <Icon name={sync.status === 'error' ? 'close' : 'cloud'} size={18} />
            <span>
              {sync.status === 'syncing'
                ? 'Синхронизация…'
                : sync.status === 'error'
                  ? sync.error
                  : time
                    ? 'Синхронизировано: ' + time
                    : 'Синхронизация включена'}
            </span>
          </div>
          <div className="btn-grid">
            <button className="btn" onClick={sync.syncNow}>
              <Icon name="sync" size={18} /> Синхронизировать
            </button>
            <button className="btn" onClick={() => ui.confirm('Отключить синхронизацию на этом устройстве? Данные останутся на месте.', sync.disconnect, 'Отключить')}>
              <Icon name="close" size={18} /> Отключить
            </button>
          </div>
        </>
      )}
    </>
  );
}
