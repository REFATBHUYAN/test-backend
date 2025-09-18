import { execSync } from 'child_process'
import fs from 'fs'

class RuntimeBrowserManager {
  constructor() {
    this.initialized = false
    this.browserPath = process.env.PLAYWRIGHT_BROWSERS_PATH || '/tmp/playwright-browsers'
  }

  async ensureBrowsers() {
    if (this.initialized) return true

    try {
      console.log('🔍 Checking Playwright browser availability...')
      
      const browserDirs = [
        `${this.browserPath}/chromium-1187`,
        '/ms-playwright/chromium-1187',
        '/root/.cache/ms-playwright/chromium-1187'
      ]

      let found = browserDirs.some(dir => fs.existsSync(dir))

      if (!found) {
        console.log('📦 Installing browsers at runtime...')
        execSync(`mkdir -p ${this.browserPath}`, { stdio: 'inherit' })
        execSync('npx playwright install chromium', {
          stdio: 'inherit',
          timeout: 180000,
          env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: this.browserPath }
        })
        console.log('✅ Runtime browser installation completed')
      }

      this.initialized = true
      return true
    } catch (error) {
      console.error('❌ Runtime browser setup failed:', error.message)
      return false
    }
  }

  async launchBrowser(playwright, options = {}) {
    await this.ensureBrowsers()
    return await playwright.chromium.launch(options)
  }
}

export default new RuntimeBrowserManager()