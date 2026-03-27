// avani-home.js

// ── NAV SCROLL ──
var navbar = document.getElementById('navbar');
window.addEventListener('scroll', function() {
  navbar.classList.toggle('scrolled', window.scrollY > 60);
});

// ── SCROLL HELPERS ──
function scrollToVillas()    { document.getElementById('villas-section').scrollIntoView({behavior:'smooth'}); }
function scrollToWhyDirect() { document.getElementById('why-direct-section').scrollIntoView({behavior:'smooth'}); }
function scrollToAmenities() { document.getElementById('amenities-section').scrollIntoView({behavior:'smooth'}); }
function scrollToContact()   { document.getElementById('contact-section').scrollIntoView({behavior:'smooth'}); }

// ── SCROLL REVEAL ──
var obs = new IntersectionObserver(function(entries) {
  entries.forEach(function(e) {
    if (e.isIntersecting) {
      e.target.style.opacity = '1';
      e.target.style.transform = 'translateY(0)';
    }
  });
}, { threshold: 0.1 });
document.querySelectorAll('.villa-card, .why-item, .amenity-item').forEach(function(el) {
  el.style.opacity = '0';
  el.style.transform = 'translateY(20px)';
  el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  obs.observe(el);
});

// ── HERO SLIDER ──
var HERO_SLIDES = 4;
var HERO_LABELS = ['Geya Villa', 'Bellis 68', 'Sandewa Villa', 'Linum Villa'];
var heroIdx = 0;
var heroTimer = null;
var heroSwipeX = 0;

function heroGoTo(n) {
  document.querySelectorAll('.hero-slide').forEach(function(s, i) {
    s.classList.toggle('active', i === n);
  });
  document.querySelectorAll('.hero-dot').forEach(function(d, i) {
    d.classList.toggle('active', i === n);
  });
  var lbl = document.getElementById('hero-villa-label');
  if (lbl) {
    lbl.style.opacity = '0';
    setTimeout(function() {
      lbl.textContent = HERO_LABELS[n];
      lbl.style.opacity = '1';
    }, 300);
  }
  heroIdx = n;
}

function heroSlide(dir) {
  heroGoTo((heroIdx + dir + HERO_SLIDES) % HERO_SLIDES);
  resetHeroTimer();
}

function resetHeroTimer() {
  clearInterval(heroTimer);
  heroTimer = setInterval(function() { heroSlide(1); }, 5000);
}

// Touch / swipe support
var swipeEl = document.getElementById('hero-swipe');
if (swipeEl) {
  swipeEl.addEventListener('touchstart', function(e) {
    heroSwipeX = e.touches[0].clientX;
  }, { passive: true });
  swipeEl.addEventListener('touchend', function(e) {
    var dx = e.changedTouches[0].clientX - heroSwipeX;
    if (Math.abs(dx) > 40) { heroSlide(dx < 0 ? 1 : -1); }
  }, { passive: true });
  swipeEl.addEventListener('mousedown', function(e) { heroSwipeX = e.clientX; });
  swipeEl.addEventListener('mouseup',   function(e) {
    var dx = e.clientX - heroSwipeX;
    if (Math.abs(dx) > 40) { heroSlide(dx < 0 ? 1 : -1); }
  });
}

// Start auto-play
resetHeroTimer();
