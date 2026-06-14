import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

interface Workflow { id: string; name: string; description: string; companyId?: string; _count: { nodo: number; tramites: number } }

@Component({
  selector: 'app-workflow-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, MatCardModule, MatButtonModule, MatIconModule, MatInputModule, MatFormFieldModule, MatProgressSpinnerModule, MatSnackBarModule],
  template: `
    <div class="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-6 py-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-3xl font-bold text-white">Workflows</h2>
        @if (auth.isAdmin()) { <button mat-flat-button color="primary" (click)="openForm()"><mat-icon>add</mat-icon> Nuevo Workflow</button> }
      </div>

      @if (loading()) { <div class="flex justify-center py-16"><mat-spinner /></div> } @else {
        <div class="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          @for (wf of workflows(); track wf.id) {
            <mat-card class="rounded-3xl p-5 shadow-sm">
              <div class="mb-3">
                <h3 class="text-lg font-semibold text-white">{{ wf.name }}</h3>
                <p class="mt-1 text-sm text-blue-300/70">{{ wf.description }}</p>
              </div>
              <div class="mb-4 flex flex-wrap gap-4 text-sm text-blue-300/70">
                <span class="flex items-center gap-1"><mat-icon class="!h-4 !w-4 !text-base">layers</mat-icon>{{ wf._count.nodo }} etapas</span>
                <span class="flex items-center gap-1"><mat-icon class="!h-4 !w-4 !text-base">description</mat-icon>{{ wf._count.tramites }} tramites</span>
              </div>
              <div class="flex items-center justify-between">
                <button mat-stroked-button [routerLink]="[wf.id, 'editor']"><mat-icon>edit</mat-icon> Editor</button>
                @if (auth.isAdmin()) {
                  <div class="flex items-center">
                    <button mat-icon-button (click)="openForm(wf)"><mat-icon>drive_file_rename_outline</mat-icon></button>
                    <button mat-icon-button color="warn" (click)="delete(wf.id, wf.name)"><mat-icon>delete</mat-icon></button>
                  </div>
                }
              </div>
            </mat-card>
          } @empty {
            <div class="col-span-full rounded-3xl bg-blue-950 px-6 py-16 text-center shadow-sm">
              <mat-icon class="!h-12 !w-12 !text-[48px] text-blue-400/40">account_tree</mat-icon>
              <p class="mt-3 text-blue-300/50">No hay workflows. Crea el primero.</p>
            </div>
          }
        </div>
      }

      @if (showForm()) {
        <div class="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 px-4" (click)="showForm.set(false)">
          <mat-card class="w-full max-w-xl rounded-3xl p-6 shadow-2xl" (click)="$event.stopPropagation()">
            <h3 class="mb-4 text-xl font-semibold text-white">{{ editId() ? 'Editar workflow' : 'Nuevo Workflow' }}</h3>
            <mat-form-field appearance="outline" class="w-full"><mat-label>Nombre</mat-label><input matInput [(ngModel)]="formName"></mat-form-field>
            <mat-form-field appearance="outline" class="w-full"><mat-label>Descripcion</mat-label><textarea matInput rows="3" [(ngModel)]="formDesc"></textarea></mat-form-field>
            <div class="mt-4 flex justify-end gap-2">
              <button mat-button (click)="showForm.set(false)">Cancelar</button>
              <button mat-flat-button color="primary" (click)="save()">Guardar</button>
            </div>
          </mat-card>
        </div>
      }
    </div>
  `
})
export class WorkflowListComponent implements OnInit {
  private api = inject(ApiService);
  private snack = inject(MatSnackBar);
  auth = inject(AuthService);

  workflows = signal<Workflow[]>([]);
  loading = signal(true);
  showForm = signal(false);
  editId = signal<string | null>(null);
  formName = ''; formDesc = '';
  private companyId = '';

  ngOnInit() { this.load(); }

  load() {
    this.companyId = this.auth.user()?.companyId ?? '';
    this.api.get<Workflow[]>('/workflows').subscribe({
      next: w => { this.workflows.set(w); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  openForm(wf?: Workflow) {
    this.editId.set(wf?.id ?? null);
    this.formName = wf?.name ?? '';
    this.formDesc = wf?.description ?? '';
    this.showForm.set(true);
  }

  save() {
    const body = { name: this.formName, description: this.formDesc, companyId: this.companyId };
    const req = this.editId()
      ? this.api.patch(`/workflows/${this.editId()}`, body)
      : this.api.post('/workflows', body);
    req.subscribe({
      next: () => { this.showForm.set(false); this.load(); this.snack.open('Guardado', '', { duration: 2000 }); },
      error: (err) => this.snack.open(err.error?.message || 'Error al guardar', '', { duration: 3000 })
    });
  }

  delete(id: string, name: string) {
    if (!confirm(`¿Eliminar el workflow "${name}"? Esta acción no se puede deshacer.`)) return;
    this.api.delete(`/workflows/${id}`).subscribe({
      next: () => { this.load(); this.snack.open('Workflow eliminado', '', { duration: 2000 }); },
      error: (err) => this.snack.open(err.error?.message || 'Error al eliminar', '', { duration: 3000 })
    });
  }
}
