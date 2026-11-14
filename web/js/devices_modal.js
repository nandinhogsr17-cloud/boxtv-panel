// Painel Completo de Ativação e Gerenciamento de Dispositivos (BoxTv)
import { api, identity, getDeviceCode, listDevices, activateDevice, editDevice, removeDevice } from './api.js';
import { h, toast } from './dom.js';
import { setScope } from './nav.js';

let currentModal = null;

const DEFAULT_M3U = 'http://vyrqulano.online/get.php?username=Nando5247&password=dede12346&type=m3u_plus&output=ts';

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copiado com sucesso!');
  } catch {
    prompt('Copie o código:', text);
  }
}

export function openDevicesModal({ onDeviceActivated } = {}) {
  if (currentModal) {
    currentModal.remove();
    currentModal = null;
  }

  const myCode = getDeviceCode();
  const myMac = identity.mac;

  // Elementos do formulário
  const inpName = h('input', {
    type: 'text',
    placeholder: 'Ex: TV da Sala, Quarto, Celular Nando',
    'data-f': true,
    style: 'width:100%;padding:11px 13px;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.06);color:#fff;font-size:1rem'
  });

  const inpCode = h('input', {
    type: 'text',
    value: myCode,
    placeholder: 'Ex: ' + myCode,
    'data-f': true,
    style: 'width:100%;padding:11px 13px;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.06);color:#00e5ff;font-family:monospace;font-weight:700;font-size:1.05rem'
  });

  const inpM3u = h('textarea', {
    placeholder: DEFAULT_M3U,
    rows: 2,
    'data-f': true,
    style: 'width:100%;padding:11px 13px;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.06);color:#fff;font-size:.9rem;resize:vertical;word-break:break-all'
  });
  inpM3u.value = DEFAULT_M3U;

  const msgBox = h('div', { style: 'display:none;padding:10px 14px;border-radius:8px;font-size:.9rem;font-weight:600' });

  const btnSubmit = h('button', {
    class: 'btn primary',
    'data-f': true,
    style: 'width:100%;justify-content:center;padding:12px;font-size:1.05rem;font-weight:700;box-shadow:0 0 20px rgba(255,0,85,0.4)',
    onclick: handleActivate
  }, '🏧 Ativar Aparelho');

  const countBadge = h('div', {
    style: 'display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:999px;background:rgba(0,229,255,0.1);border:1px solid rgba(0,229,255,0.3);color:#00e5ff;font-size:.9rem;font-weight:700'
  }, '📊 Carregando quantidade...');

  const devicesListContainer = h('div', {
    style: 'display:grid;gap:12px;margin-top:14px;max-height:360px;overflow-y:auto;padding-right:4px'
  });

  async function loadDevices() {
    devicesListContainer.replaceChildren(h('div', { class: 'dim', style: 'text-align:center;padding:20px' }, 'Carregando aparelhos…'));
    try {
      const data = await listDevices();
      countBadge.textContent = `📊 Total: ${data.total || 0} aparelhos (${data.active || 0} ativos)`;

      if (!data.devices || !data.devices.length) {
        devicesListContainer.replaceChildren(h('div', { class: 'dim', style: 'text-align:center;padding:20px' }, 'Nenhum aparelho cadastrado ainda.'));
        return;
      }

      devicesListContainer.replaceChildren(...data.devices.map(d => renderDeviceCard(d)));
    } catch (e) {
      devicesListContainer.replaceChildren(h('div', { class: 'err', style: 'text-align:center;padding:20px' }, 'Erro ao carregar lista de aparelhos.'));
    }
  }

  function renderDeviceCard(d) {
    const isThisDevice = d.mac === myMac || d.code === myCode;
    const isActive = d.status === 'active';

    const card = h('div', {
      style: `padding:14px;border-radius:12px;background:rgba(255,255,255,0.04);border:1px solid ${isThisDevice ? '#00e5ff' : 'rgba(255,255,255,0.08)'};display:grid;gap:8px;position:relative`
    });

    const header = h('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap' },
      h('div', { style: 'display:flex;align-items:center;gap:8px' },
        h('b', { style: 'font-size:1.05rem;color:#fff' }, d.name || 'Dispositivo'),
        isThisDevice ? h('span', { style: 'font-size:.75rem;padding:2px 8px;border-radius:6px;background:rgba(0,229,255,0.2);color:#00e5ff;font-weight:700' }, 'ESTE APARELHO') : null
      ),
      h('div', { style: `font-size:.8rem;padding:3px 10px;border-radius:999px;font-weight:700;background:${isActive ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'};color:${isActive ? '#10b981' : '#ef4444'}` },
        isActive ? '🟢 Ativo' : '🟡 Pendente'
      )
    );

    const codeRow = h('div', { style: 'display:flex;align-items:center;gap:10px;font-family:monospace;font-size:.9rem;color:var(--dim)' },
      h('span', {}, 'Código: ', h('b', { style: 'color:#00e5ff' }, d.code || d.mac)),
      h('button', {
        class: 'btn sm',
        style: 'padding:2px 8px;font-size:.78rem',
        onclick: () => copyText(d.code || d.mac)
      }, '📋 Copiar')
    );

    const m3uRow = h('div', { style: 'font-size:.82rem;color:var(--dim);word-break:break-all;max-height:40px;overflow:hidden;text-overflow:ellipsis' },
      'Lista: ', d.m3u_url ? h('span', { style: 'color:#fff' }, d.m3u_url) : h('i', {}, 'Sem lista M3U cadastrada')
    );

    // Botões de ação: Editar e Remover
    const actions = h('div', { style: 'display:flex;gap:8px;margin-top:6px;justify-content:flex-end' },
      h('button', {
        class: 'btn sm',
        style: 'padding:5px 12px;font-size:.85rem;background:rgba(255,255,255,0.08);color:#fff',
        onclick: () => startEdit(d)
      }, '✏️ Editar'),
      h('button', {
        class: 'btn sm',
        style: 'padding:5px 12px;font-size:.85rem;background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3)',
        onclick: () => confirmRemove(d)
      }, '🗑️ Remover')
    );

    card.append(header, codeRow, m3uRow, actions);
    return card;
  }

  function startEdit(d) {
    const newName = prompt('Editar Nome do Aparelho:', d.name || 'Dispositivo');
    if (newName === null) return;
    const newM3u = prompt('Editar Link da Lista M3U:', d.m3u_url || DEFAULT_M3U);
    if (newM3u === null) return;

    editDevice(d.code || d.mac, newName, newM3u).then(() => {
      toast('Aparelho atualizado com sucesso!');
      loadDevices();
      if (d.mac === myMac || d.code === myCode) onDeviceActivated?.();
    }).catch(err => {
      alert('Erro ao atualizar: ' + (err.body?.message || err.message));
    });
  }

  function confirmRemove(d) {
    if (!confirm(`Deseja realmente remover o aparelho "${d.name || d.code}"?`)) return;
    removeDevice(d.code || d.mac).then(() => {
      toast('Aparelho removido.');
      loadDevices();
    }).catch(err => {
      alert('Erro ao remover: ' + (err.body?.message || err.message));
    });
  }

  async function handleActivate() {
    const name = inpName.value.trim() || 'Dispositivo';
    const code = inpCode.value.trim();
    const m3uUrl = inpM3u.value.trim();

    if (!code) {
      showMsg('Informe o código único do aparelho.', 'bad');
      return;
    }
    if (!m3uUrl) {
      showMsg('Informe o link da lista M3U.', 'bad');
      return;
    }

    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Ativando aparelho…';
    showMsg('Salvando ativação e conectando lista…', 'info');

    try {
      const res = await activateDevice(code, name, m3uUrl);
      showMsg('✓ Aparelho ativado com sucesso!', 'ok');
      toast('Aparelho ativado!');
      inpName.value = '';
      loadDevices();
      if (code === myCode || code === myMac) {
        setTimeout(() => {
          closeModal();
          onDeviceActivated?.();
        }, 1200);
      }
    } catch (e) {
      showMsg(e.body?.message || 'Erro ao ativar aparelho. Verifique o código e o link.', 'bad');
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = '🏧 Ativar Aparelho';
    }
  }

  function showMsg(text, type) {
    msgBox.textContent = text;
    msgBox.style.display = 'block';
    if (type === 'ok') {
      msgBox.style.background = 'rgba(16,185,129,0.15)';
      msgBox.style.color = '#10b981';
      msgBox.style.border = '1px solid rgba(16,185,129,0.3)';
    } else if (type === 'bad') {
      msgBox.style.background = 'rgba(239,68,68,0.15)';
      msgBox.style.color = '#ef4444';
      msgBox.style.border = '1px solid rgba(239,68,68,0.3)';
    } else {
      msgBox.style.background = 'rgba(0,229,255,0.1)';
      msgBox.style.color = '#00e5ff';
      msgBox.style.border = '1px solid rgba(0,229,255,0.2)';
    }
  }

  const closeBtn = h('button', {
    class: 'btn',
    'data-f': true,
    style: 'padding:6px 14px;border-radius:8px',
    onclick: closeModal
  }, '✕ Fechar');

  const modal = h('div', {
    class: 'modal',
    role: 'dialog',
    'aria-modal': 'true',
    onclick: (e) => { if (e.target === modal) closeModal(); }
  },
    h('div', { class: 'sheet', style: 'max-width:680px;width:95%;max-height:90vh;overflow-y:auto;padding:24px' },
      h('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:18px' },
        h('div', { style: 'display:flex;align-items:center;gap:10px' },
          h('span', { style: 'font-size:1.6rem' }, '🏧'),
          h('h2', { style: 'font-size:1.4rem;font-weight:800' }, 'Painel de Ativações e Aparelhos')
        ),
        closeBtn
      ),

      // Card com o código deste aparelho
      h('div', {
        style: 'padding:14px;border-radius:12px;background:rgba(0,229,255,0.06);border:1px solid rgba(0,229,255,0.25);margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px'
      },
        h('div', {},
          h('div', { style: 'font-size:.8rem;color:var(--dim);text-transform:uppercase;letter-spacing:.05em' }, 'Código Fixo Deste Dispositivo'),
          h('div', { style: 'font-size:1.4rem;font-weight:900;color:#00e5ff;font-family:monospace;letter-spacing:.04em' }, myCode)
        ),
        h('button', {
          class: 'btn sm',
          style: 'padding:8px 16px;font-weight:700',
          onclick: () => copyText(myCode)
        }, '📋 Copiar Código')
      ),

      // Formulário de Nova Ativação
      h('div', { style: 'padding:16px;border-radius:14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);margin-bottom:20px;display:grid;gap:12px' },
        h('div', { style: 'font-weight:700;font-size:1.05rem;color:#fff;display:flex;align-items:center;gap:6px' }, '➕ Ativar Aparelho'),
        h('label', { style: 'font-size:.85rem;color:var(--dim);display:grid;gap:4px' }, 'Nome de Identificação', inpName),
        h('label', { style: 'font-size:.85rem;color:var(--dim);display:grid;gap:4px' }, 'Código do Aparelho (deste ou outro à distância)', inpCode),
        h('label', { style: 'font-size:.85rem;color:var(--dim);display:grid;gap:4px' },
          h('div', { style: 'display:flex;justify-content:space-between' },
            h('span', {}, 'Link da Lista M3U'),
            h('a', {
              href: '#',
              style: 'color:var(--accent);text-decoration:none;font-size:.8rem',
              onclick: (e) => { e.preventDefault(); inpM3u.value = DEFAULT_M3U; }
            }, 'Usar lista padrão')
          ),
          inpM3u
        ),
        msgBox,
        btnSubmit
      ),

      // Lista de Aparelhos e Quantidade
      h('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-top:10px' },
        h('div', { style: 'font-weight:700;font-size:1.1rem;color:#fff' }, '📱 Dispositivos Cadastrados'),
        countBadge
      ),
      devicesListContainer
    )
  );

  function closeModal() {
    modal.remove();
    currentModal = null;
    document.body.style.overflow = '';
  }

  const onKey = (e) => { if (e.key === 'Escape') { closeModal(); } };
  modal.addEventListener('keydown', onKey);

  document.body.append(modal);
  document.body.style.overflow = 'hidden';
  setScope(modal);
  inpName.focus();
  loadDevices();
  currentModal = modal;
}
