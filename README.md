# Johnny Blog Datagraph

🚀 **Encrypted Blog Backend for Xnode Deployment**

A secure, encrypted backend that serves blog content with:
- **End-to-end encryption** (Age encryption)
- **High compression** (Zstandard)
- **GitHub-compliant storage** (Files <100MB)
- **Fast API server** (Bare metal performance)

## 🔒 Security

- **No secrets in code** - All keys stored as environment variables
- **Public repository safe** - All data encrypted before GitHub
- **Internal API only** - Backend not exposed to internet

## 🚀 Quick Start

```bash
# Clone repository
git clone https://github.com/johnforfar/johnny-blog-dg
cd johnny-blog-dg

# Install dependencies
npm install

# Set environment variables (create .env file)
echo "AGE_PRIVATE_KEY=your_age_private_key_here" > .env

# Start API server
npm run dev
```

## 🔧 Environment Variables

Create a `.env` file with:
```bash
AGE_PRIVATE_KEY=your_age_private_key_here
DATAGRAPH_PORT=3007
```

## 🌐 Xnode Deployment

Deploy both frontend and backend on same Xnode:
- **Frontend**: Port 3000 (public access)
- **Backend**: Port 3007 (internal only)
- **Communication**: Frontend → localhost:3007

## 📁 Project Structure

```
johnny-blog-dg/
├── data/           # Encrypted content (.age files)
├── metadata/       # Public metadata (JSON)
├── api/           # API server
├── scripts/       # Tools
└── nix/           # NixOS deployment
```

## 🛡️ Security Features

- **Encrypted storage**: All content encrypted with Age
- **No key exposure**: Private keys never committed
- **Internal API**: Backend only accessible from localhost
- **GitHub safe**: All data encrypted before commit

---

**Secure, fast, and decentralized** 🌟