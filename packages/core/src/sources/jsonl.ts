import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";

/**
 * Streams a JSONL file line by line. Session logs can be 50MB+ each (and GBs in total),
 * so reading whole files into memory is not an option.
 */
export async function* readLines(filePath: string): AsyncGenerator<string> {
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (line.length > 0) yield line;
  }
}

export function safeJsonParse(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    // A session that crashed mid-write leaves a truncated last line; skip it.
    return undefined;
  }
}

/**
 * Recursively lists *.jsonl files under `dir` that were modified at or after `since`.
 * A file last written before `since` cannot contain newer events, so skipping it by
 * mtime avoids parsing gigabytes of old history.
 */
export async function findJsonlFiles(dir: string, since: Date): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(dir, { recursive: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".jsonl")) continue;
    const fullPath = join(dir, entry);
    try {
      const info = await stat(fullPath);
      if (info.isFile() && info.mtime >= since) files.push(fullPath);
    } catch {
      // File vanished between readdir and stat (e.g. tool cleanup); ignore.
    }
  }
  return files;
}
