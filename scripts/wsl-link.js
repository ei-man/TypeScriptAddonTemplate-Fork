const assert = require("assert");
const { spawnSync } = require("child_process");
const fs = require("fs-extra");
const path = require("path");
const { getAddonName, getDotaPath, isWsl } = require("./utils");

const FSTAB_PATH = "/etc/fstab";

const shellQuote = (value) => `'${String(value).replace(/'/g, `'"'"'`)}'`;

const readFileWithSudoFallback = (filePath) => {
    try {
        return fs.readFileSync(filePath, "utf8");
    } catch (error) {
        if (error && error.code === "EACCES") {
            const result = spawnSync("sudo", ["cat", filePath], { encoding: "utf8" });
            if (result.status !== 0) {
                throw new Error(`Failed to read '${filePath}' (sudo required).`);
            }
            return String(result.stdout || "");
        }
        throw error;
    }
};

const ensureFstabEntry = (line) => {
    const contents = readFileWithSudoFallback(FSTAB_PATH);
    const lines = contents.split(/\r?\n/);
    if (lines.includes(line)) {
        return false;
    }

    const appendCmd = `printf '%s\\n' ${shellQuote(line)} >> ${FSTAB_PATH}`;
    const result = spawnSync("sudo", ["sh", "-c", appendCmd], { stdio: "inherit" });
    if (result.status !== 0) {
        throw new Error(`Failed to update '${FSTAB_PATH}'.`);
    }
    return true;
};

const fstabEscape = (value) =>
    String(value)
        .replace(/\\/g, "\\134")
        .replace(/\t/g, "\\011")
        .replace(/ /g, "\\040");

const isMounted = (mountPoint) => {
    const contents = fs.readFileSync("/proc/self/mountinfo", "utf8");
    return contents.split(/\r?\n/).some((line) => {
        if (!line) {
            return false;
        }
        const fields = line.split(" ");
        return fields[4] === mountPoint;
    });
};

const ensureMountPoint = (sourcePath) => {
    if (!fs.existsSync(sourcePath)) {
        fs.ensureDirSync(sourcePath);
        return;
    }

    if (!fs.lstatSync(sourcePath).isDirectory()) {
        throw new Error(`'${sourcePath}' exists but is not a directory`);
    }
};

const bindMount = (targetPath, sourcePath) => {
    if (isMounted(sourcePath)) {
        return false;
    }

    const result = spawnSync("sudo", ["mount", "--bind", targetPath, sourcePath], { stdio: "inherit" });
    if (result.status !== 0) {
        throw new Error(`Failed to bind mount '${targetPath}' -> '${sourcePath}'.`);
    }
    return true;
};

(async () => {
    if (!isWsl()) {
        console.log("Not running under WSL. Use scripts/install.js instead.");
        return;
    }

    const dotaPath = await getDotaPath();
    if (dotaPath === undefined) {
        console.log("No Dota 2 installation found. Addon linking is skipped.");
        return;
    }

    const addonName = getAddonName();

    for (const directoryName of ["game", "content"]) {
        const sourcePath = path.resolve(__dirname, "..", directoryName);
        assert(fs.existsSync(sourcePath), `Could not find '${sourcePath}'`);

        const targetRoot = path.join(dotaPath, directoryName, "dota_addons");
        assert(fs.existsSync(targetRoot), `Could not find '${targetRoot}'`);

        const targetPath = path.join(targetRoot, addonName);
        if (!fs.existsSync(targetPath)) {
            fs.moveSync(sourcePath, targetPath);
            console.log(`Moved '${sourcePath}' -> '${targetPath}'`);
        }

        ensureMountPoint(sourcePath);
        const mounted = bindMount(targetPath, sourcePath);
        const entry = `${fstabEscape(targetPath)} ${fstabEscape(sourcePath)} none bind 0 0`;
        const added = ensureFstabEntry(entry);

        if (mounted) {
            console.log(`Mounted '${targetPath}' -> '${sourcePath}'`);
        } else {
            console.log(`Mount already active for '${sourcePath}'`);
        }

        if (added) {
            console.log(`Updated ${FSTAB_PATH} with bind mount for '${sourcePath}'`);
        } else {
            console.log(`Entry already exists in ${FSTAB_PATH} for '${sourcePath}'`);
        }
    }
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
