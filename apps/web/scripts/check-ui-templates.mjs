import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), "utf8")
const cloudCss = read("src/templates/imyemailcloud.css")
const soybeanCss = read("src/templates/imyemail-cloud-sy.css")
const vbenaCss = read("src/templates/imyemail-vbena.css")
const templateSource = read("src/lib/ui-template.ts")
const mainSource = read("src/main.tsx")
const mailPage = read("src/pages/mail.tsx")
const profilePage = read("src/pages/profile.tsx")
const adminPage = read("src/pages/admin.tsx")
const loginPage = read("src/pages/login.tsx")
const registerPage = read("src/pages/register.tsx")
const languageSwitcher = read("src/components/language-switcher.tsx")

const failures = []
const requireText = (source, value, message) => {
  if (!source.includes(value)) failures.push(message)
}
const requireBlockText = (selector, values, message) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const block = cloudCss.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] || ""
  if (!block || values.some((value) => !block.includes(value))) failures.push(message)
}
const requireSoybeanText = (value, message) => {
  if (!soybeanCss.includes(value)) failures.push(message)
}
const requireSoybeanBlockText = (selector, values, message) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const blocks = [...soybeanCss.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g"))].map((match) => match[1])
  if (!blocks.some((block) => values.every((value) => block.includes(value)))) failures.push(message)
}
const requireVbenaText = (value, message) => {
  if (!vbenaCss.includes(value)) failures.push(message)
}
const requireVbenaBlockText = (selector, values, message) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const blocks = [...vbenaCss.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g"))].map((match) => match[1])
  if (!blocks.some((block) => values.every((value) => block.includes(value)))) failures.push(message)
}

requireText(mailPage, "mail-cloud-frame", "Webmail 缺少模板布局锚点 mail-cloud-frame")
requireText(profilePage, "app-page-profile", "个人中心缺少模板布局锚点 app-page-profile")
requireText(profilePage, 'data-ui-section="client-configuration"', "客户端配置缺少稳定语义锚点")
requireText(profilePage, 'data-ui-layout="client-configuration-table"', "客户端配置缺少桌面表格布局")
requireText(profilePage, 'data-ui-layout="client-configuration-cards"', "客户端配置缺少移动端卡片布局")
requireText(profilePage, "data-copy-value={value}", "客户端配置值缺少独立复制按钮")
requireText(profilePage, 'data-ui-section="user-feedback-tickets"', "用户前台缺少反馈工单语义锚点")
requireText(adminPage, 'data-ui-section="admin-feedback-tickets"', "管理后台缺少反馈工单语义锚点")
requireText(cloudCss, '.mail-cloud-frame {', "imyemailcloud 缺少 Webmail 桌面布局")
requireText(cloudCss, '.app-page-profile > div.flex {', "imyemailcloud 缺少个人中心桌面布局")
requireBlockText(".mail-cloud-frame", ["width: 100%", "max-width: none", "margin: 0"], "Webmail 桌面框架必须使用全部可用宽度")
requireBlockText(".app-page-profile > div.flex", ["width: 100%", "max-width: none", "margin: 0"], "个人中心桌面框架必须使用全部可用宽度")
requireText(cloudCss, "@media (min-width: 1440px)", "imyemailcloud 缺少宽屏布局规则")
requireText(cloudCss, "@media (max-width: 767px)", "imyemailcloud 缺少移动端布局规则")
requireText(cloudCss, "@media (prefers-reduced-motion: reduce)", "imyemailcloud 缺少减少动态效果规则")

if (/max-width:\s*(?:1500|1600)px/.test(cloudCss)) failures.push("imyemailcloud 不应恢复固定的桌面外框最大宽度")

requireText(templateSource, '"imyemail-cloud-sy"', "前端模板白名单缺少 imyemail-cloud-sy")
requireText(templateSource, '"imyemail-vbena"', "前端模板白名单缺少 imyemail-vbena")
requireText(mainSource, "applyTheme(getInitialTheme(), false)", "应用入口必须恢复登录和注册页的已保存主题")
requireSoybeanText('html[data-ui-template="imyemail-cloud-sy"] {', "imyemail-cloud-sy 缺少浅色主题 token")
requireSoybeanText('html.dark[data-ui-template="imyemail-cloud-sy"] {', "imyemail-cloud-sy 缺少深色主题 token")
requireSoybeanText(".sy-admin-header {", "imyemail-cloud-sy 缺少管理后台顶栏")
requireSoybeanBlockText('html[data-ui-template="imyemail-cloud-sy"] .mail-cloud-frame', ["width: 100%", "max-width: none", "margin: 0"], "imyemail-cloud-sy Webmail 必须使用全部可用宽度")
requireSoybeanText("@media (min-width: 1440px)", "imyemail-cloud-sy 缺少宽屏布局规则")
requireSoybeanText("@media (max-width: 767px)", "imyemail-cloud-sy 缺少移动端布局规则")
requireSoybeanText("@media (prefers-reduced-motion: reduce)", "imyemail-cloud-sy 缺少减少动态效果规则")

if (/max-width:\s*(?:1500|1600)px/.test(soybeanCss)) failures.push("imyemail-cloud-sy 不应使用固定的桌面外框最大宽度")

requireVbenaText('html[data-ui-template="imyemail-vbena"] {', "imyemail-vbena 缺少浅色主题 token")
requireVbenaText('html.dark[data-ui-template="imyemail-vbena"] {', "imyemail-vbena 缺少深色主题 token")
requireVbenaText(".sy-admin-header {", "imyemail-vbena 缺少管理后台固定顶栏")
requireText(mailPage, "vbena-mail-brand", "imyemail-vbena Webmail 缺少左侧品牌区")
requireVbenaText(".vbena-mail-brand {", "imyemail-vbena 缺少左侧品牌区样式")
requireVbenaText(".vbena-mail-brand-mark {", "imyemail-vbena 缺少左侧品牌图标样式")
requireText(loginPage, "auth-brand-visual", "imyemail-vbena 登录页缺少邮箱品牌视觉")
requireText(loginPage, "auth-brand-at", "imyemail-vbena 登录页缺少 @ 品牌符号")
requireVbenaText(".auth-brand-at {", "imyemail-vbena 缺少 @ 品牌符号样式")
requireText(loginPage, "<LanguageSwitcher />", "登录页缺少用户语言切换入口")
requireText(registerPage, "<LanguageSwitcher />", "注册页缺少用户语言切换入口")
requireText(profilePage, "<LanguageSwitcher compact />", "个人中心缺少用户语言切换入口")
requireText(languageSwitcher, "setLanguage", "语言切换组件必须保存用户选择")
requireText(mailPage, 'aria-label="切换语言"', "Webmail 缺少用户语言切换入口")
if (/className="[^"]*\bhidden\b[^"]*"[^>]*aria-label="切换语言"/.test(mailPage)) failures.push("Webmail 语言切换入口不应隐藏")
requireVbenaBlockText('html[data-ui-template="imyemail-vbena"] .mail-cloud-frame', ["width: 100%", "max-width: none", "margin: 0"], "imyemail-vbena Webmail 必须使用全部可用宽度")
requireVbenaText("@media (min-width: 1440px)", "imyemail-vbena 缺少宽屏布局规则")
requireVbenaText("@media (max-width: 767px)", "imyemail-vbena 缺少移动端布局规则")
requireVbenaText("@media (prefers-reduced-motion: reduce)", "imyemail-vbena 缺少减少动态效果规则")

if (/max-width:\s*(?:1500|1600)px/.test(vbenaCss)) failures.push("imyemail-vbena 不应使用固定的桌面外框最大宽度")

if (failures.length > 0) {
  console.error("\nUI template contract check failed:\n")
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log("UI template contract passed for cloud, Soybean, and Vben templates: desktop, wide-screen, mobile, dark and reduced-motion rules are present.")
