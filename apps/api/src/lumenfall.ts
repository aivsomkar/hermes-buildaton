const DEFAULT_BASE_URL = "https://api.lumenfall.ai/openai/v1";

export type LumenfallVideoStatus = "queued" | "in_progress" | "completed" | "failed";

export interface LumenfallVideoRequest {
  model: string;
  prompt: string;
  seconds?: string | number;
  size?: string;
  aspect_ratio?: string;
  resolution?: string;
  input_reference?: { image_url: string } | Array<{ image_url: string }>;
  negative_prompt?: string;
  webhook_url?: string;
  idempotency_key?: string;
  metadata?: Record<string, string>;
  [providerField: string]: unknown;
}

export interface LumenfallVideo {
  id: string;
  status: LumenfallVideoStatus;
  model?: string;
  seconds?: string;
  size?: string;
  expires_at?: number;
  output?: {
    url: string;
    content_type?: string;
    size_bytes?: number;
  };
  error?: {
    code?: string;
    message?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface LumenfallEstimate {
  estimated: true;
  total_cost_micros: number;
  currency: string;
  model?: string;
  provider?: string;
  components?: Array<Record<string, unknown>>;
}

export class LumenfallError extends Error {
  constructor(message: string, readonly code?: string, readonly status?: number) {
    super(message);
    this.name = "LumenfallError";
  }
}

interface ClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
}

interface WaitOptions {
  timeoutMs?: number;
  pollMs?: number;
}

export class LumenfallClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(private readonly options: ClientOptions) {
    if (!options.apiKey.trim()) throw new LumenfallError("LUMENFALL_API_KEY is required", "missing_api_key");
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async estimateVideo(request: LumenfallVideoRequest): Promise<LumenfallEstimate> {
    return this.request<LumenfallEstimate>("/videos?dryRun=true", { method: "POST", body: JSON.stringify(request) });
  }

  async createVideo(request: LumenfallVideoRequest): Promise<LumenfallVideo> {
    return this.request<LumenfallVideo>("/videos", { method: "POST", body: JSON.stringify(request) });
  }

  async getVideo(id: string): Promise<LumenfallVideo> {
    if (!id.trim()) throw new LumenfallError("Video id is required", "missing_video_id");
    return this.request<LumenfallVideo>(`/videos/${encodeURIComponent(id)}`);
  }

  async waitForVideo(id: string, options: WaitOptions = {}): Promise<LumenfallVideo> {
    const timeoutMs = options.timeoutMs ?? 15 * 60_000;
    const pollMs = options.pollMs ?? 5_000;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      const video = await this.getVideo(id);
      if (video.status === "completed") {
        if (!video.output?.url || !video.output.url.startsWith("https://")) {
          throw new LumenfallError("Completed video has no safe HTTPS output", "missing_output");
        }
        return video;
      }
      if (video.status === "failed") {
        throw new LumenfallError(video.error?.message ?? "Lumenfall video generation failed", video.error?.code ?? "generation_failed");
      }
      await this.sleep(pollMs);
    }
    throw new LumenfallError("Lumenfall video generation timed out", "timeout");
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${this.options.apiKey}`);
    if (init.body) headers.set("content-type", "application/json");
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, headers });
    const text = await response.text();
    let payload: unknown;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new LumenfallError("Lumenfall returned invalid JSON", "invalid_response", response.status);
    }
    if (!response.ok) {
      const error = payload as { error?: { code?: string; message?: string }; message?: string };
      throw new LumenfallError(error.error?.message ?? error.message ?? `Lumenfall request failed (${response.status})`, error.error?.code, response.status);
    }
    return payload as T;
  }
}
