document.documentElement.classList.add("js-ready")

const header = document.querySelector("[data-header]")
const menuToggle = document.querySelector("[data-menu-toggle]")
const nav = document.querySelector("[data-nav]")
const toast = document.querySelector("[data-toast]")

const updateHeader = () => header?.classList.toggle("scrolled", window.scrollY > 12)
updateHeader()
window.addEventListener("scroll", updateHeader, { passive: true })

menuToggle?.addEventListener("click", () => {
  const open = menuToggle.getAttribute("aria-expanded") !== "true"
  menuToggle.setAttribute("aria-expanded", String(open))
  menuToggle.setAttribute("aria-label", open ? "关闭导航" : "打开导航")
  nav?.classList.toggle("open", open)
})

nav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    menuToggle?.setAttribute("aria-expanded", "false")
    menuToggle?.setAttribute("aria-label", "打开导航")
    nav?.classList.remove("open")
  })
})

document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const value = button.getAttribute("data-copy") || ""
    try {
      await navigator.clipboard.writeText(value)
      const label = button.querySelector("span")
      if (label) label.textContent = "已复制"
      toast?.classList.add("visible")
      window.setTimeout(() => {
        if (label) label.textContent = "复制"
        toast?.classList.remove("visible")
      }, 1800)
    } catch {
      window.prompt("复制安装命令", value)
    }
  })
})

document.querySelectorAll("[data-year]").forEach((node) => {
  node.textContent = String(new Date().getFullYear())
})

const revealItems = document.querySelectorAll("[data-reveal]")
if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return
      const delay = entry.target.getAttribute("data-delay") || "0"
      entry.target.style.setProperty("--reveal-delay", `${delay}ms`)
      entry.target.classList.add("revealed")
      observer.unobserve(entry.target)
    })
  }, { threshold: 0.08, rootMargin: "0px 0px -40px" })
  revealItems.forEach((item) => observer.observe(item))
} else {
  revealItems.forEach((item) => item.classList.add("revealed"))
}
