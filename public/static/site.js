(function () {
  // Mobile menu
  var btn = document.getElementById('mobile-menu-btn');
  var menu = document.getElementById('mobile-menu');
  if (btn && menu) {
    btn.addEventListener('click', function () { menu.classList.toggle('hidden'); });
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { menu.classList.add('hidden'); });
    });
  }

  // Two-sided posters: tap on phones, hover on desktop
  document.querySelectorAll('[data-flip]').forEach(function (box) {
    var front = box.querySelector('[data-flip-front]');
    if (!front) return;
    box.addEventListener('click', function (e) { e.preventDefault(); front.classList.toggle('opacity-0'); });
    box.addEventListener('mouseenter', function () { front.classList.add('opacity-0'); });
    box.addEventListener('mouseleave', function () { front.classList.remove('opacity-0'); });
  });

  // Member logos fall back to the organisation's name if the image fails
  function fallback(img) {
    var div = document.createElement('div');
    div.className = 'logo-fallback';
    String(img.getAttribute('data-fallback') || '').split('\n').forEach(function (line, i) {
      if (i) div.appendChild(document.createElement('br'));
      div.appendChild(document.createTextNode(line));
    });
    img.replaceWith(div);
  }
  document.querySelectorAll('img[data-fallback]').forEach(function (img) {
    if (img.complete && img.naturalWidth === 0 && img.getAttribute('loading') !== 'lazy') fallback(img);
    else img.addEventListener('error', function () { fallback(img); });
  });

  // Poster lightbox
  var modal = document.getElementById('image-modal');
  if (!modal) return;
  var modalImg = document.getElementById('modal-image');
  function open(src, alt) {
    modalImg.src = src; modalImg.alt = alt || 'Enlarged poster';
    modal.classList.remove('hidden'); modal.classList.add('flex');
    setTimeout(function () { modal.classList.remove('opacity-0'); modal.classList.add('opacity-100'); }, 10);
    document.body.style.overflow = 'hidden';
  }
  function close() {
    modal.classList.remove('opacity-100'); modal.classList.add('opacity-0');
    setTimeout(function () { modal.classList.add('hidden'); modal.classList.remove('flex'); modalImg.removeAttribute('src'); }, 300);
    document.body.style.overflow = '';
  }
  document.querySelectorAll('.action-poster').forEach(function (p) {
    p.addEventListener('click', function () { open(p.currentSrc || p.src, p.alt); });
  });
  document.getElementById('close-modal').addEventListener('click', close);
  modal.addEventListener('click', function (e) { if (e.target.tagName !== 'IMG') close(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) close();
  });
})();
