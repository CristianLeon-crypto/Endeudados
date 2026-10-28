// Pantalla de Plan de pagos (EN-88).
//
// Dice cuanto abonarle a cada deuda ESTE MES con lo que queda despues de los
// gastos esenciales. Debajo, repitiendo ese plan cada mes, la fecha estimada
// para quedar libre de deudas (EN-77) y el cronograma hasta llegar ahi (EN-89).
//
// Este archivo solo maneja la pantalla: carga con datos.js, calcula con
// calcularPlanPagos(), simularLibreDeDeudas() y resumirCronograma() de
// calculos.js y pinta. Aca no se suma ni se reparte
// ningun peso.

const periodo = periodoDeFecha(new Date());

// Unica fuente de verdad de la pantalla. Todo lo que se ve se calcula a partir
// de aca en renderizar().
const estado = {
  cargado: false,
  usuario: null,
  ingresos: [],
  gastos: [],
  deudas: [],
  // Cronograma (EN-89): que vista se ve y si el mes a mes muestra todos los meses
  vistaCronograma: 'resumido',
  cronogramaCompleto: false
};

// El mes a mes puede tener cientos de meses: de entrada solo el primer anio
const MESES_VISIBLES_CRONOGRAMA = 12;

function porId(id) {
  return document.getElementById(id);
}

function mostrar(elemento, mensaje) {
  elemento.textContent = mensaje;
  elemento.classList.remove('hidden');
}

function textoCantidad(cantidad, singular, plural) {
  if (cantidad === 0) {
    return 'Sin deudas';
  }
  return `${cantidad} ${cantidad === 1 ? singular : plural}`;
}

const MENSAJES_PLAN = {
  cargando: function () {
    return 'Calculando tu plan…';
  },
  // Sin deudas igual se dice cuanta plata queda libre, o que no queda nada
  'sin-deudas': function (plan) {
    if (plan.faltante > 0) {
      return `Tus gastos esenciales superan tus ingresos en ${formatearPesos(plan.faltante)}: este mes no te queda plata libre para deudas.`;
    }
    return `No tienes deudas registradas. Este mes te quedan ${formatearPesos(plan.excedente)} libres; cuando agregues tus deudas, aquí verás cuánto abonarle a cada una.`;
  },
  insuficiente: function (plan) {
    let causa = '';
    if (plan.totalIngresos === 0) {
      causa = ' Aún no registras ingresos este mes.';
    } else if (plan.capacidad < 0) {
      causa = ' Tus gastos esenciales ya superan tus ingresos.';
    }
    return `Tu capacidad de pago no alcanza para los pagos mínimos de tus deudas: te faltan ${formatearPesos(plan.faltante)}.` +
      `${causa} Por eso no te mostramos un plan de abonos; primero hay que cubrir los mínimos.`;
  },
  plan: function (plan) {
    if (plan.excedente === 0) {
      return 'Tu capacidad cubre justo los pagos mínimos. Este mes no queda excedente para abonar de más.';
    }
    // Con dinero de sobra despues de saldar todo, decirlo en vez de sugerir
    // abonos que superarian el saldo de las deudas (EN-101).
    if (plan.sobrante > 0) {
      return `Después de los mínimos te quedan ${formatearPesos(plan.excedente)}, y con eso saldas todas tus deudas este mes. Te sobran ${formatearPesos(plan.sobrante)}.`;
    }
    const recibenExtra = plan.pagos.filter(function (item) { return item.extra > 0; }).length;
    if (recibenExtra === 1) {
      return `Después de los mínimos te quedan ${formatearPesos(plan.excedente)}. Todo va a "${plan.prioridad.nombre}", la deuda con la tasa más alta.`;
    }
    return `Después de los mínimos te quedan ${formatearPesos(plan.excedente)}. Se reparten empezando por "${plan.prioridad.nombre}", la deuda con la tasa más alta; lo que sobra después de saldarla pasa a la siguiente.`;
  }
};

// Por que esa deuda recibe ese monto. La prioridad es la primera en el orden
// avalancha: mayor tasa y, si empata, menor saldo.
function razonDelPago(item, plan) {
  const deuda = item.deuda;
  const prioridad = plan.prioridad;

  // Queda saldada este mes: el pago es todo lo que se debia
  if (item.pago >= deuda.saldo) {
    if (item.esPrioridad) {
      return `Tiene la tasa más alta (${formatearTasa(deuda.tasaEA)}) y este mes la saldas completa: ${formatearPesos(deuda.saldo)}.`;
    }
    return `Con lo que sobró después de las deudas de mayor tasa, este mes la saldas completa: ${formatearPesos(deuda.saldo)}.`;
  }

  if (item.esPrioridad) {
    if (item.extra === 0) {
      return `Tiene la tasa más alta (${formatearTasa(deuda.tasaEA)}), pero este mes no queda excedente: solo su pago mínimo.`;
    }
    return `Tiene la tasa más alta (${formatearTasa(deuda.tasaEA)}): recibe su mínimo de ${formatearPesos(item.minimo)} más ${formatearPesos(item.extra)} del excedente.`;
  }

  // Recibe algo del excedente porque las de mayor tasa ya quedaron saldadas
  if (item.extra > 0) {
    return `Recibe su mínimo de ${formatearPesos(item.minimo)} más ${formatearPesos(item.extra)}, que sobraron después de saldar las deudas de mayor tasa.`;
  }

  if (deuda.tasaEA === prioridad.tasaEA) {
    return `Solo el pago mínimo: tiene la misma tasa que "${prioridad.nombre}", que va primero por tener menor saldo.`;
  }
  return `Solo el pago mínimo: su tasa (${formatearTasa(deuda.tasaEA)}) es menor que la de "${prioridad.nombre}".`;
}

// ---------------------------------------------------------------------------
// Pintar
// ---------------------------------------------------------------------------

function renderizar() {
  const plan = calcularPlanPagos(estado.ingresos, estado.gastos, estado.deudas);
  const estadoPlan = estado.cargado ? plan.estado : 'cargando';

  // El CSS usa data-deficit para los colores de alerta. Hay deficit cuando no
  // alcanza para los minimos o, sin deudas, cuando los gastos superan los
  // ingresos.
  const hayDeficit = estado.cargado && plan.faltante > 0;
  porId('panel-plan').dataset.estado = estadoPlan;
  porId('panel-plan').dataset.deficit = hayDeficit ? 'si' : 'no';

  renderizarResumen(plan, hayDeficit);
  porId('mensaje-plan').textContent = MENSAJES_PLAN[estadoPlan](plan);
  renderizarPagos(estadoPlan === 'plan' ? plan.pagos : [], plan);

  // Sin datos no se simula: la tarjeta y el cronograma quedan ocultos
  const simulacion = estado.cargado
    ? simularLibreDeDeudas(estado.ingresos, estado.gastos, estado.deudas, periodo)
    : null;
  renderizarLibre(simulacion);
  renderizarCronograma(simulacion);
}

// Textos de la tarjeta "cuando quedo libre" (EN-77), uno por estado de
// simularLibreDeDeudas(). Sin deudas la tarjeta no se muestra.
const MENSAJES_LIBRE = {
  libre: function (simulacion) {
    if (simulacion.meses === 1) {
      return {
        titulo: 'Estimado: quedas libre de deudas este mes',
        detalle: 'Con el plan de este mes saldas todas tus deudas, sin pagar más intereses.'
      };
    }
    return {
      titulo: `Estimado: quedas libre de deudas en ${nombreDelPeriodo(simulacion.periodoLibre)}`,
      detalle: `En ${simulacion.meses} meses siguiendo este plan. En ese tiempo pagarías ${formatearPesos(simulacion.totalIntereses)} en intereses.`
    };
  },
  'no-termina': function (simulacion) {
    if (simulacion.motivo === 'plazo') {
      return {
        titulo: 'Con tus pagos actuales no terminas de pagar en los próximos 50 años',
        detalle: 'Tu pago cubre los intereses, pero el saldo baja tan despacio que el plan no es realista. Abonar un poco más cada mes acorta mucho el plazo.'
      };
    }
    const primerMes = simulacion.cronograma[0];
    return {
      titulo: 'Con tus pagos actuales, tu deuda no se termina',
      detalle: `Este mes abonas ${formatearPesos(primerMes.pagado)}, pero lo que sigues debiendo genera ${formatearPesos(primerMes.interes)} de intereses: el saldo no baja.`
    };
  },
  insuficiente: function () {
    return {
      titulo: 'No podemos estimar una fecha',
      detalle: 'Tu capacidad de pago no cubre los pagos mínimos de tus deudas. Primero hay que cubrir los mínimos.'
    };
  }
};

function renderizarLibre(simulacion) {
  const tarjeta = porId('tarjeta-libre');
  if (!simulacion) {
    tarjeta.classList.add('hidden');
    return;
  }

  const mensajes = MENSAJES_LIBRE[simulacion.estado];
  if (!mensajes) {
    tarjeta.classList.add('hidden');
    return;
  }

  const textos = mensajes(simulacion);
  porId('libre-titulo').textContent = textos.titulo;
  porId('libre-detalle').textContent = textos.detalle;
  // La nota habla de "seguir este plan": sin plan (no cubre los minimos) no aplica
  porId('libre-supuesto').classList.toggle('hidden', simulacion.estado === 'insuficiente');
  tarjeta.dataset.alerta = simulacion.estado === 'libre' ? 'no' : 'si';
  tarjeta.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Cronograma (EN-89)
// ---------------------------------------------------------------------------

// Solo con fecha estimada. Si el interes se come el pago, si no cubre los
// minimos o si tardaria mas de 50 anios no hay camino que mostrar: la tarjeta
// de EN-77 ya explica por que.
function renderizarCronograma(simulacion) {
  const bloque = porId('bloque-cronograma');
  if (!simulacion || simulacion.estado !== 'libre') {
    bloque.classList.add('hidden');
    return;
  }

  const resumen = resumirCronograma(simulacion);
  const capital = resumen.totalPagado - resumen.totalIntereses;
  porId('cronograma-total').textContent = resumen.totalIntereses === 0
    ? `En total abonas ${formatearPesos(resumen.totalPagado)}, sin pagar intereses.`
    : `En total abonas ${formatearPesos(resumen.totalPagado)}: ${formatearPesos(capital)} a lo que debes hoy y ${formatearPesos(resumen.totalIntereses)} en intereses.`;

  renderizarResumido(resumen, simulacion);
  renderizarMesAMes(simulacion);

  const esResumido = estado.vistaCronograma === 'resumido';
  porId('vista-resumido').classList.toggle('hidden', !esResumido);
  porId('vista-mes').classList.toggle('hidden', esResumido);
  document.querySelectorAll('.cronograma-vista').forEach(function (boton) {
    boton.setAttribute('aria-pressed', String(boton.dataset.vista === estado.vistaCronograma));
  });

  bloque.classList.remove('hidden');
}

// 'noviembre de 2026 · mes 3'
function textoMesSaldada(periodoSaldada, meses) {
  return `${nombreDelPeriodo(periodoSaldada)} · mes ${meses}`;
}

// Los nombres de las deudas los escribio el usuario: todo entra con
// textContent, nunca con innerHTML. data-titulo es la etiqueta en celular.
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

function renderizarResumido(resumen, simulacion) {
  const cuerpo = porId('cuerpo-resumido');
  cuerpo.replaceChildren.apply(cuerpo, resumen.deudas.map(function (deuda) {
    const fila = document.createElement('tr');
    const nombre = crearCelda('th', deuda.nombre, null, 'celda-deuda');
    nombre.scope = 'row';
    fila.append(
      nombre,
      crearCelda('td', textoMesSaldada(deuda.periodoSaldada, deuda.meses), 'Se termina de pagar'),
      crearCelda('td', formatearPesos(deuda.totalPagado), 'Total abonado', 'celda-monto'),
      crearCelda('td', formatearPesos(deuda.totalIntereses), 'Intereses', 'celda-monto celda-interes')
    );
    return fila;
  }));

  porId('resumido-total-mes').textContent = textoMesSaldada(simulacion.periodoLibre, simulacion.meses);
  porId('resumido-total-pagado').textContent = formatearPesos(resumen.totalPagado);
  porId('resumido-total-intereses').textContent = formatearPesos(resumen.totalIntereses);
}

function renderizarMesAMes(simulacion) {
  const tabla = porId('tabla-mes-a-mes');
  const total = simulacion.cronograma.length;
  const visibles = estado.cronogramaCompleto ? total : Math.min(total, MESES_VISIBLES_CRONOGRAMA);

  tabla.querySelectorAll('tbody').forEach(function (cuerpo) { cuerpo.remove(); });
  simulacion.cronograma.slice(0, visibles).forEach(function (mes) {
    tabla.append(crearCuerpoMes(mes));
  });

  const verTodo = porId('cronograma-ver-todo');
  verTodo.classList.toggle('hidden', total <= MESES_VISIBLES_CRONOGRAMA);
  verTodo.textContent = estado.cronogramaCompleto
    ? `Ver solo los primeros ${MESES_VISIBLES_CRONOGRAMA} meses`
    : `Ver los ${total} meses`;
}

// Un tbody por mes: la fila del mes con los totales y una fila por deuda. Solo
// salen las deudas que siguen vigentes ese mes; la que llega a cero se marca.
function crearCuerpoMes(mes) {
  const cuerpo = document.createElement('tbody');

  const filaMes = document.createElement('tr');
  filaMes.className = 'fila-mes';
  const nombreMes = crearCelda('th', nombreDelPeriodo(mes.periodo));
  nombreMes.scope = 'rowgroup';
  filaMes.append(
    nombreMes,
    crearCelda('td', formatearPesos(mes.pagado), 'Abono', 'celda-monto'),
    crearCelda('td', formatearPesos(mes.interes), 'Intereses', 'celda-monto celda-interes'),
    crearCelda('td', formatearPesos(mes.saldo), 'Saldo al cierre', 'celda-monto')
  );
  cuerpo.append(filaMes);

  mes.deudas.forEach(function (deuda) {
    const fila = document.createElement('tr');
    const nombre = crearCelda('th', deuda.nombre, null, 'celda-deuda');
    nombre.scope = 'row';
    if (deuda.saldo === 0) {
      fila.classList.add('fila-saldada');
      const chip = document.createElement('span');
      chip.className = 'chip-saldada';
      chip.textContent = 'Saldada';
      nombre.append(' ', chip);
    }
    fila.append(
      nombre,
      crearCelda('td', formatearPesos(deuda.pago), 'Abono', 'celda-monto'),
      crearCelda('td', formatearPesos(deuda.interes), 'Intereses', 'celda-monto celda-interes'),
      crearCelda('td', formatearPesos(deuda.saldo), 'Saldo al cierre', 'celda-monto')
    );
    cuerpo.append(fila);
  });

  return cuerpo;
}

function conectarCronograma() {
  document.querySelectorAll('.cronograma-vista').forEach(function (boton) {
    boton.addEventListener('click', function () {
      estado.vistaCronograma = boton.dataset.vista;
      renderizar();
    });
  });
  porId('cronograma-ver-todo').addEventListener('click', function () {
    estado.cronogramaCompleto = !estado.cronogramaCompleto;
    renderizar();
  });
}

function renderizarResumen(plan, hayDeficit) {
  porId('plan-capacidad').textContent = formatearPesos(plan.capacidad);
  porId('plan-capacidad-detalle').textContent =
    `Ingresos ${formatearPesos(plan.totalIngresos)} menos gastos esenciales ${formatearPesos(plan.totalGastos)}`;

  porId('plan-minimos').textContent = formatearPesos(plan.pagoMinimoTotal);
  porId('plan-minimos-detalle').textContent = textoCantidad(estado.deudas.length, 'deuda', 'deudas');

  // Con excedente negativo la tercera cifra deja de ser el excedente y pasa a
  // ser lo que falta, diciendo para cubrir que.
  if (hayDeficit) {
    let detalle = 'Para cubrir los pagos mínimos';
    if (plan.pagoMinimoTotal === 0) {
      detalle = 'Para cubrir tus gastos esenciales';
    } else if (plan.capacidad < 0) {
      detalle = 'Para cubrir gastos esenciales y pagos mínimos';
    }
    porId('plan-excedente-etiqueta').textContent = 'Te faltan';
    porId('plan-excedente').textContent = formatearPesos(plan.faltante);
    porId('plan-excedente-detalle').textContent = detalle;
  } else {
    porId('plan-excedente-etiqueta').textContent = 'Excedente';
    porId('plan-excedente').textContent = formatearPesos(plan.excedente);
    porId('plan-excedente-detalle').textContent = 'Capacidad menos pagos mínimos';
  }
}

function renderizarPagos(pagos, plan) {
  const lista = porId('lista-pagos');
  lista.replaceChildren.apply(lista, pagos.map(function (item) {
    return crearFilaPago(item, plan);
  }));
  porId('bloque-pagos').classList.toggle('hidden', pagos.length === 0);
}

// El nombre de la deuda lo escribio el usuario: entra con textContent, nunca
// con innerHTML.
function crearFilaPago(item, plan) {
  const fila = porId('plantilla-pago').content.firstElementChild.cloneNode(true);
  const deuda = item.deuda;

  fila.querySelector('.pago-nombre').textContent = deuda.nombre;
  fila.querySelector('.pago-meta').textContent =
    `${formatearTasa(deuda.tasaEA)} · mínimo ${formatearPesos(deuda.pagoMinimo)}`;
  fila.querySelector('.pago-monto').textContent = formatearPesos(item.pago);
  fila.querySelector('.pago-razon').textContent = razonDelPago(item, plan);

  if (item.esPrioridad) {
    fila.classList.add('pago-prioridad');
  } else {
    fila.querySelector('.chip-prioridad').remove();
  }

  return fila;
}

function mostrarUsuario(usuario) {
  porId('usuario-nombre').textContent = usuario.nombre;
  porId('usuario-actual').classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------------

// Guardia de sesion: sin sesion se redirige al login. Si la consulta falla no
// se redirige: se muestra el error, para no dejar al usuario rebotando entre
// pantallas.
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
  const [ingresos, gastos, deudas] = await Promise.all([
    obtenerIngresos(periodo),
    obtenerGastos(periodo),
    obtenerDeudas()
  ]);

  estado.ingresos = ingresos;
  estado.gastos = gastos;
  estado.deudas = deudas;
  estado.cargado = true;
}

async function iniciar() {
  porId('periodo-nombre').textContent = nombreDelPeriodo(periodo);
  conectarCronograma();

  // Mientras llegan los datos se muestra todo en cero y ningun plan
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
    porId('mensaje-plan').textContent = 'No pudimos calcular tu plan.';
    console.error(error);
  }
}

iniciar();
