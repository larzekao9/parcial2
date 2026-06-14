import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { TfOfflineService } from './tf-offline.service';

export interface PriorityTramite { id: string; code: string; title: string; status: string; elapsedHours: number; expectedHours: number; urgencyScore: number; urgencyLevel: string; rank: number; }
export interface PriorityResult { workflowId: string; workflowName: string; trainedOn: number; total: number; ranked: PriorityTramite[]; }

export interface AnomalyTramite { id: string; code: string; title: string; workflowName: string; currentNodoName?: string; status: string; elapsedHours: number; expectedHours: number; anomalyScore: number; reconstructionError: number; threshold: number; isAnomaly: boolean; mainFactor: string; factorDetail?: string; }
export interface AnomalyResult { workflowId: string; workflowName: string; trainedOn: number; threshold: number; total: number; totalAnomalies: number; anomalies: AnomalyTramite[]; normal: AnomalyTramite[]; }

export interface BottleneckNode { nodoId: string; nodoName: string; order: number; avgMinutes: number; score: number; isBottleneck: boolean; historicalOvertime: number; visits: number; }
export interface BottleneckResult { workflowId: string; workflowName: string; bottlenecks: BottleneckNode[]; allNodes: BottleneckNode[]; }

export interface DelayResult { workflowId: string; workflowName: string; available: boolean; delayProbability: number; riskLevel: string; extraHoursEstimated: number; totalExpectedHours: number; numNodos: number; historicalDelayRate: number; message?: string; }

@Injectable({ providedIn: 'root' })
export class WorkflowTfAnalysisService {
  private api = inject(ApiService);
  private tfOffline = inject(TfOfflineService);

  async runPriorityAnalysis(workflowId: string): Promise<{ result: PriorityResult | null; offline: boolean }> {
    try {
      const result = await firstValueFrom(
        this.api.post<PriorityResult>(`/workflow-ai/nlp/rank-priority-real/${workflowId}`, {})
      );
      return { result, offline: false };
    } catch {
      const result = this.tfOffline.rankPriorityOffline(workflowId);
      return { result: result ?? null, offline: !!result };
    }
  }

  async runAnomalyAnalysis(workflowId: string): Promise<{ result: AnomalyResult | null; offline: boolean }> {
    try {
      const result = await firstValueFrom(
        this.api.post<AnomalyResult>(`/workflow-ai/nlp/detect-anomalies/${workflowId}`, {})
      );
      return { result, offline: false };
    } catch {
      const result = await this.tfOffline.detectAnomaliesOffline(workflowId);
      return { result: result ?? null, offline: !!result };
    }
  }

  async runBottleneckAnalysis(workflowId: string): Promise<{ result: BottleneckResult | null; offline: boolean }> {
    try {
      const result = await firstValueFrom(
        this.api.get<BottleneckResult>(`/workflow-ai/nlp/predict-bottleneck/${workflowId}`)
      );
      return { result, offline: false };
    } catch {
      const result = await this.tfOffline.predictBottleneckOffline(workflowId);
      return { result: result ?? null, offline: !!result };
    }
  }

  async runDelayAnalysis(workflowId: string): Promise<{ result: DelayResult | null; offline: boolean }> {
    try {
      const result = await firstValueFrom(
        this.api.get<DelayResult>(`/workflow-ai/nlp/predict-delay/${workflowId}`)
      );
      return { result, offline: false };
    } catch {
      const result = await this.tfOffline.predictDelayOffline(workflowId);
      return { result: result ?? null, offline: !!result };
    }
  }
}
