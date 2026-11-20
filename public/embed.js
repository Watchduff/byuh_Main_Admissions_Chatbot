/*
 * BYU-Hawaii Assistant — embeddable chat widget loader.
 *
 * Drop this one line on any BYU–Hawaii page to add a floating chat bubble that
 * opens the assistant in an iframe:
 *
 *   <script src="https://YOUR-BOT-DOMAIN/embed.js" defer></script>
 *
 * Optional configuration via data-* attributes on the same <script> tag:
 *   data-greeting="Questions? Chat with us"  // tooltip label (desktop)
 *
 * The script derives the bot origin from its own src, so the iframe and API
 * calls always point back to wherever embed.js was served from. No build step
 * or framework required on the host page.
 */
(function () {
  'use strict';

  // Guard against double-inclusion, while still recovering if a host SPA
  // re-injects the script after replacing the page body.
  if (window.__byuhChatLoaded) {
    if (window.byuhChat && typeof window.byuhChat.mount === 'function') {
      window.byuhChat.mount();
    }
    return;
  }
  window.__byuhChatLoaded = true;

  var script = document.currentScript;
  // Fallback for browsers/edge cases where currentScript is null (e.g. async
  // injection): find the tag by src.
  if (!script) {
    var tags = document.getElementsByTagName('script');
    for (var i = tags.length - 1; i >= 0; i--) {
      if (tags[i].src && tags[i].src.indexOf('embed.js') !== -1) {
        script = tags[i];
        break;
      }
    }
  }

  var origin;
  try {
    origin = new URL(script.src).origin;
  } catch {
    console.error('[byuh-chat] could not determine bot origin from embed.js src');
    return;
  }

  var data = (script && script.dataset) || {};
  var position = 'right';
  var color = '#ba0c2f';
  var greeting = data.greeting || 'Chat with us';

  var Z = 2147483000; // sit above almost everything on the host page
  var EDGE = '20px';
  var STORAGE_KEY = 'byuhChatOpen';
  var isOpen = false;
  try {
    isOpen = window.sessionStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    isOpen = false;
  }

  // ─── Launcher button ───
  var launcher = document.createElement('button');
  launcher.id = 'byuh-chat-launcher';
  launcher.setAttribute('aria-label', 'Open the BYU-Hawaii Assistant chat');
  launcher.type = 'button';
  launcher.style.cssText = [
    'position:fixed',
    'bottom:' + EDGE,
    position + ':' + EDGE,
    'width:60px',
    'height:60px',
    'border-radius:50%',
    'border:none',
    'cursor:pointer',
    'background:' + color,
    'box-shadow:0 6px 20px rgba(0,0,0,0.25)',
    'z-index:' + Z,
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'padding:0',
    'transition:transform .15s ease, box-shadow .15s ease',
  ].join(';');
  launcher.title = greeting;
  var launcherIcon = document.createElement('img');
  launcherIcon.src = origin + '/chatbot-icon.png';
  launcherIcon.alt = '';
  launcherIcon.setAttribute('aria-hidden', 'true');
  launcherIcon.style.cssText = 'width:100%;height:100%;border-radius:50%;display:block;object-fit:cover;';
  launcher.appendChild(launcherIcon);
  launcher.addEventListener('mouseenter', function () {
    launcher.style.transform = 'scale(1.05)';
  });
  launcher.addEventListener('mouseleave', function () {
    launcher.style.transform = 'scale(1)';
  });

  // ─── Iframe panel ───
  var frameWrap = document.createElement('div');
  frameWrap.id = 'byuh-chat-frame-wrap';
  frameWrap.style.cssText = [
    'position:fixed',
    'z-index:' + Z,
    'display:none',
    'overflow:hidden',
    'background:#fff',
    'box-shadow:0 12px 48px rgba(0,0,0,0.28)',
  ].join(';');

  var iframe = document.createElement('iframe');
  iframe.title = 'BYU-Hawaii Assistant';
  iframe.setAttribute('allow', 'clipboard-write');
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
  // Lazy src: only load the chat app once the user first opens it.
  frameWrap.appendChild(iframe);

  function applyPanelGeometry() {
    var mobile = window.innerWidth < 480;
    if (mobile) {
      frameWrap.style.top = '0';
      frameWrap.style.left = '0';
      frameWrap.style.right = '0';
      frameWrap.style.bottom = '0';
      frameWrap.style.width = '100%';
      frameWrap.style.height = '100%';
      frameWrap.style.borderRadius = '0';
    } else {
      frameWrap.style.top = 'auto';
      frameWrap.style.bottom = '96px';
      frameWrap.style[position] = EDGE;
      frameWrap.style[position === 'right' ? 'left' : 'right'] = 'auto';
      frameWrap.style.width = '400px';
      frameWrap.style.height = 'min(640px, calc(100vh - 120px))';
      frameWrap.style.borderRadius = '16px';
    }
  }

  function open() {
    isOpen = true;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, 'true');
    } catch {}
    if (!iframe.src) iframe.src = origin + '/embed';
    applyPanelGeometry();
    frameWrap.style.display = 'block';
    launcher.style.display = 'none';
  }

  function close() {
    isOpen = false;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, 'false');
    } catch {}
    frameWrap.style.display = 'none';
    launcher.style.display = 'flex';
  }

  launcher.addEventListener('click', open);
  window.addEventListener('resize', function () {
    if (isOpen) applyPanelGeometry();
  });

  // Messages from the iframe (close button, ready signal).
  window.addEventListener('message', function (event) {
    if (event.origin !== origin) return;
    var msg = event.data;
    if (!msg || msg.source !== 'byuh-chat') return;
    if (msg.type === 'close') close();
  });

  function mount() {
    if (!document.body) return;
    if (!document.body.contains(launcher)) document.body.appendChild(launcher);
    if (!document.body.contains(frameWrap)) document.body.appendChild(frameWrap);
    if (isOpen) open();
    else close();
  }
  if (document.body) {
    mount();
  } else {
    document.addEventListener('DOMContentLoaded', mount);
  }

  if (window.MutationObserver) {
    new MutationObserver(function () {
      if (document.body && (!document.body.contains(launcher) || !document.body.contains(frameWrap))) {
        mount();
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  // Minimal public API for host pages that want to control the widget.
  window.byuhChat = { open: open, close: close, mount: mount };
})();
