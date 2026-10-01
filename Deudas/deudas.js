// Pantalla de Analisis Financiero (modulo Deudas).
//
// Muestra tres graficos de torta con la salud financiera del mes:
//   1. Estado financiero: como se reparte el ingreso (esencial vs disponible)
//   2. Distribucion de deudas: cuanto pesa cada deuda en el saldo total
//   3. Ratios ingreso/gasto: ingresos frente a gastos esenciales y hormiga
//
// Este archivo solo pinta: los datos vienen de datos.js y los calculos de
// calculos.js. No habla con Supabase ni con localStorage.

const periodo = periodoDeFecha(new Date());

// Unica fuente de verdad de la pantalla. Todo lo que se ve se calcula a partir
// de aca en renderizar(); ningun total se suma "a mano" en el DOM.
const estado = {
  usuario: null,
  ingresos: [],
  gastos: [],
  gastosHormiga: [],
  deudas: [],
  abonos: []
};

// Un grafico por seccion; se destruyen y recrean en cada render
const graficos = {};

// Paleta que sigue el diseno: verde de la marca, terracota de alerta y
// marfiles de la superficie. Las deudas usan la misma paleta en ciclo.
const COLORES = ['#28B660', '#E0915F', '#F3ECDE', '#A9501C', '#6BBF8A', '#D9C9A3', '#8A9B6E', '#C4A484'];

const MENSAJES_ESTADO = {
  vacio: function () {
    return 'Registra tus ingresos y gastos del mes para ver tu estado financiero.';
  },
  'sin-ingresos': function () {
    return 'Tienes gastos pero ningún ingreso registrado este mes. Agrega tus ingresos para ver la distribución.';
  },
  excedido: function (datos) {
    return `Tus gastos esenciales superan tus ingresos en ${formatearPesos(-datos.disponible)}.`;
  },
  justo: function () {
    return 'Tus gastos esenciales consumen todo tu ingreso del mes.';
  },
  normal: function (datos) {
    return `Después de cubrir lo esencial te quedan ${formatearPesos(datos.disponible)} disponibles.`;
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

function textoCantidad(cantidad, singular, plural) {
  if (cantidad === 0) {
    return 'Sin registros';
  }
  return `${cantidad} ${cantidad === 1 ? singular : plural}`;
}

// ----
// Graficos
// ----

// Crea (o recrea) un grafico de torta. Si no hay ninguna porcion mayor que
// cero, muestra el mensaje vacio y no deja un grafico a medias.
function pintarGrafico(nombre, idCanvas, porciones) {
  const canvas = porId(idCanvas);
  const vacio = porId(`${idCanvas}-vacio`);

  if (graficos[nombre]) {
    graficos[nombre].destroy();
    delete graficos[nombre];
  }

  const hayDatos = porciones.some(function (porcion) { return porcion.valor > 0; });

  if (!hayDatos) {
    canvas.classList.add('hidden');
    vacio.classList.remove('hidden');
    return;
  }

  canvas.classList.remove('hidden');
  vacio.classList.add('hidden');

  graficos[nombre] = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: porciones.map(function (porcion) { return porcion.etiqueta; }),
      datasets: [{
        data: porciones.map(function (porcion) { return porcion.valor; }),
        backgroundColor: porciones.map(function (_, indice) {
          return COLORES[indice % COLORES.length];
        }),
        borderColor: '#1C1C1C',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#F3ECDE',
            usePointStyle: true,
            padding: 16,
            font: { family: 'Plus Jakarta Sans', size: 12 }
          }
        },
        tooltip: {
          callbacks: {
            label: function (contexto) {
              const total = contexto.dataset.data.reduce(function (a, b) { return a + b; }, 0);
              const porcentaje = total > 0 ? Math.round((contexto.parsed / total) * 100) : 0;
              return ` ${contexto.label}: ${formatearPesos(contexto.parsed)} (${porcentaje}%)`;
            }
          }
        }
      }
    }
  });
}

// ----
// Pintar
// ----

function renderizar() {
  renderizarEstadoFinanciero();
  renderizarDistribucionDeudas();
  renderizarRatios();
  renderizarAbonos();
}

function renderizarEstadoFinanciero() {
  const datos = calcularEstadoFinanciero(estado.ingresos, estado.gastos);

  porId('ef-ingresos').textContent = formatearPesos(datos.totalIngresos);
  porId('ef-gastos').textContent = formatearPesos(datos.totalGastos);
  porId('ef-disponible').textContent = formatearPesos(datos.disponible);
  porId('ef-mensaje').textContent = MENSAJES_ESTADO[datos.estado](datos);

  pintarGrafico('estado', 'ef-grafico', datos.porciones);
}

function renderizarDistribucionDeudas() {
  const datos = calcularDistribucionDeudas(estado.deudas);

  porId('dd-total').textContent = formatearPesos(datos.saldoTotal);
  porId('dd-cantidad').textContent = textoCantidad(datos.cantidad, 'deuda', 'deudas');
  porId('dd-mensaje').textContent = datos.prioridad
    ? `La más cara es "${datos.prioridad.nombre}" (${formatearTasa(datos.prioridad.tasaEA)}).`
    : 'Registra tus deudas para ver cómo se distribuye tu saldo total.';

  pintarGrafico('deudas', 'dd-grafico', datos.porciones);
}

function renderizarRatios() {
  const datos = calcularRatios(estado.ingresos, estado.gastos, estado.gastosHormiga);

  porId('rt-ingresos').textContent = formatearPesos(datos.totalIngresos);
  porId('rt-gastos').textContent = formatearPesos(datos.totalGastos);
  porId('rt-hormiga').textContent = formatearPesos(datos.totalHormiga);

  const totalGastos = datos.totalGastos + datos.totalHormiga;
  const porcentaje = datos.totalIngresos > 0 ? (totalGastos / datos.totalIngresos) * 100 : null;
  porId('rt-porcentaje').textContent = formatearPorcentaje(porcentaje);
  porId('rt-mensaje').textContent = porcentaje === null
    ? 'Registra tus ingresos y gastos del mes para ver la proporción.'
    : `Tus gastos del mes representan el ${formatearPorcentaje(porcentaje)} de tus ingresos.`;

  pintarGrafico('ratios', 'rt-grafico', datos.porciones);
}

// ----
// Abonos
// ----

function fechaCorta(fecha) {
  return new Date(fecha).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

// Mensaje para lectores de pantalla. Se vacia primero para que un mismo texto
// repetido se vuelva a anunciar.
function anunciar(mensaje) {
  const anuncio = porId('anuncio');
  anuncio.textContent = '';
  requestAnimationFrame(function () {
    anuncio.textContent = mensaje;
  });
}

function mostrarErrorCampo(tipo, campo, mensaje) {
  porId(`${tipo}-${campo}`).setAttribute('aria-invalid', 'true');
  mostrar(porId(`error-${tipo}-${campo}`), mensaje);
}

function limpiarErrorCampo(tipo, campo) {
  porId(`${tipo}-${campo}`).removeAttribute('aria-invalid');
  ocultar(porId(`error-${tipo}-${campo}`));
}

function nombreDeuda(id) {
  const deuda = estado.deudas.find(function (d) { return String(d.id) === String(id); });
  return deuda ? deuda.nombre : 'Deuda eliminada';
}

// El select se rearma cada vez que cambian las deudas (al agregar o eliminar un
// abono el saldo cambia, y el texto de cada opcion lo muestra).
function llenarSelectDeudas() {
  const select = porId('abono-deudaId');
  const valorPrevio = select.value;

  select.replaceChildren(select.options[0]);
  estado.deudas.forEach(function (deuda) {
    const opcion = document.createElement('option');
    opcion.value = deuda.id;
    opcion.textContent = `${deuda.nombre} · ${formatearPesos(deuda.saldo)}`;
    select.appendChild(opcion);
  });

  if (valorPrevio) {
    select.value = valorPrevio;
  }
}

function renderizarAbonos() {
  const registros = estado.abonos.slice().sort(function (a, b) {
    return new Date(b.fecha) - new Date(a.fecha);
  });

  const filas = porId('lista-abonos');
  filas.replaceChildren.apply(filas, registros.map(function (registro) {
    const fila = porId('plantilla-abono').content.firstElementChild.cloneNode(true);
    fila.dataset.id = registro.id;
    fila.querySelector('.registro-concepto').textContent = nombreDeuda(registro.deudaId);
    fila.querySelector('.registro-fecha').textContent = fechaCorta(registro.fecha);
    fila.querySelector('.registro-monto').textContent = formatearPesos(registro.monto);
    fila.querySelector('.btn-eliminar')
      .setAttribute('aria-label', `Eliminar abono a ${nombreDeuda(registro.deudaId)}`);
    return fila;
  }));

  porId('tabla-abonos').classList.toggle('hidden', registros.length === 0);
  porId('vacio-abonos').classList.toggle('hidden', registros.length > 0);

  const total = registros.reduce(function (suma, registro) { return suma + registro.monto; }, 0);
  porId('total-lista-abonos').textContent = formatearPesos(total);
  porId('nota-abonos').textContent = registros.length
    ? `Has abonado ${formatearPesos(total)} en total.`
    : 'Registra un abono para empezar a bajar tus deudas.';
}

function conectarFormularioAbono() {
  const form = porId('form-abono');
  const boton = form.querySelector('button[type="submit"]');
  const errorGeneral = porId('error-abono-general');
  const inputMonto = porId('abono-monto');

  inputMonto.addEventListener('blur', function () {
    const monto = parsearMonto(inputMonto.value);
    if (monto > 0) {
      inputMonto.value = formatearMiles(monto);
    }
  });

  ['deudaId', 'monto'].forEach(function (campo) {
    const input = porId(`abono-${campo}`);
    input.addEventListener('input', function () { limpiarErrorCampo('abono', campo); });
    input.addEventListener('change', function () { limpiarErrorCampo('abono', campo); });
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    ocultar(errorGeneral);

    const entrada = {
      deudaId: porId('abono-deudaId').value,
      monto: porId('abono-monto').value
    };

    const resultado = validarAbono(entrada, estado.deudas);

    ['deudaId', 'monto'].forEach(function (campo) {
      if (resultado.errores[campo]) {
        mostrarErrorCampo('abono', campo, resultado.errores[campo]);
      } else {
        limpiarErrorCampo('abono', campo);
      }
    });

    if (!resultado.valido) {
      const primerCampo = ['deudaId', 'monto'].find(function (campo) {
        return resultado.errores[campo];
      });
      porId(`abono-${primerCampo}`).focus();
      return;
    }

    boton.disabled = true;

    try {
      const registro = await agregarAbono(resultado.datos);
      estado.abonos.push(registro);

      // El trigger ya bajo el saldo en la base: se recargan las deudas para que
      // el grafico de distribucion y el select queden al dia.
      estado.deudas = await obtenerDeudas();

      renderizar();
      llenarSelectDeudas();
      form.reset();
      porId('abono-deudaId').focus();

      const total = estado.abonos.reduce(function (suma, a) { return suma + a.monto; }, 0);
      anunciar(`Abono agregado. Total abonado: ${formatearPesos(total)}.`);
    } catch (error) {
      mostrar(errorGeneral, 'No se pudo guardar el abono. Intenta nuevamente.');
      console.error(error);
    } finally {
      boton.disabled = false;
    }
  });
}

function conectarListaAbonos() {
  const contenedor = porId('lista-abonos');
  const errorLista = porId('error-lista-abonos');

  contenedor.addEventListener('click', async function (event) {
    const boton = event.target.closest('.btn-eliminar');
    if (!boton) {
      return;
    }

    const id = boton.closest('.registro').dataset.id;
    boton.disabled = true;
    ocultar(errorLista);

    try {
      await eliminarAbono(id);
      estado.abonos = estado.abonos.filter(function (registro) {
        return String(registro.id) !== String(id);
      });

      // El trigger devolvio el monto al saldo: se recargan las deudas
      estado.deudas = await obtenerDeudas();

      renderizar();
      llenarSelectDeudas();
      porId('titulo-lista-abonos').focus();
      anunciar('Abono eliminado.');
    } catch (error) {
      boton.disabled = false;
      mostrar(errorLista, 'No se pudo eliminar el abono. Intenta nuevamente.');
      console.error(error);
    }
  });
}

// ----
// Sesion y carga
// ----

async function verificarSesion() {
  const usuario = await getUsuarioActual();

  if (!usuario) {
    window.location.replace('../LoginRegistro/loRe.html');
    return null;
  }

  estado.usuario = usuario;
  porId('usuario-nombre').textContent = usuario.nombre;
  porId('usuario-actual').classList.remove('hidden');
  return usuario;
}

async function cargarDatos() {
  const [ingresos, gastos, gastosHormiga, deudas, abonos] = await Promise.all([
    obtenerIngresos(periodo),
    obtenerGastos(periodo),
    obtenerGastosHormiga(periodo),
    obtenerDeudas(),
    obtenerAbonos()
  ]);

  estado.ingresos = ingresos;
  estado.gastos = gastos;
  estado.gastosHormiga = gastosHormiga;
  estado.deudas = deudas;
  estado.abonos = abonos;

  llenarSelectDeudas();
}

async function iniciar() {
  porId('periodo-nombre').textContent = nombreDelPeriodo(periodo);
  conectarFormularioAbono();
  conectarListaAbonos();
  renderizar();

  try {
    const usuario = await verificarSesion();
    if (!usuario) {
      return;
    }

    await cargarDatos();
    renderizar();
  } catch (error) {
    mostrar(porId('error-carga'), 'No se pudieron cargar tus datos. Intenta nuevamente en unos minutos.');
    console.error(error);
  }
}

iniciar();
