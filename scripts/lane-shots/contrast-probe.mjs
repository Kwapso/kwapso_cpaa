import { chromium } from "playwright"
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addCookies([{ name: "kwapso_session", value: process.env.KW_SESSION, domain: "localhost", path: "/" }])
const p = await ctx.newPage()
const errs = []
p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)) })
p.on("pageerror", (e) => errs.push("PAGEERROR " + e.message.slice(0, 200)))
await p.goto("http://localhost:3055/", { waitUntil: "domcontentloaded" })
await p.waitForTimeout(12000)
console.log(JSON.stringify([...new Set(errs)], null, 1))
await b.close()
