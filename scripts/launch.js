const { spawn } = require("child_process");
const path = require("path");
const { getAddonName, getDotaPath, isWsl } = require("./utils");

const killProcessTree = (child) => {
    if (child == null || child.exitCode != null) {
        return;
    }

    if (process.platform === "win32") {
        spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"]);
    } else {
        try {
            process.kill(-child.pid, "SIGTERM");
        } catch (_) {
            try {
                child.kill("SIGTERM");
            } catch (_) {
                // Ignore if the child is already gone.
            }
        }
    }
};

const startDev = (usePolling) => {
    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
    const script = usePolling ? "dev-poll" : "dev";
    return spawn(npmCmd, ["run", script], {
        stdio: "inherit",
        detached: process.platform !== "win32", // detached is necessary on linux to later kill the whole group but creates a separate window on windows...
    });
};

const startDota = async () => {
    const dotaPath = await getDotaPath();
    const win64 = path.join(dotaPath, "game", "bin", "win64");

    // You can add any arguments there
    // For example `+dota_launch_custom_game ${getAddonName()} dota` would automatically load "dota" map
    const args = ["-novid", "-tools", "-addon", getAddonName()];
    const dota = spawn(path.join(win64, "dota2.exe"), args, {
        cwd: win64,
        stdio: "ignore",
    });

    return dota;
};

const main = async () => {
    const wsl = isWsl();
    const dota = await startDota();
    const devProcess = startDev(wsl);

    dota.once("exit", () => {
        killProcessTree(devProcess);
    });

    const shutdown = () => {
        killProcessTree(devProcess);
        if (wsl) {
            // WSL can't reliably signal Windows processes; taskkill the image instead.
            spawn("taskkill.exe", ["/IM", "dota2.exe", "/T", "/F"]);
        } else {
            killProcessTree(dota);
        }
        process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
