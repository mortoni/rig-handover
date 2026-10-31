// Plan morning-digest § 1. The contract every part of § 2 builds against (#1).
// The reader that fills it lives in src/digest/reader.ts (#2).

export type RunStatus = 'ok' | 'retry' | 'fail';

/** One parsed line of runs/<night>.jsonl. */
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

/** One row per job for the night. Times keep the offset from the log, never converted to UTC. */
export type DigestRow = {
  job: string;
  /** Owner of the job's last line. `null` stays `null`; views show it as `—`. */
  owner: string | null;
  /** Lines for this job. */
  runs: number;
  /** Lines for this job with status `retry`. */
  retries: number;
  lastStatus: RunStatus;
  /** Error of the job's last line, or `null` when it has none. */
  lastError: string | null;
  /** `at` of the job's first and last line. */
  first: string;
  last: string;
};

/** Lines per status for the night, for the board (§ 2c). */
export type StatusCounts = Record<RunStatus, number>;

export type Night = {
  night: string;
  /** Sorted by job. Page and JSON both use this order, so they never disagree (ADR 0001). */
  rows: DigestRow[];
  counts: StatusCounts;
  /** Non-empty lines that did not parse into a RunLine. Counted, never thrown. */
  badLines: number;
};

/**
 * Reads runs/<night>.jsonl from `runsDir`.
 * Returns `null` when the night has no file (404). An empty file returns a Night with no rows
 * ("nothing ran").
 */
export type ReadNight = (runsDir: string, night: string) => Night | null;
