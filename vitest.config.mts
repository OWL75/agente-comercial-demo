import {defineConfig} from "vitest/config";
import {fileURLToPath} from "node:url";
// Several suites start PostgreSQL/WASM (PGlite); with one worker per core some
// of them never finish starting on a 12-core machine, so parallelism is capped.
export default defineConfig({test:{environment:"node",maxWorkers:4},resolve:{alias:{"@":fileURLToPath(new URL("./src",import.meta.url))}}});
