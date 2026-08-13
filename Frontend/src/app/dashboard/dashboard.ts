import { AfterViewInit, Component, effect, ElementRef, inject, OnDestroy, signal, untracked, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Chart } from 'chart.js/auto';
import { Socket } from '../services/socket';
import { CpuHistoryService } from '../services/cpu-history-service';
import { CpuHistoryPoint } from '../models/cpu-history';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})

export class Dashboard implements AfterViewInit, OnDestroy {

  @ViewChild('cpuChart')
  private cpuChartCanvas?: ElementRef<HTMLCanvasElement>;

  readonly socketService = inject(Socket);

  private readonly router = inject(Router);
  private readonly cpuHistoryService = inject(CpuHistoryService);

  readonly cpuHistory = signal<CpuHistoryPoint[]>([]);

  private cpuChart: Chart | null = null;

  isAdmin = localStorage.getItem('userRole') === 'admin';

  constructor() {
    effect(() => {
      const serverId = this.socketService.selectedServerId();

      if (serverId === null) {
        this.cpuHistory.set([]);
        this.updateCpuChart();
        return;
      }

      this.cpuHistoryService
        .getCpuHistory(serverId, 60)
        .subscribe({
          next: (response) => {
            this.cpuHistory.set(response.history);
            this.updateCpuChart();
          },

          error: (error) => {
            console.error(
              'CPU geçmişi alınamadı:',
              error
            );

            this.cpuHistory.set([]);
            this.updateCpuChart();
          }
        });
    });

    effect(() => {
      const metrics = this.socketService.selectedMetrics();

      if (!metrics) {
        return;
      }

      const newPoint: CpuHistoryPoint = {
        cpuUsage: metrics.cpuUsagePercentage,
        recordedAt: new Date().toISOString()
      };

      untracked(() => {

        this.cpuHistory.update((history) => {

          const updatedHistory = [
            ...history,
            newPoint
          ];

          return updatedHistory.slice(-60);
        });

        requestAnimationFrame(() => {
          this.cpuChart?.resize();
          this.updateCpuChart();
        });
      });
    });

  }

  ngAfterViewInit() {
    const canvas = this.cpuChartCanvas?.nativeElement;

    if (!canvas) {
      return;
    }

    this.cpuChart = new Chart(canvas, {
      type: 'line',

      data: {
        labels: [],

        datasets: [
          {
            label: 'CPU Kullanımı (%)',
            data: [],
            tension: 0.25,
            fill: false
          }
        ]
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,

        interaction: {
          mode: 'nearest',
          intersect: false
        },

        plugins: {
          legend: {
            display: false
          }
        },

        scales: {
          x: {
            display: false
          },

          y: {
            display: false,
            min: 0,
            max: 100
          }
        },

        elements: {
          point: {
            radius: 0,
            hoverRadius: 4
          }
        }
      }
    });

    this.updateCpuChart();
  }

  private updateCpuChart() {
    if (!this.cpuChart) {
      return;
    }

    const history = this.cpuHistory();

    this.cpuChart.data.labels = history.map((point) =>
      new Date(point.recordedAt).toLocaleTimeString('tr-TR')
    );

    this.cpuChart.data.datasets[0].data = history.map(
      (point) => point.cpuUsage
    );

    this.cpuChart.update();
  }

  changeMetricsInterval(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    const intervalMs = Number(selectElement.value);

    this.socketService.changeMetricsInterval(intervalMs);
  }

  formatLastSeen(lastSeen: string | null): string {
    if (!lastSeen) {
      return 'Henüz görülmedi';
    }

    return new Date(lastSeen).toLocaleString('tr-TR');
  }

  logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    localStorage.removeItem('userRole');

    this.router.navigate(['/login']);
  }

  goToAdmin() {
    this.router.navigate(['/admin']);
  }

  ngOnDestroy() {
    this.cpuChart?.destroy();
  }
}