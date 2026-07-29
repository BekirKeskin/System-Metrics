import { Component,inject } from '@angular/core';
import { Socket } from '../services/socket';
import { Router } from '@angular/router';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  readonly socketService = inject(Socket);
  private readonly router = inject(Router);

  changeMetricsInterval(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    const intervalMs = Number(selectElement.value);

    this.socketService.changeMetricsInterval(intervalMs);
  }

  logout(){
    localStorage.removeItem('authToken');
    this.router.navigate(['/login']);
  }
}
