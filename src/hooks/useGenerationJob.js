import { useEffect, useState } from 'react'
import { getJobStatus } from '../services/generation'
export default function useGenerationJob(jobId) { const [job, setJob] = useState(null); useEffect(() => { if (!jobId) return undefined; let active = true; const poll = async () => { const next = await getJobStatus(jobId); if (active) setJob(next) }; poll(); const timer = window.setInterval(poll, 2000); return () => { active = false; window.clearInterval(timer) } }, [jobId]); return job }
