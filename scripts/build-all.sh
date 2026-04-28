#!/bin/bash
set -e

echo "🏗️  Building combined site..."

# Clean previous builds
rm -rf dist
rm -rf dist-expo

# 1. Build the Expo app (outputs to dist/ by default)
echo "📱 Building Expo app..."
npx expo export --platform web

# 2. Move Expo output aside
mv dist dist-expo

# 3. Build the landing page (Vite)
echo "📄 Building landing page..."
cd 20260127website2-main
npm install --silent
npx vite build --outDir ../dist
cd ..

# 4. Move Expo output into dist/app/
echo "📦 Combining builds..."
mkdir -p dist/app
cp -r dist-expo/* dist/app/

# 4b. Copy /public/* into dist/app/ so static assets like the favicon
#     (referenced from app/+html.tsx as /app/icon.png) are actually served.
if [ -d public ]; then
  echo "📦 Copying public/ → dist/app/"
  cp -R public/. dist/app/
fi

# 5. Clean up
rm -rf dist-expo

echo "✅ Build complete! Output in dist/"
echo "   Landing page → dist/"
echo "   Expo app     → dist/app/"
