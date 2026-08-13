import { TestBed } from '@angular/core/testing';

import { CpuHistoryService } from './cpu-history-service';

describe('CpuHistoryService', () => {
  let service: CpuHistoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CpuHistoryService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
