export const JOB_STAGES = [
  "queued",
  "researching",
  "analyzing_reference",
  "writing_script",
  "rendering",
  "completed",
  "failed",
] as const;

export type JobStage = (typeof JOB_STAGES)[number];
export type JobFormat = "landscape" | "portrait";

export interface JobEvent {
  stage: JobStage;
  message: string;
  at: string;
}

export interface JobArtifacts {
  breakdown?: string;
  styleBrief?: string;
  beats?: string;
  script?: string;
  video?: string;
  contactSheet?: string;
}

export interface LaunchJob {
  id: string;
  productUrl: string;
  inspiration: string;
  format: JobFormat;
  status: JobStage;
  createdAt: string;
  updatedAt: string;
  title?: string;
  productSummary?: string;
  error?: string;
  artifacts: JobArtifacts;
  events: JobEvent[];
}

export interface CreateJobInput {
  productUrl: string;
  inspiration: string;
  format?: JobFormat;
}
