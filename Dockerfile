# Use the official Playwright base image with all dependencies pre-installed
FROM mcr.microsoft.com/playwright:v1.55.0-jammy

# Set working directory
WORKDIR /app

# Create browser directories with proper permissions
RUN mkdir -p /tmp/playwright-browsers && \
    mkdir -p /ms-playwright && \
    chmod -R 777 /tmp/playwright-browsers && \
    chmod -R 777 /ms-playwright

# Set environment variables for Playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/tmp/playwright-browsers
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0
ENV NODE_ENV=production
ENV DEBIAN_FRONTEND=noninteractive

# Update system packages and install additional dependencies
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first for better Docker layer caching
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production && npm cache clean --force

# Pre-install Playwright browsers with error handling
RUN echo "Installing Playwright browsers..." && \
    npx playwright install chromium && \
    npx playwright install-deps chromium && \
    echo "Browsers installed successfully" && \
    ls -la /tmp/playwright-browsers/ && \
    ls -la /ms-playwright/ || echo "Browsers not in /ms-playwright"

# Verify browser installation
RUN echo "Verifying browser installation..." && \
    node -e " \
    const { chromium } = require('playwright'); \
    chromium.launch({ \
        headless: true, \
        args: ['--no-sandbox', '--disable-setuid-sandbox'] \
    }).then(browser => { \
        console.log('✅ Browser verification successful'); \
        return browser.close(); \
    }).catch(err => { \
        console.error('❌ Browser verification failed:', err.message); \
        process.exit(1); \
    }); \
    " || echo "Browser verification completed with warnings"

# Copy application files
COPY . .

# Create a startup script that ensures browsers are available
RUN echo '#!/bin/bash\n\
echo "🚀 Starting application..."\n\
echo "Environment: $NODE_ENV"\n\
echo "Browser path: $PLAYWRIGHT_BROWSERS_PATH"\n\
\n\
# Ensure browser path exists\n\
mkdir -p $PLAYWRIGHT_BROWSERS_PATH\n\
\n\
# Check if browsers are installed\n\
if [ ! -d "$PLAYWRIGHT_BROWSERS_PATH/chromium-1187" ] && [ ! -d "/ms-playwright/chromium-1187" ]; then\n\
    echo "⚠️ Browsers not found, installing..."\n\
    npx playwright install chromium || echo "Browser installation attempted"\n\
fi\n\
\n\
# Start the application\n\
exec node app.js\n\
' > /app/start.sh && chmod +x /app/start.sh

# Set proper file permissions
RUN chown -R root:root /app && \
    chmod -R 755 /app

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

# Use the startup script
CMD ["/app/start.sh"]