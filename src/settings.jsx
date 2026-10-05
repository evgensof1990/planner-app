import { useEffect, useState } from 'react';
import Icon from './icons.jsx';
import { useUi, Sheet, SheetHeader } from './components.jsx';
import { useStore, uid } from './store.jsx';
import { todayKey } from './date.js';
import { isNative } from './notify.js';
import { convertTickTick } from './ticktick.js';
import { SIDE_ITEMS, TOOL_ITEMS, THEMES, ACCENTS, DEFAULT_ACCENT, isHidden } from './layout.js';
import { refreshCalendar, calendarInfo, dropCalendar, onCalendarsChange } from './ical.js';

const TABS = [
  ['general', 'Общие', 'settings'],
  ['sync', 'Синхронизация', 'cloud'],
  ['iface', 'Интерфейс', 'panel'],
  ['themes', 'Темы', 'palette'],
  ['calendars', 'Календари', 'calendar'],
  ['pomo', 'Помодоро', 'timer'],
  ['data', 'Данные', 'folder'],
];

export function SettingsSheet({ onClose, tab: initial }) {
  const [tab, setTab] = useState(initial || 'general');
  let pane;
  if (tab === 'general') pane = <General />;
  else if (tab === 'sync') pane = <SyncSection />;
  else if (tab === 'iface') pane = <Interface />;
  else if (tab === 'themes') pane = <Themes />;
  else if (tab === 'calendars') pane = <Calendars />;
  else if (tab === 'pomo') pane = <Pomo />;
  else pane = <DataPane onClose={onClose} />;
  return (
    <Sheet onClose={onClose} full className="settings-sheet">
      <SheetHeader title="Настройки" onClose={onClose} />
      <div className="stabs">
        {TABS.map(([k, l, ic]) => (
          <button key={k} className={'stab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>
            <Icon name={ic} size={26} stroke={1.5} />
            <span>{l}</span>
          </button>
        ))}
      </div>
      <div className="spane">{pane}</div>
    </Sheet>
  );
}

function Check({ on, onClick, label, sub, right }) {
  return (
    <div className="srow">
      <button className={'chk' + (on ? ' on' : '')} onClick={onClick} aria-pressed={on}>
        {on && <Icon name="check" size={13} stroke={3} />}
      </button>
      <div className="srow-l" onClick={onClick} style={{ cursor: 'pointer' }}>
        {label}
        {sub && <div className="srow-sub">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

function Select({ label, sub, value, options, onChange }) {
  return (
    <div className="srow">
      <div className="srow-l">
        {label}
        {sub && <div className="srow-sub">{sub}</div>}
      </div>
      <select className="sselect" value={String(value)} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={String(v)} value={String(v)}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ---------- Общие ---------- */
function General() {
  const { data, setSettings, emptyTrash } = useStore();
  const ui = useUi();
  const st = data.settings;
  return (
    <>
      <label className="lbl">Название / имя</label>
      <input className="field" value={st.name} onChange={(e) => setSettings({ name: e.target.value })} />
      <Select
        label="Переносить выполненные задачи в архив"
        value={st.autoArchive === false ? 'never' : 'now'}
        options={[
          ['now', 'Сразу же'],
          ['never', 'Вручную'],
        ]}
        onChange={(v) => setSettings({ autoArchive: v === 'now' })}
      />
      <Select
        label="Начало недели"
        value={st.weekStart === 0 ? 0 : 1}
        options={[
          [1, 'Понедельник'],
          [0, 'Воскресенье'],
        ]}
        onChange={(v) => setSettings({ weekStart: Number(v) })}
      />
      <Select
        label="Показывать анимации выполнения задач"
        value={st.cheer === false ? 'never' : 'always'}
        options={[
          ['always', 'Всегда'],
          ['never', 'Никогда'],
        ]}
        onChange={(v) => setSettings({ cheer: v === 'always' })}
      />
      {!isNative && (
        <Check
          on={st.hotkey !== false}
          onClick={() => setSettings({ hotkey: st.hotkey === false })}
          label="Горячая клавиша быстрого создания задачи"
          sub="Работает, когда курсор не стоит в поле ввода"
          right={<span className="kbd">N</span>}
        />
      )}
      <Check on={!!st.showCompleted} onClick={() => setSettings({ showCompleted: !st.showCompleted })} label="Показывать выполненные задачи в списках" sub="Когда перенос в архив выключен" />
      <button className="row-btn danger" style={{ marginTop: 12 }} onClick={() => ui.confirm('Очистить корзину? Задачи удалятся навсегда.', emptyTrash, 'Очистить')}>
        <Icon name="trash" size={20} /> <span>Очистить корзину</span>
      </button>
      <div className="hint center">Плановик · версия 1.0</div>
    </>
  );
}

/* ---------- Интерфейс ---------- */
function Interface() {
  const { data, setSettings } = useStore();
  const [part, setPart] = useState('side');
  const st = data.settings;
  const key = part === 'side' ? 'sideHidden' : 'toolHidden';
  const items = part === 'side' ? SIDE_ITEMS : TOOL_ITEMS;
  const toggle = (k) => {
    const cur = st[key] || [];
    setSettings({ [key]: cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k] });
  };
  return (
    <>
      <div className="s-title">Здесь вы можете выбрать элементы для отображения</div>
      <div className="iface">
        <div className="iface-nav">
          <button className={part === 'side' ? 'on' : ''} onClick={() => setPart('side')}>
            Левая панель
          </button>
          <button className={part === 'tool' ? 'on' : ''} onClick={() => setPart('tool')}>
            Верхний тулбар
          </button>
        </div>
        <div className="iface-list">
          <div style={{ fontWeight: 600, margin: '4px 0 6px' }}>{part === 'side' ? 'Какие элементы выводить в левой панели' : 'Какие кнопки выводить в тулбаре'}</div>
          {items.map(([k, l, ic]) => (
            <button key={k} className="iface-item" onClick={() => toggle(k)}>
              <span className={'chk' + (!isHidden(st[key], k) ? ' on' : '')}>{!isHidden(st[key], k) && <Icon name="check" size={13} stroke={3} />}</span>
              <Icon name={ic} size={21} />
              <span>{l}</span>
            </button>
          ))}
          {part === 'tool' && <div className="hint small">Тулбар виден в широком окне (на компьютере), справа сверху.</div>}
        </div>
      </div>
    </>
  );
}

/* ---------- Темы ---------- */
function Themes() {
  const { data, setSettings } = useStore();
  const theme = data.settings.theme || 'dark';
  const accent = data.settings.accent || DEFAULT_ACCENT;
  return (
    <>
      <div className="s-title">Выбрать цветовую тему</div>
      <div className="themes">
        {THEMES.map(([k, l, bg, bar, fg]) => (
          <button key={k} className={'theme-card' + (theme === k ? ' on' : '')} onClick={() => setSettings({ theme: k })}>
            <span className="theme-prev" style={{ background: bg }}>
              <i style={{ top: 22, width: 22, background: accent }} />
              <i style={{ top: 36, width: 10, background: bar }} />
              <i style={{ top: 36, left: 24, width: 10, background: bar }} />
              <b style={{ color: fg }}>A</b>
            </span>
            <span>
              {theme === k && '✓ '}
              {l}
            </span>
          </button>
        ))}
      </div>
      <div className="s-title" style={{ marginTop: 22 }}>
        Выбрать акцентный цвет
      </div>
      <div className="accents">
        {ACCENTS.map((c) => (
          <button key={c} className={'accent-dot' + (accent === c ? ' on' : '')} style={{ background: c }} onClick={() => setSettings({ accent: c })}>
            {accent === c && <Icon name="check" size={16} stroke={3} />}
          </button>
        ))}
      </div>
    </>
  );
}

/* ---------- Календари ---------- */
const CAL_COLORS = ['#4aa8ff', '#4cc764', '#f08a2c', '#d84ff0', '#f5c932', '#f0574f'];

function Calendars() {
  const { data, setSettings } = useStore();
  const ui = useUi();
  const cals = data.settings.calendars || [];
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [, bump] = useState(0);
  useEffect(() => onCalendarsChange(() => bump((x) => x + 1)), []);
  const add = async () => {
    const u = url.trim();
    if (!u) return;
    setBusy(true);
    const cal = { id: uid(), url: u, name: 'Календарь', color: CAL_COLORS[cals.length % CAL_COLORS.length], on: true };
    const info = await refreshCalendar(cal);
    setBusy(false);
    if (info.error && !info.events.length) {
      dropCalendar(cal.id);
      ui.toast(info.error);
      return;
    }
    setSettings({ calendars: [...cals, { ...cal, name: info.name || 'Календарь' }] });
    setUrl('');
    ui.toast(`Календарь подключён, событий: ${info.events.length}`);
  };
  const update = (id, patch) => setSettings({ calendars: cals.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const remove = (c) =>
    ui.confirm(
      `Отключить календарь «${c.name}»?`,
      () => {
        dropCalendar(c.id);
        setSettings({ calendars: cals.filter((x) => x.id !== c.id) });
      },
      'Отключить'
    );
  return (
    <>
      <div className="s-title">Подключение веб-календарей по ссылке (iCal)</div>
      <div className="hint">
        События из Google, Яндекс или Apple календаря появятся в разделе «Календарь» (только для просмотра). В Google Календаре ссылка находится в настройках календаря: «Закрытый адрес в формате iCal».
      </div>
      {cals.map((c) => {
        const info = calendarInfo(c.id);
        return (
          <div key={c.id} className="cal-sub">
            <button className={'chk' + (c.on !== false ? ' on' : '')} style={c.on !== false ? { background: c.color, borderColor: c.color } : { borderColor: c.color }} onClick={() => update(c.id, { on: c.on === false })}>
              {c.on !== false && <Icon name="check" size={13} stroke={3} />}
            </button>
            <div className="nm">
              {c.name}
              <div className="srow-sub">{info?.error ? <span className="red">{info.error}</span> : `Событий: ${info?.events?.length || 0}`}</div>
            </div>
            <button className="icon-btn sm" title="Обновить" onClick={() => refreshCalendar(c)}>
              <Icon name="sync" size={17} />
            </button>
            <button className="icon-btn sm" title="Отключить" onClick={() => remove(c)}>
              <Icon name="close" size={17} />
            </button>
          </div>
        );
      })}
      <input className="field" placeholder="https://… .ics или webcal://…" value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="off" spellCheck={false} />
      <button className="btn primary wide" disabled={busy || !url.trim()} onClick={add}>
        {busy ? 'Загружаю…' : 'Подключить календарь'}
      </button>
      {!isNative && <div className="hint small">Многие календари (в том числе Google) не разрешают загрузку прямо с сайта. Тогда подключите ссылку в приложении на телефоне: события будут видны там.</div>}
    </>
  );
}

/* ---------- Помодоро ---------- */
function Pomo() {
  const { data, setSettings } = useStore();
  const st = data.settings;
  const Num = ({ label, k, def, unit, max = 180 }) => (
    <div className="srow">
      <div className="srow-l">{label}</div>
      <input
        className="num"
        type="number"
        min="1"
        max={max}
        defaultValue={st[k] || def}
        onBlur={(e) => {
          const v = Math.min(max, Math.max(1, Math.round(Number(e.target.value) || def)));
          e.target.value = v;
          setSettings({ [k]: v });
        }}
      />
      <span style={{ width: 70, color: 'var(--text2)' }}>{unit}</span>
    </div>
  );
  return (
    <>
      <Num label="Период работы" k="pomoMinutes" def={25} unit="минут" />
      <Num label="Короткий перерыв" k="pomoShort" def={5} unit="минут" />
      <Num label="Длинный перерыв" k="pomoLong" def={15} unit="минут" />
      <Num label="Длинный перерыв каждые" k="pomoEvery" def={4} unit="помодоро" max={12} />
      <div style={{ height: 10 }} />
      <Check on={!!st.pomoAuto} onClick={() => setSettings({ pomoAuto: !st.pomoAuto })} label="Автоматически начинать следующий период" />
      <Check on={st.pomoSound !== false} onClick={() => setSettings({ pomoSound: st.pomoSound === false })} label="Звуковое оповещение об окончании периода" />
    </>
  );
}

/* ---------- Данные: импорт и резервная копия ---------- */
function DataPane({ onClose }) {
  const { data, importData, importTickTick } = useStore();
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
    <>
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
    </>
  );
}

/* ---------- Синхронизация ---------- */
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
