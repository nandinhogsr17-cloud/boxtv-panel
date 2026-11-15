// Verifica acesso ao repositório GitHub sem gravar nem exibir o token.
// Defina GH_TOKEN ou GITHUB_TOKEN apenas no ambiente da sessão.
const owner = process.env.GITHUB_OWNER || 'nandinhogsr17-cloud';
const repo = process.env.GITHUB_REPO || 'boxtv-panel';
let token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';

// Se disponível, reutiliza a sessão autenticada do GitHub CLI sem pedir nem imprimir token.
if (!token) {
  try {
    const { execFileSync } = await import('node:child_process');
    token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    // A ausência de GH_TOKEN e de uma sessão gh autenticada é tratada abaixo.
  }
}

if (!token) {
  console.error('Autenticação ausente. Defina GH_TOKEN/GITHUB_TOKEN ou autentique com `gh auth login`.');
  process.exit(2);
}

const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
  headers: {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'x-github-api-version': '2022-11-28',
    'user-agent': 'BoxTv-GitHub-Connection-Test',
  },
});

if (!response.ok) {
  console.error(`GitHub respondeu HTTP ${response.status}. Confira validade e permissões do token.`);
  process.exit(1);
}
const data = await response.json();
console.log(`Conexão autenticada: ${data.full_name}`);
console.log(`Permissão de leitura: ${data.permissions?.pull ?? data.permissions?.admin ? 'sim' : 'não informada'}`);
console.log(`Permissão de escrita: ${data.permissions?.push || data.permissions?.admin ? 'sim' : 'não'}`);
if (!(data.permissions?.push || data.permissions?.admin)) process.exitCode = 3;
