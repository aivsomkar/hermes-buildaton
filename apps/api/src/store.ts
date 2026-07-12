import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { JobStage, LaunchJob } from "./types.js";

export class JobStore {
  private jobs = new Map<string, LaunchJob>();
  private writeQueue = Promise.resolve();

  constructor(private readonly file: string) {}

  async load(): Promise<void> {
    try {
      const data = JSON.parse(await readFile(this.file, "utf8")) as LaunchJob[];
      this.jobs = new Map(data.map((job) => [job.id, job]));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  list(): LaunchJob[] {
    return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string): LaunchJob | undefined {
    return this.jobs.get(id);
  }

  async save(job: LaunchJob): Promise<void> {
    job.updatedAt = new Date().toISOString();
    this.jobs.set(job.id, job);
    await this.persist();
  }

  async transition(job: LaunchJob, stage: JobStage, message: string): Promise<void> {
    const at = new Date().toISOString();
    job.status = stage;
    job.updatedAt = at;
    job.events.push({ stage, message, at });
    await this.save(job);
  }

  private persist(): Promise<void> {
    const task = this.writeQueue.catch(() => undefined).then(async () => {
      await mkdir(dirname(this.file), { recursive: true });
      const temp = `${this.file}.tmp`;
      await writeFile(temp, JSON.stringify(this.list(), null, 2));
      await rename(temp, this.file);
    });
    this.writeQueue = task.catch(() => undefined);
    return task;
  }
}
