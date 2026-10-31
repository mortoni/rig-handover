import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

const JOBS = ['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs'];

let runsDir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  process.env.LANE_MARKER = 'TEST-MARKER';
  runsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-runs-'));
  // runs/ is read-only: copy the real night, never write to it.
  fs.copyFileSync(path.resolve('runs', '2026-10-28.jsonl'), path.join(runsDir, '2026-10-28.jsonl'));
  fs.writeFileSync(path.join(runsDir, '2026-10-30.jsonl'), '');
  fs.writeFileSync(
    path.join(runsDir, '2026-10-31.jsonl'),
    [
      '{"at":"2026-10-31T01:00:00+01:00","job":"a/one","status":"ok","owner":"x"}',
      '{"at":"2026-10-31T01:05:00+01:00","job":"a/one","status":"retry","owner":"x","error":"slow"}',
      'not json',
    ].join('\n') + '\n',
  );
  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
});

afterAll(() => {
  fs.rmSync(runsDir, { recursive: true, force: true });
});

// Job names in table order: the first cell of each body row (header cells are <th>).
function jobsInPage(html: string): string[] {
  const jobs: string[] = [];
  for (const tr of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cell = /<td\b[^>]*>([\s\S]*?)<\/td>/.exec(tr[1] ?? '');
    if (cell) jobs.push((cell[1] ?? '').replace(/<[^>]*>/g, '').trim());
  }
  return jobs;
}

describe('GET /digest/:night', () => {
  it('200 with every job and the warn mark for 2026-10-28', async () => {
    const res = await app.request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const job of JOBS) expect(html).toContain(job);
    expect(html).toMatch(/<tr\b[^>]*class="warn"/);
  });

  it('404 for a night with no file', async () => {
    const res = await app.request('/digest/2026-10-29');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('no run log for 2026-10-29');
  });

  it('empty night says nothing ran and has no table', async () => {
    const res = await app.request('/digest/2026-10-30');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table');
  });

  it('a bad line is counted, the good lines still show', async () => {
    const res = await app.request('/digest/2026-10-31');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('a/one');
    expect(html).toContain('1 line could not be read');
  });
});

describe('GET /api/digest/:night', () => {
  it('200 with the rows for 2026-10-28', async () => {
    const res = await app.request('/api/digest/2026-10-28');
    const body = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(body.night).toBe('2026-10-28');
    expect(body.rows.map((r) => r.job)).toEqual(JOBS);
  });

  it('page and JSON never disagree: same jobs in the same order', async () => {
    const page = await app.request('/digest/2026-10-28');
    const api = await app.request('/api/digest/2026-10-28');
    const body = (await api.json()) as Night;
    const fromPage = jobsInPage(await page.text());
    expect(fromPage).toHaveLength(JOBS.length);
    expect(body.rows.map((r) => r.job)).toEqual(fromPage);
  });

  it('404 with an error body for a night with no file', async () => {
    const res = await app.request('/api/digest/2026-10-29');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log for 2026-10-29' });
  });

  it('empty night has no rows and no bad lines', async () => {
    const res = await app.request('/api/digest/2026-10-30');
    const body = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('a bad line is counted and the good job is one row with two runs', async () => {
    const res = await app.request('/api/digest/2026-10-31');
    const body = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(body.badLines).toBe(1);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]?.job).toBe('a/one');
    expect(body.rows[0]?.runs).toBe(2);
  });
});
