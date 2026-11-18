#!/usr/bin/env bash
# Builds docx-template.zip: the source files (handler, renderer, styles, form engine) plus `docx` (the Node Lambda runtime has the AWS
# SDK but not this library). Dependencies are installed fresh into a throwaway folder from the
# "dependencies" of package.json (production only), so devDependencies (tests, AWS SDK) never ship.
# Run from backend/lambda via `yarn compile-docx-template`.
set -euo pipefail
cd "$(dirname "$0")"

BUILD=.build-docx
rm -rf "$BUILD" docx-template.zip
mkdir "$BUILD"
cp docxTemplate.js docxRender.js docxStyles.js formEngine.js exportEntry.js "$BUILD/"
node -e "require('fs').writeFileSync('$BUILD/package.json', JSON.stringify({ name: 'docx-template', private: true, dependencies: require('./package.json').dependencies }))"
(cd "$BUILD" && npm install --omit=dev --no-audit --no-fund --silent)
(cd "$BUILD" && zip -qr ../docx-template.zip . -x '*.DS_Store' -x 'package-lock.json')
rm -rf "$BUILD"
echo "docx-template.zip: $(du -h docx-template.zip | cut -f1)"
