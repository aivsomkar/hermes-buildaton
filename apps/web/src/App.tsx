import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { upload } from '@vercel/blob/client'
import { ConvexClient } from 'convex/browser'
import { anyApi } from 'convex/server'
import './App.css'

type JobStage = 'queued' | 'researching' | 'analyzing_reference' | 'writing_script' | 'rendering' | 'completed' | 'failed'

type Job = {
  id: string
  productUrl: string
  format: 'landscape' | 'portrait'
  status: JobStage
  updatedAt: string | number
  title?: string
  productSummary?: string
  error?: string
  artifacts: Record<string, string | undefined>
  events: Array<{ stage: JobStage; message: string; at: string | number }>
}

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'
const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string | undefined
const convex = CONVEX_URL ? new ConvexClient(CONVEX_URL) : null

const stages: Array<{ id: JobStage; label: string; owner: string }> = [
  { id: 'researching', label: 'Identify the product', owner: 'Researcher' },
  { id: 'analyzing_reference', label: 'Map the reference', owner: 'Style analyst' },
  { id: 'writing_script', label: 'Build the story', owner: 'Scriptwriter' },
  { id: 'rendering', label: 'Render the preview', owner: 'Video producer' },
  { id: 'completed', label: 'Package artifacts', owner: 'Director' },
]

const stageIndex = (stage: JobStage) => {
  if (stage === 'queued') return -1
  if (stage === 'failed') return -1
  return stages.findIndex((item) => item.id === stage)
}

function artifactHref(path?: string) {
  if (!path) return undefined
  return path.startsWith('https://') ? path : `${API}${path}`
}

function publicConvexJob(value: Record<string, unknown>): Job {
  return { ...value, id: String(value._id) } as unknown as Job
}

function uploadPath(file: File) {
  const safe = file.name.trim().replace(/[^a-zA-Z0-9._-]/g, '_').slice(-160)
  if (!/\.(mp4|mov|webm)$/i.test(safe)) throw new Error('Choose an MP4, MOV, or WebM video')
  return `inspirations/${safe}`
}

function App() {
  const [productUrl, setProductUrl] = useState('')
  const [format, setFormat] = useState<'landscape' | 'portrait'>('landscape')
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const activeIndex = useMemo(() => job ? stageIndex(job.status) : -1, [job])

  useEffect(() => {
    if (!job || ['completed', 'failed'].includes(job.status)) return
    const jobId = job.id
    if (convex) {
      return convex.onUpdate(anyApi.jobs.get, { id: jobId }, (value: unknown) => {
        if (value) setJob(publicConvexJob(value as Record<string, unknown>))
      })
    }
    let cancelled = false
    let timer: number | undefined
    let controller: AbortController | undefined

    const poll = async () => {
      controller = new AbortController()
      try {
        const response = await fetch(`${API}/api/jobs/${jobId}`, { signal: controller.signal })
        if (response.ok) {
          const data = await response.json() as { job: Job }
          if (cancelled || data.job.id !== jobId) return
          setJob((current) => {
            if (!current || current.id !== jobId || data.job.updatedAt < current.updatedAt) return current
            return data.job
          })
          if (['completed', 'failed'].includes(data.job.status)) return
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
      if (!cancelled) timer = window.setTimeout(poll, 1400)
    }

    timer = window.setTimeout(poll, 1400)
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
      controller?.abort()
    }
  }, [job?.id, job?.status])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    setSubmitting(true)
    try {
      if (!videoFile) throw new Error('Choose an inspiration video from this Mac')
      if (convex) {
        const blob = await upload(uploadPath(videoFile), videoFile, {
          // Single public Blob store: uploads live at unguessable random-suffixed URLs.
          access: 'public',
          handleUploadUrl: '/api/blob-upload',
          multipart: true,
        })
        const id = await convex.mutation(anyApi.jobs.create, {
          productUrl,
          format,
          input: { pathname: blob.pathname, contentType: videoFile.type, size: videoFile.size },
        }) as string
        setJob({ id, productUrl, format, status: 'queued', updatedAt: Date.now(), artifacts: {}, events: [] })
      } else {
        const body = new FormData()
        body.set('productUrl', productUrl)
        body.set('format', format)
        body.set('video', videoFile)
        const response = await fetch(`${API}/api/jobs`, { method: 'POST', body })
        const data = await response.json() as { job?: Job; error?: string }
        if (!response.ok || !data.job) throw new Error(data.error ?? 'Could not start the production')
        setJob(data.job)
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not start the production')
    } finally {
      setSubmitting(false)
    }
  }

  async function retry() {
    if (!job) return
    setFormError('')
    if (convex) {
      await convex.mutation(anyApi.jobs.retry, { id: job.id })
      setJob({ ...job, status: 'queued', updatedAt: Date.now() })
      return
    }
    const response = await fetch(`${API}/api/jobs/${job.id}/retry`, { method: 'POST' })
    const data = await response.json() as { job?: Job; error?: string }
    if (data.job) setJob({ ...data.job, status: 'researching' })
    else setFormError(data.error ?? 'Retry failed')
  }

  return (
    <main>
      <header className="masthead">
        <a className="wordmark" href="#top" aria-label="LaunchReel home">LAUNCHREEL<span>●</span></a>
        <p>Local launch-video pipeline</p>
        <div className="live-mark"><i /> HERMES CREW ONLINE</div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">URL IN. REFERENCE IN. PREVIEW OUT.</p>
          <h1>Your product.<br /><strong>Your taste.</strong><br />One local preview.</h1>
          <p className="dek">Give the local agent crew your product URL and an inspiration-video upload. It maps the reference and renders a new 12-second pipeline preview.</p>
        </div>
        <aside className="proof-note" aria-label="How it works">
          <span>01 / CREATIVE BRIEF</span>
          <p>Reference structure becomes a style prior. Source footage and brand assets are never reused.</p>
          <div className="format-stamp">12 SEC<br />TITLE CARDS<br />MP4 + SCRIPT</div>
        </aside>
      </section>

      <section className="workspace" aria-label="Start a production">
        <form className="slate" onSubmit={submit}>
          <div className="slate-heading">
            <div>
              <p className="eyebrow">NEW PRODUCTION</p>
              <h2>Set the source material.</h2>
            </div>
            <span>TAKE 001</span>
          </div>

          <label className="field">
            <span className="field-number">01</span>
            <span className="field-body">
              <b>Product URL</b>
              <small>Used locally to identify the product; the page is not fetched yet.</small>
              <input type="url" value={productUrl} onChange={(event) => setProductUrl(event.target.value)} placeholder="https://yourproduct.com" required />
            </span>
          </label>

          <div className="field inspiration-field">
            <span className="field-number">02</span>
            <div className="field-body">
              <b>Inspiration video</b>
              <small>Upload an MP4, MOV, or WebM. Max 3 minutes and 200 MB.</small>
              <label className="upload-control">
                <input type="file" accept="video/*" onChange={(event) => setVideoFile(event.target.files?.[0] ?? null)} />
                <span>{videoFile ? videoFile.name : 'Choose an MP4 from this Mac'}</span>
                <b>{videoFile ? 'READY' : 'BROWSE'}</b>
              </label>
            </div>
          </div>

          <fieldset className="format-picker">
            <legend>FORMAT</legend>
            <label><input type="radio" name="format" checked={format === 'landscape'} onChange={() => setFormat('landscape')} /> <span>16:9</span> Landscape</label>
            <label><input type="radio" name="format" checked={format === 'portrait'} onChange={() => setFormat('portrait')} /> <span>9:16</span> Vertical</label>
          </fieldset>

          {formError && <p className="form-error" role="alert">{formError}</p>}
          <button className="submit-button" type="submit" disabled={submitting || (!!job && !['completed', 'failed'].includes(job.status))}>
            <span>{submitting ? 'OPENING THE JOB…' : 'CREATE THE LOCAL PREVIEW'}</span>
            <b>↗</b>
          </button>
        </form>

        <section className="crew" aria-live="polite">
          <div className="crew-heading">
            <p className="eyebrow">LIVE PRODUCTION</p>
            <span>{job ? `JOB ${job.id.slice(0, 8).toUpperCase()}` : 'WAITING FOR BRIEF'}</span>
          </div>
          <ol className="crew-list">
            {stages.map((stage, index) => {
              const complete = job?.status === 'completed' || activeIndex > index
              const active = activeIndex === index && job?.status !== 'completed'
              return (
                <li className={`${complete ? 'complete' : ''} ${active ? 'active' : ''}`} key={stage.id}>
                  <div className="stage-marker">{complete ? '✓' : String(index + 1).padStart(2, '0')}</div>
                  <div>
                    <span>{stage.owner}</span>
                    <b>{stage.label}</b>
                    {active && <p>{job?.events.at(-1)?.message}</p>}
                  </div>
                  <time>{complete ? 'DONE' : active ? 'NOW' : 'NEXT'}</time>
                </li>
              )
            })}
          </ol>

          {!job && <div className="empty-state"><div className="reel-mark">◉</div><p>The crew appears here as soon as the brief lands.</p></div>}
          {job?.status === 'failed' && <div className="failure-state"><b>PRODUCTION STOPPED</b><p>{job.error}</p><button type="button" onClick={retry}>Retry with preserved context</button></div>}
          {job?.status === 'completed' && (
            <div className="delivery">
              <div className="delivery-title"><span>LOCAL MVP / 001</span><b>Pipeline preview ready.</b></div>
              {job.artifacts.video && <video controls playsInline src={artifactHref(job.artifacts.video)} />}
              <div className="artifact-links">
                <a href={artifactHref(job.artifacts.video)} target="_blank">MP4 <span>↗</span></a>
                <a href={artifactHref(job.artifacts.styleBrief)} target="_blank">Style brief <span>↗</span></a>
                <a href={artifactHref(job.artifacts.script)} target="_blank">Script <span>↗</span></a>
                <a href={artifactHref(job.artifacts.breakdown)} target="_blank">Breakdown <span>↗</span></a>
              </div>
            </div>
          )}
        </section>
      </section>

      <section className="method">
        <p className="eyebrow">THE HANDOFF CHAIN</p>
        <div className="method-line">
          <span><b>01</b> Identify the product</span><i>→</i>
          <span><b>02</b> Deconstruct the taste</span><i>→</i>
          <span><b>03</b> Write to the beats</span><i>→</i>
          <span><b>04</b> Render a title-card preview</span>
        </div>
        <p className="legal-note">We transfer structure, timing, and motion grammar. We never reuse the reference footage, audio, copy, or brand assets.</p>
      </section>
    </main>
  )
}

export default App
