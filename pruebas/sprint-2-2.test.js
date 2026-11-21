// Pruebas automatizadas del Sprint 2-2 (EN Sprint 2, 18 al 30 de septiembre).
//
// Meta del sprint: el usuario recibe un plan de pago calculado con su plata
// real, cuanto abonarle a cada deuda este mes y por que.
//
// Historias cubiertas:
//   EN-41  cerrar sesion
//   EN-42  recargar la pagina sin perder la sesion
//   EN-48  registrar abonos a una deuda
//   EN-49  entender por que pagar primero una deuda (avalancha)
//   EN-88  cuanto pagarle a cada deuda este mes
//   EN-91  cuanta plata queda libre para deudas
//   EN-101 el plan no sugiere abonar mas de lo que se debe
//
// pruebas/calculos.test.js ya tiene 6 pruebas del plan del mes (EN-88 y
// EN-101); las de aca completan lo que esas no miran.
// Se corren con el resto:  node --test

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  crearSupabaseFalso, paso, crearUbicacionFalsa, crearFechaFija, cargarScript, plano
} = require('./apoyo/entorno');

const HOY = '2026-09-25T10:00:00';
const SESION = { data: { session: { user: { id: 'auth-123', email: 'ana@correo.co' } } }, error: null };
const SIN_SESION = { data: { session: null }, error: null };
const PERFIL = { id: 7, nombre: 'Ana', email: 'ana@correo.co' };

function calculos() {
  return cargarScript('IngresosGastos/calculos.js', {});
}

function capaDeDatos(opciones) {
  const config = opciones || {};
  const sb = crearSupabaseFalso({
    auth: Object.assign({ getSession: SESION }, config.auth),
    responder: function (consulta) {
      if (consulta.tabla === 'usuarios') {
        return { data: PERFIL, error: null };
      }
      const respuesta = (config.filas || {})[consulta.tabla];
      if (typeof respuesta === 'function') {
        return respuesta(consulta);
      }
      return respuesta || { data: [], error: null };
    }
  });
  const app = cargarScript(
    ['IngresosGastos/calculos.js', 'IngresosGastos/datos.js'],
    { sbClient: sb.cliente, Date: crearFechaFija(HOY) }
  );
  return { app, sb };
}

function consultasA(sb, tabla) {
  return sb.consultas.filter(function (c) { return c.tabla === tabla; });
}

function mes(ingresos, gastos) {
  return {
    ingresos: ingresos.map(function (monto) { return { concepto: 'Ingreso', monto }; }),
    gastos: gastos.map(function (monto) { return { concepto: 'Gasto', monto }; })
  };
}

function deuda(nombre, saldo, tasaEA, pagoMinimo) {
  return { id: nombre, nombre, saldo, tasaEA, pagoMinimo };
}

function pagosPorNombre(pagos) {
  return pagos.map(function (item) {
    return { nombre: item.deuda.nombre, minimo: item.minimo, extra: item.extra, pago: item.pago, esPrioridad: item.esPrioridad };
  });
}

// ===========================================================================
// EN-41  Cerrar sesion
// ===========================================================================

test('EN-41: cerrar sesion llama a Supabase y olvida al usuario en memoria', async function () {
  // Despues del signOut, getSession ya no devuelve sesion
  let sesionActiva = true;
  const { app, sb } = capaDeDatos({
    auth: {
      getSession: function () { return sesionActiva ? SESION : SIN_SESION; },
      signOut: function () { sesionActiva = false; return { error: null }; }
    }
  });

  assert.equal((await app.getUsuarioActual()).id, 7);
  await app.cerrarSesion();

  // Sin limpiar el cache seguiria devolviendo a Ana
  assert.equal(await app.getUsuarioActual(), null);
  assert.deepEqual(sb.llamadasAuth.map(function (l) { return l.metodo; }), ['getSession', 'signOut', 'getSession']);
});

test('EN-41: si el cierre falla el error llega a la pantalla y la sesion sigue', async function () {
  const { app } = capaDeDatos({
    auth: { signOut: { error: new Error('network error') } }
  });

  await app.getUsuarioActual();
  await assert.rejects(app.cerrarSesion(), /network error/);
  assert.equal((await app.getUsuarioActual()).id, 7);
});

// ===========================================================================
// EN-42  Recargar la pagina sin perder la sesion
// ===========================================================================

test('EN-42: el cliente de Supabase guarda la sesion y renueva el token', function () {
  let opciones = null;
  let url = null;
  const app = cargarScript('shared/supabase.js', {
    window: { location: crearUbicacionFalsa() },
    supabase: {
      createClient: function (u, key, o) { url = u; opciones = o; return {}; }
    }
  });

  assert.equal(url, 'https://nuuqonentwzzhptkjjyh.supabase.co');
  assert.deepEqual(plano(opciones), { auth: { persistSession: true, autoRefreshToken: true } });
  // El correo de recuperacion vuelve al sitio donde esta el usuario
  assert.equal(app.urlRecuperacion(), 'https://endeudados.test/RecuperarPassword/recPass.html');
});

test('EN-42: al recargar, el usuario sale de la sesion guardada sin volver a iniciar sesion', async function () {
  // Una pagina recargada es un contexto nuevo: la memoria se pierde y solo
  // queda la sesion que el SDK guardo en el navegador.
  const primeraCarga = capaDeDatos();
  const recarga = capaDeDatos();

  assert.equal((await primeraCarga.app.getUsuarioActual()).id, 7);
  assert.equal((await recarga.app.getUsuarioActual()).id, 7);
  assert.deepEqual(recarga.sb.llamadasAuth.map(function (l) { return l.metodo; }), ['getSession']);
});

// ===========================================================================
// EN-48  Registrar abonos a una deuda
// ===========================================================================

const DEUDAS = [{ id: 4, nombre: 'Tarjeta' }, { id: 9, nombre: 'Celular' }];

test('EN-48: el abono necesita una deuda que exista y un monto valido', function () {
  const app = calculos();

  assert.equal(app.validarAbono({ deudaId: '', monto: '50.000' }, DEUDAS).errores.deudaId, 'Selecciona una deuda.');
  assert.equal(app.validarAbono({ deudaId: '99', monto: '50.000' }, DEUDAS).errores.deudaId, 'Selecciona una deuda.');
  assert.equal(app.validarAbono({ deudaId: '4', monto: '0' }, DEUDAS).errores.monto, 'El monto debe ser mayor que cero.');
  assert.equal(app.validarAbono({ deudaId: '4', monto: '50,5' }, DEUDAS).valido, false);
});

test('EN-48: el id del select llega como texto y aun asi encuentra la deuda', function () {
  const app = calculos();
  const r = app.validarAbono({ deudaId: '4', monto: '50.000' }, DEUDAS);

  assert.equal(r.valido, true);
  assert.deepEqual(plano(r.datos), { deudaId: '4', monto: 50000 });
});

test('EN-48: el abono se guarda con la deuda, el usuario y la fecha de hoy', async function () {
  const { app, sb } = capaDeDatos({
    filas: { abonos: { data: { id: 21, deuda_id: 4, monto: '50000', fecha: '2026-09-25' }, error: null } }
  });

  const abono = await app.agregarAbono({ deudaId: 4, monto: 50000 });

  const [insert] = consultasA(sb, 'abonos');
  assert.deepEqual(plano(paso(insert, 'insert')[0]), { deuda_id: 4, usuario_id: 7, monto: 50000, fecha: '2026-09-25' });
  assert.deepEqual(plano(abono), { id: 21, deudaId: 4, monto: 50000, fecha: '2026-09-25' });
});

test('EN-48: lista los abonos de una deuda o todos, y borra por id', async function () {
  const { app, sb } = capaDeDatos({
    filas: { abonos: { data: [{ id: 21, deuda_id: 4, monto: '50000', fecha: '2026-09-25' }], error: null } }
  });

  const deUna = await app.obtenerAbonos(4);
  await app.obtenerAbonos();
  await app.eliminarAbono(21);

  const [filtrada, todas, borrado] = consultasA(sb, 'abonos');
  assert.deepEqual(paso(filtrada, 'eq'), ['deuda_id', 4]);
  assert.equal(paso(todas, 'eq'), undefined);
  assert.ok(paso(borrado, 'delete'));
  assert.deepEqual(paso(borrado, 'eq'), ['id', 21]);
  assert.deepEqual(plano(deUna), [{ id: 21, deudaId: 4, monto: 50000, fecha: '2026-09-25' }]);
});

test('EN-48: si la base rechaza el abono el error llega a la pantalla', async function () {
  const { app } = capaDeDatos({
    filas: { abonos: { data: null, error: new Error('violates foreign key constraint') } }
  });

  await assert.rejects(app.agregarAbono({ deudaId: 99, monto: 1000 }), /foreign key/);
});

// ===========================================================================
// EN-49  Entender por que pagar primero una deuda (avalancha)
// ===========================================================================

test('EN-49: la prioridad es la deuda de mayor tasa; con empate, la de menor saldo', function () {
  const app = calculos();
  const deudas = [
    deuda('Libre inversion', 5000000, 20, 100000),
    deuda('Tarjeta grande', 3000000, 40, 100000),
    deuda('Tarjeta chica', 800000, 40, 50000)
  ];

  const ordenadas = app.ordenarPorAvalancha(deudas);

  assert.deepEqual(plano(ordenadas).map(function (d) { return d.nombre; }), ['Tarjeta chica', 'Tarjeta grande', 'Libre inversion']);
  // No reordena la lista que tiene la pantalla
  assert.equal(deudas[0].nombre, 'Libre inversion');
});

test('EN-49: la tasa mensual sale de la efectiva anual con interes compuesto', function () {
  const app = calculos();

  // 12,6825% E.A. equivale a 1% mensual; dividir entre 12 daria 1,057%
  const ea = (Math.pow(1.01, 12) - 1) * 100;
  assert.ok(Math.abs(app.tasaMensualEquivalente(ea) - 0.01) < 1e-12);
  assert.ok(app.tasaMensualEquivalente(40) < 40 / 100 / 12);
  assert.ok(Math.abs(app.calcularInteresMensual({ saldo: 1000000, tasaEA: ea }) - 10000) < 1e-6);
});

test('EN-49: el resumen de deudas trae totales, interes del mes y prioridad', function () {
  const app = calculos();
  const ea = (Math.pow(1.01, 12) - 1) * 100;
  const r = app.calcularResumenDeudas([
    deuda('Credito', 2000000, ea, 120000),
    deuda('Tarjeta', 1000000, 40, 80000)
  ]);

  assert.equal(r.cantidad, 2);
  assert.equal(r.saldoTotal, 3000000);
  assert.equal(r.pagoMinimoTotal, 200000);
  // 20.000 del credito + 28.436 de la tarjeta, redondeado a pesos
  assert.equal(r.interesMensual, Math.round(20000 + 1000000 * (Math.pow(1.4, 1 / 12) - 1)));
  assert.equal(r.prioridad.nombre, 'Tarjeta');

  assert.equal(app.calcularResumenDeudas([]).prioridad, null);
});

test('EN-49: el grafico de deudas reparte el saldo en orden de prioridad', function () {
  const app = calculos();
  const d = app.calcularDistribucionDeudas([
    deuda('Credito', 2000000, 18, 120000),
    deuda('Tarjeta', 1000000, 40, 80000)
  ]);

  assert.deepEqual(plano(d.porciones), [
    { etiqueta: 'Tarjeta', valor: 1000000 },
    { etiqueta: 'Credito', valor: 2000000 }
  ]);
  assert.equal(d.saldoTotal, 3000000);
});

test('EN-49: el estado financiero no muestra porcion disponible si hay deficit', function () {
  const app = calculos();
  const conPlata = app.calcularEstadoFinanciero([{ monto: 2000000 }], [{ monto: 1500000 }]);
  const enDeficit = app.calcularEstadoFinanciero([{ monto: 1000000 }], [{ monto: 1500000 }]);

  assert.deepEqual(plano(conPlata.porciones), [
    { etiqueta: 'Gastos esenciales', valor: 1500000 },
    { etiqueta: 'Disponible', valor: 500000 }
  ]);
  assert.deepEqual(plano(enDeficit.porciones), [{ etiqueta: 'Gastos esenciales', valor: 1500000 }]);
  assert.equal(enDeficit.estado, 'excedido');
});

test('EN-49: los ratios comparan ingresos, gastos esenciales y gastos hormiga', function () {
  const app = calculos();
  const r = app.calcularRatios([{ monto: 2000000 }], [{ monto: 1200000 }], [{ montoMensual: 80000 }, { montoMensual: 40000 }]);

  assert.deepEqual(plano(r.porciones), [
    { etiqueta: 'Ingresos', valor: 2000000 },
    { etiqueta: 'Gastos esenciales', valor: 1200000 },
    { etiqueta: 'Gastos hormiga', valor: 120000 }
  ]);
});

// ===========================================================================
// EN-88  Cuanto pagarle a cada deuda este mes
// ===========================================================================

test('EN-88: la deuda se valida antes de guardarla', function () {
  const app = calculos();
  const valida = app.validarDeuda({ nombre: ' Tarjeta ', saldo: '1.200.000', tasaEA: '42,5 %', pagoMinimo: '0' });

  assert.equal(valida.valido, true);
  // El pago minimo puede ser cero: hay creditos sin cuota este mes
  assert.deepEqual(plano(valida.datos), { nombre: 'Tarjeta', saldo: 1200000, tasaEA: 42.5, pagoMinimo: 0 });

  const errores = function (entrada) {
    return plano(app.validarDeuda(Object.assign({ nombre: 'Tarjeta', saldo: '1000', tasaEA: '30', pagoMinimo: '100' }, entrada)).errores);
  };
  assert.deepEqual(errores({ nombre: '' }), { nombre: 'Escribe el nombre de la deuda.' });
  assert.deepEqual(errores({ tasaEA: '' }), { tasaEA: 'Escribe la tasa de interés.' });
  assert.deepEqual(errores({ tasaEA: '0' }), { tasaEA: 'La tasa debe ser mayor que cero.' });
  assert.deepEqual(errores({ tasaEA: '301' }), { tasaEA: 'La tasa no puede superar 300% efectivo anual.' });
  assert.deepEqual(errores({ tasaEA: '42,555' }), { tasaEA: 'Escribe la tasa como número, con máximo dos decimales. Ej. 42,5' });
  assert.deepEqual(errores({ pagoMinimo: '' }), { pagoMinimo: 'Escribe el pago mínimo.' });
});

test('EN-88: las deudas viajan a la base con los nombres de sus columnas', async function () {
  const fila = { id: 4, nombre: 'Tarjeta', saldo: '1200000.00', tasa_ea: '42.50', pago_minimo: '80000', fecha: '2026-09-25' };
  const { app, sb } = capaDeDatos({
    filas: { deudas: function (consulta) { return { data: paso(consulta, 'insert') ? fila : [fila], error: null }; } }
  });

  await app.agregarDeuda({ nombre: 'Tarjeta', saldo: 1200000, tasaEA: 42.5, pagoMinimo: 80000 });
  const deudas = await app.obtenerDeudas();

  const [insert, lectura] = consultasA(sb, 'deudas');
  assert.deepEqual(plano(paso(insert, 'insert')[0]), {
    usuario_id: 7, nombre: 'Tarjeta', saldo: 1200000, tasa_ea: 42.5, pago_minimo: 80000, fecha: '2026-09-25'
  });
  // Las deudas no se filtran por mes: son un saldo vigente
  assert.equal(paso(lectura, 'gte'), undefined);
  assert.deepEqual(plano(deudas), [{ id: 4, nombre: 'Tarjeta', saldo: 1200000, tasaEA: 42.5, pagoMinimo: 80000, fecha: '2026-09-25' }]);
});

test('EN-88: la capacidad de pago suma todos los ingresos y gastos del mes', function () {
  const app = calculos();
  const m = mes([1800000, 400000], [900000, 350000, 150000]);
  const plan = app.calcularPlanPagos(m.ingresos, m.gastos, [deuda('Tarjeta', 3000000, 40, 150000)]);

  assert.equal(plan.totalIngresos, 2200000);
  assert.equal(plan.totalGastos, 1400000);
  assert.equal(plan.capacidad, 800000);
});

test('EN-88: cada pago dice cuanto es minimo, cuanto es extra y cual es la prioridad', function () {
  const app = calculos();
  const m = mes([3000000], [2400000]);
  const plan = app.calcularPlanPagos(m.ingresos, m.gastos, [
    deuda('Credito', 4000000, 18, 150000),
    deuda('Tarjeta', 2500000, 38, 100000)
  ]);

  assert.equal(plan.estado, 'plan');
  assert.deepEqual(plano(pagosPorNombre(plan.pagos)), [
    { nombre: 'Tarjeta', minimo: 100000, extra: 350000, pago: 450000, esPrioridad: true },
    { nombre: 'Credito', minimo: 150000, extra: 0, pago: 150000, esPrioridad: false }
  ]);
  // Lo abonado es exactamente la capacidad: ni un peso de mas ni de menos
  const total = plan.pagos.reduce(function (s, p) { return s + p.pago; }, 0);
  assert.equal(total, plan.capacidad);
});

test('EN-88: no modifica las deudas que recibe', function () {
  const app = calculos();
  const deudas = [deuda('Credito', 4000000, 18, 150000), deuda('Tarjeta', 2500000, 38, 100000)];
  const copia = JSON.stringify(deudas);
  const m = mes([3000000], [2400000]);

  app.calcularPlanPagos(m.ingresos, m.gastos, deudas);

  assert.equal(JSON.stringify(deudas), copia);
});

// ===========================================================================
// EN-91  Cuanta plata queda libre para deudas
// ===========================================================================

test('EN-91: sin deudas toda la capacidad queda libre', function () {
  const app = calculos();
  const m = mes([2000000], [1500000]);
  const plan = app.calcularPlanPagos(m.ingresos, m.gastos, []);

  assert.equal(plan.estado, 'sin-deudas');
  assert.equal(plan.excedente, 500000);
  assert.equal(plan.faltante, 0);
});

test('EN-91: sin deudas y con gastos mayores a los ingresos dice cuanto falta', function () {
  const app = calculos();
  const m = mes([1000000], [1300000]);
  const plan = app.calcularPlanPagos(m.ingresos, m.gastos, []);

  assert.equal(plan.excedente, 0);
  assert.equal(plan.faltante, 300000);
  assert.equal(plan.capacidad, -300000);
});

test('EN-91: el excedente es lo que queda despues de los minimos', function () {
  const app = calculos();
  const m = mes([2500000], [1800000]);
  const plan = app.calcularPlanPagos(m.ingresos, m.gastos, [
    deuda('Tarjeta', 2000000, 40, 120000),
    deuda('Celular', 300000, 25, 80000)
  ]);

  assert.equal(plan.capacidad, 700000);
  assert.equal(plan.pagoMinimoTotal, 200000);
  assert.equal(plan.excedente, 500000);
});

test('EN-91: sin ingresos registrados no hay plan y falta cubrir los minimos', function () {
  const app = calculos();
  const plan = app.calcularPlanPagos([], [], [deuda('Tarjeta', 2000000, 40, 120000)]);

  assert.equal(plan.estado, 'insuficiente');
  assert.equal(plan.totalIngresos, 0);
  assert.equal(plan.faltante, 120000);
});

// ===========================================================================
// EN-101  El plan no sugiere abonar mas de lo que se debe
// ===========================================================================

test('EN-101: lo que sobra de una deuda saldada pasa a la siguiente en orden de tasa', function () {
  const app = calculos();
  const m = mes([3000000], [1500000]);
  const plan = app.calcularPlanPagos(m.ingresos, m.gastos, [
    deuda('Credito', 5000000, 18, 200000),
    deuda('Tarjeta', 300000, 45, 60000),
    deuda('Celular', 500000, 30, 50000)
  ]);

  // Capacidad 1.500.000: minimos 310.000 y excedente 1.190.000.
  // Tarjeta se salda (240.000 extra), Celular se salda (450.000 extra) y los
  // 500.000 que quedan van al Credito.
  assert.deepEqual(plano(pagosPorNombre(plan.pagos)), [
    { nombre: 'Tarjeta', minimo: 60000, extra: 240000, pago: 300000, esPrioridad: true },
    { nombre: 'Celular', minimo: 50000, extra: 450000, pago: 500000, esPrioridad: false },
    { nombre: 'Credito', minimo: 200000, extra: 500000, pago: 700000, esPrioridad: false }
  ]);
  plan.pagos.forEach(function (p) {
    assert.ok(p.pago <= p.deuda.saldo, p.deuda.nombre + ' recibe mas de lo que debe');
  });
});

test('EN-101: si alcanza para saldar todo, lo que sobra se reporta y no se abona', function () {
  const app = calculos();
  const m = mes([3000000], [1500000]);
  const plan = app.calcularPlanPagos(m.ingresos, m.gastos, [
    deuda('Tarjeta', 300000, 45, 60000),
    deuda('Celular', 200000, 30, 250000)
  ]);

  assert.equal(plan.pagoMinimoTotal, 260000);
  assert.deepEqual(plano(plan.pagos).map(function (p) { return p.pago; }), [300000, 200000]);
  assert.equal(plan.sobrante, 1000000);
});
