import fs from "node:fs"

const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8")
const script = fs.readFileSync(new URL("./i18n.js", import.meta.url), "utf8")
const failures = []

const englishBlock = script.match(/const english = \{([\s\S]*?)\n  \}\n\n  const traditionalPhrases/)?.[1] || ""
const englishKeys = new Set(
  [...englishBlock.matchAll(/^\s+"((?:[^"\\]|\\.)+)":/gm)].map((match) => JSON.parse(`"${match[1]}"`)),
)

const visibleHtml = html
  .replace(/<script[\s\S]*?<\/script>/gi, "")
  .replace(/<style[\s\S]*?<\/style>/gi, "")
const textValues = visibleHtml
  .replace(/<[^>]+>/g, "\n")
  .split(/\r?\n/)
  .map((value) => value.trim())
  .filter(Boolean)
const attributeValues = [...visibleHtml.matchAll(/(?:aria-label|title)="([^"]+)"/g)].map((match) => match[1].trim())
const intentionallyUniversal = new Set(["简体中文", "繁體中文"])
const chinese = /[\u3400-\u9fff]/u

for (const value of [...textValues, ...attributeValues]) {
  if (chinese.test(value) && !intentionallyUniversal.has(value) && !englishKeys.has(value)) {
    failures.push(`Missing English translation: ${value}`)
  }
}

for (const language of ["en", "zh-Hans", "zh-Hant"]) {
  if (!html.includes(`<option value="${language}">`)) failures.push(`Missing language option: ${language}`)
  if (!html.includes(`hreflang="${language}"`)) failures.push(`Missing hreflang: ${language}`)
}

if (!html.includes('<html lang="en">')) failures.push("The static default language must be English")
if (!script.includes('supportedLanguages.includes(stored) ? stored : "en"')) failures.push("New visitors must default to English")
if (!html.includes('<link rel="canonical" href="https://imy.email/">')) failures.push("Canonical URL must use https://imy.email/")
if (html.includes("imyemail.xinai.de")) failures.push("Legacy Pages domain remains in index.html")

if (failures.length > 0) {
  console.error(failures.join("\n"))
  process.exit(1)
}

console.log(`Pages i18n check passed: ${englishKeys.size} English translations plus Simplified and Traditional Chinese.`)
