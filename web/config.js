// Configuração do site.
// Se o site estiver no mesmo endereço do painel (padrão), deixe apiBase vazio.
// Se hospedar o site em outro lugar, coloque o endereço do painel (ex.: "https://painel.seudominio.com")
// e defina CORS_ORIGIN no painel com o endereço do site.
window.IPTV_CONFIG = {
  apiBase: '',
  appName: 'BoxTv',
  // Endereços do player (opcional). O site tenta primeiro a cópia local em /vendor e depois o CDN.
  hlsUrls: ['vendor/hls.min.js', 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js'],
  mpegtsUrls: ['vendor/mpegts.js', 'https://cdn.jsdelivr.net/npm/mpegts.js@1.7.3/dist/mpegts.js'],
};
