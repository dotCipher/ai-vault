# Homebrew Formula for AI Vault
#
# To use this formula:
# 1. Create a tap: brew tap dotCipher/ai-vault
# 2. Install: brew install ai-vault
#
# Or install directly from this file:
# brew install --build-from-source homebrew/ai-vault.rb

class AiVault < Formula
  desc "Own your data. Comprehensive archival of AI interactions across multiple platforms"
  homepage "https://github.com/dotCipher/ai-vault"
  url "https://github.com/dotCipher/ai-vault/archive/refs/tags/v1.2.1.tar.gz"
  sha256 "82fa053ca132e9889876971e92f20e4b1331bbabac752d98bf93fa1ae1f20c38"
  license "MIT"

  depends_on "node@22"
  depends_on "pnpm"

  def install
    system "pnpm", "install", "--frozen-lockfile"
    system "pnpm", "run", "build"

    libexec.install Dir["*"]
    bin.install_symlink libexec/"dist/cli.js" => "ai-vault"
  end

  test do
    assert_match "ai-vault", shell_output("#{bin}/ai-vault --version")
  end
end
