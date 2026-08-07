const { spawn } = require("node:child_process");

const POWERSHELL_COMMAND_END = "__COMMAND_END__";

let powerShellProcess;
let powerShellOutput = "";
let pendingPowerShellCallback = null;

function startPowerShellProcess() {
    powerShellProcess = spawn("powershell.exe",["-NoLogo","-NoProfile",
        "-NonInteractive","-Command","-"]);

    powerShellProcess.on("spawn",()=>{ //spawn hazır event
        console.log("PowerShell süreci başlatıldı.");

        powerShellProcess.stdin.write(
            '[Console]::InputEncoding = [System.Text.Encoding]::UTF8; ' +
            '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ' +
            '$OutputEncoding = [System.Text.Encoding]::UTF8\n'
        );
    });

    powerShellProcess.stdout.on("data",(data)=>{
        powerShellOutput += data.toString();

        if(powerShellOutput.includes(POWERSHELL_COMMAND_END)) {

            const completedOutput = powerShellOutput
            .replace(POWERSHELL_COMMAND_END, "")
            .trim();

            powerShellOutput = "";

            if(pendingPowerShellCallback) {
                pendingPowerShellCallback(completedOutput);
                pendingPowerShellCallback = null;
            }
        }
    });

    powerShellProcess.stderr.on("data", (data)=>{
        console.error("PowerShell Hatası:", data.toString());
    });
}

function runPowerShellCommand(command, callback) {
    pendingPowerShellCallback = callback;

    powerShellProcess.stdin.write(`${command}; Write-Output "${POWERSHELL_COMMAND_END}"\n`);
}

function stopPowerShellProcess() {

    if(powerShellProcess){
        powerShellProcess.stdin.end();  // yeni komut gönderilmeyecek
        powerShellProcess.kill();   // çalışan süreç sonlanacak
        powerShellProcess = null;   // artık çalışan bir süreç göstermiyor
    }    

}

module.exports = {

    startPowerShellProcess,
    runPowerShellCommand,
    stopPowerShellProcess
    
};