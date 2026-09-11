import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { createAtomBlockMarkdownSpec, createBlockMarkdownSpec, createInlineMarkdownSpec, mergeAttributes } from "@tiptap/core"

// Guard dependency fixes for GHSA-cp6q-959q-f8rh and GHSA-j95f-988m-3j2f.
// Each parsing probe runs in a bounded child so a regressed regex cannot hang CI.
if (process.argv[2] === "--parse-probe") {
  const blockInput = `:::probe {${"__QUOTED_0".repeat(8192)}__QUOTED_0__} :::\n`
  const probes = {
    atom: () => createAtomBlockMarkdownSpec({ nodeName: "probe" }).markdownTokenizer.tokenize(blockInput, [], {}),
    block: () => createBlockMarkdownSpec({ nodeName: "probe" }).markdownTokenizer.tokenize(blockInput, [], {}),
    inline: () => createInlineMarkdownSpec({ nodeName: "probe", selfClosing: true }).markdownTokenizer.tokenize(`[probe ${"0".repeat(131072)}]`, [], {}),
  }
  assert.ok(Object.hasOwn(probes, process.argv[3]))
  probes[process.argv[3]]()
} else {
  const untrusted = JSON.parse('{"__proto__":{"onerror":"probe","data-inherited-canary":"present"},"class":"custom"}')
  const attributes = mergeAttributes({ class: "base", title: "Safe" }, untrusted)
  assert.equal(Object.getPrototypeOf(attributes), Object.prototype)
  assert.equal(attributes.onerror, undefined)
  assert.equal(attributes["data-inherited-canary"], undefined)
  // The patched helper preserves __proto__ as inert own data, not a setter.
  assert.equal(Object.getOwnPropertyDescriptor(attributes, "__proto__").value, untrusted.__proto__)
  const enumerableKeys = []
  for (const key in attributes) enumerableKeys.push(key)
  assert.ok(!enumerableKeys.includes("onerror") && !enumerableKeys.includes("data-inherited-canary"))
  assert.equal(attributes.class, "base custom")
  assert.equal(attributes.title, "Safe")
  for (const probe of ["atom", "block", "inline"]) {
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--parse-probe", probe], { timeout: 5000, encoding: "utf8" })
    assert.equal(result.status, 0, `${probe} Markdown parser failed or exceeded 5 seconds: ${result.error || result.stderr}`)
  }
  console.log("Editor security regression passed: no inherited DOM attributes; bounded Markdown parsing.")
}
