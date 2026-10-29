// Starts the web app and the background worker together for local development.
import { spawn } from "node:child_process";
const procs = [spawn("npm", ["run", "dev"], { stdio: "inherit" }), spawn("npm", ["run", "worker"], { stdio: "inherit" })];
const stop = () => procs.forEach((p) => p.kill("SIGTERM"));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
