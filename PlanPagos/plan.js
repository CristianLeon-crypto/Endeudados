// Pantalla de Plan de pagos (EN-88).
//
// Dice cuanto abonarle a cada deuda ESTE MES con lo que queda despues de los
// gastos esenciales. Es un plan de un solo mes: no simula los siguientes.
//
// Este archivo solo maneja la pantalla: carga con datos.js, calcula con
// calcularPlanPagos() de calculos.js y pinta. Aca no se suma ni se reparte
// ningun peso.

const periodo = periodoDeFecha(new Date());

// Unica fuente de verdad de la pantalla. Todo lo que se ve se calcula a partir
// de aca en renderizar().
const estado = {
  cargado: false,
  usuario: null,
  ingresos: [],
  gastos: [],
  deudas: []
};

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
  'sin-deudas': function () {
    return 'No tienes deudas registradas. Cuando las agregues, aquí verás cuánto abonarle a cada una este mes.';
  },
  insuficiente: function (plan) {
    const sinIngresos = plan.totalIngresos === 0 ? ' Aún no registras ingresos este mes.' : '';
    return `Tu capacidad de pago no alcanza para los pagos mínimos de tus deudas: te faltan ${formatearPesos(plan.faltante)}.` +
      `${sinIngresos} Por eso no te mostramos un plan de abonos; primero hay que cubrir los mínimos.`;
  },
  plan: function (plan) {
    if (plan.excedente === 0) {
      return 'Tu capacidad cubre justo los pagos mínimos. Este mes no queda excedente para abonar de más.';
    }
    return `Después de los mínimos te quedan ${formatearPesos(plan.excedente)}. Todo va a "${plan.prioridad.nombre}", la deuda con la tasa más alta.`;
  }
};

// Por que esa deuda recibe ese monto. La prioridad es la primera en el orden
// avalancha: mayor tasa y, si empata, menor saldo.
function razonDelPago(item, plan) {
  const deuda = item.deuda;
  const prioridad = plan.prioridad;

  if (item.esPrioridad) {
    if (plan.excedente === 0) {
      return `Tiene la tasa más alta (${formatearTasa(deuda.tasaEA)}), pero este mes no queda excedente: solo su pago mínimo.`;
    }
    return `Tiene la tasa más alta (${formatearTasa(deuda.tasaEA)}): recibe su mínimo de ${formatearPesos(deuda.pagoMinimo)} más todo el excedente de ${formatearPesos(plan.excedente)}.`;
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

  // El CSS usa data-estado para los colores de alerta
  porId('panel-plan').dataset.estado = estadoPlan;

  renderizarResumen(plan, estadoPlan);
  porId('mensaje-plan').textContent = MENSAJES_PLAN[estadoPlan](plan);
  renderizarPagos(estadoPlan === 'plan' ? plan.pagos : [], plan);
}

function renderizarResumen(plan, estadoPlan) {
  porId('plan-capacidad').textContent = formatearPesos(plan.capacidad);
  porId('plan-capacidad-detalle').textContent =
    `Ingresos ${formatearPesos(plan.totalIngresos)} menos gastos esenciales ${formatearPesos(plan.totalGastos)}`;

  porId('plan-minimos').textContent = formatearPesos(plan.pagoMinimoTotal);
  porId('plan-minimos-detalle').textContent = textoCantidad(estado.deudas.length, 'deuda', 'deudas');

  // Si no alcanza, la tercera cifra deja de ser el excedente y pasa a ser lo
  // que falta para cubrir los minimos.
  if (estadoPlan === 'insuficiente') {
    porId('plan-excedente-etiqueta').textContent = 'Te faltan';
    porId('plan-excedente').textContent = formatearPesos(plan.faltante);
    porId('plan-excedente-detalle').textContent = 'Para cubrir los pagos mínimos';
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
