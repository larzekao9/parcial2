import { CdkDragEnd, DragDropModule } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { TfOfflineService } from '../../core/services/tf-offline.service';
import { WorkflowTfAnalysisService, PriorityResult, PriorityTramite, AnomalyResult, AnomalyTramite, BottleneckResult, BottleneckNode, DelayResult } from '../../core/services/workflow-tf-analysis.service';
import { WorkflowAiPanelComponent } from './workflow-ai-panel.component';
import { NodeBehaviorResolver } from './utils/node-behavior-resolver';
import { autoLayoutWorkflowNodos } from './utils/workflow-layout.utils';
import {
  CollaborativeWorkflowNodo,
  CollaborativeWorkflowTransition,
  WorkflowCollaborationService,
  WorkflowNodoLock
} from '../../core/services/workflow-collaboration.service';

type NodeType = 'inicio' | 'proceso' | 'decision' | 'bifurcasion' | 'union' | 'fin' | 'iteracion';
type FieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'FILE' | 'EMAIL' | 'CHECKBOX' | 'GRID';
type GridColumnType = 'TEXT' | 'NUMBER' | 'DATE' | 'EMAIL' | 'CHECKBOX';
type ForwardMode = 'selected' | 'none' | 'all' | 'files-only';

interface Workflow {
  id: string;
  name: string;
  description?: string;
  companyId?: string;
  companyName?: string;
  nodo: Nodo[];
  transitions: Transition[];
}

interface FormField {
  id: string;
  name: string;
  type: FieldType;
  columns?: GridColumn[];
  options?: string[];
  isRequired?: boolean;
  order: number;
}

interface GridColumn {
  id: string;
  name: string;
  type: GridColumnType;
  order: number;
}

interface FormDefinition {
  id?: string;
  title: string;
  fields: FormField[];
}

interface DocumentPermission {
  departmentId: string;
  canCreate: boolean;
  canRead: boolean;
  canEdit: boolean;
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
  documentPermissions?: DocumentPermission[];
  formDefinition?: FormDefinition;
}

interface ForwardConfig {
  mode?: ForwardMode;
  fieldNames?: string[];
  includeFiles?: boolean;
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

interface DepartmentLane {
  id: string;
  name: string;
  leftPercent: number;
  widthPercent: number;
  tintClass: string;
  borderClass: string;
}

interface NodoForm {
  name: string;
  description: string;
  nodeType: NodeType;
  responsibleDepartmentId: string;
  responsibleJobRoleId: string;
  avgMinutes: number;
  trueLabel: string;
  falseLabel: string;
  condition: string;
  requiresForm: boolean;
  documentPermissions: DocumentPermission[];
  formTitle: string;
  formFields: FormField[];
}

interface TransitionForm {
  mode: ForwardMode;
  fieldNames: string[];
  includeFiles: boolean;
}

interface ResolvedNodoField extends FormField {
  originNodoId: string;
  originNodoName: string;
}

type SidebarTab = 'inspector' | 'priority' | 'anomaly' | 'bottleneck' | 'delay';


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
        type?: GridColumnType;
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
        type?: GridColumnType;
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

@Component({
  selector: 'app-workflow-editor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSnackBarModule,
    WorkflowAiPanelComponent
  ],
  templateUrl: './workflow-editor.component.html',
})
export class WorkflowEditorComponent implements OnInit, OnDestroy {
  @ViewChild('canvas') canvas?: ElementRef<HTMLDivElement>;
  @ViewChild('formVoiceAssistant') formVoiceAssistant?: WorkflowAiPanelComponent;

  private paletteDragMimeType = 'application/x-workflow-node';
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ApiService);
  private snack = inject(MatSnackBar);
  private collab = inject(WorkflowCollaborationService);
  private tfOffline = inject(TfOfflineService);
  private tfAnalysis = inject(WorkflowTfAnalysisService);
  private nodeBehaviorResolver = new NodeBehaviorResolver();

  readonly fieldTypes: FieldType[] = ['TEXT', 'NUMBER', 'DATE', 'FILE', 'EMAIL', 'CHECKBOX', 'GRID'];
  readonly gridColumnTypes: GridColumnType[] = ['TEXT', 'NUMBER', 'DATE', 'EMAIL', 'CHECKBOX'];
  readonly palette = [
    { type: 'inicio' as NodeType, label: 'Inicio', icon: 'play_circle' },
    { type: 'proceso' as NodeType, label: 'Proceso', icon: 'settings' },
    { type: 'decision' as NodeType, label: 'Decision', icon: 'diamond' },
    { type: 'bifurcasion' as NodeType, label: 'Bifurcacion', icon: 'call_split' },
    { type: 'union' as NodeType, label: 'Union', icon: 'merge' },
    { type: 'iteracion' as NodeType, label: 'Iteracion', icon: 'refresh' },
    { type: 'fin' as NodeType, label: 'Fin', icon: 'stop_circle' }
  ];

  id = '';
  loading = signal(true);
  workflow = signal<Workflow | null>(null);
  departments = signal<Department[]>([]);
  jobRoles = signal<JobRole[]>([]);
  draggingPalette = signal(false);
  nodoLocks = signal(new Map<string, WorkflowNodoLock>());
  selectedNodoId = signal<string | null>(null);
  selectedTransitionId = signal<string | null>(null);
  connectingFromId = signal<string | null>(null);
  sidebarTab = signal<SidebarTab>('inspector');
  priorityLoading    = signal(false);
  priorityResult     = signal<PriorityResult | null>(null);
  anomalyLoading     = signal(false);
  anomalyResult      = signal<AnomalyResult | null>(null);
  bottleneckLoading  = signal(false);
  bottleneckResult   = signal<BottleneckResult | null>(null);
  delayLoading       = signal(false);
  delayResult        = signal<DelayResult | null>(null);
  readonly applyAiActionsBound = (actions: DiagramAiAction[]) => this.applyAiActions(actions);
  readonly applyVoiceFormPatchBound = (result: FormVoiceDesignResult) => this.applyVoiceFormPatch(result);
  readonly showAiError = (message: string) => this.snack.open(message, '', { duration: 3500 });

  selectedNodo = computed(() => this.workflow()?.nodo.find(nodo => nodo.id === this.selectedNodoId()) ?? null);
  selectedTransition = computed(() => this.workflow()?.transitions.find(transition => transition.id === this.selectedTransitionId()) ?? null);
  availableForwardFields = computed(() => {
    const transition = this.selectedTransition();
    if (!transition) return [] as ResolvedNodoField[];
    return this.resolveFieldsAvailableAtNodo(transition.fromNodoId);
  });
    resolvedForwardFields = computed(() => this.filterForwardFields(this.availableForwardFields(), this.transitionForm));
  incomingFieldsForSelectedNodo = computed(() => {
    const nodo = this.selectedNodo();
    const workflow = this.workflow();
    if (!nodo || !workflow) return [] as Array<{ fromNodoName: string; fields: ResolvedNodoField[] }>;
    return workflow.transitions
      .filter(transition => transition.toNodoId === nodo.id)
      .map(transition => {
        const fromNodoName = workflow.nodo.find(candidate => candidate.id === transition.fromNodoId)?.name || 'Origen';
        return {
          fromNodoName,
          fields: this.resolveTransitionFields(transition)
        };
      })
      .filter(block => block.fields.length > 0);
  });
  visibleLanes = computed(() => {
    const nodoDepartmentIds = this.workflow()?.nodo
      .map(nodo => nodo.responsibleDepartmentId)
      .filter((departmentId): departmentId is string => !!departmentId) ?? [];
    const orderedIds = [...new Set(nodoDepartmentIds)];
    const selected = this.departments().filter(department => orderedIds.includes(department.id));
    const palette = [
      { tintClass: 'bg-amber-50/70', borderClass: 'border-amber-200' },
      { tintClass: 'bg-sky-50/70', borderClass: 'border-sky-200' },
      { tintClass: 'bg-emerald-50/70', borderClass: 'border-emerald-200' },
      { tintClass: 'bg-rose-50/70', borderClass: 'border-rose-200' },
      { tintClass: 'bg-violet-50/70', borderClass: 'border-violet-200' },
      { tintClass: 'bg-orange-50/70', borderClass: 'border-orange-200' }
    ];
    const count = selected.length;
    return selected.map((department, index) => {
      const widthPercent = count ? 100 / count : 100;
      return {
        id: department.id,
        name: department.name,
        leftPercent: index * widthPercent,
        widthPercent,
        tintClass: palette[index % palette.length].tintClass,
        borderClass: palette[index % palette.length].borderClass
      } satisfies DepartmentLane;
    });
  });
  canvasWidth = computed(() => {
    const nodo = this.workflow()?.nodo ?? [];
    const laneCount = Math.max(this.visibleLanes().length, 1);
    const lanesWidth = laneCount * 300;
    const maxNodoRight = nodo.reduce((max, nodo) => {
      const width = this.nodoBoxWidth(nodo);
      return Math.max(max, (nodo.posX ?? 0) + width + 120);
    }, 0);
    return Math.max(1200, lanesWidth, maxNodoRight);
  });
  canvasHeight = computed(() => {
    const nodo = this.workflow()?.nodo ?? [];
    const maxNodoBottom = nodo.reduce((max, nodo) => {
      const height = this.nodoBoxHeight(nodo);
      return Math.max(max, (nodo.posY ?? 0) + height + 120);
    }, 0);
    return Math.max(720, maxNodoBottom);
  });

  nodoForm: NodoForm = this.emptyNodoForm();
  transitionForm: TransitionForm = this.emptyTransitionForm();

  ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id') || '';
    this.loadReferenceData();
    this.loadWorkflow();
    this.connectRealtime();
  }

  ngOnDestroy() {
    const selectedNodoId = this.selectedNodoId();
    if (selectedNodoId && this.isLockedByMe(selectedNodoId)) {
      this.collab.unlockNodo(selectedNodoId);
    }
    this.collab.disconnect();
  }

  toggleFormVoiceCapture() {
    this.formVoiceAssistant?.toggleFormVoiceCapture();
  }

  isFormVoiceListening() {
    return this.formVoiceAssistant?.isFormVoiceListening() ?? false;
  }

  isFormVoiceBusy() {
    return this.formVoiceAssistant?.isFormVoiceBusy() ?? false;
  }

  goBack() {
    this.router.navigate(['/workflows']);
  }

  onPaletteDragStart(event: DragEvent, type: NodeType) {
    this.draggingPalette.set(true);
    if (event.dataTransfer) {
      event.dataTransfer.setData(this.paletteDragMimeType, type);
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  onPaletteDragEnd() {
    this.draggingPalette.set(false);
  }

  allowPaletteDrop(event: DragEvent) {
    if (!event.dataTransfer?.types.includes(this.paletteDragMimeType)) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  onCanvasDrop(event: DragEvent) {
    this.onPaletteDragEnd();
    if (!event.dataTransfer?.types.includes(this.paletteDragMimeType)) return;
    event.preventDefault();
    const type = event.dataTransfer.getData(this.paletteDragMimeType) as NodeType | '';
    const rect = this.canvas?.nativeElement.getBoundingClientRect();
    if (!type || !rect) return;
    this.createNodo(type, event.clientX - rect.left, event.clientY - rect.top);
  }

  onNodoClick(nodo: Nodo, event: MouseEvent) {
    event.stopPropagation();
    if (this.connectingFromId() && this.connectingFromId() !== nodo.id) {
      this.createTransition(this.connectingFromId()!, nodo.id);
      return;
    }
    if (this.isLockedByOther(nodo.id)) return;
    this.tryLockNodo(nodo.id);
    this.selectedTransitionId.set(null);
    this.sidebarTab.set('inspector');
    this.selectNodo(nodo.id);
  }

  iniciarConexion(nodo: Nodo, event: MouseEvent) {
    event.stopPropagation();
    this.selectedNodoId.set(null);
    this.selectedTransitionId.set(null);
    this.connectingFromId.set(nodo.id);
  }

  cancelConnect() {
    this.connectingFromId.set(null);
  }

  onTransitionClick(transition: Transition, event: MouseEvent) {
    event.stopPropagation();
    this.selectedNodoId.set(null);
    this.selectedTransitionId.set(transition.id);
    this.connectingFromId.set(null);
    this.sidebarTab.set('inspector');
    this.ensureReachableFormsLoaded(transition.fromNodoId);
    this.transitionForm = {
      mode: this.normalizeForwardMode(transition.forwardConfig?.mode),
      fieldNames: [...(transition.forwardConfig?.fieldNames ?? [])],
      includeFiles: Boolean(transition.forwardConfig?.includeFiles)
    };
  }

  onNodoDragEnd(nodo: Nodo, event: CdkDragEnd) {
    const position = event.source.getFreeDragPosition();
    this.updateNodoignal(nodo.id, { posX: position.x, posY: position.y });
    this.api.patch<Nodo>(`/workflow-nodos/${nodo.id}`, {
      posX: position.x,
      posY: position.y
    }).subscribe({
      next: saved => this.upsertNodo(saved),
      error: () => this.snack.open('No se pudo guardar la posicion', '', { duration: 2500 })
    });
  }

  clearSelection() {
    const selectedNodoId = this.selectedNodoId();
    if (selectedNodoId && this.isLockedByMe(selectedNodoId)) {
      this.collab.unlockNodo(selectedNodoId);
    }
    this.selectedNodoId.set(null);
    this.selectedTransitionId.set(null);
    this.connectingFromId.set(null);
  }

  removeSelected() {
    const nodo = this.selectedNodo();
    if (nodo) {
    this.api.delete<void>(`/workflow-nodos/${nodo.id}`).subscribe({
        next: () => {
          this.removeNodo(nodo.id);
        },
        error: err => this.snack.open(err?.error?.message || 'No se pudo eliminar el nodo', '', { duration: 3000 })
      });
      return;
    }

    const transition = this.selectedTransition();
    if (!transition) return;
    this.api.delete<void>(`/workflow-transitions/${transition.id}`).subscribe({
      next: () => {
        this.removeTransition(transition.id);
      },
      error: err => this.snack.open(err?.error?.message || 'No se pudo eliminar la conexion', '', { duration: 3000 })
    });
  }

  saveNodo() {
    const nodo = this.selectedNodo();
    if (!nodo) return;
    const nodoProceso = this.esNodoHumano(this.nodoForm.nodeType);
    const requiresForm = nodoProceso && this.nodoForm.requiresForm;
    const formDefinition: FormDefinition | null = requiresForm ? {
      title: this.nodoForm.formTitle || 'Formulario',
      fields: this.nodoForm.formFields.map((field, index) => ({
        id: field.id || this.createFieldId(),
        name: field.name,
        type: field.type,
        columns: field.type === 'GRID'
          ? this.normalizeGridColumns(field.columns)
          : [],
        isRequired: Boolean(field.isRequired),
        order: index + 1
      }))
    } : null;

    this.api.patch<Nodo>(`/workflow-nodos/${nodo.id}`, {
      name: this.nodoForm.name.trim() || 'Etapa',
      description: this.nodoForm.description,
      nodeType: this.nodoForm.nodeType,
      responsibleDepartmentId: nodoProceso ? this.nodoForm.responsibleDepartmentId || null : null,
      responsibleJobRoleId: nodoProceso ? this.nodoForm.responsibleJobRoleId || null : null,
      avgMinutes: nodoProceso ? Number(this.nodoForm.avgMinutes || 1) : 0,
      condition: this.nodoForm.condition,
      trueLabel: this.nodoForm.trueLabel,
      falseLabel: this.nodoForm.falseLabel,
      requiresForm,
      documentPermissions: nodoProceso ? this.normalizeDocumentPermissions(this.nodoForm.documentPermissions) : [],
      formDefinition,
      posX: nodo.posX ?? 0,
      posY: nodo.posY ?? 0
    }).subscribe({
      next: saved => {
        this.upsertNodo({
          ...nodo,
          ...saved,
          trueLabel: this.nodoForm.trueLabel,
          falseLabel: this.nodoForm.falseLabel,
          requiresForm,
          documentPermissions: this.normalizeDocumentPermissions(this.nodoForm.documentPermissions),
          formDefinition: formDefinition ?? undefined
        });
        this.snack.open('Nodo actualizado', '', { duration: 1800 });
      },
      error: err => this.snack.open(err?.error?.message || 'Error al guardar el nodo', '', { duration: 3000 })
    });
  }

  saveTransition() {
      const transition = this.selectedTransition();
      if (!transition) return;
      this.api.patch<Transition>(`/workflow-transitions/${transition.id}`, {
        forwardConfig: {
          mode: this.transitionForm.mode,
          fieldNames: this.transitionForm.mode === 'selected' ? this.transitionForm.fieldNames : [],
          includeFiles: this.transitionForm.mode === 'files-only' || this.transitionForm.includeFiles
        }
      }).subscribe({
      next: saved => {
        this.upsertTransition(saved);
        this.snack.open('Conexion actualizada', '', { duration: 1800 });
      },
      error: err => this.snack.open(err?.error?.message || 'Error al guardar la conexion', '', { duration: 3000 })
    });
  }

  addFormField() {
    this.nodoForm.formFields = [
      ...this.nodoForm.formFields,
      { id: this.createFieldId(), name: `campo_${this.nodoForm.formFields.length + 1}`, type: 'TEXT', columns: [], isRequired: false, order: this.nodoForm.formFields.length + 1 }
    ];
  }

  removeFormField(index: number) {
    this.nodoForm.formFields = this.nodoForm.formFields.filter((_, i) => i !== index).map((field, i) => ({ ...field, order: i + 1 }));
  }

  addDocumentPermission() {
    this.nodoForm.documentPermissions = [
      ...this.nodoForm.documentPermissions,
      {
        departmentId: '',
        canCreate: true,
        canRead: true,
        canEdit: false
      }
    ];
  }

  removeDocumentPermission(index: number) {
    this.nodoForm.documentPermissions = this.nodoForm.documentPermissions.filter((_, i) => i !== index);
  }

  onFieldTypeChange(field: FormField, type: FieldType) {
    field.type = type;
    field.columns = type === 'GRID'
      ? this.normalizeGridColumns(field.columns?.length ? field.columns : [this.createGridColumn(1)])
      : [];
  }

  addGridColumn(field: FormField) {
    field.columns = [
      ...(field.columns ?? []),
      this.createGridColumn((field.columns?.length ?? 0) + 1)
    ];
  }

  removeGridColumn(field: FormField, index: number) {
    field.columns = this.normalizeGridColumns((field.columns ?? []).filter((_, i) => i !== index));
  }

  toggleForwardField(fieldName: string, checked: boolean) {
    const next = new Set(this.transitionForm.fieldNames);
    if (checked) next.add(fieldName); else next.delete(fieldName);
    this.transitionForm = { ...this.transitionForm, fieldNames: [...next] };
  }

  assignDepartmentToSelectedNodo(departmentId: string) {
    const nodo = this.selectedNodo();
    if (!nodo || !this.esNodoHumano(nodo.nodeType)) {
      this.snack.open('Selecciona un proceso para moverlo a esa calle', '', { duration: 2200 });
      return;
    }
    this.nodoForm = {
      ...this.nodoForm,
      responsibleDepartmentId: departmentId,
      responsibleJobRoleId: this.rolesForDepartment(departmentId).some(role => role.id === this.nodoForm.responsibleJobRoleId)
        ? this.nodoForm.responsibleJobRoleId
        : ''
    };
    this.saveNodo();
  }

  esNodoHumano(type: string | undefined) {
    return this.nodeBehaviorResolver.resolve(type).isHuman;
  }

  rolesForDepartment(departmentId: string) {
    return departmentId ? this.jobRoles().filter(role => role.departmentId === departmentId) : this.jobRoles();
  }

  isLaneVisible(departmentId: string) {
    return this.visibleLanes().some(lane => lane.id === departmentId);
  }

  tipoNodo(nodo: Pick<Nodo, 'nodeType'>) {
    return this.nodeBehaviorResolver.resolveType(nodo) as NodeType;
  }

  nodeCardClass(nodo: Nodo) {
    const selected = this.selectedNodoId() === nodo.id ? 'ring-4 ring-blue-500 ' : '';
    const connecting = this.connectingFromId() === nodo.id ? 'ring-4 ring-emerald-200 ' : '';
    const locked = this.isLockedByOther(nodo.id) ? 'opacity-60 cursor-not-allowed ' : 'cursor-pointer ';
    return `${selected}${connecting}${locked}relative transition`;
  }

  transitionPath(transition: Transition) {
    const source = this.nodoCenter(transition.fromNodoId);
    const target = this.nodoCenter(transition.toNodoId);
    if (!source || !target) return '';
    const fromNodo = this.workflow()?.nodo.find(n => n.id === transition.fromNodoId);
    const fromType = fromNodo ? this.tipoNodo(fromNodo) : '';
    let from: { x: number; y: number };
    if ((fromType === 'decision' || fromType === 'iteracion') && fromNodo) {
      const hw = this.nodeBehaviorResolver.resolve(fromNodo).width / 2;
      from = target.x >= source.x
        ? { x: source.x + hw, y: source.y }
        : { x: source.x - hw, y: source.y };
    } else {
      from = this.nodoEdgePoint(transition.fromNodoId, target.x, target.y) ?? source;
    }
    const to = this.nodoEdgePoint(transition.toNodoId, source.x, source.y) ?? target;
    return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  }

  transitionLabel(transition: Transition): string | null {
    const src = this.workflow()?.nodo.find(n => n.id === transition.fromNodoId);
    const workflow = this.workflow();
    if (!src) return null;
    const type = this.tipoNodo(src);
    if (type !== 'decision' && type !== 'iteracion') return null;
    const outgoingTransitions = (workflow?.transitions ?? []).filter(item => item.fromNodoId === transition.fromNodoId);
    const transitionIndex = outgoingTransitions.findIndex(item => item.id === transition.id);
    if (transitionIndex === 0) {
      return src.trueLabel || 'Si';
    }
    if (transitionIndex === 1) {
      return src.falseLabel || 'No';
    }
    const sc = this.nodoCenter(transition.fromNodoId);
    const tc = this.nodoCenter(transition.toNodoId);
    if (!sc || !tc) return src.trueLabel || 'Si';
    return tc.x >= sc.x ? (src.trueLabel || 'Si') : (src.falseLabel || 'No');
  }

  transitionLabelPosition(transition: Transition) {
    const source = this.nodoCenter(transition.fromNodoId);
    const target = this.nodoCenter(transition.toNodoId);
    if (!source || !target) return null;
    return { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 };
  }

  private nodoEdgePoint(nodoId: string, fromX: number, fromY: number): { x: number; y: number } | null {
    const center = this.nodoCenter(nodoId);
    if (!center) return null;
    const nodo = this.workflow()?.nodo.find(item => item.id === nodoId);
    if (!nodo) return null;
    const dx = fromX - center.x;
    const dy = fromY - center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return center;
    const nx = dx / dist;
    const ny = dy / dist;
    const type = this.tipoNodo(nodo);
    if (type === 'inicio' || type === 'fin') {
      const r = this.nodeBehaviorResolver.resolve(nodo).width / 2;
      return { x: center.x + nx * r, y: center.y + ny * r };
    }
    const hw = this.nodeBehaviorResolver.resolve(nodo).width / 2;
    const hh = Math.max(this.nodeBehaviorResolver.resolve(nodo).height / 2, 8);
    const tx = nx !== 0 ? Math.abs(hw / nx) : Infinity;
    const ty = ny !== 0 ? Math.abs(hh / ny) : Infinity;
    const t = Math.min(tx, ty);
    return { x: center.x + nx * t, y: center.y + ny * t };
  }

  sourceNodoName(transition: Transition) {
    return this.workflow()?.nodo.find(nodo => nodo.id === transition.fromNodoId)?.name || 'Origen';
  }

  targetNodoName(transition: Transition) {
    return this.workflow()?.nodo.find(nodo => nodo.id === transition.toNodoId)?.name || 'Destino';
  }

  tryLockNodo(nodoId: string) {
    if (this.isLockedByOther(nodoId)) return;
    const selected = this.selectedNodoId();
    if (selected && selected !== nodoId && this.isLockedByMe(selected)) {
      this.collab.unlockNodo(selected);
    }
    if (!this.isLockedByMe(nodoId)) {
      this.collab.lockNodo(nodoId);
    }
  }

  isLockedByOther(nodoId: string) {
    const lock = this.nodoLocks().get(nodoId);
    return !!lock && lock.userId !== this.collab.getClientId();
  }

  private async applyAiActions(actions: DiagramAiAction[]) {
    this.validateAiActionPlan(actions);
    const placeholderMap = new Map<string, string>();
    let shouldRelayout = false;
    for (const action of actions) {
      switch (action.type) {
        case 'create_department':
          await this.applyCreateDepartmentAction(action);
          break;
        case 'create_job_role':
          await this.applyCreateJobRoleAction(action);
          break;
        case 'create_nodo':
          await this.applyCreateNodoAction(action, placeholderMap);
          shouldRelayout = true;
          break;
        case 'update_nodo':
          await this.applyUpdateNodoAction(action, placeholderMap);
          shouldRelayout = true;
          break;
        case 'delete_nodo':
          await this.applyDeleteNodoAction(action, placeholderMap);
          shouldRelayout = true;
          break;
        case 'connect_nodo':
          await this.applyConnectNodoAction(action, placeholderMap);
          shouldRelayout = true;
          break;
        case 'disconnect_nodo':
          await this.applyDisconnectNodoAction(action);
          shouldRelayout = true;
          break;
        default:
          break;
      }
    }
    if (shouldRelayout) {
      await this.autoLayoutWorkflow();
    }
  }

  private async applyVoiceFormPatch(result: FormVoiceDesignResult) {
    const targetNodoId = result.targetNodoId || this.selectedNodoId();
    if (!targetNodoId) {
      throw new Error('No se pudo identificar el nodo del formulario');
    }
    const nodo = this.workflow()?.nodo.find(item => item.id === targetNodoId);
    if (!nodo) {
      throw new Error('El nodo indicado por voz no existe en el workflow actual');
    }
    const nodeType = this.tipoNodo(nodo);
    if (!this.esNodoHumano(nodeType)) {
      throw new Error('Solo se puede editar el formulario de nodos tipo proceso');
    }
    const normalizedFormDefinition = this.normalizeVoiceFormDefinition(result.formDefinition);
    const saved = await firstValueFrom(this.api.patch<Nodo>(`/workflow-nodos/${targetNodoId}`, {
      name: nodo.name,
      description: nodo.description || '',
      nodeType: nodo.nodeType || 'proceso',
      responsibleDepartmentId: nodo.responsibleDepartmentId || null,
      responsibleJobRoleId: nodo.responsibleJobRoleId || null,
      avgMinutes: Number(nodo.avgMinutes || 1),
      condition: nodo.condition || '',
      trueLabel: nodo.trueLabel || 'Si',
      falseLabel: nodo.falseLabel || 'No',
      requiresForm: result.requiresForm !== false,
      formDefinition: normalizedFormDefinition,
      posX: nodo.posX ?? 0,
      posY: nodo.posY ?? 0
    }));
    this.upsertNodo(saved);
    if (this.selectedNodoId() === targetNodoId) {
      this.selectNodo(targetNodoId);
    }
  }

  private validateAiActionPlan(actions: DiagramAiAction[]) {
    const workflow = this.workflow();
    if (!workflow || !actions.length) return;

    type SimNodo = Pick<Nodo, 'id' | 'name' | 'nodeType'>;
    type SimTransition = Pick<Transition, 'id' | 'fromNodoId' | 'toNodoId'>;

    const nodos = new Map<string, SimNodo>(
      workflow.nodo.map(nodo => [nodo.id, { id: nodo.id, name: nodo.name, nodeType: nodo.nodeType }])
    );
    const transitions: SimTransition[] = workflow.transitions.map(transition => ({
      id: transition.id,
      fromNodoId: transition.fromNodoId,
      toNodoId: transition.toNodoId
    }));
    const placeholderMap = new Map<string, string>();
    let syntheticTransitionIndex = 0;

    for (const action of actions) {
      switch (action.type) {
        case 'create_nodo': {
          const syntheticId = action.placeholderId || `ai-create-${nodos.size + 1}`;
          placeholderMap.set(action.placeholderId || syntheticId, syntheticId);
          nodos.set(syntheticId, {
            id: syntheticId,
            name: action.name || syntheticId,
            nodeType: action.nodeType || 'proceso'
          });
          break;
        }
        case 'update_nodo': {
          const nodoId = this.resolveNodoRef(action.nodoId, placeholderMap);
          if (!nodoId || !nodos.has(nodoId)) {
            throw new Error(`La IA intento actualizar un nodo inexistente: ${action.nodoId || ''}`);
          }
          const current = nodos.get(nodoId)!;
          nodos.set(nodoId, {
            ...current,
            name: action.name ?? current.name,
            nodeType: action.nodeType ?? current.nodeType
          });
          break;
        }
        case 'delete_nodo': {
          const nodoId = this.resolveNodoRef(action.nodoId, placeholderMap);
          if (!nodoId || !nodos.has(nodoId)) {
            throw new Error(`La IA intento eliminar un nodo inexistente: ${action.nodoId || ''}`);
          }
          nodos.delete(nodoId);
          for (let i = transitions.length - 1; i >= 0; i--) {
            if (transitions[i].fromNodoId === nodoId || transitions[i].toNodoId === nodoId) {
              transitions.splice(i, 1);
            }
          }
          break;
        }
        case 'connect_nodo': {
          const fromNodoId = this.resolveNodoRef(action.fromNodoId, placeholderMap);
          const toNodoId = this.resolveNodoRef(action.toNodoId, placeholderMap);
          this.validateAiSimulatedTransition(fromNodoId, toNodoId, nodos, transitions);
          transitions.push({
            id: `ai-transition-${++syntheticTransitionIndex}`,
            fromNodoId,
            toNodoId
          });
          break;
        }
        case 'disconnect_nodo': {
          if (!action.transitionId) {
            throw new Error('La IA intento eliminar una conexion sin transitionId');
          }
          const index = transitions.findIndex(item => item.id === action.transitionId);
          if (index === -1) {
            throw new Error(`La IA intento eliminar una conexion inexistente: ${action.transitionId}`);
          }
          transitions.splice(index, 1);
          break;
        }
        default:
          break;
      }
    }
  }

  private validateAiSimulatedTransition(
    fromNodoId: string,
    toNodoId: string,
    nodos: Map<string, Pick<Nodo, 'id' | 'name' | 'nodeType'>>,
    transitions: Array<Pick<Transition, 'id' | 'fromNodoId' | 'toNodoId'>>
  ) {
    if (!fromNodoId || !toNodoId || fromNodoId === toNodoId) {
      throw new Error('La IA genero una conexion invalida');
    }

    const from = nodos.get(fromNodoId);
    const to = nodos.get(toNodoId);
    if (!from || !to) {
      throw new Error(`La IA conecto nodos inexistentes: ${fromNodoId} -> ${toNodoId}`);
    }

    const fromType = this.tipoNodo(from);
    const toType = this.tipoNodo(to);
    const outgoing = transitions.filter(transition => transition.fromNodoId === fromNodoId);
    const incomingToTarget = transitions.filter(transition => transition.toNodoId === toNodoId);

    if (transitions.some(transition => transition.fromNodoId === fromNodoId && transition.toNodoId === toNodoId)) {
      throw new Error(`La IA repitio una conexion: ${from.name} -> ${to.name}`);
    }
    if (toType === 'inicio') {
      throw new Error(`La IA intento conectar hacia Inicio: ${from.name} -> ${to.name}`);
    }
    if (fromType === 'fin') {
      throw new Error(`La IA intento sacar una conexion desde Fin: ${from.name} -> ${to.name}`);
    }
    if (fromType === 'inicio' && toType !== 'proceso') {
      throw new Error(`La IA intento conectar Inicio hacia un nodo no valido: ${to.name}`);
    }
    if (toType === 'fin' && fromType !== 'proceso') {
      throw new Error(`La IA intento cerrar ${from.name} directamente en Fin, pero solo Proceso puede entrar a Fin`);
    }
    if (fromType === 'inicio' && outgoing.length >= 1) {
      throw new Error('La IA genero mas de una salida desde Inicio');
    }
    if ((toType === 'decision' || toType === 'iteracion') && incomingToTarget.length >= 1) {
      throw new Error(`La IA genero multiples entradas para ${to.name}`);
    }
    if ((fromType === 'decision' || fromType === 'iteracion') && outgoing.length >= 2) {
      throw new Error(`La IA genero demasiadas salidas para ${from.name}`);
    }
    if (fromType === 'union' && outgoing.length >= 1) {
      throw new Error(`La IA genero demasiadas salidas para ${from.name}`);
    }
    if (toType === 'bifurcasion' && incomingToTarget.length >= 1) {
      throw new Error(`La IA genero demasiadas entradas para ${to.name}`);
    }
    if (fromType === 'proceso' && outgoing.length >= 1) {
      throw new Error(`La IA intento sacar multiples salidas desde el proceso ${from.name}`);
    }
  }

  private async applyCreateDepartmentAction(action: DiagramAiAction) {
    const name = String(action.name || '').trim();
    if (!name) return;
    const existing = this.departments().find(item => item.name.toLowerCase() === name.toLowerCase());
    if (existing) return;
    const companyId = this.workflow()?.companyId || this.departments()[0]?.companyId;
    if (!companyId) {
      throw new Error('No se encontro la empresa para crear el departamento');
    }
    const saved = await firstValueFrom(this.api.post<Department>('/departments', { companyId, name }));
    this.departments.set([...this.departments(), saved].sort((a, b) => a.name.localeCompare(b.name)));
  }

  private async applyCreateJobRoleAction(action: DiagramAiAction) {
    const name = String(action.name || '').trim();
    if (!name) return;
    const departmentId = this.departmentIdByName(action.departmentName || action.responsibleDepartmentName);
    if (!departmentId) {
      throw new Error(`No se encontro el departamento ${action.departmentName || action.responsibleDepartmentName || ''} para crear el rol`);
    }
    const existing = this.jobRoles().find(role =>
      role.departmentId === departmentId &&
      role.name.toLowerCase() === name.toLowerCase()
    );
    if (existing) return;
    const saved = await firstValueFrom(this.api.post<JobRole>('/job-roles', { departmentId, name }));
    this.jobRoles.set([...this.jobRoles(), saved].sort((a, b) => a.name.localeCompare(b.name)));
  }

  private async applyCreateNodoAction(action: DiagramAiAction, placeholderMap: Map<string, string>) {
    const saved = await firstValueFrom(this.api.post<Nodo>('/workflow-nodos', {
      workflowId: this.id,
      name: action.name || 'Etapa',
      description: action.description || '',
      order: action.order || ((Math.max(0, ...(this.workflow()?.nodo.map(nodo => nodo.order || 0) ?? [0])) + 1)),
      nodeType: action.nodeType || 'proceso',
      responsibleDepartmentId: this.departmentIdByName(action.responsibleDepartmentName),
      responsibleJobRoleId: this.jobRoleIdByName(action.responsibleDepartmentName, action.responsibleJobRoleName),
      requiresForm: Boolean(action.requiresForm),
      formDefinition: this.normalizeAiFormDefinition(action.formDefinition),
      avgMinutes: Number(action.avgMinutes ?? (action.nodeType === 'proceso' ? 60 : 0)),
      trueLabel: action.trueLabel || 'Si',
      falseLabel: action.falseLabel || 'No',
      posX: Number(action.posX ?? 120),
      posY: Number(action.posY ?? 120)
    }));
    this.upsertNodo(saved);
    if (action.placeholderId) {
      placeholderMap.set(action.placeholderId, saved.id);
    }
  }

  private async applyUpdateNodoAction(action: DiagramAiAction, placeholderMap: Map<string, string>) {
    const nodoId = this.resolveNodoRef(action.nodoId, placeholderMap);
    if (!nodoId) return;
    const current = this.workflow()?.nodo.find(nodo => nodo.id === nodoId);
    const nextType = action.nodeType || current?.nodeType || 'proceso';
    const requiresForm = action.requiresForm ?? current?.requiresForm ?? false;
    const saved = await firstValueFrom(this.api.patch<Nodo>(`/workflow-nodos/${nodoId}`, {
      name: action.name ?? current?.name ?? 'Etapa',
      description: action.description ?? current?.description ?? '',
      nodeType: nextType,
      responsibleDepartmentId: this.hasActionField(action, 'responsibleDepartmentName')
        ? this.departmentIdByName(action.responsibleDepartmentName)
        : (current?.responsibleDepartmentId ?? null),
      responsibleJobRoleId: this.hasActionField(action, 'responsibleJobRoleName')
        ? this.jobRoleIdByName(action.responsibleDepartmentName ?? current?.responsibleDepartmentName ?? null, action.responsibleJobRoleName)
        : (current?.responsibleJobRoleId ?? null),
      requiresForm,
      formDefinition: this.hasActionField(action, 'formDefinition')
        ? this.normalizeAiFormDefinition(action.formDefinition)
        : (current?.formDefinition ?? null),
      avgMinutes: Number(action.avgMinutes ?? current?.avgMinutes ?? 60),
      trueLabel: action.trueLabel ?? current?.trueLabel ?? 'Si',
      falseLabel: action.falseLabel ?? current?.falseLabel ?? 'No',
      posX: Number(action.posX ?? current?.posX ?? 0),
      posY: Number(action.posY ?? current?.posY ?? 0)
    }));
    this.upsertNodo(saved);
  }

  private async applyDeleteNodoAction(action: DiagramAiAction, placeholderMap: Map<string, string>) {
    const nodoId = this.resolveNodoRef(action.nodoId, placeholderMap);
    if (!nodoId) return;
    await firstValueFrom(this.api.delete<void>(`/workflow-nodos/${nodoId}`));
    this.removeNodo(nodoId);
  }

  private async applyConnectNodoAction(action: DiagramAiAction, placeholderMap: Map<string, string>) {
    const fromNodoId = this.resolveNodoRef(action.fromNodoId, placeholderMap);
    const toNodoId = this.resolveNodoRef(action.toNodoId, placeholderMap);
    if (!fromNodoId || !toNodoId) return;
    const saved = await firstValueFrom(this.api.post<Transition>('/workflow-transitions', {
      workflowId: this.id,
      fromNodoId,
      toNodoId,
      name: action.name || '',
      forwardConfig: action.forwardConfig ?? null
    }));
    this.upsertTransition(saved);
  }

  private async applyDisconnectNodoAction(action: DiagramAiAction) {
    if (!action.transitionId) return;
    await firstValueFrom(this.api.delete<void>(`/workflow-transitions/${action.transitionId}`));
    this.removeTransition(action.transitionId);
  }

  private resolveNodoRef(value: string | undefined, placeholderMap: Map<string, string>) {
    if (!value) return '';
    return placeholderMap.get(value) || value;
  }

  private normalizeAiFormDefinition(formDefinition: DiagramAiAction['formDefinition']) {
    if (!formDefinition) return null;
    return {
      title: formDefinition.title || 'Formulario',
      fields: (formDefinition.fields ?? []).map((field, index) => ({
        id: field.id || this.createFieldId(),
        name: field.name || `campo_${index + 1}`,
        type: field.type || 'TEXT',
        columns: field.type === 'GRID' ? this.normalizeGridColumns(field.columns) : [],
        isRequired: Boolean(field.required),
        order: field.order || index + 1
      }))
    };
  }

  private normalizeVoiceFormDefinition(formDefinition: FormVoiceDesignResult['formDefinition']) {
    if (!formDefinition) return null;
    return {
      title: formDefinition.title || 'Formulario',
      fields: (formDefinition.fields ?? []).map((field, index) => ({
        id: field.id || this.createFieldId(),
        name: field.name || `campo_${index + 1}`,
        type: field.type || 'TEXT',
        columns: field.type === 'GRID' ? this.normalizeGridColumns(field.columns) : [],
        isRequired: Boolean(field.isRequired ?? field.required),
        order: field.order || index + 1
      }))
    };
  }

  private departmentIdByName(name: string | null | undefined) {
    if (!name) return null;
    return this.departments().find(item => item.name.toLowerCase() === String(name).toLowerCase())?.id ?? null;
  }

  private jobRoleIdByName(departmentName: string | null | undefined, roleName: string | null | undefined) {
    if (!roleName) return null;
    const departmentId = this.departmentIdByName(departmentName);
    return this.jobRoles().find(role =>
      role.name.toLowerCase() === String(roleName).toLowerCase() &&
      (!departmentId || role.departmentId === departmentId)
    )?.id ?? null;
  }

  private hasActionField<T extends keyof DiagramAiAction>(action: DiagramAiAction, key: T) {
    return Object.prototype.hasOwnProperty.call(action, key);
  }

  private loadReferenceData() {
    this.api.get<Department[]>('/departments').subscribe({
      next: departments => {
        this.departments.set([...departments].sort((a, b) => a.name.localeCompare(b.name)));
      }
    });
    this.api.get<JobRole[]>('/job-roles').subscribe({
      next: roles => {
        this.jobRoles.set([...roles].sort((a, b) => a.name.localeCompare(b.name)));
      }
    });
  }

  private loadWorkflow() {
    this.api.get<Workflow>(`/workflows/${this.id}`).subscribe({
      next: workflow => {
        this.workflow.set({
          ...workflow,
          nodo: workflow.nodo.map((nodo, index) => ({
            ...nodo,
            posX: nodo.posX ?? 60 + (index % 4) * 240,
            posY: nodo.posY ?? 60 + Math.floor(index / 4) * 180
          }))
        });
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('No se pudo cargar el workflow', '', { duration: 3000 });
      }
    });
  }

  private createNodo(type: NodeType, x: number, y: number) {
    const workflow = this.workflow();
    if (!workflow) return;
    const nextOrder = Math.max(0, ...workflow.nodo.map(nodo => nodo.order || 0)) + 1;
    this.api.post<Nodo>('/workflow-nodos', {
      workflowId: workflow.id,
      name: type === 'proceso' ? `Etapa ${nextOrder}` : this.palette.find(item => item.type === type)?.label,
      description: '',
      order: nextOrder,
      nodeType: type,
      responsibleDepartmentId: this.esNodoHumano(type) ? this.departments()[0]?.id ?? null : null,
      responsibleJobRoleId: null,
      requiresForm: false,
      avgMinutes: this.esNodoHumano(type) ? 60 : 0,
      isConditional: type === 'decision' || type === 'iteracion',
      trueLabel: 'Si',
      falseLabel: 'No',
      posX: Math.max(12, x),
      posY: Math.max(12, y)
    }).subscribe({
      next: saved => {
        this.upsertNodo(saved);
        this.selectedTransitionId.set(null);
        this.selectNodo(saved.id);
      },
      error: err => this.snack.open(err?.error?.message || 'No se pudo crear el nodo', '', { duration: 3000 })
    });
  }

  private createTransition(fromNodoId: string, toNodoId: string) {
    const validationError = this.validateTransition(fromNodoId, toNodoId);
    if (validationError) {
      this.snack.open(validationError, '', { duration: 3000 });
      this.connectingFromId.set(null);
      return;
    }

    const source = this.workflow()?.nodo.find(nodo => nodo.id === fromNodoId);
    this.api.post<Transition>('/workflow-transitions', {
      workflowId: this.id,
      fromNodoId,
      toNodoId,
      name: this.defaultTransitionName(source)
    }).subscribe({
      next: saved => {
        this.upsertTransition(saved);
        this.connectingFromId.set(null);
        this.onTransitionClick(saved, new MouseEvent('click'));
      },
      error: err => {
        this.connectingFromId.set(null);
        this.snack.open(err?.error?.message || 'No se pudo crear la conexion', '', { duration: 3000 });
      }
    });
  }

  private validateTransition(fromNodoId: string, toNodoId: string) {
    const workflow = this.workflow();
    if (!workflow || fromNodoId === toNodoId) return 'Conexion invalida';
    const from = workflow.nodo.find(nodo => nodo.id === fromNodoId);
    const to = workflow.nodo.find(nodo => nodo.id === toNodoId);
    if (!from || !to) return 'Conexion invalida';
    const fromType = this.tipoNodo(from);
    const toType = this.tipoNodo(to);
    const outgoing = workflow.transitions.filter(transition => transition.fromNodoId === fromNodoId);
    const incomingToTarget = workflow.transitions.filter(transition => transition.toNodoId === toNodoId);

    if (workflow.transitions.some(transition => transition.fromNodoId === fromNodoId && transition.toNodoId === toNodoId)) return 'Esa conexion ya existe';
    if (toType === 'inicio') return 'Inicio no recibe conexiones';
    if (fromType === 'fin') return 'Fin no puede salir a otro nodo';
    if (fromType === 'inicio' && toType !== 'proceso') return 'Inicio solo puede conectarse a un Proceso';
    if (toType === 'fin' && fromType !== 'proceso') return 'Fin solo puede recibir conexion desde un Proceso';
    if (fromType === 'inicio' && outgoing.length >= 1) return 'Inicio solo puede tener una salida';
    if ((toType === 'decision' || toType === 'iteracion') && incomingToTarget.length >= 1) {
      return `${to.name} solo puede tener una entrada`;
    }
    if ((fromType === 'decision' || fromType === 'iteracion') && outgoing.length >= 2) {
      return `${from.name} ya tiene sus dos salidas configuradas`;
    }
    if (fromType === 'union' && outgoing.length >= 1) return 'La union solo puede devolver una salida';
    if (toType === 'bifurcasion' && incomingToTarget.length >= 1) return 'La bifurcacion solo puede tener una entrada';
    return '';
  }

  private connectRealtime() {
    this.collab.connect(this.id, {
      onSnapshot: locks => {
        const next = new Map<string, WorkflowNodoLock>();
        for (const lock of locks) next.set(lock.nodoId, lock);
        this.nodoLocks.set(next);
      },
      onNodoLocked: lock => {
        const next = new Map(this.nodoLocks());
        next.set(lock.nodoId, lock);
        this.nodoLocks.set(next);
      },
      onNodoUnlocked: nodoId => {
        const next = new Map(this.nodoLocks());
        next.delete(nodoId);
        this.nodoLocks.set(next);
      },
      onNodoMoved: event => {
        if (event.userId === this.collab.getClientId()) return;
        this.updateNodoignal(event.nodoId, { posX: event.x, posY: event.y });
      },
      onNodoCreated: event => {
        if (event.nodo) {
          this.upsertNodo(event.nodo);
        }
      },
      onNodoUpdated: event => {
        if (event.nodo) {
          this.upsertNodo(event.nodo);
        }
      },
      onNodoDeleted: event => {
        if (event.nodoId) {
          this.removeNodo(event.nodoId);
        }
      },
      onTransitionCreated: event => {
        if (event.transition) {
          this.upsertTransition(event.transition);
        }
      },
      onTransitionUpdated: event => {
        if (event.transition) {
          this.upsertTransition(event.transition);
        }
      },
      onTransitionDeleted: event => {
        if (event.transitionId) {
          this.removeTransition(event.transitionId);
        }
      },
      onLockDenied: event => {
        const owner = event.lock?.userName ? ` por ${event.lock.userName}` : '';
        this.snack.open(`Ese nodo ya esta bloqueado${owner}`, '', { duration: 2500 });
      }
    });
  }

  private selectNodo(nodoId: string) {
    this.selectedNodoId.set(nodoId);
    const nodo = this.workflow()?.nodo.find(item => item.id === nodoId);
    if (!nodo) return;
    this.ensureReachableFormsLoaded(nodoId);
    this.nodoForm = {
      name: nodo.name || '',
      description: nodo.description || '',
      nodeType: this.tipoNodo(nodo),
      responsibleDepartmentId: nodo.responsibleDepartmentId || '',
      responsibleJobRoleId: nodo.responsibleJobRoleId || '',
      avgMinutes: nodo.avgMinutes ?? 60,
      trueLabel: nodo.trueLabel || 'Si',
      falseLabel: nodo.falseLabel || 'No',
      condition: nodo.condition || '',
      requiresForm: Boolean(nodo.requiresForm),
      documentPermissions: this.initDocumentPermissions(nodo),
      formTitle: nodo.formDefinition?.title || 'Formulario',
      formFields: [...(nodo.formDefinition?.fields ?? [])]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map(field => ({ ...field, columns: this.normalizeGridColumns(field.columns) }))
    };
    if (nodo.requiresForm && !nodo.formDefinition) {
      this.loadNodoFormDefinition(nodoId);
    }
  }

  private upsertNodo(nodo: Nodo | CollaborativeWorkflowNodo) {
    const current = this.workflow();
    if (!current) return;
    const fullNodo = this.normalizeNodo(nodo);
    const nextNodo = current.nodo.some(item => item.id === fullNodo.id)
      ? current.nodo.map(item => item.id === fullNodo.id ? {
          ...item,
          ...fullNodo,
          formDefinition: fullNodo.formDefinition ?? item.formDefinition
        } : item)
      : [...current.nodo, fullNodo].sort((a, b) => a.order - b.order);
    this.workflow.set({ ...current, nodo: nextNodo });
    if (this.selectedNodoId() === fullNodo.id) this.selectNodo(fullNodo.id);
  }

  private removeNodo(nodoId: string) {
    const current = this.workflow();
    if (!current) return;
    this.workflow.set({
      ...current,
      nodo: current.nodo.filter(item => item.id !== nodoId),
      transitions: current.transitions.filter(item => item.fromNodoId !== nodoId && item.toNodoId !== nodoId)
    });
    if (this.selectedNodoId() === nodoId || this.connectingFromId() === nodoId) this.clearSelection();
  }

  private upsertTransition(transition: Transition | CollaborativeWorkflowTransition) {
    const current = this.workflow();
    if (!current) return;
    const nextTransition = transition as Transition;
    const transitions = current.transitions.some(item => item.id === nextTransition.id)
      ? current.transitions.map(item => item.id === nextTransition.id ? { ...item, ...nextTransition } : item)
      : [...current.transitions, nextTransition];
    this.workflow.set({ ...current, transitions });
    if (this.selectedTransitionId() === nextTransition.id) {
      this.onTransitionClick(nextTransition, new MouseEvent('click'));
    }
  }

  private removeTransition(transitionId: string) {
    const current = this.workflow();
    if (!current) return;
    this.workflow.set({ ...current, transitions: current.transitions.filter(item => item.id !== transitionId) });
    if (this.selectedTransitionId() === transitionId) this.clearSelection();
  }

  private updateNodoignal(nodoId: string, patch: Partial<Nodo>) {
    const current = this.workflow();
    if (!current) return;
    this.workflow.set({
      ...current,
      nodo: current.nodo.map(nodo => nodo.id === nodoId ? { ...nodo, ...patch } : nodo)
    });
  }

  private isLockedByMe(nodoId: string) {
    const lock = this.nodoLocks().get(nodoId);
    return !!lock && lock.userId === this.collab.getClientId();
  }

  private normalizeNodo(nodo: Nodo | CollaborativeWorkflowNodo): Nodo {
    const typed = nodo as Nodo;
    return {
      ...typed,
      formDefinition: typed.formDefinition ? {
        ...typed.formDefinition,
        fields: [...(typed.formDefinition.fields ?? [])].map(field => ({
          ...field,
          columns: this.normalizeGridColumns(field.columns)
        }))
      } : typed.formDefinition,
      documentPermissions: this.normalizeDocumentPermissions(typed.documentPermissions),
      responsibleDepartmentName: typed.responsibleDepartmentName || this.departments().find(item => item.id === typed.responsibleDepartmentId)?.name,
      requiresForm: typed.requiresForm ?? false,
      avgMinutes: typed.avgMinutes ?? 1440
    };
  }

  private loadNodoFormDefinition(nodoId: string) {
    this.api.get<FormDefinition>(`/forms/nodo/${nodoId}`).subscribe({
      next: formDefinition => {
        const current = this.workflow();
        if (!current) return;
        this.workflow.set({
          ...current,
          nodo: current.nodo.map(nodo => nodo.id === nodoId ? { ...nodo, formDefinition } : nodo)
        });
        if (this.selectedNodoId() === nodoId) {
          const nodo = this.workflow()?.nodo.find(item => item.id === nodoId);
          if (!nodo) return;
          this.nodoForm = {
            ...this.nodoForm,
            requiresForm: true,
            formTitle: formDefinition.title || 'Formulario',
            formFields: [...(formDefinition.fields ?? [])]
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
              .map(field => ({ ...field, columns: this.normalizeGridColumns(field.columns) }))
          };
        }
      },
      error: () => {}
    });
  }

  private ensureReachableFormsLoaded(nodoId: string, visited = new Set<string>()) {
    const workflow = this.workflow();
    if (!workflow || visited.has(nodoId)) return;
    visited.add(nodoId);

    const current = workflow.nodo.find(nodo => nodo.id === nodoId);
    if (current?.requiresForm && !current.formDefinition) {
      this.loadNodoFormDefinition(nodoId);
    }

     if (!current || !this.esNodoLogico(current.nodeType)) {
      return;
    }

    for (const transition of workflow.transitions.filter(item => item.toNodoId === nodoId)) {
      this.ensureReachableFormsLoaded(transition.fromNodoId, visited);
    }
  }

  private resolveFieldsAvailableAtNodo(nodoId: string, visited = new Set<string>()): ResolvedNodoField[] {
    const workflow = this.workflow();
    if (!workflow || visited.has(nodoId)) return [] as ResolvedNodoField[];
    const nodo = workflow.nodo.find(item => item.id === nodoId);
    if (!nodo) return [] as ResolvedNodoField[];

    const ownFields: ResolvedNodoField[] = [...(nodo.formDefinition?.fields ?? [])]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(field => ({
        ...field,
        originNodoId: nodo.id,
        originNodoName: nodo.name
      }));

    if (!this.esNodoLogico(nodo.nodeType)) {
      return ownFields;
    }

    const nextVisited = new Set(visited);
    nextVisited.add(nodoId);

    const inheritedFields: ResolvedNodoField[] = workflow.transitions
      .filter(transition => transition.toNodoId === nodoId)
      .flatMap(transition => this.resolveTransitionFields(transition, nextVisited));

    return this.uniqueResolvedFields([...ownFields, ...inheritedFields]);
  }

  private resolveTransitionFields(transition: Transition, visited = new Set<string>()): ResolvedNodoField[] {
    const sourceFields: ResolvedNodoField[] = this.resolveFieldsAvailableAtNodo(transition.fromNodoId, visited);
    return this.filterForwardFields(sourceFields, {
      mode: this.normalizeForwardMode(transition.forwardConfig?.mode),
      fieldNames: [...(transition.forwardConfig?.fieldNames ?? [])],
      includeFiles: Boolean(transition.forwardConfig?.includeFiles)
    });
  }

  private uniqueResolvedFields(fields: ResolvedNodoField[]): ResolvedNodoField[] {
    const seen = new Set<string>();
    return fields.filter(field => {
      const key = `${field.originNodoId}::${field.name}::${field.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private esNodoLogico(nodeType: string | undefined) {
    return this.nodeBehaviorResolver.resolve(nodeType).isLogical;
  }

  private nodoCenter(nodoId: string) {
    const nodo = this.workflow()?.nodo.find(item => item.id === nodoId);
    if (!nodo) return null;
    const x = nodo.posX ?? 0;
    const y = nodo.posY ?? 0;
    return this.nodeBehaviorResolver.resolve(nodo).resolveCenter(x, y);
  }

  private nodoBoxWidth(nodo: Pick<Nodo, 'nodeType'>) {
    return this.nodeBehaviorResolver.resolve(nodo).width;
  }

  private nodoBoxHeight(nodo: Pick<Nodo, 'nodeType'>) {
    return this.nodeBehaviorResolver.resolve(nodo).height;
  }

  private defaultTransitionName(source?: Nodo) {
    if (!source) return '';
    const outgoing = this.workflow()?.transitions.filter(item => item.fromNodoId === source.id).length || 0;
    return this.nodeBehaviorResolver.resolve(source).defaultTransitionName(outgoing);
  }

  private async autoLayoutWorkflow() {
    const workflow = this.workflow();
    if (!workflow?.nodo.length) return;
    const nextNodos = autoLayoutWorkflowNodos(workflow, this.departments(), this.nodeBehaviorResolver);

    this.workflow.set({ ...workflow, nodo: nextNodos });

    await Promise.all(nextNodos.map(async nodo => {
      await firstValueFrom(this.api.patch<Nodo>(`/workflow-nodos/${nodo.id}`, {
        posX: nodo.posX,
        posY: nodo.posY
      }));
    }));
  }

  private createFieldId() {
    return `field-${Math.random().toString(36).slice(2, 10)}`;
  }

  private createGridColumn(order: number): GridColumn {
    return {
      id: this.createFieldId(),
      name: `columna_${order}`,
      type: 'TEXT',
      order
    };
  }

  private normalizeGridColumns(columns?: Array<Partial<GridColumn>> | null): GridColumn[] {
    return [...(columns ?? [])]
      .filter(column => !!column)
      .map((column, index) => ({
        id: column.id || this.createFieldId(),
        name: column.name || `columna_${index + 1}`,
        type: this.normalizeGridColumnType(column.type),
        order: index + 1
      }));
  }

  private normalizeGridColumnType(type: string | undefined): GridColumnType {
    return this.gridColumnTypes.includes(type as GridColumnType) ? type as GridColumnType : 'TEXT';
  }

  private emptyNodoForm(): NodoForm {
    return {
      name: '',
      description: '',
      nodeType: 'proceso',
      responsibleDepartmentId: '',
      responsibleJobRoleId: '',
      avgMinutes: 1440,
      trueLabel: 'Si',
      falseLabel: 'No',
      condition: '',
      requiresForm: false,
      documentPermissions: [],
      formTitle: 'Formulario',
      formFields: []
    };
  }

  private emptyTransitionForm(): TransitionForm {
      return {
        mode: 'none',
        fieldNames: [],
        includeFiles: false
      };
    }

  private filterForwardFields(fields: ResolvedNodoField[], config: TransitionForm): ResolvedNodoField[] {
    const selectedNames = new Set(config.fieldNames);
    return fields.filter(field => {
      const isFileField = field.type === 'FILE';
      if (config.mode === 'none') return false;
      if (config.mode === 'files-only') return isFileField;
      if (config.mode === 'all') return config.includeFiles || !isFileField;
      if (config.mode === 'selected') return selectedNames.has(field.name) || (config.includeFiles && isFileField);
      return false;
    });
  }

  private normalizeForwardMode(mode: string | undefined): ForwardMode {
    if (mode === 'selected' || mode === 'all' || mode === 'files-only') {
      return mode;
    }
    return 'none';
  }

  departmentName(departmentId: string) {
    return this.departments().find(d => d.id === departmentId)?.name || '';
  }

  onResponsibleDepartmentChange(departmentId: string) {
    this.nodoForm.responsibleJobRoleId = '';
    this.nodoForm.documentPermissions = [];
  }

  onResponsibleJobRoleChange(jobRoleId: string) {
    const existing = this.nodoForm.documentPermissions[0];
    if (jobRoleId) {
      this.nodoForm.documentPermissions = [{
        departmentId: jobRoleId,
        canCreate: false,
        canRead: existing?.canRead ?? false,
        canEdit: existing?.canEdit ?? false
      }];
    } else {
      this.nodoForm.documentPermissions = [];
    }
  }

  private initDocumentPermissions(nodo: Nodo): DocumentPermission[] {
    const jobRoleId = nodo.responsibleJobRoleId || '';
    if (!jobRoleId) return [];
    const existing = nodo.documentPermissions?.find(p => p.departmentId === jobRoleId);
    return [{
      departmentId: jobRoleId,
      canCreate: false,
      canRead: existing?.canRead ?? false,
      canEdit: existing?.canEdit ?? false
    }];
  }

  private normalizeDocumentPermissions(permissions?: Array<Partial<DocumentPermission>> | null): DocumentPermission[] {
    return [...(permissions ?? [])]
      .filter(permission => !!permission && typeof permission.departmentId === 'string' && permission.departmentId.trim().length > 0)
      .map(permission => ({
        departmentId: permission.departmentId!.trim(),
        canCreate: Boolean(permission.canCreate),
        canRead: Boolean(permission.canRead),
        canEdit: Boolean(permission.canEdit)
      }));
  }

  async runPriorityAnalysis() {
    const wfId = this.workflow()?.id;
    if (!wfId || this.priorityLoading()) return;
    this.priorityLoading.set(true);
    const { result, offline } = await this.tfAnalysis.runPriorityAnalysis(wfId);
    if (result) {
      this.priorityResult.set(result);
      if (offline) this.snack.open('Modo offline — datos cacheados', '', { duration: 2000 });
    } else {
      this.snack.open('No se pudo obtener prioridades', '', { duration: 3000 });
    }
    this.priorityLoading.set(false);
  }

  async runAnomalyAnalysis() {
    const wfId = this.workflow()?.id;
    if (!wfId || this.anomalyLoading()) return;
    this.anomalyLoading.set(true);
    const { result, offline } = await this.tfAnalysis.runAnomalyAnalysis(wfId);
    if (result) {
      this.anomalyResult.set(result);
      if (offline) this.snack.open('Modo offline — datos cacheados', '', { duration: 2000 });
    } else {
      this.snack.open('No se pudo analizar anomalías', '', { duration: 3000 });
    }
    this.anomalyLoading.set(false);
  }

  async runBottleneckAnalysis() {
    const wfId = this.workflow()?.id;
    if (!wfId || this.bottleneckLoading()) return;
    this.bottleneckLoading.set(true);
    const { result, offline } = await this.tfAnalysis.runBottleneckAnalysis(wfId);
    if (result) {
      this.bottleneckResult.set(result);
      if (offline) this.snack.open('Modo offline — datos cacheados', '', { duration: 2000 });
    } else {
      this.snack.open('No se pudo analizar cuellos de botella', '', { duration: 3000 });
    }
    this.bottleneckLoading.set(false);
  }

  async runDelayAnalysis() {
    const wfId = this.workflow()?.id;
    if (!wfId || this.delayLoading()) return;
    this.delayLoading.set(true);
    const { result, offline } = await this.tfAnalysis.runDelayAnalysis(wfId);
    if (result) {
      this.delayResult.set(result);
      if (offline) this.snack.open('Modo offline — datos cacheados', '', { duration: 2000 });
    } else {
      this.snack.open('No se pudo predecir demora', '', { duration: 3000 });
    }
    this.delayLoading.set(false);
  }

  urgencyColor(level: string): string {
    switch (level) {
      case 'CRITICAL': return 'text-red-400 bg-red-900/20 border-red-200';
      case 'HIGH':     return 'text-orange-400 bg-orange-900/20 border-orange-200';
      case 'MEDIUM':   return 'text-yellow-400 bg-yellow-900/20 border-yellow-200';
      default:         return 'text-blue-200 bg-[#081726] border-blue-900/40';
    }
  }

  anomalyFactorLabel(factor: string): string {
    const map: Record<string, string> = {
      elapsed_ratio:       'Tiempo total excedido',
      nodo_position_ratio: 'Posición en el flujo',
      time_in_nodo_ratio:  'Tiempo en nodo actual',
      hour_of_day:         'Hora inusual',
      day_of_week:         'Día inusual',
      wf_load:             'Carga del workflow',
    };
    return map[factor] ?? factor;
  }

  formatHours(h: number): string {
    if (h >= 24) return `${(h / 24).toFixed(1)} d`;
    if (h >= 1)  return `${h.toFixed(1)} h`;
    return `${Math.round(h * 60)} min`;
  }
}





