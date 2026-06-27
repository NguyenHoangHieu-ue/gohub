const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Patterns for detecting sensitive information/secrets
const SECRET_PATTERNS = [
  {
    name: "Google API Key",
    regex: /AIzaSy[A-Za-z0-9_\-]{35}/g,
  },
  {
    name: "Generic API / Secret Key",
    regex: /(?:secret|api_key|private_key|auth_token|supabase_key)\s*=\s*["']([A-Za-z0-9_\-]{16,})["']/gi,
  },
  {
    name: "Raw Password Assignment",
    regex: /(?:password|passwd|db_password)\s*=\s*["']([A-Za-z0-9_\-!@#$%^&*()]{6,})["']/gi,
  }
];

// Files that are allowed to have credentials or config defaults (like examples)
const IGNORED_FILES = [
  /package-lock\.json$/,
  /\.env\.local\.example$/,
  /\.env\.example$/,
  /scan-secrets\.js$/, // ignore this scanner script
];

function getStagedFiles() {
  try {
    const stdout = execSync("git diff --cached --name-only", { encoding: "utf-8" });
    return stdout.split("\n").map(f => f.trim()).filter(Boolean);
  } catch (err) {
    console.error("Error getting staged files:", err.message);
    return [];
  }
}

function scanFile(filePath) {
  // Only scan text files, ignore binary files
  const ext = path.extname(filePath).toLowerCase();
  const textExtensions = [".js", ".jsx", ".ts", ".tsx", ".json", ".md", ".txt", ".sql", ".py", ".yml", ".yaml", ".sh", ".bash"];
  
  if (!textExtensions.includes(ext) && ext !== "") {
    return false; // skip binary / non-text files
  }

  // Check if file is ignored
  if (IGNORED_FILES.some(pattern => pattern.test(filePath))) {
    return false;
  }

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  let foundSecret = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of SECRET_PATTERNS) {
      pattern.regex.lastIndex = 0; // reset regex state
      const match = pattern.regex.exec(line);
      if (match) {
        // Exclude generic placeholder assignments like PASSWORD=your_password
        const val = match[1] || match[0];
        if (/^(?:your_password|placeholder|my_secret|api_key|token|supabase_key|password_here|password|secret_here|key_here)$/i.test(val)) {
          continue; // skip fake placeholders
        }

        console.error(`\x1b[31m[SECURITY ALERT] Found potential ${pattern.name} in file: ${filePath} at line ${i + 1}\x1b[0m`);
        console.error(`\x1b[33mLine content: ${line.trim()}\x1b[0m`);
        foundSecret = true;
      }
    }
  }

  return foundSecret;
}

function main() {
  console.log("Running pre-commit security secret scan...");
  
  // Staged files are relative to project root
  const stagedFiles = getStagedFiles();
  let secretsCount = 0;

  for (const file of stagedFiles) {
    if (scanFile(file)) {
      secretsCount++;
    }
  }

  if (secretsCount > 0) {
    console.error(`\x1b[31m[COMMIT BLOCKED] Found ${secretsCount} file(s) with potential raw credentials.\x1b[0m`);
    console.error("\x1b[33mPlease remove raw credentials and use environment variables (web/.env.local) instead.\x1b[0m");
    process.exit(1); // abort the commit
  } else {
    console.log("\x1b[32m[SECURITY SCAN PASS] No raw credentials found in staged files.\x1b[0m");
    process.exit(0); // allow commit
  }
}

main();
