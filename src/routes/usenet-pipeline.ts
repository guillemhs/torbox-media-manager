import type { RequestHandler } from 'express';
import { buildUsenetPipeline, UsenetPipeline } from '../services/usenet-pipeline';
import { sendError, pagination } from './routeUtils';

let pipelineInstance: UsenetPipeline | undefined;

function getPipeline(): UsenetPipeline {
  if (!pipelineInstance) {
    pipelineInstance = buildUsenetPipeline();
  }
  return pipelineInstance;
}

/** POST /usenet/pipeline/search - Search NZBGeek for candidates. */
export const usenetPipelineSearchRoute: RequestHandler = async (req, res) => {
  const scalar = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;
  const query = scalar(req.body?.q)?.trim() || '';
  if (query.length < 2 || query.length > 180) {
    return res.status(400).json({ error: 'Search query must be between 2 and 180 characters.' });
  }

  try {
    const pipeline = getPipeline();
    const { results, total } = await pipeline.searchNzbgeek(query, {
      category: scalar(req.body?.category),
      limit: Number(req.body?.limit ?? 20),
      offset: Number(req.body?.offset ?? 0),
    });
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json({ query, total, results });
  } catch (error) {
    return sendError(res, error);
  }
};

/** POST /usenet/pipeline/run - Run the full pipeline for a query. */
export const usenetPipelineRunRoute: RequestHandler = async (req, res) => {
  const scalar = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;
  const query = scalar(req.body?.q)?.trim() || '';
  if (query.length < 2 || query.length > 180) {
    return res.status(400).json({ error: 'Search query must be between 2 and 180 characters.' });
  }

  try {
    const pipeline = getPipeline();
    const job = await pipeline.runFullPipeline(query, {
      category: scalar(req.body?.category),
      nzbId: scalar(req.body?.nzbId),
      fileName: scalar(req.body?.fileName),
    });
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ job });
  } catch (error) {
    return sendError(res, error);
  }
};

/** GET /usenet/pipeline/status/:jobId - Get job status and logs. */
export const usenetPipelineStatusRoute: RequestHandler = async (req, res) => {
  const jobId = req.params.jobId;
  if (!/^usenet-[\w-]+$/.test(jobId)) {
    return res.status(400).json({ error: 'Invalid job ID.' });
  }

  try {
    const pipeline = getPipeline();
    const job = pipeline.getJobStatus(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found.' });
    }
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json({ job });
  } catch (error) {
    return sendError(res, error);
  }
};

/** GET /usenet/pipeline/jobs - List all pipeline jobs. */
export const usenetPipelineJobsRoute: RequestHandler = async (_req, res) => {
  try {
    const pipeline = getPipeline();
    const jobs = pipeline.listJobs();
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json({ jobs });
  } catch (error) {
    return sendError(res, error);
  }
};

/** POST /usenet/pipeline/cleanup/:jobId - Force cleanup of local files for a job. */
export const usenetPipelineCleanupRoute: RequestHandler = async (req, res) => {
  const jobId = req.params.jobId;
  if (!/^usenet-[\w-]+$/.test(jobId)) {
    return res.status(400).json({ error: 'Invalid job ID.' });
  }

  try {
    const pipeline = getPipeline();
    const job = pipeline.getJobStatus(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found.' });
    }
    await pipeline.cleanup(jobId);
    const updated = pipeline.getJobStatus(jobId);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json({ job: updated });
  } catch (error) {
    return sendError(res, error);
  }
};
