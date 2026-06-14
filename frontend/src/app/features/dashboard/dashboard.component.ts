import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, MatProgressSpinnerModule],
  template: `
    <div class="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-6 py-6">
      <h2 class="text-3xl font-bold text-white">Dashboard</h2>

      @if (loading()) {
        <div class="flex justify-center py-16"><mat-spinner /></div>
      } @else {
        <div class="rounded-3xl bg-blue-950 p-6 shadow-sm">
          <p class="text-lg text-blue-100">
            Bienvenido, {{ userName() }}
          </p>
        </div>
      }
    </div>
  `
})
export class DashboardComponent implements OnInit {
  private auth = inject(AuthService);
  loading = signal(true);

  userName() {
    return this.auth.user()?.name || 'Usuario';
  }

  ngOnInit() {
    this.loading.set(false);
  }
}
