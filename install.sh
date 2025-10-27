#!/usr/bin/env bash
# AI Vault Installer
# Universal installer for all platforms

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🏛️  AI Vault Installer"
echo ""

# Check if running on supported OS
OS="$(uname -s)"
case "${OS}" in
    Linux*)     MACHINE=Linux;;
    Darwin*)    MACHINE=Mac;;
    CYGWIN*)    MACHINE=Cygwin;;
    MINGW*)     MACHINE=MinGw;;
    *)          MACHINE="UNKNOWN:${OS}"
esac

echo "Detected OS: ${MACHINE}"

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Node.js not found.${NC}"
    echo ""

    if [ "$MACHINE" = "Mac" ]; then
        echo "Install Node.js:"
        echo "  brew install node@22"
        echo "  or visit: https://nodejs.org"
    elif [ "$MACHINE" = "Linux" ]; then
        echo "Install Node.js:"
        echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -"
        echo "  sudo apt-get install -y nodejs"
        echo "  or visit: https://nodejs.org"
    else
        echo "Please install Node.js from: https://nodejs.org"
    fi
    exit 1
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}✓${NC} Node.js ${NODE_VERSION} found"

# Check for npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}npm not found${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} npm found"
echo ""

# Install ai-vault
echo "Installing ai-vault globally..."
if npm install -g ai-vault; then
    echo ""
    echo -e "${GREEN}✓ AI Vault installed successfully!${NC}"
    echo ""
    echo "Get started:"
    echo "  ai-vault setup      # Interactive configuration"
    echo "  ai-vault archive    # Start archiving"
    echo "  ai-vault --help     # See all commands"
    echo ""
else
    echo -e "${RED}Installation failed${NC}"
    echo ""
    echo "Try manual installation:"
    echo "  npm install -g ai-vault"
    echo ""
    echo "Or install from source:"
    echo "  git clone https://github.com/dotCipher/ai-vault.git"
    echo "  cd ai-vault"
    echo "  pnpm install && pnpm build"
    exit 1
fi
