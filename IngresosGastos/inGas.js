// Pantalla de Ingresos y Gastos.
//
// Cubre cuatro entidades: ingresos (EN-4), gastos esenciales (EN-5), gastos
// hormiga y deudas, mas el resumen del mes (EN-6).
//
// Este archivo solo maneja la pantalla: lee los formularios, valida con
// calculos.js, guarda con datos.js y vuelve a pintar. Nunca habla con
// localStorage ni con Supabase; para conectar la base de datos no hay que
// tocarlo, solo datos.js.
//
// Nota: antes esta pantalla devolvia a la landing cuando se recargaba con F5.
// Se quito a proposito: al recargar el usuario se queda donde estaba.

const periodo = periodoDeFecha(new Date());

// Unica fuente de verdad de la pantalla. Todo lo que se ve se calcula a partir
// de aca en renderizar(); ningun total se suma ni se resta "a mano" en el DOM.
const estado = {
  usuario: null,
  categorias: [],
  ingresos: [],
  gastos: [],
  gastosHormiga: [],
  deudas: []
};

// Lo que cambia entre una entidad y otra. El resto del flujo (validar, guardar,
// pintar, eliminar) es el mismo para las cuatro.
//
//   coleccion    llave dentro de `estado`
//   dom          sufijo de los id del HTML (form-..., lista-..., vacio-...)
//   campos       inputs del formulario, en orden; el id es `${tipo}-${campo}`
//   camposMonto  cuales de esos campos se formatean como pesos al salir
//   tabla        id de la tabla que se oculta cuando no hay registros (si aplica)
//   ordenar      orden de las filas; por defecto, de la mas reciente a la mas vieja
const tipos = {
  ingreso: {
    coleccion: 'ingresos',
    dom: 'ingresos',
    campos: ['concepto', 'monto'],
    camposMonto: ['monto'],
    validar: function (entrada) { return validarIngreso(entrada); },
    agregar: agregarIngreso,
    eliminar: eliminarIngreso,
    plantilla: 'plantilla-registro',
    llenarFila: llenarFilaMovimiento,
    etiqueta: function (registro) { return registro.concepto; },
    total: function (registros) { return formatearPesos(sumarMontos(registros)); },
    singular: 'ingreso',
    textoAgregado: 'Ingreso agregado. Ingresos del mes:',
    textoEliminado: 'Ingreso eliminado.'
  },
  gasto: {
    coleccion: 'gastos',
    dom: 'gastos',
    campos: ['concepto', 'categoria', 'monto'],
    camposMonto: ['monto'],
    validar: function (entrada) { return validarGasto(entrada, estado.categorias); },
    agregar: agregarGasto,
    eliminar: eliminarGasto,
    plantilla: 'plantilla-registro',
    llenarFila: llenarFilaMovimiento,
    etiqueta: function (registro) { return registro.concepto; },
    total: function (registros) { return formatearPesos(sumarMontos(registros)); },
    singular: 'gasto',
    textoAgregado: 'Gasto agregado. Gastos esenciales del mes:',
    textoEliminado: 'Gasto eliminado.'
  },
  hormiga: {
    coleccion: 'gastosHormiga',
    dom: 'hormiga',
    tabla: 'tabla-hormiga',
    campos: ['concepto', 'montoMensual'],
    camposMonto: ['montoMensual'],
    validar: function (entrada) { return validarGastoHormiga(entrada); },
    agregar: agregarGastoHormiga,
    eliminar: eliminarGastoHormiga,
    plantilla: 'plantilla-hormiga',
    llenarFila: llenarFilaHormiga,
    etiqueta: function (registro) { return registro.concepto; },
    total: function (registros) { return formatearPesos(calcularResumenHormiga(registros).totalMensual); },
    singular: 'gasto hormiga',
    textoAgregado: 'Gasto hormiga agregado. Al mes suman:',
    textoEliminado: 'Gasto hormiga eliminado.'
  },
  deuda: {
    coleccion: 'deudas',
    dom: 'deudas',
    tabla: 'tabla-deudas',
    campos: ['nombre', 'saldo', 'tasaEA', 'pagoMinimo'],
    camposMonto: ['saldo', 'pagoMinimo'],
    validar: function (entrada) { return validarDeuda(entrada); },
    agregar: agregarDeuda,
    eliminar: eliminarDeuda,
    plantilla: 'plantilla-deuda',
    llenarFila: llenarFilaDeuda,
    // Metodo avalancha: la de mayor tasa primero
    ordenar: ordenarPorAvalancha,
    etiqueta: function (registro) { return registro.nombre; },
    total: function (registros) { return formatearPesos(calcularResumenDeudas(registros).saldoTotal); },
    singular: 'deuda',
    textoAgregado: 'Deuda agregada. Saldo total:',
    textoEliminado: 'Deuda eliminada.'
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

function fechaCorta(fecha) {
  return new Date(fecha).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

// ---------------------------------------------------------------------------
// Pintar
// ---------------------------------------------------------------------------

function renderizar() {
  renderizarResumen();
  Object.keys(tipos).forEach(renderizarLista);
  renderizarResumenHormiga();
  renderizarResumenDeudas();
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

function renderizarResumenHormiga() {
  const resumen = calcularResumenHormiga(estado.gastosHormiga);

  porId('mini-hormiga').textContent = formatearPesos(resumen.totalMensual);
  porId('mini-hormiga-anual').textContent = formatearPesos(resumen.impactoAnual);
  porId('hormiga-anual').textContent = formatearPesos(resumen.impactoAnual);
}

function renderizarResumenDeudas() {
  const resumen = calcularResumenDeudas(estado.deudas);

  porId('mini-deuda').textContent = formatearPesos(resumen.saldoTotal);
  porId('deuda-pagos-minimos').textContent = formatearPesos(resumen.pagoMinimoTotal);
  porId('deuda-intereses').textContent = formatearPesos(resumen.interesMensual);

  porId('nota-avalancha').textContent = resumen.prioridad
    ? `Abona lo que puedas a "${resumen.prioridad.nombre}" (${formatearTasa(resumen.prioridad.tasaEA)}): es la que más intereses te cobra.`
    : 'Registra tus deudas para saber cuál pagar primero.';
}

function renderizarLista(tipo) {
  const config = tipos[tipo];
  const guardados = estado[config.coleccion];

  const registros = config.ordenar
    ? config.ordenar(guardados)
    : guardados.slice().sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); });

  const filas = porId(`lista-${config.dom}`);
  filas.replaceChildren.apply(filas, registros.map(function (registro, indice) {
    return crearFila(tipo, registro, indice);
  }));

  // En las tablas se esconde la tabla entera, para que no quede un encabezado
  // de columnas suelto cuando no hay filas.
  porId(config.tabla || `lista-${config.dom}`).classList.toggle('hidden', registros.length === 0);
  porId(`vacio-${config.dom}`).classList.toggle('hidden', registros.length > 0);
  porId(`total-lista-${config.dom}`).textContent = config.total(registros);
}

function crearFila(tipo, registro, indice) {
  const config = tipos[tipo];
  const fila = porId(config.plantilla).content.firstElementChild.cloneNode(true);

  fila.dataset.id = registro.id;
  config.llenarFila(fila, registro, indice);
  fila.querySelector('.btn-eliminar')
    .setAttribute('aria-label', `Eliminar ${config.singular}: ${config.etiqueta(registro)}`);

  return fila;
}

// Todo el texto que escribe el usuario entra con textContent, nunca con
// innerHTML, para que un concepto como "<img onerror=...>" no se ejecute.
// Esto vale para las tres funciones de abajo.

function llenarFilaMovimiento(fila, registro) {
  fila.querySelector('.registro-concepto').textContent = registro.concepto;
  fila.querySelector('.registro-monto').textContent = formatearPesos(registro.monto);
  fila.querySelector('.registro-fecha').textContent = fechaCorta(registro.fecha);

  const chip = fila.querySelector('.chip-categoria');
  if (registro.categoria) {
    chip.textContent = nombreCategoria(registro.categoria);
  } else {
    chip.remove();
  }
}

function llenarFilaHormiga(fila, registro) {
  fila.querySelector('.registro-concepto').textContent = registro.concepto;
  fila.querySelector('.registro-fecha').textContent = fechaCorta(registro.fecha);
  fila.querySelector('.registro-monto').textContent = formatearPesos(registro.montoMensual);
  fila.querySelector('.registro-anual').textContent = formatearPesos(calcularImpactoAnual(registro.montoMensual));
}

function llenarFilaDeuda(fila, registro, indice) {
  fila.querySelector('.registro-concepto').textContent = registro.nombre;
  fila.querySelector('.registro-saldo').textContent = formatearPesos(registro.saldo);
  fila.querySelector('.registro-tasa').textContent = formatearTasa(registro.tasaEA);
  fila.querySelector('.registro-pago').textContent = formatearPesos(registro.pagoMinimo);

  // La lista ya viene ordenada por avalancha: la primera es la prioritaria
  const chip = fila.querySelector('.chip-prioridad');
  if (indice === 0) {
    chip.textContent = 'Paga primero';
  } else {
    chip.remove();
  }
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

function mostrarUsuario(usuario) {
  porId('usuario-nombre').textContent = usuario.nombre;
  porId('usuario-actual').classList.remove('hidden');
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

  // Al salir del campo el monto se muestra con puntos de miles: 1500000 -> 1.500.000
  config.camposMonto.forEach(function (campo) {
    const input = porId(`${tipo}-${campo}`);
    input.addEventListener('blur', function () {
      const monto = parsearMonto(input.value);
      if (monto > 0) {
        input.value = formatearMiles(monto);
      }
    });
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
      const registro = await config.agregar(resultado.datos);
      estado[config.coleccion].push(registro);
      renderizar();
      form.reset();
      porId(`${tipo}-${config.campos[0]}`).focus();
      anunciar(`${config.textoAgregado} ${config.total(estado[config.coleccion])}.`);
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
  const contenedor = porId(`lista-${config.dom}`);
  const errorLista = porId(`error-lista-${config.dom}`);

  // Un solo listener para toda la lista, porque las filas se vuelven a crear
  // cada vez que se pinta.
  contenedor.addEventListener('click', async function (event) {
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
        return String(registro.id) !== String(id);
      });
      renderizar();
      // La fila (y su boton) ya no existen: el foco pasa al titulo de la lista
      porId(`titulo-lista-${config.dom}`).focus();
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

// Guardia de sesion. Hoy getUsuarioActual() devuelve un usuario simulado y se
// entra directo; cuando devuelva la sesion real de Supabase, sin sesion se
// redirige al login. Si la consulta falla no se redirige: se muestra el error,
// para no dejar al usuario rebotando entre pantallas.
async function verificarSesion() {
  const usuario = await getUsuarioActual();

  if (!usuario) {
    window.location.replace('../LoginRegistro/loRe.html');
    return null;
  }

  estado.usuario = usuario;
  mostrarUsuario(usuario);
  return usuario;
}

async function cargarDatos() {
  const [categorias, ingresos, gastos, gastosHormiga, deudas] = await Promise.all([
    obtenerCategorias(),
    obtenerIngresos(periodo),
    obtenerGastos(periodo),
    obtenerGastosHormiga(periodo),
    obtenerDeudas()
  ]);

  estado.categorias = categorias;
  estado.ingresos = ingresos;
  estado.gastos = gastos;
  estado.gastosHormiga = gastosHormiga;
  estado.deudas = deudas;

  llenarCategorias();
}

async function iniciar() {
  porId('periodo-nombre').textContent = nombreDelPeriodo(periodo);

  Object.keys(tipos).forEach(function (tipo) {
    conectarFormulario(tipo);
    conectarLista(tipo);
  });

  // Mientras llegan los datos se muestra todo en cero y no se deja enviar nada,
  // para que un registro nuevo no se pierda cuando termine la carga.
  const botonesEnviar = document.querySelectorAll('.formulario-registro button[type="submit"]');
  botonesEnviar.forEach(function (boton) { boton.disabled = true; });
  renderizar();

  try {
    const usuario = await verificarSesion();
    if (!usuario) {
      return;
    }

    await cargarDatos();
    renderizar();
    botonesEnviar.forEach(function (boton) { boton.disabled = false; });
  } catch (error) {
    mostrar(porId('error-carga'), 'No se pudieron cargar tus datos. Intenta nuevamente en unos minutos.');
    console.error(error);
  }
}

iniciar();
