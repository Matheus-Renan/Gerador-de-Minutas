/* Alterna entre tema claro e escuro (lembra a escolha neste navegador). */
(function () {
  'use strict';
  const CHAVE = 'gerador-minutas:tema';
  const raiz = document.documentElement;
  const escuroSistema = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const atual = () => raiz.dataset.theme || (escuroSistema() ? 'dark' : 'light');
  function rotular(b) {
    const escuro = atual() === 'dark';
    b.title = escuro ? 'Mudar para o tema claro' : 'Mudar para o tema escuro';
    b.setAttribute('aria-label', b.title);
  }
  document.querySelectorAll('.btn-tema').forEach(b => {
    rotular(b);
    b.addEventListener('click', () => {
      const novo = atual() === 'dark' ? 'light' : 'dark';
      raiz.dataset.theme = novo;
      try { localStorage.setItem(CHAVE, novo); } catch (e) { /* sem armazenamento */ }
      rotular(b);
      document.dispatchEvent(new CustomEvent('tema-alterado', { detail: novo }));
    });
  });
})();
