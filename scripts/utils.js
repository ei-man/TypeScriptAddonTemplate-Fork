const { findSteamAppByName, SteamNotFoundError } = require("@moddota/find-steam-app");
const fs = require("fs");
const packageJson = require("../package.json");

module.exports.getAddonName = () => {
    if (!/^[a-z][\d_a-z]+$/.test(packageJson.name)) {
        throw new Error(
            "Addon name may consist only of lowercase characters, digits, and underscores " +
                "and should start with a letter. Edit `name` field in `package.json` file.",
        );
    }

    return packageJson.name;
};

module.exports.isWsl = () =>
    process.platform === "linux" &&
    (Boolean(process.env.WSL_DISTRO_NAME) ||
        (() => {
            try {
                return fs.readFileSync("/proc/version", "utf8").toLowerCase().includes("microsoft");
            } catch (_) {
                return false;
            }
        })());

module.exports.getDotaPath = async () => {
    // On WSL, prefer mounted Windows Steam libraries so postinstall links to Windows Dota.
    if (this.isWsl()) {
        const candidates = [];
        for (const drive of ["c", "d", "e", "f", "g", "h", "i"]) {
            candidates.push(`/mnt/${drive}/Program Files (x86)/Steam/steamapps/common/dota 2 beta`);
            candidates.push(`/mnt/${drive}/Program Files/Steam/steamapps/common/dota 2 beta`);
            candidates.push(`/mnt/${drive}/SteamLibrary/steamapps/common/dota 2 beta`);
        }

        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }
    }

    try {
        return await findSteamAppByName("dota 2 beta");
    } catch (error) {
        if (!(error instanceof SteamNotFoundError)) {
            throw error;
        }
    }
};
