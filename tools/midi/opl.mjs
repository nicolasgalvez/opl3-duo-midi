#!/usr/bin/env node
// Bin shim: the CLI lives in src/cli (TypeScript, run natively by Node >= 24
// via type stripping — see ARCHITECTURE.md). This file stays .mjs so the npm
// bin entries (root + workspace) never change.
import './src/cli/main.ts'
