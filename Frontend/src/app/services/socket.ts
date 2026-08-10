import { Service, signal, computed } from '@angular/core';
import { io } from 'socket.io-client';
import { SystemMetrics } from '../models/system-metrics';
import { ServerInfo } from '../models/server-info';

interface ServerMetricsMessage {
    serverId: number;
    metrics: SystemMetrics;
}

@Service()
export class Socket {

    readonly socket = io("http://localhost:3000");

    servers = signal<ServerInfo[]>([]);

    selectedServerId =
        signal<number | null>(null);

    metricsByServer =
        signal<Record<number, SystemMetrics>>({});

    selectedServer = computed(() => {

        const serverId =
            this.selectedServerId();

        if (serverId === null) {
            return null;
        }

        return this.servers().find(
            server => server.id === serverId
        ) ?? null;
    });

    selectedMetrics = computed(() => {

        const serverId =
            this.selectedServerId();

        if (serverId === null) {
            return null;
        }

        return this.metricsByServer()[serverId]
            ?? null;
    });

    constructor() {

        this.socket.on('connect', () => {
            console.log(
                'Socket bağlandı:',
                this.socket.id
            );
        });

        this.socket.on(
            'serverList',
            (servers: ServerInfo[]) => {

                this.servers.set(servers);

                const currentServerId =
                    this.selectedServerId();

                const serverStillExists =
                    servers.some(
                        server =>
                            server.id === currentServerId
                    );

                if (!serverStillExists) {
                    this.selectedServerId.set(
                        servers[0]?.id ?? null
                    );
                }
            }
        );

        this.socket.on(
            'serverMetrics',
            (data: ServerMetricsMessage) => {

                this.metricsByServer.update(
                    current => ({
                        ...current,

                        [data.serverId]:
                            data.metrics
                    })
                );
            }
        );
    }

    selectServer(serverId: number | string) {
        this.selectedServerId.set(
            Number(serverId)
        );
    }

    changeMetricsInterval(intervalMs: number) {

        const serverId =
            this.selectedServerId();

        if (serverId === null) {
            return;
        }

        this.socket.emit(
            "changeMetricsInterval",
            {
                serverId,
                intervalMs
            }
        );
    }
}