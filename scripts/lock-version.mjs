// Copies the version in package.json into package-lock.json, so a version set by hand is not left behind in the lockfile.
// Runs before every build, and so before every publish, as `prebuild`.
import { readFileSync, writeFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));

if (lock.version !== version || lock.packages?.['']?.version !== version) {
	lock.version = version;
	if (lock.packages?.['']) lock.packages[''].version = version;
	writeFileSync('package-lock.json', JSON.stringify(lock, null, 2) + '\n');
	console.log(`package-lock.json is now at ${version}.`);
}
