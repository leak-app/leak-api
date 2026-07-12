#!/usr/bin/env bash
set -euo pipefail

export BUMP_PKG_JSON="package.json"

CURRENT_VERSION=$(node -p "require('./package.json').version")

# Ask the user for the new version
echo -n "Enter new version (current is $CURRENT_VERSION, press Enter to auto-bump patch): "

# Read input from terminal tty to ensure interactive prompt works even in non-interactive pipelines
read -r USER_VERSION </dev/tty || USER_VERSION=""

export USER_VERSION

node <<'NODE'
const fs = require('fs');
const path = process.env.BUMP_PKG_JSON;
const userVersion = (process.env.USER_VERSION || '').trim();

const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
const v = pkg.version;

let nextVersion = '';
if (userVersion) {
  nextVersion = userVersion;
} else {
  const parts = v.split('.');
  if (parts.length !== 3 || parts.some((p) => !Number.isFinite(Number(p)))) {
    console.error(`Invalid semver major.minor.patch version: ${v}`);
    process.exit(1);
  }
  const major = Number(parts[0]);
  const minor = Number(parts[1]);
  const patch = Number(parts[2]) + 1;
  nextVersion = `${major}.${minor}.${patch}`;
}

pkg.version = nextVersion;
fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
console.log(`Version: ${v} → ${pkg.version}`);
NODE

echo "package.json updated with the new version"

NEW_VERSION=$(node -p "require('./package.json').version")

echo "Running: git add package.json"
git add package.json
echo "Staged package.json"

echo "Running: git commit -m \"chore: 🔖 bump version to $NEW_VERSION\""
git commit -m "chore: 🔖 bump version to $NEW_VERSION"
echo "Commit created"
