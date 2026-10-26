// Single-user storage: the planner document (same shape the app syncs) plus server state,
// kept as JSON files with atomic writes.
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { merge, stamp, canon } from '../src/sync.js';

const empty = () => ({ tasks: [], projects: [], tags: [], habits: [], pomo: { sessions: [] }, settings: {}, deletedIds: {} });

export class Store {
  constructor(dir) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
    this.data = this.read('data.json') || empty();
    // links: taskId -> {href, etag, hash, cal}; calendars/events: last pull from CalDAV
    this.state = this.read('state.json') || { links: {}, calendars: [], events: [], pulledAt: 0, error: null };
    this.listeners = new Set();
  }

  read(name) {
    const p = join(this.dir, name);
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, 'utf8'));
  }

  write(name, obj) {
    const p = join(this.dir, name);
    writeFileSync(p + '.tmp', JSON.stringify(obj));
    renameSync(p + '.tmp', p);
  }

  saveState() {
    this.write('state.json', this.state);
  }

  // Merge a client's copy; returns the merged document
  sync(client) {
    const merged = merge(this.data, client);
    this.setData(merged);
    return this.data;
  }

  setData(next) {
    const changed = canon(next) !== canon(this.data);
    this.data = next;
    if (!changed) return;
    this.write('data.json', next);
    this.listeners.forEach((f) => f());
  }

  // Server-side edits (e.g. a task moved in Yandex Calendar), stamped so clients pick them up
  mutate(fn) {
    const n = JSON.parse(JSON.stringify(this.data));
    fn(n);
    this.setData(stamp(this.data, n));
  }

  onChange(f) {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }
}
