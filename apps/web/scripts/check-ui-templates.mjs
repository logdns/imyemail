import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), "utf8")
const cloudCss = read("src/templates/imyemailcloud.css")
const mailPage = read("src/pages/mail.tsx")
const profilePage = read("src/pages/profile.tsx")

const failures = []
const requireText = (source, value, message) => {
  if (!source.includes(value)) failures.push(message)
}
const requireBlockText = (selector, values, message) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const block = cloudCss.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] || ""
  if (!block || values.some((value) => !block.includes(value))) failures.push(message)
}

requireText(mailPage, "mail-cloud-frame", "Webmail 缺少模板布局锚点 mail-cloud-frame")
requireText(profilePage, "app-page-profile", "个人中心缺少模板布局锚点 app-page-profile")
requireText(cloudCss, '.mail-cloud-frame {', "imyemailcloud 缺少 Webmail 桌面布局")
requireText(cloudCss, '.app-page-profile > div.flex {', "imyemailcloud 缺少个人中心桌面布局")
requireBlockText(".mail-cloud-frame", ["width: 100%", "max-width: none", "margin: 0"], "Webmail 桌面框架必须使用全部可用宽度")
requireBlockText(".app-page-profile > div.flex", ["width: 100%", "max-width: none", "margin: 0"], "个人中心桌面框架必须使用全部可用宽度")
requireText(cloudCss, "@media (min-width: 1440px)", "imyemailcloud 缺少宽屏布局规则")
requireText(cloudCss, "@media (max-width: 767px)", "imyemailcloud 缺少移动端布局规则")
requireText(cloudCss, "@media (prefers-reduced-motion: reduce)", "imyemailcloud 缺少减少动态效果规则")

if (/max-width:\s*(?:1500|1600)px/.test(cloudCss)) failures.push("imyemailcloud 不应恢复固定的桌面外框最大宽度")

if (failures.length > 0) {
  console.error("\nUI template contract check failed:\n")
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log("UI template contract passed: desktop, wide-screen, mobile and reduced-motion rules are present.")
