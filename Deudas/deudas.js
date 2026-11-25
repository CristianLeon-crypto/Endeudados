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
  abonos: [],
  // Abono extra que eligio el usuario en la barra (EN-50)
  abonoExtra: 0
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
  renderizarProyeccion();
  renderizarAbonos();
  renderizarAvance();
  renderizarLogros();
}

// ---------------------------------------------------------------------------
// Abono extra (EN-50): cuanto tiempo e intereses se ahorra con un extra al mes
// ---------------------------------------------------------------------------

function renderizarProyeccion() {
  const bloque = porId('bloque-proyeccion');
  const barra = porId('abono-extra');
  const nota = porId('abono-nota');

  // Antes de la sesion y los datos no se muestra nada
  if (!estado.usuario) {
    bloque.classList.add('hidden');
    return;
  }
  bloque.classList.remove('hidden');

  // El excedente se calcula igual que en Plan de pagos
  const plan = calcularPlanPagos(estado.ingresos, estado.gastos, estado.deudas);
  const tope = topeAbonoExtra(plan.excedente);
  barra.max = tope;
  barra.disabled = plan.estado !== 'plan' || tope === 0;
  estado.abonoExtra = Math.min(estado.abonoExtra, tope);
  barra.value = estado.abonoExtra;

  if (plan.estado === 'insuficiente') {
    nota.textContent = 'Tus pagos mínimos superan tu capacidad: por ahora no se puede aumentar el abono.';
  } else if (plan.estado === 'sin-deudas') {
    nota.textContent = 'Cuando registres deudas, aquí podrás simular un abono extra.';
  } else if (tope === 0) {
    nota.textContent = 'Tu excedente está muy justo: por paz mental, mejor no aumentar el abono.';
  } else {
    nota.textContent = `Puedes subir hasta ${formatearPesos(tope)}: se dejan ${formatearPesos(plan.excedente - tope)} libres para ocio e imprevistos.`;
  }

  renderizarSimulacion();
}

// Solo lo que cambia al mover la barra: no recalcula el plan ni la nota
function renderizarSimulacion() {
  porId('abono-valor').textContent = `${formatearPesos(estado.abonoExtra)}/mes`;

  const simulacion = simularAbonoExtra(estado.deudas, estado.abonoExtra, periodo);
  const textos = textosAbonoExtra(simulacion);
  porId('proyeccion-tiempo').textContent = textos.tiempo;
  porId('proyeccion-ahorro').textContent = textos.ahorro;
  porId('proyeccion-ahorro').classList.toggle('hidden', !textos.ahorro);
}

// { tiempo, ahorro }: la frase principal y la comparacion con pagar solo los
// minimos. Si el abono no cubre los intereses se dice, sin mostrar un numero.
function textosAbonoExtra(simulacion) {
  const extra = simulacion.abonoExtra;

  if (simulacion.estado === 'sin-deudas') {
    return { tiempo: 'No tienes deudas registradas: ya estás libre.', ahorro: '' };
  }
  if (simulacion.estado === 'no-termina') {
    if (simulacion.motivo === 'plazo') {
      return { tiempo: extra > 0 ? 'Con este abono no terminas de pagar ni en 50 años.' : 'Pagando solo los mínimos no terminas de pagar ni en 50 años.', ahorro: 'Sube el abono extra para ver cuándo terminarías.' };
    }
    return {
      tiempo: extra > 0
        ? 'Con este abono la deuda nunca se termina: lo que pagas no cubre los intereses.'
        : 'Pagando solo los mínimos la deuda nunca se termina: no alcanzan a cubrir los intereses.',
      ahorro: 'Sube el abono extra para ver cuándo terminarías.'
    };
  }

  const con = simulacion.conExtra;
  const cuando = `${textoDuracion(con.meses)}, en ${nombreDelPeriodo(con.periodoLibre)}`;

  if (extra === 0) {
    return {
      tiempo: `Pagando solo los mínimos terminas en ${cuando}, y pagas ${formatearPesos(con.totalIntereses)} en intereses.`,
      ahorro: 'Mueve la barra para ver cuánto te ahorras con un abono extra.'
    };
  }

  const tiempo = `Con ${formatearPesos(extra)} extra al mes terminas en ${cuando}.`;
  if (simulacion.mesesAhorrados === null) {
    return { tiempo, ahorro: 'Pagando solo los mínimos nunca terminarías: este abono es lo que hace que la deuda se acabe.' };
  }
  const intereses = `${formatearPesos(simulacion.interesesAhorrados)} menos en intereses`;
  return {
    tiempo,
    ahorro: simulacion.mesesAhorrados > 0
      ? `Son ${textoDuracion(simulacion.mesesAhorrados)} antes y ${intereses} que pagando solo los mínimos.`
      : `Terminas el mismo mes, pero pagas ${intereses} que pagando solo los mínimos.`
  };
}

function conectarAbonoExtra() {
  // Una sola vez: renderizar() corre en cada cambio y antes registraba otro
  // listener cada vez que pintaba.
  porId('abono-extra').addEventListener('input', function () {
    estado.abonoExtra = Number(porId('abono-extra').value);
    renderizarSimulacion();
  });
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
  // Una deuda pagada ya no se puede abonar: solo quedan las que tienen saldo.
  const activas = separarDeudasPorEstado(estado.deudas).activas;

  select.replaceChildren(select.options[0]);
  activas.forEach(function (deuda) {
    const opcion = document.createElement('option');
    opcion.value = deuda.id;
    opcion.textContent = `${deuda.nombre} · ${formatearPesos(deuda.saldo)}`;
    select.appendChild(opcion);
  });

  const sigueActiva = activas.some(function (deuda) {
    return String(deuda.id) === String(valorPrevio);
  });
  select.value = sigueActiva ? valorPrevio : '';
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

    const resultado = validarAbono(entrada, separarDeudasPorEstado(estado.deudas).activas);

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

    const deudaId = resultado.datos.deudaId;
    const antes = estado.deudas.find(function (deuda) {
      return String(deuda.id) === String(deudaId);
    });
    const saldoAnterior = antes ? antes.saldo : 0;

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

      // EN-97: si este abono termino de pagar la deuda, se celebra
      const despues = estado.deudas.find(function (deuda) {
        return String(deuda.id) === String(deudaId);
      });
      if (saldoAnterior > 0 && despues && despues.saldo <= 0) {
        const avance = calcularAvanceDeudas([despues], estado.abonos).porDeuda[0];
        const intereses = calcularInteresesEvitados(
          Object.assign({}, despues, { saldoInicial: avance.saldoInicial }),
          periodo
        );
        mostrarLogro(avance, intereses);
      }
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
      ocultar(porId('logro-abono'));
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
// Avance (EN-95) y logros (EN-97)
// ----

function crearCelda(etiqueta, texto, titulo, clase) {
  const celda = document.createElement(etiqueta);
  celda.textContent = texto;
  if (titulo) {
    celda.dataset.titulo = titulo;
  }
  if (clase) {
    celda.className = clase;
  }
  return celda;
}

function renderizarAvance() {
  const avance = calcularAvanceDeudas(estado.deudas, estado.abonos);

  porId('avance-abonado').textContent = formatearPesos(avance.totalAbonado);
  porId('avance-inicial').textContent = formatearPesos(avance.saldoInicialTotal);
  porId('avance-saldo').textContent = formatearPesos(avance.saldoTotal);
  porId('avance-porcentaje').textContent = formatearPorcentaje(avance.porcentajeTotal);

  const barra = porId('avance-barra');
  barra.setAttribute('aria-valuenow', String(Math.round(avance.porcentajeTotal)));
  barra.setAttribute('aria-valuetext', formatearPorcentaje(avance.porcentajeTotal));
  porId('avance-relleno').style.width = `${avance.porcentajeTotal}%`;

  const lista = porId('lista-avance');
  lista.replaceChildren.apply(lista, avance.porDeuda.map(crearItemAvance));
  porId('vacio-avance').classList.toggle('hidden', avance.porDeuda.length > 0);
}

// Una fila por deuda: nombre, cuanto se ha abonado de su saldo inicial y su
// propia barra. La pagada lleva el chip y la barra llena.
function crearItemAvance(item) {
  const fila = document.createElement('li');
  fila.className = item.pagada ? 'avance-item avance-item-pagada' : 'avance-item';

  const encabezado = document.createElement('div');
  encabezado.className = 'avance-item-encabezado';

  const nombre = document.createElement('span');
  nombre.className = 'avance-item-nombre';
  nombre.textContent = item.nombre;
  if (item.pagada) {
    const chip = document.createElement('span');
    chip.className = 'chip-pagada';
    chip.textContent = 'Pagada';
    nombre.append(' ', chip);
  }

  const cifra = document.createElement('span');
  cifra.className = 'avance-item-cifra';
  cifra.textContent =
    `${formatearPorcentaje(item.porcentaje)} · ${formatearPesos(item.abonado)} de ${formatearPesos(item.saldoInicial)}`;

  encabezado.append(nombre, cifra);

  const barra = document.createElement('div');
  barra.className = 'barra';
  barra.setAttribute('role', 'progressbar');
  barra.setAttribute('aria-label', `Avance de ${item.nombre}`);
  barra.setAttribute('aria-valuemin', '0');
  barra.setAttribute('aria-valuemax', '100');
  barra.setAttribute('aria-valuenow', String(Math.round(item.porcentaje)));

  const relleno = document.createElement('span');
  relleno.className = 'barra-relleno';
  relleno.style.width = `${item.porcentaje}%`;
  barra.appendChild(relleno);

  fila.append(encabezado, barra);
  return fila;
}

// Historial de deudas pagadas: no se borran, quedan con su saldo inicial, lo
// abonado y los intereses que se evitaron.
function renderizarLogros() {
  const pagadas = separarDeudasPorEstado(estado.deudas).pagadas;
  const avance = calcularAvanceDeudas(pagadas, estado.abonos);

  const filas = porId('lista-logros');
  filas.replaceChildren.apply(filas, avance.porDeuda.map(function (item) {
    const deuda = pagadas.find(function (d) { return String(d.id) === String(item.id); });
    const intereses = calcularInteresesEvitados(
      Object.assign({}, deuda, { saldoInicial: item.saldoInicial }),
      periodo
    );

    const fila = document.createElement('tr');
    const nombre = crearCelda('th', item.nombre, null, 'celda-deuda');
    nombre.scope = 'row';
    fila.append(
      nombre,
      crearCelda('td', formatearPesos(item.saldoInicial), 'Saldo inicial', 'celda-monto'),
      crearCelda('td', formatearPesos(item.abonado), 'Abonado', 'celda-monto'),
      crearCelda('td', intereses === null ? '—' : formatearPesos(intereses), 'Intereses evitados',
        'celda-monto celda-interes')
    );
    return fila;
  }));

  porId('tabla-logros').classList.toggle('hidden', avance.porDeuda.length === 0);
  porId('vacio-logros').classList.toggle('hidden', avance.porDeuda.length > 0);
}

function mostrarLogro(avance, intereses) {
  porId('logro-titulo').textContent = `¡Deuda pagada: ${avance.nombre}!`;
  porId('logro-detalle').textContent = intereses === null
    ? `Abonaste ${formatearPesos(avance.abonado)} y ya no debes nada. Evitaste los intereses de seguir debiendo.`
    : `Abonaste ${formatearPesos(avance.abonado)} y ya no debes nada. Si hubieras pagado solo el mínimo, habrías pagado ${formatearPesos(intereses)} en intereses: te los ahorraste.`;
  porId('logro-abono').classList.remove('hidden');
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
  conectarAbonoExtra();
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
