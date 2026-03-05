// Orchestrator script that uses upstream repos (as git submodules) to generate
// Dota 2 TypeScript type declarations. Does NOT reimplement any logic — just
// shells out to the upstream build commands and copies the output.

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs-extra");

const ROOT = path.resolve(__dirname, "..");
const DOTA_DATA = path.join(ROOT, "vendor", "dota-data");
const TS_DECL = path.join(ROOT, "vendor", "TypeScriptDeclarations");
const DOTA_TYPES = path.join(ROOT, "dota_types");

const skipDump = process.argv.includes("--skip-dump");

function run(cmd, cwd = ROOT) {
	console.log(`\n> [${path.relative(ROOT, cwd) || "."}] ${cmd}`);
	execSync(cmd, { cwd, stdio: "inherit" });
}

// 1. Ensure submodules are initialized
console.log("=== Initializing submodules ===");
run("git submodule update --init");

// 2. Install dependencies in both vendor repos
console.log("\n=== Installing dota-data dependencies ===");
run("npm install", DOTA_DATA);

console.log("\n=== Installing TypeScriptDeclarations dependencies ===");
run("npm install", TS_DECL);

// 3. Build dota-data
// With dump: auto-dump captures fresh API data, then full build regenerates files/ from dump
// Without dump (--skip-dump): only compile TS→lib/, keep existing files/ JSON intact
//   (build:clean wipes files/, so we must NOT run full build without a dump)
if (!skipDump) {
	console.log("\n=== Running dota-data auto-dump (launching Dota 2) ===");
	run("npm run auto-dump", DOTA_DATA);
	console.log("\n=== Building dota-data (full rebuild from dump) ===");
	run("npm run build", DOTA_DATA);
} else {
	console.log(
		"\n=== Skipping dump (--skip-dump). Using existing files/ data. ===",
	);
	console.log("\n=== Compiling dota-data TypeScript ===");
	run("npm run build:tsc", DOTA_DATA);
}

// 5. Create junction so TypeScriptDeclarations can resolve @moddota/dota-data
// TypeScriptDeclarations imports from '@moddota/dota-data/files/...'
const junctionTarget = DOTA_DATA;
const junctionPath = path.join(
	TS_DECL,
	"node_modules",
	"@moddota",
	"dota-data",
);

console.log("\n=== Linking @moddota/dota-data for TypeScriptDeclarations ===");
fs.ensureDirSync(path.join(TS_DECL, "node_modules", "@moddota"));
// Remove existing (could be a real npm install or stale junction)
if (fs.existsSync(junctionPath)) {
	fs.removeSync(junctionPath);
}
fs.symlinkSync(junctionTarget, junctionPath, "junction");
console.log(`  ${junctionPath} -> ${junctionTarget}`);

// 6. Run TypeScriptDeclarations' build (generates .d.ts files)
console.log("\n=== Building TypeScriptDeclarations ===");
run("npm run build", TS_DECL);

// 7. Copy generated types to dota_types/
console.log("\n=== Copying generated types to dota_types/ ===");

const LUA_SRC = path.join(TS_DECL, "packages", "dota-lua-types");
const PAN_SRC = path.join(TS_DECL, "packages", "panorama-types");
const LUA_DST = path.join(DOTA_TYPES, "lua");
const PAN_DST = path.join(DOTA_TYPES, "panorama");

function copyPackage(srcDir, dstDir) {
	fs.removeSync(dstDir);
	fs.ensureDirSync(dstDir);
	// Copy type declarations and package.json
	for (const item of ["package.json", "index.d.ts", "normalized.d.ts", "types"]) {
		const src = path.join(srcDir, item);
		if (fs.existsSync(src)) {
			fs.copySync(src, path.join(dstDir, item));
		}
	}
	// Copy only published transformer files (JS + mappings, not TS source/tsconfig)
	const transformerSrc = path.join(srcDir, "transformer");
	const transformerDst = path.join(dstDir, "transformer");
	if (fs.existsSync(transformerSrc)) {
		fs.ensureDirSync(transformerDst);
		for (const file of ["index.js", "index.d.ts", "mappings.json"]) {
			const src = path.join(transformerSrc, file);
			if (fs.existsSync(src)) {
				fs.copySync(src, path.join(transformerDst, file));
			}
		}
	}
}

copyPackage(LUA_SRC, LUA_DST);
copyPackage(PAN_SRC, PAN_DST);

// 8. Restore submodule working trees (generated files are intermediate artifacts)
console.log("\n=== Cleaning up vendor working trees ===");
run("git checkout .", DOTA_DATA);
run("git clean -fd files/ lib/ dumper/dump", DOTA_DATA);
run("git checkout .", TS_DECL);

console.log("\n=== Done! Types generated in dota_types/ ===");
console.log(`  Lua types:     ${LUA_DST}`);
console.log(`  Panorama types: ${PAN_DST}`);
