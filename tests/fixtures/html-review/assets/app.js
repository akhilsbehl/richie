(() => {
  let slide = 1;
  const status = () => { const element = document.querySelector('#slide-status'); if (element) element.textContent = `Slide ${slide}`; };
  document.querySelector('#next-slide')?.addEventListener('click', () => { slide += 1; status(); });
  document.querySelector('#previous-slide')?.addEventListener('click', () => { slide = Math.max(1, slide - 1); status(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'ArrowRight') { slide += 1; status(); } if (event.key === 'ArrowLeft') { slide = Math.max(1, slide - 1); status(); } });
})();
