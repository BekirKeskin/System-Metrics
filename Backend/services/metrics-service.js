const os = require("node:os");
const { exec } = require("node:child_process");
const { runPowerShellCommand } = require("./powershell-service");

const BYTES_IN_MB = 1024 ** 2;
const BYTES_IN_GB = 1024 ** 3;
const BITS_IN_BYTE = 8;
const BITS_IN_MEGABIT = 1_000_000;

function getCpuTimes() {
    const cpus = os.cpus();

    let totalTime = 0;
    let idleTime = 0;

    cpus.forEach((cpu)=>{
        totalTime += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
        idleTime += cpu.times.idle;
    });

    return {
        total: totalTime,
        idle: idleTime
    };
}

function calculateCpuUsage(previousMeasure, currentMeasure){
    const totalDiff = currentMeasure.total - previousMeasure.total;
    const idleDiff = currentMeasure.idle - previousMeasure.idle;
    const activeDiff = totalDiff - idleDiff;

    return totalDiff > 0 ? (activeDiff / totalDiff) * 100 : 0;
}

function getRamMetrics(){
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsage = usedMem / totalMem * 100;
    
    return{
        totalMemGB: Number((totalMem/BYTES_IN_GB).toFixed(2)),
        freeMemGB: Number((freeMem/BYTES_IN_GB).toFixed(2)),
        usedMemGB: Number((usedMem/BYTES_IN_GB).toFixed(2)),
        usagePercentage: Number(memUsage.toFixed(2))
    };
}

function getPhysicalCoreCount(callback) {
    exec(
        "powershell -NoProfile -Command \"(Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfCores -Sum).Sum\"",
        (error, stdout, stderr) => {
            if (error) {
                console.error("Fiziksel çekirdek bilgisi alınamadı:", error);
                return;
            }
            const physicalCoreCount = Number(stdout.trim());
            callback(physicalCoreCount);
        }
    );
}

function getNetworkInfo(callback){
    exec(
        "powerShell -NoProfile -Command \"$route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Where-Object { $_.State -eq 'Alive' } | Sort-Object RouteMetric, InterfaceMetric | Select-Object -First 1; Get-NetAdapter -InterfaceIndex $route.InterfaceIndex | Select-Object Name, InterfaceDescription, LinkSpeed | ConvertTo-Json -Compress\"",
        (error, stdout, stderr) => {
            if (error) {
                console.error("Ağ bilgisi alınamadı: ", error);
                return;
            }
            const networkInfo = JSON.parse(stdout.trim());

            const counterInstanceName = networkInfo.InterfaceDescription
                .replaceAll("(","[")
                .replaceAll(")","]");

            const linkSpeedText = networkInfo.LinkSpeed.trim();
            let interfaceSpeedMbps;

            if(linkSpeedText.includes("Gbps")){
                interfaceSpeedMbps = Number(linkSpeedText.replace("Gbps", "").trim()) * 1000;
            } else if(linkSpeedText.includes("Mbps")){
                interfaceSpeedMbps = Number(linkSpeedText.replace("Mbps", "").trim());
            } else {
                console.error("Tanımlanmayan bağlantı hızı birimi: ", linkSpeedText);
                return;
            }

            const parsedNetworkInfo = {
                interfaceName: networkInfo.Name,
                interfaceDescription: networkInfo.InterfaceDescription,
                counterInstanceName,
                interfaceSpeedMbps
            };
            callback(parsedNetworkInfo);
        }
    );
}

function calculateNetworkMetrics(dynamicMetrics, interfaceSpeedMbps){

    const receivedMbps = Number(((dynamicMetrics.receivedBytesPerSec * BITS_IN_BYTE) / BITS_IN_MEGABIT).toFixed(2));
    const sentMbps = Number(((dynamicMetrics.sentBytesPerSec * BITS_IN_BYTE) / BITS_IN_MEGABIT).toFixed(2));
    const totalBytesPerSec = dynamicMetrics.receivedBytesPerSec + dynamicMetrics.sentBytesPerSec;

    const totalBitsPerSec = totalBytesPerSec * BITS_IN_BYTE;
    const capacityBitsPerSec = interfaceSpeedMbps * BITS_IN_MEGABIT;
    const networkUsagePercentage = Number(((totalBitsPerSec / capacityBitsPerSec) * 100).toFixed(2));

    return {
        receivedMbps,
        sentMbps,
        networkUsagePercentage
    };
}

function getUnitedDynamicMetrics(counterInstanceName, callback){
    const command = `(Get-Counter '\\FizikselDisk(_Total)\\Disk Okuma Bayt/sn','\\FizikselDisk(_Total)\\Disk Yazma Bayt/sn','\\Ağ Bağdaştırıcısı(${counterInstanceName})\\Alınan Bayt/sn','\\Ağ Bağdaştırıcısı(${counterInstanceName})\\Gönderilen Bayt/sn').CounterSamples | Select-Object -ExpandProperty CookedValue`;

    runPowerShellCommand(command, (output) => {

        try {
            const values = output.trim().split(/\r?\n/);

            if (values.length < 4) {
                console.log("Tüm dinamik metrikler alınamadı:", values);
                callback(null);
                return;
            }

            const readBytesPerSec = Number(values[0].replace(",", "."));
            const writeBytesPerSec = Number(values[1].replace(",", "."));
            const receivedBytesPerSec = Number(values[2].replace(",", "."));
            const sentBytesPerSec = Number(values[3].replace(",", "."));

            const readMBPerSec = Number((readBytesPerSec/BYTES_IN_MB).toFixed(2));
            const writeMBPerSec = Number((writeBytesPerSec/BYTES_IN_MB).toFixed(2));

            callback({
                readMBPerSec,
                writeMBPerSec,
                receivedBytesPerSec,
                sentBytesPerSec
            });
        } catch (error) {
            console.error("Dinamik metrik çıktısı çözülemedi:", output);
            console.error(error);
            callback(null);
        }
    });
}

module.exports = {
    getCpuTimes,
    calculateCpuUsage,
    getRamMetrics,
    getPhysicalCoreCount,
    getNetworkInfo,
    calculateNetworkMetrics,
    getUnitedDynamicMetrics
}