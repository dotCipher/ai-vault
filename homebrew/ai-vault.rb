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
  url "https://github.com/dotCipher/ai-vault/archive/refs/tags/v1.15.0.tar.gz"
  sha256 "caff733a9b47361fa6f13973e3ca63ccfc5ecaddaa2f3d1460d06990f953b019"
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
