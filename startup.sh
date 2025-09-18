#!/bin/bash

# Install required Chromium deps
apt-get update && apt-get install -y \
    wget curl unzip fonts-liberation \
    libasound2 libatk1.0-0 libcups2 \
    libdbus-1-3 libgdk-pixbuf2.0-0 \
    libnspr4 libnss3 libx11-xcb1 \
    libxcomposite1 libxdamage1 \
    libxrandr2 xdg-utils libxkbcommon0 \
    libpango-1.0-0 libxshmfence1 libgbm1

# Install Chromium for Playwright
npx playwright install --with-deps chromium

# Start your app
npm start
