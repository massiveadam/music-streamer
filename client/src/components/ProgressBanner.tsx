import { SERVER_URL, getServerUrl } from '../config';
import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import axios from 'axios';


interface EnrichmentStatus {
    isEnriching: boolean;
    total: number;
    processed: number;
    currentTrack: string | null;
    albumsTotal?: number;
    albumsProcessed?: number;
    mode?: string;
}

interface AnalysisStatus {
    status: string;
    total: number;
    completed: number;
    percentComplete: number;
    current?: string;
}

export default function ProgressBanner() {
    const [enrichment, setEnrichment] = useState<EnrichmentStatus | null>(null);
    const [analysis, setAnalysis] = useState<AnalysisStatus | null>(null);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        const poll = async () => {
            // Poll enrichment status
            try {
                const enrichRes = await axios.get(`${getServerUrl()}/api/enrich/status`);
                setEnrichment(enrichRes.data);
            } catch (e) {
                // Ignore enrichment errors
            }

            // Poll analysis status separately to avoid one failure breaking the other
            try {
                const analysisRes = await axios.get(`${getServerUrl()}/api/admin/analysis-status`);
                setAnalysis(analysisRes.data);
            } catch (e) {
                // Ignore analysis errors
            }
        };

        poll();
        const interval = setInterval(poll, 3000);
        return () => clearInterval(interval);
    }, []);

    const isRunning = enrichment?.isEnriching || analysis?.status === 'running';

    if (!isRunning || dismissed) return null;

    const enrichPercent = enrichment?.isEnriching && enrichment.total > 0
        ? Math.round((enrichment.processed / enrichment.total) * 100)
        : 0;

    const analysisPercent = analysis?.status === 'running' ? analysis.percentComplete : 0;

    return (
        <div className="bg-app-surface border-b border-app-bg px-4 py-2 flex items-center gap-4">
            <RefreshCw size={16} className="text-app-accent animate-spin shrink-0" />

            <div className="flex-1 min-w-0">
                {enrichment?.isEnriching && (
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-app-text-muted shrink-0">Enriching:</span>
                        <div className="flex-1 bg-app-bg rounded-full h-2 overflow-hidden max-w-xs">
                            <div
                                className="bg-app-accent h-full transition-all duration-300"
                                style={{ width: `${enrichPercent}%` }}
                            />
                        </div>
                        <span className="text-xs text-app-text-muted shrink-0">
                            {enrichment.processed}/{enrichment.total} ({enrichPercent}%)
                        </span>
                        {enrichment.currentTrack && (
                            <span className="text-xs text-app-text truncate max-w-[200px]">
                                {enrichment.currentTrack}
                            </span>
                        )}
                    </div>
                )}

                {analysis?.status === 'running' && (
                    <div className="flex items-center gap-3 mt-1">
                        <span className="text-sm text-app-text-muted shrink-0">Analyzing:</span>
                        <div className="flex-1 bg-app-bg rounded-full h-2 overflow-hidden max-w-xs">
                            <div
                                className="bg-app-accent h-full transition-all duration-300"
                                style={{ width: `${analysisPercent}%` }}
                            />
                        </div>
                        <span className="text-xs text-app-text-muted shrink-0">
                            {analysis.completed}/{analysis.total} ({analysisPercent}%)
                        </span>
                    </div>
                )}
            </div>

            <button
                onClick={() => setDismissed(true)}
                className="text-app-text-muted hover:text-app-text transition-colors shrink-0"
            >
                <X size={16} />
            </button>
        </div>
    );
}
