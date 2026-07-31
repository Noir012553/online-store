#!/bin/bash

echo ""
echo "🚀 RUNNING TRANSLATION SEEDER..."
echo "================================"
echo ""

# Run seeder
node src/seeds/translationSeeder.js

echo ""
echo "✅ SEEDER COMPLETED!"
echo ""
echo "🔍 Now running diagnostic..."
echo "=============================="
echo ""

# Run diagnostic
node src/seeds/diagnoseI18n.js

echo ""
echo "✨ All done! Check footer in browser now."
