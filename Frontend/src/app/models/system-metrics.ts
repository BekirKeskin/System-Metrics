export interface SystemMetrics {
    cpuUsagePercentage: number;
    usedMemGB: number;
    freeMemGB: number;
    memUsagePercentage: number; 
    readMBPerSec: number;
    writeMBPerSec: number;
    receivedMbps: number;
    sentMbps: number;
    networkUsagePercentage: number;
}