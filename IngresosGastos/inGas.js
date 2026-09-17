// Pantalla de Ingresos y Gastos (EN-4, EN-5, EN-6).
//
// Este archivo solo maneja la pantalla: lee los formularios, valida con
// calculos.js, guarda con datos.js y vuelve a pintar. Para conectar la base de
// datos no hay que tocarlo, solo datos.js.

// Si la página fue recargada (F5), devolver al usuario a la landing
// TODO: comportamiento heredado (el mismo que tiene LoginRegistro/loRe.js),
// pendiente de revision de producto. Se mantuvo a proposito en EN-4/5/6: no es
// un descuido. Ojo que con datos reales un F5 saca al usuario de su resumen.
if (performance.getEntriesByType('navigation')[0]?.type === 'reload') {
  window.location.replace('../index.html');
}

const periodo = periodoDeFecha(new Date());

// Unica fuente de verdad de la pantalla. Todo lo que se ve se calcula a partir
// de aca en renderizar(); ningun total se suma ni se resta "a mano" en el DOM.
const estado = {
  categorias: [],
  ingresos: [],
  gastos: []
};

// Lo que cambia entre ingresos y gastos. El resto del flujo (validar, guardar,
// pintar, eliminar) es el mismo para los dos.
const tipos = {
  ingreso: {
    coleccion: 'ingresos',
    campos: ['concepto', 'monto'],
    validar: function (entrada) { return validarIngreso(entrada); },
    crear: crearIngreso,
    eliminar: eliminarIngreso,
    singular: 'ingreso',
    textoAgregado: 'Ingreso agregado. Ingresos del mes:',
    textoEliminado: 'Ingreso eliminado.'
  },
  gasto: {
    coleccion: 'gastos',
    campos: ['concepto', 'categoria', 'monto'],
    validar: function (entrada) { return validarGasto(entrada, estado.categorias); },
    crear: crearGasto,
    eliminar: eliminarGasto,
    singular: 'gasto',
    textoAgregado: 'Gasto agregado. Gastos esenciales del mes:',
    textoEliminado: 'Gasto eliminado.'
  }
};

const MENSAJES_RESUMEN = {
  vacio: function () {
    return 'Registra tus ingresos y gastos esenciales del mes para ver cuánto dinero te queda disponible.';
  },
  'sin-ingresos': function () {
    return 'Tienes gastos esenciales pero ningún ingreso registrado este mes. Agrega tus ingresos para calcular el porcentaje.';
  },
  excedido: function (resumen) {
    return `Tus gastos esenciales superan tus ingresos en ${formatearPesos(-resumen.disponible)}. Revisa cuáles puedes ajustar.`;
  },
  justo: function () {
    return 'Tus gastos esenciales consumen todo tu ingreso del mes. No te queda dinero disponible.';
  },
  normal: function (resumen) {
    return `Después de cubrir lo esencial te quedan ${formatearPesos(resumen.disponible)} disponibles este mes.`;
  }
};

function porId(id) {
  return document.getElementById(id);
}

function mostrar(elemento, mensaje) {
  elemento.textContent = mensaje;
  elemento.classList.remove('hidden');
}

function ocultar(elemento) {
  elemento.textContent = '';
  elemento.classList.add('hidden');
}

// Mensaje para lectores de pantalla. Se vacia primero para que un mismo texto
// repetido ("Ingreso agregado") se vuelva a anunciar.
function anunciar(mensaje) {
  const anuncio = porId('anuncio');
  anuncio.textContent = '';
  requestAnimationFrame(function () {
    anuncio.textContent = mensaje;
  });
}

function textoCantidad(cantidad, singular, plural) {
  if (cantidad === 0) {
    return 'Sin registros';
  }
  return `${cantidad} ${cantidad === 1 ? singular : plural}`;
}

// ---------------------------------------------------------------------------
// Pintar
// ---------------------------------------------------------------------------

function renderizar() {
  renderizarResumen();
  renderizarLista('ingreso');
  renderizarLista('gasto');
}

function renderizarResumen() {
  const resumen = calcularResumen(estado.ingresos, estado.gastos);

  // El CSS usa data-estado para los colores de alerta (deficit, sin ingresos)
  porId('panel-resumen').dataset.estado = resumen.estado;

  porId('total-ingresos').textContent = formatearPesos(resumen.totalIngresos);
  porId('total-gastos').textContent = formatearPesos(resumen.totalGastos);
  porId('total-disponible').textContent = formatearPesos(resumen.disponible);
  porId('cantidad-ingresos').textContent = textoCantidad(estado.ingresos.length, 'ingreso', 'ingresos');
  porId('cantidad-gastos').textContent = textoCantidad(estado.gastos.length, 'gasto', 'gastos');
  porId('porcentaje-gastos').textContent = formatearPorcentaje(resumen.porcentajeGastos);
  porId('mensaje-resumen').textContent = MENSAJES_RESUMEN[resumen.estado](resumen);

  // La barra llega como maximo al 100% aunque los gastos superen los ingresos;
  // el porcentaje real queda escrito al lado. Con gastos y sin ingresos se
  // muestra llena, en color de alerta.
  const barra = porId('barra-gastos');
  let relleno = 0;

  if (resumen.porcentajeGastos === null) {
    relleno = resumen.estado === 'sin-ingresos' ? 100 : 0;
    barra.removeAttribute('aria-valuenow');
    barra.setAttribute('aria-valuetext', 'Sin ingresos registrados');
  } else {
    relleno = Math.min(resumen.porcentajeGastos, 100);
    barra.setAttribute('aria-valuenow', String(Math.round(relleno)));
    barra.setAttribute('aria-valuetext', formatearPorcentaje(resumen.porcentajeGastos));
  }

  porId('barra-relleno').style.width = `${relleno}%`;
}

function renderizarLista(tipo) {
  const config = tipos[tipo];
  const registros = estado[config.coleccion].slice().sort(function (a, b) {
    return new Date(b.fecha) - new Date(a.fecha);
  });

  const lista = porId(`lista-${config.coleccion}`);
  lista.replaceChildren.apply(lista, registros.map(function (registro) {
    return crearFila(tipo, registro);
  }));

  lista.classList.toggle('hidden', registros.length === 0);
  porId(`vacio-${config.coleccion}`).classList.toggle('hidden', registros.length > 0);
  porId(`total-lista-${config.coleccion}`).textContent = formatearPesos(sumarMontos(registros));
}

// Todo el texto que escribe el usuario entra con textContent, nunca con
// innerHTML, para que un concepto como "<img onerror=...>" no se ejecute.
function crearFila(tipo, registro) {
  const fila = porId('plantilla-registro').content.firstElementChild.cloneNode(true);

  fila.dataset.id = registro.id;
  fila.querySelector('.registro-concepto').textContent = registro.concepto;
  fila.querySelector('.registro-monto').textContent = formatearPesos(registro.monto);
  fila.querySelector('.registro-fecha').textContent = new Date(registro.fecha)
    .toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });

  const chip = fila.querySelector('.chip-categoria');
  if (registro.categoria) {
    chip.textContent = nombreCategoria(registro.categoria);
  } else {
    chip.remove();
  }

  fila.querySelector('.btn-eliminar')
    .setAttribute('aria-label', `Eliminar ${tipos[tipo].singular}: ${registro.concepto}`);

  return fila;
}

function nombreCategoria(id) {
  const categoria = estado.categorias.find(function (c) { return c.id === id; });
  return categoria ? categoria.nombre : id;
}

function llenarCategorias() {
  const select = porId('gasto-categoria');
  estado.categorias.forEach(function (categoria) {
    const opcion = document.createElement('option');
    opcion.value = categoria.id;
    opcion.textContent = categoria.nombre;
    select.appendChild(opcion);
  });
}

// ---------------------------------------------------------------------------
// Formularios
// ---------------------------------------------------------------------------

function mostrarErrorCampo(tipo, campo, mensaje) {
  porId(`${tipo}-${campo}`).setAttribute('aria-invalid', 'true');
  mostrar(porId(`error-${tipo}-${campo}`), mensaje);
}

function limpiarErrorCampo(tipo, campo) {
  porId(`${tipo}-${campo}`).removeAttribute('aria-invalid');
  ocultar(porId(`error-${tipo}-${campo}`));
}

function conectarFormulario(tipo) {
  const config = tipos[tipo];
  const form = porId(`form-${tipo}`);
  const boton = form.querySelector('button[type="submit"]');
  const errorGeneral = porId(`error-${tipo}-general`);
  const inputMonto = porId(`${tipo}-monto`);

  // Al salir del campo el monto se muestra con puntos de miles: 1500000 -> 1.500.000
  inputMonto.addEventListener('blur', function () {
    const monto = parsearMonto(inputMonto.value);
    if (monto > 0) {
      inputMonto.value = formatearMiles(monto);
    }
  });

  // El error de un campo desaparece apenas el usuario empieza a corregirlo
  config.campos.forEach(function (campo) {
    const input = porId(`${tipo}-${campo}`);
    input.addEventListener('input', function () { limpiarErrorCampo(tipo, campo); });
    input.addEventListener('change', function () { limpiarErrorCampo(tipo, campo); });
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    ocultar(errorGeneral);

    const entrada = {};
    config.campos.forEach(function (campo) {
      entrada[campo] = porId(`${tipo}-${campo}`).value;
    });

    const resultado = config.validar(entrada);

    config.campos.forEach(function (campo) {
      if (resultado.errores[campo]) {
        mostrarErrorCampo(tipo, campo, resultado.errores[campo]);
      } else {
        limpiarErrorCampo(tipo, campo);
      }
    });

    if (!resultado.valido) {
      const primerCampoConError = config.campos.find(function (campo) {
        return resultado.errores[campo];
      });
      porId(`${tipo}-${primerCampoConError}`).focus();
      return;
    }

    boton.disabled = true;

    try {
      const registro = await config.crear(resultado.datos);
      estado[config.coleccion].push(registro);
      renderizar();
      form.reset();
      porId(`${tipo}-concepto`).focus();
      anunciar(`${config.textoAgregado} ${formatearPesos(sumarMontos(estado[config.coleccion]))}.`);
    } catch (error) {
      mostrar(errorGeneral, 'No se pudo guardar el registro. Intenta nuevamente.');
      console.error(error);
    } finally {
      boton.disabled = false;
    }
  });
}

// ---------------------------------------------------------------------------
// Eliminar
// ---------------------------------------------------------------------------

function conectarLista(tipo) {
  const config = tipos[tipo];
  const lista = porId(`lista-${config.coleccion}`);
  const errorLista = porId(`error-lista-${config.coleccion}`);

  // Un solo listener para toda la lista, porque las filas se vuelven a crear
  // cada vez que se pinta.
  lista.addEventListener('click', async function (event) {
    const boton = event.target.closest('.btn-eliminar');
    if (!boton) {
      return;
    }

    const id = boton.closest('.registro').dataset.id;
    boton.disabled = true;
    ocultar(errorLista);

    try {
      await config.eliminar(id);
      estado[config.coleccion] = estado[config.coleccion].filter(function (registro) {
        return registro.id !== id;
      });
      renderizar();
      // La fila (y su boton) ya no existen: el foco pasa al titulo de la lista
      porId(`titulo-lista-${config.coleccion}`).focus();
      anunciar(config.textoEliminado);
    } catch (error) {
      boton.disabled = false;
      mostrar(errorLista, 'No se pudo eliminar el registro. Intenta nuevamente.');
      console.error(error);
    }
  });
}

// ---------------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------------

async function iniciar() {
  porId('periodo-nombre').textContent = nombreDelPeriodo(periodo);

  conectarFormulario('ingreso');
  conectarFormulario('gasto');
  conectarLista('ingreso');
  conectarLista('gasto');

  // Mientras llegan los datos se muestra todo en cero y no se deja enviar nada,
  // para que un registro nuevo no se pierda cuando termine la carga.
  const botonesEnviar = document.querySelectorAll('.formulario-registro button[type="submit"]');
  botonesEnviar.forEach(function (boton) { boton.disabled = true; });
  renderizar();

  try {
    const [categorias, ingresos, gastos] = await Promise.all([
      obtenerCategorias(),
      obtenerIngresos(periodo),
      obtenerGastos(periodo)
    ]);

    estado.categorias = categorias;
    estado.ingresos = ingresos;
    estado.gastos = gastos;

    llenarCategorias();
    renderizar();
    botonesEnviar.forEach(function (boton) { boton.disabled = false; });
  } catch (error) {
    mostrar(porId('error-carga'), 'No se pudieron cargar tus datos. Intenta nuevamente en unos minutos.');
    console.error(error);
  }
}

iniciar();
