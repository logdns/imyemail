import fs from "node:fs"
import path from "node:path"
import { API } from "typescript/unstable/sync"
import { SyntaxKind } from "typescript/unstable/ast"

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
const compiler = new API()
try {
  const config = path.join(root, "tsconfig.json")
  const snapshot = compiler.updateSnapshot({ openProjects: [config] })
  const program = snapshot.getProject(config).program
  for (const file of sourceFiles(sourceRoot).filter((file) => !catalogSources.has(file))) {
    const parsed = program.getSourceFile(file)
    if (!parsed) throw new Error(`Source missing from TypeScript project: ${file}`)
    const values = new Set()
    function visit(node) {
      if (node.kind === SyntaxKind.StringLiteral || node.kind === SyntaxKind.NoSubstitutionTemplateLiteral || node.kind === SyntaxKind.JsxText) {
        const value = node.text.trim()
        if (value && cjkPattern.test(value)) values.add(value)
      }
      node.forEachChild(visit)
    }
    visit(parsed)
    for (const value of values) {
      if (!translations.has(value)) missing.push(`${path.relative(root, file)}: ${value}`)
    }
  }
} finally {
  compiler.close()
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
