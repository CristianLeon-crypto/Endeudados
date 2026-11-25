// Menu compartido de las pantallas internas (EN-106).
//
// Un solo lugar define las opciones y su orden. Cada pantalla interna pone
// <header class="navbar" data-menu></header> y carga este archivo: aca se
// pintan el logo, las opciones, el usuario y "Cerrar sesion". La opcion de la
// pantalla actual queda marcada con aria-current="page".
//
// "Resumen" e "Ingresos y gastos" son dos secciones de la misma pantalla
// (inGas.html); el ancla del hash decide cual de las dos se marca.

const MENU_PRINCIPAL = [
  {
    id: 'resumen',
    texto: 'Resumen',
    href: '../IngresosGastos/inGas.html#resumen',
    pagina: 'inGas',
    anclas: ['', '#resumen']
  },
  {
    id: 'ingresos',
    texto: 'Ingresos y gastos',
    href: '../IngresosGastos/inGas.html#ingresos',
    pagina: 'inGas',
    anclas: ['#ingresos', '#gastos', '#hormiga', '#deudas']
  },
  {
    id: 'deudas',
    texto: 'Deudas y abonos',
    href: '../Deudas/deudas.html',
    pagina: 'deudas',
    anclas: ['', '#resumen', '#abonos', '#avance', '#logros']
  },
  {
    id: 'plan',
    texto: 'Plan de pagos',
    href: '../PlanPagos/plan.html',
    pagina: 'plan',
    anclas: ['']
  },
  {
    id: 'perfil',
    texto: 'Mi perfil',
    href: '../Perfil/perfil.html',
    pagina: 'perfil',
    anclas: ['']
  }
];

const LOGO_MENU =
  '<svg class="logo-marca" viewBox="0 0 40 40" aria-hidden="true">' +
  '<defs><linearGradient id="logo-degradado" x1="0" y1="0" x2="1" y2="1">' +
  '<stop offset="0" stop-color="#1C1C1C" /><stop offset="1" stop-color="#28B660" />' +
  '</linearGradient></defs>' +
  '<rect x="0.5" y="0.5" width="39" height="39" rx="11.5" fill="url(#logo-degradado)" ' +
  'stroke="#F3ECDE" stroke-opacity="0.18" />' +
  '<rect x="9" y="11" width="22" height="4" rx="2" fill="#F3ECDE" />' +
  '<rect x="9" y="18" width="15" height="4" rx="2" fill="#F3ECDE" />' +
  '<rect x="9" y="25" width="8" height="4" rx="2" fill="#A9501C" />' +
  '</svg><span class="logo-texto">Endeudados</span>';

const ICONO_USUARIO =
  '<svg class="icono" viewBox="0 0 24 24" aria-hidden="true">' +
  '<circle cx="12" cy="8" r="4" /><path d="M5 21c0-3.9 3.1-7 7-7s7 3.1 7 7" /></svg>';

const ICONO_SALIR =
  '<svg class="icono" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />' +
  '<path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>';

// '/IngresosGastos/inGas.html' -> 'inGas'. En Windows la ruta puede venir con
// backslashes; se normaliza antes de comparar.
function paginaDeRuta(pathname) {
  const ruta = String(pathname || '').replace(/\\/g, '/').toLowerCase();
  if (ruta.endsWith('/ingresosgastos/ingas.html')) {
    return 'inGas';
  }
  if (ruta.endsWith('/deudas/deudas.html')) {
    return 'deudas';
  }
  if (ruta.endsWith('/planpagos/plan.html')) {
    return 'plan';
  }
  if (ruta.endsWith('/perfil/perfil.html')) {
    return 'perfil';
  }
  return null;
}

// Id de la opcion que corresponde a la pantalla y al ancla actuales. Si el
// ancla no esta en la lista se marca la primera opcion de esa pantalla.
function menuActual(pathname, hash) {
  const pagina = paginaDeRuta(pathname);
  const ancla = hash || '';

  const exacta = MENU_PRINCIPAL.find(function (opcion) {
    return opcion.pagina === pagina && opcion.anclas.indexOf(ancla) !== -1;
  });
  if (exacta) {
    return exacta.id;
  }

  const primera = MENU_PRINCIPAL.find(function (opcion) {
    return opcion.pagina === pagina;
  });
  return primera ? primera.id : null;
}

function crearElemento(documento, etiqueta, clase) {
  const elemento = documento.createElement(etiqueta);
  if (clase) {
    elemento.className = clase;
  }
  return elemento;
}

// Pinta el menu dentro de `contenedor`. `ubicacion` es window.location (o una
// version falsa en las pruebas) y `documento` permite probar sin navegador.
function pintarMenu(contenedor, ubicacion, documento) {
  const doc = documento || document;
  const actual = menuActual(ubicacion.pathname, ubicacion.hash);

  const logo = crearElemento(doc, 'a', 'logo');
  logo.href = '../index.html';
  logo.innerHTML = LOGO_MENU;

  const nav = crearElemento(doc, 'nav', 'nav-links');
  nav.setAttribute('aria-label', 'Secciones');
  let enlaceActual = null;
  MENU_PRINCIPAL.forEach(function (opcion) {
    const enlace = crearElemento(doc, 'a');
    enlace.href = opcion.href;
    enlace.textContent = opcion.texto;
    if (opcion.id === actual) {
      enlace.setAttribute('aria-current', 'page');
      enlaceActual = enlace;
    }
    nav.appendChild(enlace);
  });

  // En celular la barra se arrastra en horizontal: se centra la opcion actual
  // para que se vea marcada sin tener que buscarla. Se espera un frame para que
  // el navegador ya tenga medida la barra.
  if (enlaceActual && typeof enlaceActual.scrollIntoView === 'function') {
    const centrar = function () {
      enlaceActual.scrollIntoView({ inline: 'center', block: 'nearest' });
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(centrar);
    } else {
      centrar();
    }
  }

  const botones = crearElemento(doc, 'div', 'nav-buttons');

  const chip = crearElemento(doc, 'p', 'chip-usuario hidden');
  chip.id = 'usuario-actual';
  chip.innerHTML = ICONO_USUARIO + '<span id="usuario-nombre"></span>';

  const boton = crearElemento(doc, 'button', 'btn btn-ghost btn-cerrar-sesion');
  boton.type = 'button';
  boton.id = 'btn-cerrar-sesion';
  boton.innerHTML = ICONO_SALIR + '<span class="texto-cerrar-sesion">Cerrar sesión</span>';

  botones.append(chip, boton);

  const aviso = crearElemento(doc, 'p', 'error-msg menu-error hidden');
  aviso.id = 'menu-error';
  aviso.setAttribute('role', 'alert');

  contenedor.replaceChildren(logo, nav, botones, aviso);
  conectarCerrarSesion(doc);
}

// Cierra la sesion desde cualquier pantalla. Si signOut falla se deja el boton
// activo y se avisa, en vez de dejar al usuario varado.
function conectarCerrarSesion(documento) {
  const doc = documento || document;
  const boton = doc.getElementById('btn-cerrar-sesion');
  if (!boton) {
    return;
  }

  boton.addEventListener('click', async function () {
    boton.disabled = true;
    const aviso = doc.getElementById('menu-error');
    if (aviso) {
      aviso.textContent = '';
      aviso.classList.add('hidden');
    }

    try {
      const { error } = await sbClient.auth.signOut();
      if (error) {
        throw error;
      }
      window.location.replace('../LoginRegistro/loRe.html');
    } catch (error) {
      boton.disabled = false;
      if (aviso) {
        aviso.textContent = 'No se pudo cerrar la sesión. Intenta nuevamente.';
        aviso.classList.remove('hidden');
      }
      console.error(error);
    }
  });
}

// En el navegador se pinta solo. En las pruebas se llama a pintarMenu() a mano.
if (typeof document !== 'undefined' && typeof window !== 'undefined' &&
    typeof document.querySelector === 'function') {
  const contenedor = document.querySelector('[data-menu]');
  if (contenedor) {
    pintarMenu(contenedor, window.location, document);
  }
}
