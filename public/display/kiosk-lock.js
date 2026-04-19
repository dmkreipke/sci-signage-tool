document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('selectstart', e => e.preventDefault());
document.addEventListener('mousedown', e => { if (e.detail > 1) e.preventDefault(); });

document.addEventListener('keydown', e => {
  const blocked =
    e.key === 'F12' ||
    e.key === 'F5' ||
    e.key === 'Escape' ||
    (e.ctrlKey && (e.key === 'u' || e.key === 'U')) ||
    (e.ctrlKey && (e.key === 's' || e.key === 'S')) ||
    (e.ctrlKey && (e.key === 'p' || e.key === 'P')) ||
    (e.ctrlKey && e.shiftKey && ['i','I','j','J','c','C'].includes(e.key)) ||
    (e.altKey && e.key === 'F4');
  if (blocked) e.preventDefault();
});
