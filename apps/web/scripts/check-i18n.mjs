import fs from "node:fs"
import path from "node:path"
import ts from "typescript"

const root = process.cwd()
const languageFile = path.join(root, "src/lib/language.tsx")
const catalogFile = path.join(root, "src/lib/application-translations.ts")
const mailFile = path.join(root, "src/pages/mail.tsx")
const sourceRoot = path.join(root, "src")
const catalogSources = new Set([languageFile, catalogFile])
const cjkPattern = /[\u3400-\u9fff]/
const keyPattern = /^\s*"([^"]+)": \{\s*"zh-TW":/gm

function catalogKeys(file) {
  const source = fs.readFileSync(file, "utf8")
  return Array.from(source.matchAll(keyPattern), (match) => match[1])
}

const rawKeys = [...catalogKeys(languageFile), ...catalogKeys(catalogFile)]
const translations = new Set(rawKeys)
const duplicateKeys = rawKeys.filter((key, index) => rawKeys.indexOf(key) !== index)
if (duplicateKeys.length > 0) {
  throw new Error(`Duplicate UI translations: ${Array.from(new Set(duplicateKeys)).join(", ")}`)
}

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(target)
    return /\.(ts|tsx)$/.test(entry.name) ? [target] : []
  })
}

const missing = []
for (const file of sourceFiles(sourceRoot).filter((file) => !catalogSources.has(file))) {
  const source = fs.readFileSync(file, "utf8")
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const values = new Set()
  function visit(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) {
      const value = node.text.trim()
      if (value && cjkPattern.test(value)) values.add(value)
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  for (const value of values) {
    if (!translations.has(value)) missing.push(`${path.relative(root, file)}: ${value}`)
  }
}

if (missing.length > 0) {
  throw new Error(`Missing UI translations (${missing.length}):\n${missing.join("\n")}`)
}

const languageSource = fs.readFileSync(languageFile, "utf8")
for (const language of ["zh-CN", "zh-TW", "en"]) {
  if (!languageSource.includes(`value: "${language}"`)) throw new Error(`Missing language option: ${language}`)
}
if (!/translatableAttributes\s*=\s*\[[^\]]*"data-placeholder"/.test(languageSource)) {
  throw new Error("Rich-text data-placeholder attributes must be localized")
}
if (!/protectedTextTags\s*=\s*new Set\(\[[^\]]*"textarea"/.test(languageSource)) {
  throw new Error("Textarea content must be protected while its placeholder remains localizable")
}

const mailSource = fs.readFileSync(mailFile, "utf8")
if (!mailSource.includes('Placeholder.configure({ placeholder: () => translateUiText("输入正文", languageRef.current) })')) {
  throw new Error("The composer placeholder must be generated from the active UI language")
}

console.log(`UI translation check passed: ${translations.size} source strings across Simplified Chinese, Traditional Chinese, and English.`)
