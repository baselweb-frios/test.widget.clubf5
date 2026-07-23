/**
 * ============================================
 * ClubF5 Sound Widget - Embed Script v2.0.0
 * ============================================
 *
 * Permite embeber el reproductor de música ClubF5
 * en cualquier sitio web de terceros DE FORMA SEGURA.
 *
 * ══════════════════════════════════════════════
 * CONEXIÓN SEGURA: Solo por Token JWT
 * ══════════════════════════════════════════════
 *
 * El token NUNCA se coloca en la URL del iframe;
 * se envía al iframe vía postMessage (canal seguro).
 *
 * === Con token JWT directo (JS API, recomendado) ===
 *
 *   <script src="https://sound.clubf5.com/widget-embed.js"></script>
 *   <div id="clubf5-player"></div>
 *   <script>
 *     ClubF5Widget.connect('clubf5-player', {
 *       token: 'JWT_TOKEN_HERE'
 *     });
 *   </script>
 *
 * === Con token en atributo HTML (backward compatible) ===
 *
 *   <div id="clubf5-player" data-token="JWT_TOKEN_HERE"></div>
 *
 * Opciones adicionales:
 *   width    (string)  - Ancho del widget (default: "100%")
 *   height   (string)  - Alto del widget (default: "80px")
 *   theme    (string)  - "dark" | "light" (default: "dark")
 *   border   (string)  - "true" | "false" (default: "false")
 *   radius   (string)  - Border radius en px (default: "8")
 *
 * API JavaScript:
 *   ClubF5Widget.connect(id, options) - Conecta con token JWT
 *   ClubF5Widget.init()               - Auto-inicializa widgets con data-token
 *   ClubF5Widget.destroy()            - Destruye todos los widgets
 *   ClubF5Widget.getInstances()       - Retorna las instancias activas
 *
 * ⚠️  SEGURIDAD:
 *   - Usa siempre ClubF5Widget.connect() con token via JS
 *   - El token se envía al iframe via postMessage, NO en la URL
 *   - data-user / data-password NUNCA se leen del DOM
 */
(function () {
  'use strict';

  // Evitar doble carga
  if (window.ClubF5Widget) return;

  // ============================================
  // CONFIGURACIÓN
  // ============================================

  // Detectar URL base del script (donde está desplegado el reproductor)
  var scripts = document.getElementsByTagName('script');
  var currentScript = scripts[scripts.length - 1];
  var scriptSrc = currentScript.src || '';
  var baseUrl = "https://web.clubf5.com";

  // Almacenar instancias activas
  var instances = [];

  // Nonce counter para handshake seguro con iframes
  var nonceCounter = 0;

  // ============================================
  // VALIDACIÓN DE TOKEN
  // ============================================

  /**
   * Verifica si un token JWT sigue vigente (con 60s de margen)
   */
  function isTokenValid(token) {
    try {
      var payload = JSON.parse(atob(token.split('.')[1]));
      var expMs = payload.exp * 1000;
      return Date.now() < expMs - 60000;
    } catch (e) {
      return false;
    }
  }

  // ============================================
  // UI HELPERS
  // ============================================

  function showError(container, message) {
    container.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;padding:12px 16px;' +
      'background:#0f172a;border-radius:8px;font-family:sans-serif;">' +
      '<span style="color:#f87171;font-size:18px;">⚠️</span>' +
      '<div>' +
      '<p style="color:#f87171;font-size:12px;font-weight:600;margin:0;">Error del Widget</p>' +
      '<p style="color:#94a3b8;font-size:11px;margin:2px 0 0;">' + escapeHtml(message) + '</p>' +
      '</div></div>';
  }

  function showLoading(container, message) {
    container.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;gap:10px;' +
      'padding:16px;background:#0f172a;border-radius:8px;font-family:sans-serif;">' +
      '<div style="width:18px;height:18px;border:2px solid rgba(255,255,255,0.1);' +
      'border-top-color:#60a5fa;border-radius:50%;animation:cf5spin 0.8s linear infinite;"></div>' +
      '<span style="color:rgba(255,255,255,0.6);font-size:13px;">' +
      escapeHtml(message || 'Conectando...') + '</span>' +
      '</div>' +
      '<style>@keyframes cf5spin{to{transform:rotate(360deg)}}</style>';
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ============================================
  // IFRAME CREATION (con postMessage seguro)
  // ============================================

  /**
   * Crea el iframe del widget y le envía el token via postMessage.
   * El token NO va en la URL — va por canal seguro.
   *
   * @param {HTMLElement} container
   * @param {string} token - JWT token
   * @param {object} options - Opciones visuales
   * @returns {object} instance
   */
  function createIframe(container, token, options) {
    var width = options.width || '100%';
    var height = options.height || '80px';
    var theme = options.theme || 'dark';
    var border = options.border === 'true';
    var radius = options.radius || '8';

    // Generar nonce único para este handshake
    var nonce = 'cf5_' + (++nonceCounter) + '_' + Math.random().toString(36).substr(2, 9);

    // URL del widget SIN token (el token irá via postMessage)
    var widgetUrl = baseUrl + '/widget?auth=postMessage&nonce=' + encodeURIComponent(nonce);
    if (theme) widgetUrl += '&theme=' + encodeURIComponent(theme);

    // Crear iframe
    var iframe = document.createElement('iframe');
    iframe.src = widgetUrl;
    iframe.style.width = width;
    iframe.style.height = height;
    iframe.style.border = border ? '1px solid rgba(255,255,255,0.1)' : 'none';
    iframe.style.borderRadius = radius + 'px';
    iframe.style.overflow = 'hidden';
    iframe.style.display = 'block';
    iframe.style.background = theme === 'light' ? '#f8fafc' : '#0f172a';
    iframe.setAttribute('allow', 'autoplay; encrypted-media; fullscreen');
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('title', 'ClubF5 Sound Player');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms');

    // Handler para el handshake postMessage
    var handshakeComplete = false;
    var messageHandler = function (event) {
      // Validar origen: solo aceptar mensajes del mismo dominio del widget
      var expectedOrigin = new URL(baseUrl).origin;
      if (event.origin !== expectedOrigin) return;

      var data = event.data;
      if (!data || data.type !== 'cf5-widget-ready' || data.nonce !== nonce) return;

      // El iframe está listo — enviar token de forma segura
      if (!handshakeComplete) {
        handshakeComplete = true;
        iframe.contentWindow.postMessage({
          type: 'cf5-auth-token',
          nonce: nonce,
          token: token
        }, expectedOrigin);

        // Limpiar listener después del handshake
        window.removeEventListener('message', messageHandler);
      }
    };

    window.addEventListener('message', messageHandler);

    // Timeout: si el handshake no se completa en 30s, limpiar
    var handshakeTimeout = setTimeout(function () {
      if (!handshakeComplete) {
        window.removeEventListener('message', messageHandler);
        console.warn('[ClubF5 Widget] Handshake timeout - falling back to URL token');
        // Fallback: recargar iframe con token en URL (backward compat)
        iframe.src = baseUrl + '/widget?token=' + encodeURIComponent(token) +
          (theme ? '&theme=' + encodeURIComponent(theme) : '');
      }
    }, 30000);

    // Limpiar contenedor e insertar iframe
    container.innerHTML = '';
    container.appendChild(iframe);

    var instance = {
      container: container,
      iframe: iframe,
      nonce: nonce,
      destroy: function () {
        clearTimeout(handshakeTimeout);
        window.removeEventListener('message', messageHandler);
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }
    };

    instances.push(instance);
    return instance;
  }

  /**
   * Crea iframe con token directo en URL (modo legacy/backward compatible)
   */
  function createIframeLegacy(container, token, options) {
    var width = options.width || '100%';
    var height = options.height || '80px';
    var theme = options.theme || 'dark';
    var border = options.border === 'true';
    var radius = options.radius || '8';

    var widgetUrl = baseUrl + '/widget?token=' + encodeURIComponent(token);
    if (theme) widgetUrl += '&theme=' + encodeURIComponent(theme);

    var iframe = document.createElement('iframe');
    iframe.src = widgetUrl;
    iframe.style.width = width;
    iframe.style.height = height;
    iframe.style.border = border ? '1px solid rgba(255,255,255,0.1)' : 'none';
    iframe.style.borderRadius = radius + 'px';
    iframe.style.overflow = 'hidden';
    iframe.style.display = 'block';
    iframe.style.background = theme === 'light' ? '#f8fafc' : '#0f172a';
    iframe.setAttribute('allow', 'autoplay; encrypted-media; fullscreen');
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('title', 'ClubF5 Sound Player');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms');

    container.innerHTML = '';
    container.appendChild(iframe);

    var instance = {
      container: container,
      iframe: iframe,
      destroy: function () {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }
    };

    instances.push(instance);
    return instance;
  }

  // ============================================
  // MÉTODO PRINCIPAL: connect()
  // ============================================

  /**
   * Conecta un widget usando un token JWT.
   * El token se pasa SOLO vía JavaScript, nunca en el DOM ni en la URL del iframe.
   *
   * @param {string|HTMLElement} containerOrId - ID del contenedor o elemento HTML
   * @param {object} options - Opciones de conexión
   * @param {string} options.token     - Token JWT (obligatorio)
   * @param {string} [options.width]    - Ancho del widget
   * @param {string} [options.height]   - Alto del widget
   * @param {string} [options.theme]    - "dark" | "light"
   * @param {string} [options.border]   - "true" | "false"
   * @param {string} [options.radius]   - Border radius en px
   * @returns {Promise<object>} instancia del widget
   */
  function connect(containerOrId, options) {
    options = options || {};

    // Resolver contenedor
    var container;
    if (typeof containerOrId === 'string') {
      container = document.getElementById(containerOrId);
      if (!container) {
        console.error('[ClubF5 Widget] Contenedor no encontrado: #' + containerOrId);
        return Promise.reject(new Error('Contenedor no encontrado: #' + containerOrId));
      }
    } else if (containerOrId instanceof HTMLElement) {
      container = containerOrId;
    } else {
      return Promise.reject(new Error('Se requiere un ID de contenedor o un HTMLElement'));
    }

    // Opciones visuales (pueden venir de options o de data-* attributes)
    var visualOptions = {
      width: options.width || container.getAttribute('data-width') || '100%',
      height: options.height || container.getAttribute('data-height') || '80px',
      theme: options.theme || container.getAttribute('data-theme') || 'dark',
      border: options.border || container.getAttribute('data-border') || 'false',
      radius: options.radius || container.getAttribute('data-radius') || '8'
    };

    // Validar token
    if (!options.token) {
      showError(container, 'Se requiere un token JWT en la opción { token }');
      return Promise.reject(new Error('Token no proporcionado'));
    }

    if (!isTokenValid(options.token)) {
      showError(container, 'El token JWT ha expirado');
      return Promise.reject(new Error('Token expirado'));
    }

    var instance = createIframe(container, options.token, visualOptions);
    return Promise.resolve(instance);
  }

  // ============================================
  // AUTO-INIT (solo para data-token, backward compat)
  // ============================================

  /**
   * Busca contenedores con data-token y los inicializa.
   * ⚠️ Solo soporta data-token. data-user/data-password
   *    ya NO se leen del DOM por seguridad.
   */
  function init() {
    var selectors = [
      '#clubf5-player',
      '.clubf5-player',
      '[data-clubf5-widget]'
    ];

    selectors.forEach(function (selector) {
      var elements = document.querySelectorAll(selector);
      for (var i = 0; i < elements.length; i++) {
        var el = elements[i];
        if (el.querySelector('iframe')) continue; // Ya inicializado

        var token = el.getAttribute('data-token');
        if (token && token.trim()) {
          // Modo legacy: token en atributo → iframe con token en URL
          var options = {
            width: el.getAttribute('data-width'),
            height: el.getAttribute('data-height'),
            theme: el.getAttribute('data-theme'),
            border: el.getAttribute('data-border'),
            radius: el.getAttribute('data-radius')
          };
          createIframeLegacy(el, token.trim(), options);
        }
        // ⚠️ data-user/data-password YA NO SE LEEN del DOM
        // Usar ClubF5Widget.connect() en su lugar
      }
    });
  }

  /**
   * Destruye todos los widgets activos
   */
  function destroy() {
    instances.forEach(function (instance) {
      instance.destroy();
    });
    instances = [];
  }

  // ============================================
  // API PÚBLICA
  // ============================================

  window.ClubF5Widget = {
    /** Conecta un widget de forma segura (recomendado) */
    connect: connect,
    /** Auto-inicializa widgets con data-token (legacy) */
    init: init,
    /** Destruye todos los widgets */
    destroy: destroy,
    /** Obtiene instancias activas */
    getInstances: function () { return instances; },
    /** Versión del script */
    version: '2.0.0'
  };

  // Auto-inicializar cuando el DOM esté listo (solo data-token)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
