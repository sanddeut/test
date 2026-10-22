import { createRequire } from "module";
const require = createRequire("/opt/node-tools/node_modules/");
const { chromium } = require("playwright");
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
await p.goto("file:///tmp/claude-0/-home-user-test/00da1e0a-459d-5465-910e-8f650899689b/scratchpad/site2/index.html");
await p.waitForTimeout(1500);
await p.screenshot({ path: "/tmp/claude-0/-home-user-test/00da1e0a-459d-5465-910e-8f650899689b/scratchpad/page3.png", fullPage: false });
await b.close();
