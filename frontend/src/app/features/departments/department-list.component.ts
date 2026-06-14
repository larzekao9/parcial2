import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

interface Company { id: string; name: string; }
interface Department { id: string; companyId: string; name: string; }

@Component({
  selector: 'app-department-list',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressSpinnerModule, MatSelectModule, MatSnackBarModule],
  template: `
    <div class="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-6 py-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-3xl font-bold text-white">Departamentos</h2>
        <button mat-flat-button color="primary" (click)="openCreate()"><mat-icon>add</mat-icon> Nuevo departamento</button>
      </div>

      @if (loading()) {
        <div class="flex justify-center py-16"><mat-spinner /></div>
      } @else {
        <div class="overflow-hidden rounded-3xl shadow-sm" style="background:#0f2140">
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm" style="background:transparent;color:#e2e8f0">
              <thead style="background:#07111e">
                <tr><th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style="color:#93c5fd">Departamento</th><th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style="color:#93c5fd">Acciones</th></tr>
              </thead>
              <tbody>
                @for (department of departments(); track department.id) {
                  <tr style="border-top:1px solid rgba(59,130,246,0.15)">
                    <td class="px-4 py-3" style="color:#e2e8f0">{{ department.name }}</td>
                    <td class="px-4 py-3 flex items-center">
                      <button mat-icon-button (click)="openEdit(department)"><mat-icon>edit</mat-icon></button>
                      <button mat-icon-button color="warn" (click)="delete(department.id, department.name)"><mat-icon>delete</mat-icon></button>
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="3" class="px-4 py-10 text-center text-blue-300/50">No hay departamentos</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      @if (showForm()) {
        <div class="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 px-4" (click)="showForm.set(false)">
          <mat-card class="w-full max-w-lg rounded-3xl p-6 shadow-2xl" (click)="$event.stopPropagation()">
            <h3 class="mb-4 text-xl font-semibold text-white">{{ editId() ? 'Editar' : 'Nuevo' }} departamento</h3>
            <mat-form-field appearance="outline" class="w-full"><mat-label>Nombre</mat-label><input matInput [(ngModel)]="form.name"></mat-form-field>
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
export class DepartmentListComponent implements OnInit {
  private api = inject(ApiService);
  private snack = inject(MatSnackBar);
  auth = inject(AuthService);
  companies = signal<Company[]>([]);
  departments = signal<Department[]>([]);
  loading = signal(true);
  showForm = signal(false);
  editId = signal<string | null>(null);
  form = { companyId: '', name: '' };

  ngOnInit() { this.load(); }

  load() {
    this.api.get<Company[]>('/companies').subscribe(v => this.companies.set(v));
    this.api.get<Department[]>('/departments').subscribe({
      next: v => { this.departments.set(v); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  companyName(id: string) { return this.companies().find(c => c.id === id)?.name || id; }

  openCreate() {
    this.editId.set(null);
    this.form = { companyId: this.auth.user()?.companyId || this.companies()[0]?.id || '', name: '' };
    this.showForm.set(true);
  }

  openEdit(d: Department) {
    this.editId.set(d.id);
    this.form = { companyId: this.auth.user()?.companyId || d.companyId, name: d.name };
    this.showForm.set(true);
  }

  save() {
    const req = this.editId() ? this.api.patch(`/departments/${this.editId()}`, this.form) : this.api.post('/departments', this.form);
    req.subscribe({
      next: () => { this.showForm.set(false); this.load(); this.snack.open('Guardado', '', { duration: 2000 }); },
      error: (e) => this.snack.open(e.error?.message || 'Error', '', { duration: 3000 })
    });
  }

  delete(id: string, name: string) {
    if (!confirm(`¿Eliminar el departamento "${name}"? Esta acción no se puede deshacer.`)) return;
    this.api.delete(`/departments/${id}`).subscribe({
      next: () => { this.load(); this.snack.open('Departamento eliminado', '', { duration: 2000 }); },
      error: (e) => this.snack.open(e.error?.message || 'Error al eliminar', '', { duration: 3000 })
    });
  }
}




