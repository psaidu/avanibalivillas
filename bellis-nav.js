// bellis-nav.js
var nb = document.getElementById('navbar');
window.addEventListener('scroll', function() {
  nb.classList.toggle('scrolled', window.scrollY > 60);
});

var lbImgs = [];
document.querySelectorAll('.gallery-item img').forEach(function(i) { lbImgs.push(i.src); });
var lbCur = 0;
function openLightbox(i) { lbCur=i; document.getElementById('lightbox-img').src=lbImgs[i]; document.getElementById('lightbox').classList.add('open'); document.body.style.overflow='hidden'; }
function closeLightbox() { document.getElementById('lightbox').classList.remove('open'); document.body.style.overflow=''; }
function changeImg(d) { lbCur=(lbCur+d+lbImgs.length)%lbImgs.length; document.getElementById('lightbox-img').src=lbImgs[lbCur]; }
document.getElementById('lightbox').addEventListener('click', function(e) { if(e.target===document.getElementById('lightbox')) closeLightbox(); });
document.addEventListener('keydown', function(e) { if(e.key==='Escape') closeLightbox(); if(e.key==='ArrowRight') changeImg(1); if(e.key==='ArrowLeft') changeImg(-1); });

var obs = new IntersectionObserver(function(entries) {
  entries.forEach(function(e) {
    if(e.isIntersecting) { e.target.style.opacity='1'; e.target.style.transform='translateY(0)'; }
  });
}, { threshold: 0.1 });
document.querySelectorAll('.amenity-card,.service-card,.place-row,.review-card').forEach(function(el) {
  el.style.opacity='0'; el.style.transform='translateY(20px)';
  el.style.transition='opacity 0.6s ease,transform 0.6s ease';
  obs.observe(el);
});
