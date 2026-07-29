import { Service, signal } from '@angular/core';
import { io } from 'socket.io-client';
import { SystemInfo } from '../models/system-info';
import { SystemMetrics } from '../models/system-metrics';

@Service()
export class Socket {

    readonly socket = io("http://localhost:3000");

    systemInfo = signal<SystemInfo | null>(null);
    systemMetrics = signal<SystemMetrics | null>(null);

    constructor() {
        this.socket.on('connect', () => {
            console.log('Socket bağlandı:', this.socket.id);
        });

        this.socket.on('systemInfo', (systemInfoData: SystemInfo)=>{
            this.systemInfo.set(systemInfoData);
            console.log('SystemInfo:', systemInfoData);
        });

        this.socket.on('systemMetrics', (systemMetricsData: SystemMetrics)=>{
            this.systemMetrics.set(systemMetricsData);
            console.log('SystemMetrics:', systemMetricsData);
        });
    }

    changeMetricsInterval(intervalMs: number){
        this.socket.emit("changeMetricsInterval", intervalMs);
    }
}
