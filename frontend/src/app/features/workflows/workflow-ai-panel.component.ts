import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, SimpleChanges, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { TfOfflineService } from '../../core/services/tf-offline.service';

type NodeType = 'inicio' | 'proceso' | 'decision' | 'bifurcasion' | 'union' | 'fin' | 'iteracion';
type FieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'FILE' | 'EMAIL' | 'CHECKBOX' | 'GRID';
type SidebarTab = 'inspector' | 'diagram-ai' | 'worky' | 'bottleneck';

interface GridColumn {
  id: string;
  name: string;
  type: Exclude<FieldType, 'FILE' | 'GRID'>;
  order: number;
}

interface ForwardConfig {
  mode?: 'selected' | 'none' | 'all' | 'files-only';
  fieldNames?: string[];
  includeFiles?: boolean;
}

interface Nodo {
  id: string;
  workflowId: string;
  name: string;
  description?: string;
  order: number;
  nodeType?: string;
  responsibleDepartmentId?: string;
  responsibleDepartmentName?: string;
  responsibleJobRoleId?: string;
  requiresForm: boolean;
  avgMinutes: number;
  condition?: string;
  trueLabel?: string;
  falseLabel?: string;
  posX?: number;
  posY?: number;
  formDefinition?: {
    title: string;
    fields: Array<{
      id: string;
      name: string;
      type: FieldType;
      columns?: GridColumn[];
      options?: string[];
      isRequired?: boolean;
      order: number;
    }>;
  };
}

interface Transition {
  id: string;
  workflowId: string;
  fromNodoId: string;
  toNodoId: string;
  name?: string;
  condition?: string;
  forwardConfig?: ForwardConfig;
}

interface Department {
  id: string;
  companyId?: string;
  name: string;
}

interface JobRole {
  id: string;
  companyId?: string;
  departmentId: string;
  name: string;
}

interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface DiagramAiAction {
  type: 'create_nodo' | 'update_nodo' | 'delete_nodo' | 'connect_nodo' | 'disconnect_nodo' | 'create_department' | 'create_job_role' | 'show_diagram';
  placeholderId?: string;
  nodoId?: string;
  transitionId?: string;
  fromNodoId?: string;
  toNodoId?: string;
  departmentName?: string | null;
  name?: string;
  description?: string;
  nodeType?: NodeType;
  order?: number;
  responsibleDepartmentName?: string | null;
  responsibleJobRoleName?: string | null;
  requiresForm?: boolean;
  formDefinition?: {
    title?: string;
    fields?: Array<{
      id?: string;
      name?: string;
      type?: FieldType;
      columns?: Array<{
        id?: string;
        name?: string;
        type?: Exclude<FieldType, 'FILE' | 'GRID'>;
        order?: number;
      }>;
      required?: boolean;
      order?: number;
    }>;
  } | null;
  trueLabel?: string;
  falseLabel?: string;
  avgMinutes?: number;
  posX?: number;
  posY?: number;
  forwardConfig?: ForwardConfig;
}

interface DiagramAiResult {
  interpretation?: string;
  changes?: string;
  actions: DiagramAiAction[];
}

interface FormVoiceDesignResult {
  targetNodoId: string;
  requiresForm: boolean;
  formDefinition?: {
    title?: string;
    fields?: Array<{
      id?: string;
      name?: string;
      type?: FieldType;
      columns?: Array<{
        id?: string;
        name?: string;
        type?: Exclude<FieldType, 'FILE' | 'GRID'>;
        order?: number;
      }>;
      isRequired?: boolean;
      required?: boolean;
      order?: number;
    }>;
  } | null;
  changes?: string;
  warnings?: string[];
  patches?: FormVoiceDesignResult[];
}

interface WorkySuggestion {
  title: string;
  reason: string;
  actions: DiagramAiAction[];
}

interface WorkyResult {
  assistantName?: string;
  summary?: string;
  suggestions: WorkySuggestion[];
}

interface BottleneckItem {
  nodoName?: string;
  nodoId?: string;
  type?: string;
  severity?: string;
  reason?: string;
  recommendation?: string;
  TiempoEsperaMinutes?: number;
  TiempoPromedioActividadEnNodoMinutes?: number;
  activeCount?: number;
  completedSamples?: number;
  avgMinutesTarget?: number;
}

interface BottleneckKpi {
  id: string;
  label: string;
  averageMinutes: number;
  displayValue: string;
  sampleSize: number;
  formula: string;
  sourceFields: string[];
  description?: string;
}

interface BottleneckNodeMetric {
  nodoId: string;
  nodoName: string;
  avgMinutesTarget: number;
  activeCount: number;
  completedSamples: number;
  TiempoEsperaMinutes: number;
  TiempoEsperaDisplay: string;
  TiempoPromedioActividadEnNodoMinutes: number;
  TiempoPromedioActividadEnNodoDisplay: string;
}

interface BottleneckResult {
  summary?: string;
  kpis?: BottleneckKpi[];
  nodeMetrics?: BottleneckNodeMetric[];
  bottlenecks: BottleneckItem[];
  parallelizationOpportunities: string[];
}


@Component({
  selector: 'app-workflow-ai-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './workflow-ai-panel.component.html',
})
export class WorkflowAiPanelComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) activeTab!: SidebarTab;
  @Input() workflowId = '';
  @Input() workflowName = '';
  @Input() nodo: Nodo[] = [];
  @Input() transitions: Transition[] = [];
  @Input() departments: Department[] = [];
  @Input() jobRoles: JobRole[] = [];
  @Input() selectedNodo: Nodo | null = null;
  @Input({ required: true }) applyAiActions!: (actions: DiagramAiAction[]) => Promise<void>;
  @Input() applyVoiceFormPatch?: (result: FormVoiceDesignResult) => Promise<void>;
  @Input() onError?: (message: string) => void;

  private api = inject(ApiService);
  private tfOffline = inject(TfOfflineService);
  private workyRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  diagramBusy = signal(false);
  diagramResult = signal<DiagramAiResult | null>(null);
  workyLoading = signal(false);
  workyResult = signal<WorkyResult | null>(null);
  workyChat = signal<AiChatMessage[]>([]);
  bottleneckLoading = signal(false);
  bottleneckResult = signal<BottleneckResult | null>(null);
  diagramVoiceListening = signal(false);
  diagramVoiceProcessing = signal(false);
  diagramVoiceTranscript = signal('');
  diagramPrompt = '';
  workyPrompt = '';
  private aiHistory: AiChatMessage[] = [];
  private workyHistory: AiChatMessage[] = [];
  private speechRecognition: any = null;
  private shouldExecuteVoiceCommand = false;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnChanges(changes: SimpleChanges) {
    if (this.activeTab === 'worky' && (changes['activeTab'] || changes['nodo'] || changes['transitions'] || changes['departments'] || changes['jobRoles'])) {
      this.queueWorkyRefresh();
    }
  }

  ngOnDestroy() {
    this.stopDiagramVoiceCapture();
    if (this.workyRefreshTimer) {
      clearTimeout(this.workyRefreshTimer);
    }
  }

  async runDiagramCommand() {
    const command = this.diagramPrompt.trim();
    if (!command || this.diagramBusy()) return;
    await this.executeAiCommand(command, false);
  }

  private async executeAiCommand(command: string, fromVoice: boolean) {
    if (this.looksLikeFormIntent(command)) {
      await this.executeFormVoiceCommand(command);
      return;
    }
    await this.executeDiagramCommand(command, fromVoice ? '/workflow-ai/diagramaporvoz' : '/workflow-ai/diagramaporcomand');
  }

  private async executeDiagramCommand(command: string, endpoint: string) {
    this.diagramBusy.set(true);
    try {
      const result = await firstValueFrom(this.api.post<DiagramAiResult>(endpoint, {
        ...this.aiContextPayload(),
        command,
        history: this.aiHistory
      }));
      this.diagramResult.set(result);
      this.aiHistory = [
        ...this.aiHistory,
        { role: 'user' as const, content: command },
        { role: 'assistant' as const, content: result.changes || result.interpretation || 'Sin cambios' }
      ].slice(-8);
      if (result.actions.length) {
        await this.applyAiActions(result.actions);
        this.queueWorkyRefresh();
      }
      this.diagramPrompt = '';
    } catch (err: any) {
      this.handleError(err?.error?.message || err?.message || 'No se pudo ejecutar la IA del diagrama');
    } finally {
      this.diagramBusy.set(false);
    }
  }

  private async executeFormVoiceCommand(command: string) {
    if (!this.applyVoiceFormPatch) {
      this.handleError('No hay manejador para aplicar cambios de formulario');
      return;
    }
    this.diagramBusy.set(true);
    try {
      const result = await firstValueFrom(this.api.post<FormVoiceDesignResult>('/workflow-ai/formularioporvoz', {
        ...this.aiContextPayload(),
        transcript: command,
        selectedNodo: this.selectedNodo
      }));
      const patches = result.patches?.length ? result.patches : [result];
      if (result.warnings?.length && !patches.some(item => item.targetNodoId)) {
        this.diagramResult.set({
          interpretation: 'No se aplicaron cambios al formulario',
          changes: result.warnings.join(' | '),
          actions: []
        });
        return;
      }
      for (const patch of patches) {
        if (!patch.targetNodoId) continue;
        await this.applyVoiceFormPatch(patch);
      }
      const warnings = result.warnings?.length ? ` Advertencias: ${result.warnings.join(' | ')}` : '';
      this.diagramResult.set({
        interpretation: patches.length > 1
          ? `Formularios actualizados en ${patches.filter(item => item.targetNodoId).length} nodo(s)`
          : `Formulario actualizado en ${this.resolveNodoName(result.targetNodoId)}`,
        changes: `${result.changes || 'Cambios aplicados al formulario.'}${warnings}`,
        actions: []
      });
      this.queueWorkyRefresh();
      this.diagramPrompt = '';
    } catch (err: any) {
      this.handleError(err?.error?.message || err?.message || 'No se pudo editar el formulario por voz');
    } finally {
      this.diagramBusy.set(false);
    }
  }

  async applyWorkySuggestion(suggestion: WorkySuggestion) {
    if (!suggestion.actions.length || this.diagramBusy()) return;
    this.diagramBusy.set(true);
    try {
      await this.applyAiActions(suggestion.actions);
      this.queueWorkyRefresh();
    } catch (err: any) {
      this.handleError(err?.error?.message || err?.message || 'No se pudo aplicar la sugerencia');
    } finally {
      this.diagramBusy.set(false);
    }
  }

  async sendWorkyMessage() {
    const command = this.workyPrompt.trim();
    if (!command || this.workyLoading() || !this.workflowId) return;
    this.workyLoading.set(true);
    try {
      const result = await firstValueFrom(this.api.post<WorkyResult>('/workflow-ai/sugerenciaworky', {
        ...this.aiContextPayload(),
        command,
        history: this.workyHistory
      }));
      this.workyResult.set(result);
      const assistantReply = result.summary || 'Sin respuesta';
      this.workyHistory = [
        ...this.workyHistory,
        { role: 'user' as const, content: command },
        { role: 'assistant' as const, content: assistantReply }
      ].slice(-12);
      this.workyChat.set(this.workyHistory);
      this.workyPrompt = '';
    } catch (err: any) {
      this.handleError(err?.error?.message || err?.message || 'No se pudo consultar a Worky');
    } finally {
      this.workyLoading.set(false);
    }
  }

  async runBottleneckAnalysis() {
    if (this.bottleneckLoading()) return;
    this.bottleneckLoading.set(true);
    try {
      const result = await firstValueFrom(this.api.post<BottleneckResult>('/workflow-ai/detectcuellodebotella', {
        workflowId: this.workflowId,
        workflowName: this.workflowName,
        nodo: this.nodo,
        transitions: this.transitions
      }));
      this.bottleneckResult.set(result);
    } catch (err: any) {
      if (this.workflowId) {
        const offline = await this.tfOffline.predictBottleneckOffline(this.workflowId);
        if (offline) {
          this.bottleneckResult.set(offline);
          return;
        }
      }
      this.handleError(err?.error?.message || err?.message || 'No se pudo analizar el workflow');
    } finally {
      this.bottleneckLoading.set(false);
    }
  }

  groupedRoleMetrics() {
    const metrics = this.bottleneckResult()?.nodeMetrics ?? [];
    const map = new Map<string, {
      key: string; deptName: string; roleName: string;
      esperas: number[]; enNodos: number[]; totalActivas: number; totalMuestras: number; targets: number[];
    }>();
    for (const metric of metrics) {
      const n = this.nodo.find(item => item.id === metric.nodoId);
      if (!n) continue;
      const dept = n.responsibleDepartmentName || this.departments.find(d => d.id === n.responsibleDepartmentId)?.name || '';
      const role = this.jobRoles.find(r => r.id === n.responsibleJobRoleId)?.name || '';
      if (!dept && !role) continue;
      const key = `${dept}::${role}`;
      if (!map.has(key)) map.set(key, { key, deptName: dept, roleName: role, esperas: [], enNodos: [], totalActivas: 0, totalMuestras: 0, targets: [] });
      const g = map.get(key)!;
      g.esperas.push(metric.TiempoEsperaMinutes);
      g.enNodos.push(metric.TiempoPromedioActividadEnNodoMinutes);
      g.totalActivas += metric.activeCount;
      g.totalMuestras += metric.completedSamples;
      g.targets.push(metric.avgMinutesTarget);
    }
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    return [...map.values()].map(g => ({
      key: g.key, deptName: g.deptName, roleName: g.roleName,
      avgEspera: avg(g.esperas), avgEnNodo: avg(g.enNodos),
      totalActivas: g.totalActivas, totalMuestras: g.totalMuestras,
      avgTarget: avg(g.targets)
    }));
  }

  nodoMeta(nodoId: string): { dept: string; role: string } | null {
    const n = this.nodo.find(item => item.id === nodoId);
    if (!n) return null;
    const dept = n.responsibleDepartmentName || this.departments.find(d => d.id === n.responsibleDepartmentId)?.name || '';
    const role = this.jobRoles.find(r => r.id === n.responsibleJobRoleId)?.name || '';
    return (dept || role) ? { dept, role } : null;
  }

  bottleneckSuggestions(): string[] {
    const result = this.bottleneckResult();
    if (!result) return [];
    const fromBottlenecks = (result.bottlenecks ?? [])
      .map(b => b.recommendation)
      .filter((r): r is string => !!r);
    const fromParallelization = result.parallelizationOpportunities ?? [];
    return [...fromBottlenecks, ...fromParallelization];
  }

  describeAiAction(action: DiagramAiAction) {
    switch (action.type) {
      case 'create_department': return `Crear departamento ${action.name || 'nuevo'}`;
      case 'create_job_role': return `Crear rol ${action.name || 'nuevo'} en ${action.departmentName || action.responsibleDepartmentName || 'departamento'}`;
      case 'create_nodo': return `Crear nodo ${action.name || 'nuevo'} (${action.nodeType || 'proceso'})`;
      case 'update_nodo': return `Actualizar nodo ${action.nodoId || ''}`;
      case 'delete_nodo': return `Eliminar nodo ${action.nodoId || ''}`;
      case 'connect_nodo': return `Conectar ${action.fromNodoId || ''} -> ${action.toNodoId || ''}`;
      case 'disconnect_nodo': return `Eliminar conexion ${action.transitionId || ''}`;
      default: return 'Mostrar diagrama';
    }
  }

  toggleDiagramVoiceCapture() {
    if (this.diagramVoiceListening()) {
      this.stopDiagramVoiceCapture(true);
      return;
    }
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      this.handleError('Tu navegador no soporta reconocimiento de voz');
      return;
    }
    this.shouldExecuteVoiceCommand = false;
    this.speechRecognition = new SpeechRecognitionCtor();
    this.speechRecognition.lang = 'es-ES';
    this.speechRecognition.continuous = true;
    this.speechRecognition.interimResults = true;
    this.speechRecognition.onstart = () => {
      this.diagramVoiceListening.set(true);
      this.diagramVoiceTranscript.set('');
      this.clearSilenceTimer();
    };
    this.speechRecognition.onerror = () => {
      this.diagramVoiceListening.set(false);
      this.diagramVoiceProcessing.set(false);
      this.shouldExecuteVoiceCommand = false;
      this.clearSilenceTimer();
      this.handleError('No se pudo capturar la voz');
    };
    this.speechRecognition.onend = async () => {
      this.clearSilenceTimer();
      this.diagramVoiceListening.set(false);
      const shouldExecute = this.shouldExecuteVoiceCommand;
      this.shouldExecuteVoiceCommand = false;
      if (!shouldExecute) {
        return;
      }
      const transcript = this.diagramVoiceTranscript().trim();
      if (!transcript) {
        this.diagramVoiceProcessing.set(false);
        this.handleError('No se detecto ningun comando de voz');
        return;
      }
      this.diagramPrompt = transcript;
      try {
        await this.executeAiCommand(transcript, true);
      } finally {
        this.diagramVoiceProcessing.set(false);
      }
    };
    this.speechRecognition.onresult = (event: any) => {
      const transcript = Array.from(event.results ?? [])
        .map((result: any) => result?.[0]?.transcript || '')
        .join(' ')
        .trim();
      if (!transcript) return;
      this.diagramVoiceTranscript.set(transcript);
      this.restartSilenceTimer();
    };
    this.speechRecognition.start();
  }

  toggleFormVoiceCapture() {
    if (this.diagramVoiceListening()) {
      this.stopFormVoiceCapture(true);
      return;
    }
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      this.handleError('Tu navegador no soporta reconocimiento de voz');
      return;
    }
    this.shouldExecuteVoiceCommand = false;
    this.speechRecognition = new SpeechRecognitionCtor();
    this.speechRecognition.lang = 'es-ES';
    this.speechRecognition.continuous = true;
    this.speechRecognition.interimResults = true;
    this.speechRecognition.onstart = () => {
      this.diagramVoiceListening.set(true);
      this.diagramVoiceTranscript.set('');
      this.clearSilenceTimer();
    };
    this.speechRecognition.onerror = () => {
      this.diagramVoiceListening.set(false);
      this.diagramVoiceProcessing.set(false);
      this.shouldExecuteVoiceCommand = false;
      this.clearSilenceTimer();
      this.handleError('No se pudo capturar la voz');
    };
    this.speechRecognition.onend = async () => {
      this.clearSilenceTimer();
      this.diagramVoiceListening.set(false);
      const shouldExecute = this.shouldExecuteVoiceCommand;
      this.shouldExecuteVoiceCommand = false;
      if (!shouldExecute) {
        return;
      }
      const transcript = this.diagramVoiceTranscript().trim();
      if (!transcript) {
        this.diagramVoiceProcessing.set(false);
        this.handleError('No se detecto ningun comando de voz');
        return;
      }
      try {
        await this.executeFormVoiceCommand(transcript);
      } finally {
        this.diagramVoiceProcessing.set(false);
      }
    };
    this.speechRecognition.onresult = (event: any) => {
      const transcript = Array.from(event.results ?? [])
        .map((result: any) => result?.[0]?.transcript || '')
        .join(' ')
        .trim();
      if (!transcript) return;
      this.diagramVoiceTranscript.set(transcript);
      this.restartFormSilenceTimer();
    };
    this.speechRecognition.start();
  }

  isFormVoiceListening() {
    return this.diagramVoiceListening();
  }

  isFormVoiceBusy() {
    return this.diagramVoiceProcessing() || this.diagramBusy();
  }

  private queueWorkyRefresh() {
    if (this.workyRefreshTimer) {
      clearTimeout(this.workyRefreshTimer);
    }
    this.workyRefreshTimer = setTimeout(() => void this.refreshWorkySuggestions(), 1200);
  }

  async refreshWorkySuggestions() {
    if (!this.workflowId || this.workyLoading()) return;
    this.workyLoading.set(true);
    try {
      const result = await firstValueFrom(this.api.post<WorkyResult>('/workflow-ai/sugerenciaworky', {
        ...this.aiContextPayload(),
        history: this.workyHistory
      }));
      this.workyResult.set(result);
    } catch {
      this.workyResult.set(null);
    } finally {
      this.workyLoading.set(false);
    }
  }

  private aiContextPayload() {
    return {
      workflowId: this.workflowId,
      workflowName: this.workflowName,
      companyId: this.departments[0]?.companyId || null,
      nodo: this.nodo,
      transitions: this.transitions,
      departments: this.departments,
      jobRoles: this.jobRoles,
      selectedNodo: this.selectedNodo
    };
  }

  private looksLikeFormCommand(command: string) {
    const normalized = command.trim().toLowerCase();
    return /formulario|campo|grilla|grid|checkbox|check|obligatorio|required|requerido|columna|titulo del formulario|título del formulario/.test(normalized);
  }

  private looksLikeFormIntent(command: string) {
    const normalized = command.trim().toLowerCase();
    return /formulario|campo|campos|grilla|grid|tabla|checkbox|check|obligatorio|required|requerido|mandatorio|columna|columnas|tipo fecha|tipo grilla|tipo grid|tipo texto|tipo numero|tipo correo|tipo email|tipo archivo|primera columna|segunda columna|tercera columna|cuarta columna|titulo del formulario|t[íi]tulo del formulario|agrega.+campo|anade.+campo|añade.+campo/.test(normalized);
  }

  private resolveNodoName(nodoId: string) {
    return this.nodo.find(item => item.id === nodoId)?.name || nodoId || 'nodo';
  }

  private handleError(message: string) {
    this.onError?.(message);
  }

  private stopDiagramVoiceCapture(executeCommand = false) {
    this.shouldExecuteVoiceCommand = executeCommand;
    if (executeCommand) {
      this.diagramVoiceProcessing.set(true);
    }
    this.clearSilenceTimer();
    if (this.speechRecognition) {
      this.speechRecognition.stop();
      this.speechRecognition = null;
      return;
    }
    this.diagramVoiceListening.set(false);
    if (executeCommand) {
      this.diagramVoiceProcessing.set(false);
    }
  }

  private stopFormVoiceCapture(executeCommand = false) {
    this.shouldExecuteVoiceCommand = executeCommand;
    if (executeCommand) {
      this.diagramVoiceProcessing.set(true);
    }
    this.clearSilenceTimer();
    if (this.speechRecognition) {
      this.speechRecognition.stop();
      this.speechRecognition = null;
      return;
    }
    this.diagramVoiceListening.set(false);
    if (executeCommand) {
      this.diagramVoiceProcessing.set(false);
    }
  }

  private restartSilenceTimer() {
    this.clearSilenceTimer();
    this.silenceTimer = setTimeout(() => {
      if (this.diagramVoiceListening()) {
        this.stopDiagramVoiceCapture(true);
      }
    }, 4000);
  }

  private restartFormSilenceTimer() {
    this.clearSilenceTimer();
    this.silenceTimer = setTimeout(() => {
      if (this.diagramVoiceListening()) {
        this.stopFormVoiceCapture(true);
      }
    }, 4000);
  }

  private clearSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  formatMinutes(value: number | null | undefined) {
    const minutes = Number(value ?? 0);
    if (!minutes || minutes <= 0) return '0 min';
    if (minutes >= 1440) return `${Math.round((minutes / 1440) * 100) / 100} d`;
    if (minutes >= 60) return `${Math.round((minutes / 60) * 100) / 100} h`;
    return `${Math.round(minutes * 100) / 100} min`;
  }
}



