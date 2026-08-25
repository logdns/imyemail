(() => {
  const supportedLanguages = ["en", "zh-Hans", "zh-Hant"]
  const storageKey = "imyemail:pages-language"

  const english = {
    "跳到主要内容": "Skip to main content",
    "功能": "Features",
    "架构": "Architecture",
    "部署": "Deploy",
    "客户端": "Clients",
    "文档": "Docs",
    "开始部署": "Deploy now",
    "最新版本 v1.3.24": "Latest release v1.3.24",
    "自己的邮箱，": "Your email.",
    "自己完整掌控。": "Fully under your control.",
    "imyemail 把 Webmail、管理后台、SMTP、IMAP、POP3 和反垃圾能力整合进一套清晰、可备份、可回滚的自建方案。": "imyemail brings Webmail, administration, SMTP, IMAP, POP3, and spam protection together in one clear, backup-ready, rollback-ready self-hosted platform.",
    "一键部署": "One-command deploy",
    "查看源码": "View source",
    "MIT 开源": "MIT licensed",
    "数据完全自持": "Your data stays yours",
    "写信": "Compose",
    "收件箱": "Inbox",
    "星标邮件": "Starred",
    "已发送": "Sent",
    "草稿箱": "Drafts",
    "标签": "Labels",
    "项目": "Projects",
    "重要": "Important",
    "上午好，欢迎回来": "Good morning, welcome back",
    "今日收件": "Received today",
    "较昨日 +12%": "+12% from yesterday",
    "待处理": "To review",
    "4 封重要邮件": "4 important messages",
    "存储空间": "Storage",
    "Release v1.3.24 已成功发布": "Release v1.3.24 published successfully",
    "系统健康检查已完成": "System health check completed",
    "更新前数据库备份创建成功": "Pre-update database backup created",
    "昨天": "Yesterday",
    "证书有效期还有 62 天": "Certificate valid for 62 more days",
    "周三": "Wednesday",
    "系统状态": "System status",
    "全部运行正常": "All systems operational",
    "一套镜像，完整邮件能力": "One image. A complete email platform.",
    "完整但不臃肿": "Complete, without the bloat",
    "从第一封邮件到日常运维，": "From your first message to daily operations,",
    "都在同一个系统里。": "everything lives in one system.",
    "开箱即用的邮箱体验，加上真正适合自托管环境的管理、审计和恢复能力。": "A polished email experience with administration, auditing, and recovery designed for self-hosting.",
    "现代 Webmail": "Modern Webmail",
    "会话阅读、全文搜索、草稿、定时发送、标签、自定义文件夹、联系人、签名、导入导出和多邮箱切换；四套模板适配移动端与超宽屏。": "Threaded reading, full-text search, drafts, scheduled delivery, labels, folders, contacts, signatures, import/export, multiple mailboxes, and four responsive UI templates.",
    "可视化管理后台": "Visual administration",
    "账号、权限、域名、DNS、邮箱、队列、反馈工单、全域公告、三语言默认设置、界面模板和系统统计集中管理。": "Manage accounts, permissions, domains, DNS, mailboxes, queues, feedback tickets, announcements, a three-language default, UI templates, and system analytics in one place.",
    "默认重视安全": "Secure by default",
    "TOTP 双因素、恢复码、应用密码、API scope、Webhook 签名和 SSRF 防护。": "TOTP 2FA, recovery codes, app passwords, API scopes, signed webhooks, and SSRF protection.",
    "标准邮件协议": "Standard email protocols",
    "SMTP Submission、IMAP SSL 和 POP3 SSL，兼容主流桌面与移动客户端。": "SMTP Submission, IMAP SSL, and POP3 SSL for mainstream desktop and mobile clients.",
    "备份、更新与回滚": "Backup, update, and rollback",
    "更新前自动备份，后台异步更新，保留上一镜像并支持回滚或安全删除旧回滚点。": "Automatic pre-update backups, asynchronous updates, preserved previous images, and safe rollback or rollback-point deletion.",
    "开放 API 与自动化": "Open API and automation",
    "通过 `/api/open/v1` 管理域名、邮箱和邮件投递；状态 Webhook 带签名、重试与幂等保护。": "Manage domains, mailboxes, and delivery through `/api/open/v1`; status webhooks include signatures, retries, and idempotency.",
    "清晰的系统边界": "Clear system boundaries",
    "复杂的邮件栈，": "A sophisticated email stack,",
    "简单地交给你。": "made simple for you.",
    "默认 All-in-one 镜像将成熟的邮件组件组合在一起。账号、设置和索引写入 SQLite，邮件原文留在 Maildir，所有关键数据都持久化在宿主机。": "The default all-in-one image combines proven mail components. Accounts, settings, and indexes live in SQLite; original messages stay in Maildir; all critical data persists on the host.",
    "一套 Compose": "One Compose stack",
    "业务服务与内部更新服务职责分离": "Application and internal update responsibilities stay separated",
    "标准组件": "Proven components",
    "Postfix、Dovecot、Rspamd，不重新发明邮件协议": "Postfix, Dovecot, and Rspamd instead of reinventing email protocols",
    "数据可迁移": "Portable data",
    ".env、data、mail、dkim 成套备份即可恢复": "Back up .env, data, mail, and dkim together for recovery",
    "阅读架构说明": "Read the architecture guide",
    "账号与索引": "Accounts and indexes",
    "邮件原文": "Original messages",
    "证书与 DKIM": "Certificates and DKIM",
    "数分钟完成部署": "Deploy in minutes",
    "从一台干净的服务器开始。": "Start with a clean server.",
    "支持 Debian / Ubuntu 的 amd64 与 arm64。管理器会检查 Docker、生成内部令牌、拉取镜像并等待健康检查通过。": "Supports Debian and Ubuntu on amd64 and arm64. The manager checks Docker, creates internal tokens, pulls images, and waits for healthy services.",
    "复制": "Copy",
    "检查 Docker Engine 与 Compose": "Check Docker Engine and Compose",
    "创建 /opt/imyemail 持久化目录": "Create the /opt/imyemail persistent directory",
    "拉取 GHCR 多架构镜像": "Pull multi-architecture GHCR images",
    "服务已启动并通过健康检查": "Services started and passed health checks",
    "安装完成：输出访问地址、管理员用户名和密码获取方式": "Installation complete: URL, administrator username, and password guidance are shown",
    "准备域名和服务器": "Prepare your domain and server",
    "将邮件主机名解析到服务器，并确认所需端口可以访问。": "Point the mail hostname to your server and confirm that the required ports are reachable.",
    "运行安装命令": "Run the installer",
    "根据提示填写主机名、访问地址和初始管理员信息。": "Enter the hostname, public URL, and initial administrator details when prompted.",
    "配置邮件 DNS": "Configure email DNS",
    "在后台逐条复制 MX、SPF、DKIM 和 DMARC，再执行 DNS 检测。": "Copy each MX, SPF, DKIM, and DMARC record from the admin console, then run the DNS check.",
    "签发证书并测试": "Issue certificates and test",
    "启用 ACME 证书，验证 Web、SMTP、IMAP 和 POP3。": "Enable ACME certificates and verify Web, SMTP, IMAP, and POP3.",
    "推荐配置": "Recommended resources",
    "2 核 / 2 GB 内存": "2 cores / 2 GB RAM",
    "操作系统": "Operating system",
    "处理器架构": "CPU architecture",
    "持久化目录": "Persistent directory",
    "连接你熟悉的客户端": "Connect the clients you already use",
    "不锁定工具，": "No lock-in.",
    "只使用标准协议。": "Just standard protocols.",
    "Apple Mail、Thunderbird、Outlook 和移动设备都可以通过完整邮箱地址连接。启用双因素认证后，使用对应邮箱的应用密码。": "Connect Apple Mail, Thunderbird, Outlook, and mobile devices with the full email address. After enabling 2FA, use that mailbox's app password.",
    "查看客户端排错指南": "View the client troubleshooting guide",
    "推荐连接参数": "Recommended connection settings",
    "用户名始终使用完整邮箱地址": "Always use the full email address as the username",
    "接收邮件": "Receive mail",
    "发送邮件": "Send mail",
    "开启 2FA 后，网页登录仍使用账号密码；邮件客户端必须改用应用密码。": "After enabling 2FA, Web login still uses the account password; email clients must use an app password.",
    "更新有路径，出错有退路": "A clear update path, with a way back",
    "安全更新，也能从容回滚。": "Update safely. Roll back confidently.",
    "更新前保存数据库与当前镜像，服务恢复后页面自动刷新。回滚操作要求二次确认。": "Save the database and current image before updating. The page refreshes after recovery, and rollback requires confirmation.",
    "在线备份": "Online backup",
    "创建一致性的 SQLite 更新前备份。": "Create a consistent pre-update SQLite backup.",
    "保存回滚点": "Save rollback point",
    "记录当前镜像和 Compose 配置。": "Record the current image and Compose configuration.",
    "异步更新": "Asynchronous update",
    "Operator 在内网触发镜像更新与重启。": "The Operator triggers image updates and restarts on the internal network.",
    "按需回滚": "Rollback on demand",
    "保留数据库，仅切回上一版本镜像。": "Keep the database and switch only to the previous image.",
    "文档中心": "Documentation",
    "从部署到排错，都有明确说明。": "Clear guidance from deployment to troubleshooting.",
    "在 GitHub 查看全部文档": "View all docs on GitHub",
    "产品": "Product",
    "功能说明": "Feature guide",
    "前台、后台、安全、协议和运维能力总览。": "An overview of user, admin, security, protocol, and operations features.",
    "Docker 部署": "Docker deployment",
    "镜像、Compose、域名、证书和生产注意事项。": "Images, Compose, domains, certificates, and production guidance.",
    "运维": "Operations",
    "安装与运维": "Installation and operations",
    "更新、回滚、备份、恢复、迁移和客户端排错。": "Updates, rollback, backup, recovery, migration, and client troubleshooting.",
    "工程": "Engineering",
    "系统架构": "System architecture",
    "组件职责、数据一致性、安全边界和请求链路。": "Component responsibilities, data consistency, security boundaries, and request flows.",
    "集成": "Integration",
    "开放 API": "Open API",
    "Token、scope、域名、邮箱、投递和 Webhook。": "Tokens, scopes, domains, mailboxes, delivery, and webhooks.",
    "质量": "Quality",
    "开发与发布规范": "Development and release standard",
    "设计融合、验证矩阵、安全审计、文档同步和发布完成标准。": "Design integration, verification matrix, security review, documentation sync, and release definition of done.",
    "你的域名，你的数据，你的规则": "Your domain. Your data. Your rules.",
    "准备好拥有自己的邮箱了吗？": "Ready to own your email?",
    "从一台服务器开始，用开放标准建立真正属于自己的邮件系统。": "Start with one server and build an email system that is truly yours using open standards.",
    "查看部署命令": "View deployment command",
    "GitHub 仓库": "GitHub repository",
    "开源、可管理、可恢复的自建邮箱系统。": "An open-source, manageable, and recoverable self-hosted email platform.",
    "部署指南": "Deployment guide",
    "API 文档": "API docs",
    "来源": "Origins",
    "原始上游": "Original upstream",
    "来源快照": "Source snapshot",
    "以开放标准连接世界。": "Connecting the world through open standards.",
    "安装命令已复制": "Install command copied",
    "已复制": "Copied",
    "复制安装命令": "Copy install command",
    "打开导航": "Open navigation",
    "关闭导航": "Close navigation",
    "主导航": "Main navigation",
    "在 GitHub 查看 imyemail": "View imyemail on GitHub",
    "imyemail 首页": "imyemail home",
    "项目特点": "Project highlights",
    "imyemail 管理界面示意图": "imyemail administration interface preview",
    "API 请求示例": "API request example",
    "imyemail 系统架构示意图": "imyemail system architecture diagram"
  }

  const traditionalPhrases = {
    "管理后台": "管理後台", "自建邮箱": "自架信箱", "电子邮箱": "電子信箱", "邮箱": "信箱", "邮件": "郵件",
    "客户端": "用戶端", "服务器": "伺服器", "账号": "帳號", "数据": "資料", "源码": "原始碼", "项目": "專案",
    "组件": "元件", "界面": "介面", "文件夹": "資料夾", "信息": "資訊", "内存": "記憶體", "主机名": "主機名稱",
    "默认": "預設", "配置": "設定", "设置": "設定", "保存": "儲存", "创建": "建立", "复制": "複製", "检查": "檢查",
    "运行": "執行", "支持": "支援", "链接": "連結", "恢复": "還原", "回滚": "回滾", "通过": "透過", "签名": "簽章",
    "应用密码": "應用程式密碼", "管理器": "管理程式", "复杂": "複雜", "网络": "網路", "会话阅读": "會話閱讀",
    "全文搜索": "全文搜尋", "标签": "標籤", "自定义": "自訂", "联系人": "聯絡人", "导入导出": "匯入匯出",
    "在线": "線上", "端口": "連接埠", "访问地址": "存取網址", "访问": "存取", "GitHub 仓库": "GitHub 儲存庫",
    "收件箱": "收件匣", "草稿箱": "草稿匣", "队列": "佇列", "超宽屏": "超寬螢幕", "移动端": "行動裝置",
    "移动设备": "行動裝置", "兼容": "相容", "异步": "非同步", "镜像": "映像檔", "域名": "網域",
    "证书": "憑證", "运维": "維運", "文档": "文件", "集成": "整合", "当前": "目前", "按需": "視需要"
  }

  const traditionalCharacters = {
    "与":"與","个":"個","为":"為","这":"這","开":"開","关":"關","发":"發","备":"備","录":"錄","标":"標",
    "准":"準","统":"統","现":"現","码":"碼","证":"證","书":"書","验":"驗","测":"測","线":"線","异":"異",
    "后":"後","并":"並","会":"會","设":"設","计":"計","审":"審","档":"檔","质":"質","视":"視","觉":"覺",
    "规":"規","则":"則","运":"運","维":"維","签":"簽","启":"啟","认":"認","应":"應","护":"護","储":"儲",
    "间":"間","较":"較","处":"處","从":"從","属":"屬","拥":"擁","务":"務","构":"構","图":"圖","页":"頁",
    "览":"覽","动":"動","态":"態","锁":"鎖","户":"戶","简":"簡","体":"體","层":"層","经":"經","错":"錯",
    "单":"單","机":"機","环":"環","项":"項","显":"顯","导":"導","入":"入","复":"複","换":"換","仅":"僅",
    "无":"無","时":"時","长":"長","门":"門","条":"條","执":"執","毕":"畢","终":"終","须":"須","读":"讀",
    "权":"權","虑":"慮","实":"實","际":"際","将":"將","进":"進","过":"過","网":"網","达":"達","双":"雙",
    "适":"適","宽":"寬","队":"隊","镜":"鏡","确":"確","幂":"冪","边":"邊","键":"鍵","迁":"遷","连":"連",
    "协":"協","议":"議","阵":"陣","说":"說","请":"請","荐":"薦","参":"參","浏":"瀏","库":"庫","触":"觸",
    "总":"總","链":"鏈","递":"遞","来":"來","闭":"閉","压":"壓","缩":"縮","获":"獲","删":"刪","类":"類",
    "话":"話","阅":"閱","义":"義","联":"聯","系":"系","状":"狀","带":"帶","试":"試","栈":"棧","给":"給",
    "组":"組","写":"寫","业":"業","内":"內","职":"職","责":"責","离":"離","访":"訪","问":"問","装":"裝",
    "据":"據","填":"填","员":"員","检":"檢","对":"對","点":"點","记":"記","当":"當","产":"產","范":"範",
    "吗":"嗎","于":"於","仓":"倉","继":"繼","续":"續","号":"號","华":"華","数":"數","广":"廣","庆":"慶"
  }

  const toTraditional = (value) => {
    let output = value
    Object.entries(traditionalPhrases)
      .sort(([a], [b]) => b.length - a.length)
      .forEach(([from, to]) => { output = output.split(from).join(to) })
    return Array.from(output, (character) => traditionalCharacters[character] || character).join("")
  }

  const head = {
    en: {
      title: "imyemail — Open-source self-hosted email",
      description: "imyemail is an open-source, self-hosted email platform with Webmail, administration, SMTP, IMAP, POP3, backup, updates, and rollback.",
      keywords: "imyemail,self-hosted email,Webmail,SMTP,IMAP,POP3,Docker,open-source email",
      socialDescription: "One image with Webmail, administration, and standard email protocols.",
      locale: "en_US"
    },
    "zh-Hans": {
      title: "imyemail — 开源自建邮箱系统",
      description: "imyemail 是一个包含 Webmail、管理后台、SMTP、IMAP、POP3、备份、在线更新和回滚能力的开源自建邮箱系统。",
      keywords: "imyemail,自建邮箱,Webmail,SMTP,IMAP,POP3,Docker,开源邮箱",
      socialDescription: "一个镜像，完整拥有 Webmail、管理后台和标准邮件协议。",
      locale: "zh_CN"
    },
    "zh-Hant": {
      title: "imyemail — 開源自架信箱系統",
      description: "imyemail 是一個包含 Webmail、管理後台、SMTP、IMAP、POP3、備份、線上更新和回滾能力的開源自架信箱系統。",
      keywords: "imyemail,自架信箱,Webmail,SMTP,IMAP,POP3,Docker,開源信箱",
      socialDescription: "一個映像檔，完整擁有 Webmail、管理後台和標準郵件協定。",
      locale: "zh_TW"
    }
  }

  const textRecords = []
  const attributeRecords = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const node = walker.currentNode
    if (node.parentElement?.closest("script, style")) continue
    const source = node.nodeValue.trim()
    if (!english[source]) continue
    const start = node.nodeValue.indexOf(source)
    textRecords.push({ node, source, prefix: node.nodeValue.slice(0, start), suffix: node.nodeValue.slice(start + source.length) })
  }

  document.querySelectorAll("[aria-label], [title]").forEach((element) => {
    for (const attribute of ["aria-label", "title"]) {
      const source = element.getAttribute(attribute)
      if (source && english[source]) attributeRecords.push({ element, attribute, source })
    }
  })

  const translate = (source, language) => language === "en" ? english[source] || source : language === "zh-Hant" ? toTraditional(source) : source
  let currentLanguage = "en"
  const updateMeta = (language) => {
    const values = head[language]
    document.title = values.title
    document.querySelector('meta[name="description"]')?.setAttribute("content", values.description)
    document.querySelector('meta[name="keywords"]')?.setAttribute("content", values.keywords)
    document.querySelector('meta[property="og:locale"]')?.setAttribute("content", values.locale)
    document.querySelector('meta[property="og:title"]')?.setAttribute("content", values.title)
    document.querySelector('meta[property="og:description"]')?.setAttribute("content", values.socialDescription)
    document.querySelector('meta[name="twitter:title"]')?.setAttribute("content", values.title)
    document.querySelector('meta[name="twitter:description"]')?.setAttribute("content", values.socialDescription)
  }

  const applyLanguage = (language, { persist = false, updateUrl = false } = {}) => {
    const next = supportedLanguages.includes(language) ? language : "en"
    currentLanguage = next
    document.documentElement.lang = next
    textRecords.forEach(({ node, source, prefix, suffix }) => { node.nodeValue = `${prefix}${translate(source, next)}${suffix}` })
    attributeRecords.forEach(({ element, attribute, source }) => element.setAttribute(attribute, translate(source, next)))
    document.querySelectorAll("[data-language-select]").forEach((select) => { select.value = next })
    updateMeta(next)
    if (persist) {
      try { localStorage.setItem(storageKey, next) } catch { /* Storage may be disabled. */ }
    }
    if (updateUrl) {
      const url = new URL(window.location.href)
      next === "en" ? url.searchParams.delete("lang") : url.searchParams.set("lang", next)
      history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
    }
    document.dispatchEvent(new CustomEvent("imyemail:language-change", { detail: { language: next } }))
    return next
  }

  const requested = new URLSearchParams(window.location.search).get("lang")
  let stored = ""
  try { stored = localStorage.getItem(storageKey) || "" } catch { /* Storage may be disabled. */ }
  applyLanguage(supportedLanguages.includes(requested) ? requested : supportedLanguages.includes(stored) ? stored : "en")

  document.querySelectorAll("[data-language-select]").forEach((select) => {
    select.addEventListener("change", () => { applyLanguage(select.value, { persist: true, updateUrl: true }) })
  })

  window.imyemailI18n = {
    get language() { return currentLanguage },
    setLanguage(language) { applyLanguage(language, { persist: true, updateUrl: true }) },
    t(source) { return translate(source, currentLanguage) },
    supportedLanguages
  }
})()
