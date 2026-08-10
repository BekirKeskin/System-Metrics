export interface ServerInfo {
    id: number;

    name: string;
    hostname: string;
    os: string;

    sourceType:
        'local' | 'agent';

    physicalCoreCount: number;
    logicalProcessorCount: number;

    totalMemGB: number;

    interfaceName: string;
    interfaceSpeedMbps: number;

    lastSeen: string | null;

    isOnline: boolean;
}