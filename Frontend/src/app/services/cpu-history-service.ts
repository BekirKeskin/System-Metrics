import { inject, Service } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { CpuHistoryResponse } from '../models/cpu-history';

@Service()
export class CpuHistoryService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = 'http://localhost:3000';

  getCpuHistory(serverId: number, limit = 60) {
    return this.http.get<CpuHistoryResponse>(
      `${this.baseUrl}/metrics/cpu-history`,
      {
        params: {
          serverId: serverId.toString(),
          limit: limit.toString()
        }
      }
    );
  }
}