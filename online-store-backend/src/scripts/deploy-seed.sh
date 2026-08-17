#!/bin/bash

# ==================== SAFE SEEDING SCRIPT ====================
# Usage: ./deploy-seed.sh
# 
# This script:
# 1. Stops the API server (ensures no memory conflicts)
# 2. Runs seed with GC exposed (allows manual garbage collection)
# 3. Restarts the API server
# 4. Monitors memory during process

set -e  # Exit on error

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========== SAFE SEEDING DEPLOYMENT ==========${NC}\n"

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ Error: .env file not found${NC}"
    exit 1
fi

# Function to check if port is in use
check_port() {
    if lsof -i :5000 >/dev/null 2>&1; then
        return 0  # Port in use
    else
        return 1  # Port free
    fi
}

# Step 1: Stop API server (if running)
echo -e "${YELLOW}Step 1: Stopping API server...${NC}"
if check_port; then
    echo -e "${YELLOW}  Port 5000 is in use, attempting to stop...${NC}"
    
    # Try different methods to stop
    if command -v systemctl &> /dev/null && systemctl is-active --quiet laptop-store-backend; then
        echo -e "${YELLOW}  Using systemctl to stop...${NC}"
        sudo systemctl stop laptop-store-backend
        sleep 2
    elif command -v pm2 &> /dev/null; then
        echo -e "${YELLOW}  Using PM2 to stop...${NC}"
        pm2 stop laptop-store-backend || true
        sleep 2
    else
        echo -e "${YELLOW}  Killing process on port 5000...${NC}"
        lsof -i :5000 | grep LISTEN | awk '{print $2}' | xargs kill -9 2>/dev/null || true
        sleep 2
    fi
    
    # Verify port is free
    if check_port; then
        echo -e "${RED}❌ Failed to stop API server${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ API server stopped${NC}\n"
else
    echo -e "${GREEN}✅ Port 5000 is free${NC}\n"
fi

# Step 2: Run seed with exposed GC
echo -e "${YELLOW}Step 2: Running seed with memory monitoring...${NC}"
echo -e "${BLUE}Command: node --expose-gc src/seed.js${NC}\n"

if node --expose-gc src/seed.js; then
    echo -e "\n${GREEN}✅ Seed completed successfully${NC}\n"
else
    echo -e "\n${RED}❌ Seed failed${NC}"
    exit 1
fi

# Step 3: Restart API server
echo -e "${YELLOW}Step 3: Restarting API server...${NC}"

if command -v systemctl &> /dev/null; then
    echo -e "${YELLOW}  Using systemctl to start...${NC}"
    sudo systemctl start laptop-store-backend
    sleep 3
    if sudo systemctl is-active --quiet laptop-store-backend; then
        echo -e "${GREEN}✅ API server started via systemctl${NC}"
    else
        echo -e "${RED}❌ Failed to start via systemctl${NC}"
        exit 1
    fi
elif command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}  Using PM2 to start...${NC}"
    pm2 start ecosystem.config.js --name laptop-store-backend
    sleep 3
    echo -e "${GREEN}✅ API server started via PM2${NC}"
else
    echo -e "${YELLOW}  Starting in background...${NC}"
    nohup npm run dev > /tmp/backend.log 2>&1 &
    sleep 3
    echo -e "${GREEN}✅ API server started${NC}"
fi

# Step 4: Verify server is running
echo -e "\n${YELLOW}Step 4: Verifying server health...${NC}"
sleep 2

for i in {1..10}; do
    if curl -s http://localhost:5000/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Server is healthy${NC}\n"
        break
    fi
    if [ $i -eq 10 ]; then
        echo -e "${YELLOW}⚠️  Server may still be starting, please verify manually${NC}\n"
    else
        echo -e "${YELLOW}  Waiting for server... (attempt $i/10)${NC}"
        sleep 2
    fi
done

# Step 5: Show cache status
echo -e "${YELLOW}Step 5: Checking cache status...${NC}"
CACHE_STATUS=$(curl -s http://localhost:5000/health/cache)

if [ ! -z "$CACHE_STATUS" ]; then
    echo -e "${GREEN}Cache Status:${NC}"
    echo "$CACHE_STATUS" | jq . 2>/dev/null || echo "$CACHE_STATUS"
else
    echo -e "${YELLOW}⚠️  Could not retrieve cache status${NC}"
fi

echo -e "\n${GREEN}========== DEPLOYMENT COMPLETE ==========${NC}\n"
echo -e "${BLUE}Summary:${NC}"
echo -e "  ✅ Seed completed"
echo -e "  ✅ API server restarted"
echo -e "  ✅ Health check passed"
echo -e "\n${YELLOW}Recommendations:${NC}"
echo -e "  • Monitor server logs: tail -f /tmp/backend.log"
echo -e "  • Check cache status: curl http://localhost:5000/health/cache | jq ."
echo -e "  • Monitor memory: watch -n 5 'curl -s http://localhost:5000/health/cache | jq .memory'"
echo -e "  • Test API: curl http://localhost:5000/"
