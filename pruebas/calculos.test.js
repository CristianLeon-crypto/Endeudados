// Pruebas de la logica pura de IngresosGastos/calculos.js.
//
// Se corren con el runner que ya trae Node (18 o superior), sin instalar nada:
//   node --test
//
// calculos.js es un script de navegador sin exports: se carga tal cual en el
// contexto global, igual que lo hace la etiqueta <script> de cada pantalla, y
// sus funciones quedan disponibles como globales.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RUTA_CALCULOS = path.join(__dirname, '..', 'IngresosGastos', 'calculos.js');
vm.runInThisContext(fs.readFileSync(RUTA_CALCULOS, 'utf8'), { filename: RUTA_CALCULOS });

// Ingresos y gastos de un mes con un solo registro cada uno. La capacidad de
// pago es la diferencia.
function mesCon(ingreso, gasto) {
  return {
    ingresos: ingreso ? [{ concepto: 'Salario', monto: ingreso }] : [],
    gastos: gasto ? [{ concepto: 'Arriendo', monto: gasto }] : []
  };
}

function deuda(nombre, saldo, tasaEA, pagoMinimo) {
  return { id: nombre, nombre, saldo, tasaEA, pagoMinimo };
}

function montosPorDeuda(pagos) {
  return pagos.map(function (item) {
    return [item.deuda.nombre, item.pago];
  });
}

// ---------------------------------------------------------------------------
// Plan del mes (EN-88): regresion para el cambio a repartirPagos
// ---------------------------------------------------------------------------

test('plan del mes: sin deudas no hay plan', function () {
  const mes = mesCon(2000000, 1500000);
  const plan = calcularPlanPagos(mes.ingresos, mes.gastos, []);

  assert.equal(plan.estado, 'sin-deudas');
  assert.equal(plan.capacidad, 500000);
  assert.deepEqual(plan.pagos, []);
});

test('plan del mes: si la capacidad no cubre los minimos dice cuanto falta', function () {
  const mes = mesCon(2000000, 1900000);
  const plan = calcularPlanPagos(mes.ingresos, mes.gastos, [
    deuda('Tarjeta', 1000000, 40, 150000)
  ]);

  assert.equal(plan.estado, 'insuficiente');
  assert.equal(plan.faltante, 50000);
  assert.equal(plan.excedente, 0);
  assert.deepEqual(plan.pagos, []);
});

test('plan del mes: el excedente va completo a la deuda de mayor tasa', function () {
  const mes = mesCon(3000000, 2500000);
  const plan = calcularPlanPagos(mes.ingresos, mes.gastos, [
    deuda('Libre inversion', 5000000, 20, 100000),
    deuda('Tarjeta', 2000000, 40, 100000)
  ]);

  assert.equal(plan.estado, 'plan');
  assert.equal(plan.excedente, 300000);
  assert.equal(plan.prioridad.nombre, 'Tarjeta');
  assert.deepEqual(montosPorDeuda(plan.pagos), [['Tarjeta', 400000], ['Libre inversion', 100000]]);
  assert.equal(plan.sobrante, 0);
});

test('plan del mes: con la misma tasa va primero la de menor saldo', function () {
  const mes = mesCon(1000000, 500000);
  const plan = calcularPlanPagos(mes.ingresos, mes.gastos, [
    deuda('Grande', 4000000, 30, 50000),
    deuda('Chica', 1000000, 30, 50000)
  ]);

  assert.equal(plan.prioridad.nombre, 'Chica');
});

test('plan del mes: no sugiere abonar mas de lo que se debe (EN-101)', function () {
  const mes = mesCon(2000000, 1000000);
  const plan = calcularPlanPagos(mes.ingresos, mes.gastos, [
    deuda('Tarjeta', 200000, 42, 50000),
    deuda('Libre inversion', 1000000, 20, 100000)
  ]);

  assert.deepEqual(montosPorDeuda(plan.pagos), [['Tarjeta', 200000], ['Libre inversion', 800000]]);
  assert.equal(plan.sobrante, 0);
});

test('plan del mes: el minimo nunca supera el saldo y lo que sobra se reporta', function () {
  const mes = mesCon(1000000, 500000);
  const plan = calcularPlanPagos(mes.ingresos, mes.gastos, [
    deuda('Celular', 30000, 30, 50000)
  ]);

  assert.equal(plan.pagoMinimoTotal, 30000);
  assert.deepEqual(montosPorDeuda(plan.pagos), [['Celular', 30000]]);
  assert.equal(plan.sobrante, 470000);
});

// ---------------------------------------------------------------------------
// Cuando quedo libre de deudas (EN-77)
// ---------------------------------------------------------------------------

// Tasa E.A. que equivale exactamente a 1% mensual, para poder verificar los
// intereses a mano.
const EA_UNO_POR_CIENTO_MENSUAL = (Math.pow(1.01, 12) - 1) * 100;

test('libre: una deuda sola, verificada a mano', function () {
  // Capacidad 300.000 cada mes, 1% mensual sobre lo que queda debiendo:
  //   mes 1: 1.000.000 - 300.000 = 700.000 + 7.000 interes = 707.000
  //   mes 2:   707.000 - 300.000 = 407.000 + 4.070 interes = 411.070
  //   mes 3:   411.070 - 300.000 = 111.070 + 1.111 interes = 112.181
  //   mes 4:   paga 112.181 y queda en cero
  const mes = mesCon(2300000, 2000000);
  const resultado = simularLibreDeDeudas(mes.ingresos, mes.gastos, [
    deuda('Tarjeta', 1000000, EA_UNO_POR_CIENTO_MENSUAL, 50000)
  ], '2026-11');

  assert.equal(resultado.estado, 'libre');
  assert.equal(resultado.meses, 4);
  assert.equal(resultado.periodoLibre, '2027-02');
  assert.equal(resultado.totalIntereses, 7000 + 4070 + 1111);
  assert.equal(resultado.totalPagado, 300000 * 3 + 112181);
  assert.deepEqual(resultado.cronograma.map(function (fila) { return fila.saldo; }), [707000, 411070, 112181, 0]);
});

test('libre: el primer mes es el mismo plan que muestra la pantalla', function () {
  const mes = mesCon(3000000, 2500000);
  const deudas = [
    deuda('Libre inversion', 5000000, 20, 100000),
    deuda('Tarjeta', 2000000, 40, 100000)
  ];
  const plan = calcularPlanPagos(mes.ingresos, mes.gastos, deudas);
  const resultado = simularLibreDeDeudas(mes.ingresos, mes.gastos, deudas, '2026-11');

  assert.deepEqual(
    resultado.cronograma[0].deudas.map(function (fila) { return [fila.nombre, fila.pago]; }),
    montosPorDeuda(plan.pagos)
  );
});

test('libre: al saldar una deuda, todo el pago pasa a la siguiente', function () {
  // Mes 1: minimos 60.000 y excedente 140.000. La tarjeta se salda con 100.000
  // y lo que sobra va al credito.
  const mes = mesCon(1200000, 1000000);
  const resultado = simularLibreDeDeudas(mes.ingresos, mes.gastos, [
    deuda('Credito', 500000, 15, 50000),
    deuda('Tarjeta', 100000, 40, 10000)
  ], '2026-11');

  const [primerMes, segundoMes] = resultado.cronograma;
  assert.deepEqual(primerMes.deudas.map(function (fila) { return [fila.nombre, fila.pago, fila.saldo > 0]; }),
    [['Tarjeta', 100000, false], ['Credito', 100000, true]]);
  // El segundo mes solo queda el credito y recibe los 200.000 completos
  assert.deepEqual(segundoMes.deudas.map(function (fila) { return [fila.nombre, fila.pago]; }), [['Credito', 200000]]);
  assert.equal(resultado.estado, 'libre');
});

test('libre: si se paga todo este mes queda libre este mes y sin intereses', function () {
  const mes = mesCon(2000000, 1000000);
  const resultado = simularLibreDeDeudas(mes.ingresos, mes.gastos, [
    deuda('Celular', 300000, 30, 50000)
  ], '2026-11');

  assert.equal(resultado.estado, 'libre');
  assert.equal(resultado.meses, 1);
  assert.equal(resultado.periodoLibre, '2026-11');
  assert.equal(resultado.totalIntereses, 0);
});

test('libre: no modifica las deudas que recibe', function () {
  const mes = mesCon(1200000, 1000000);
  const deudas = [deuda('Tarjeta', 1000000, 40, 50000)];
  simularLibreDeDeudas(mes.ingresos, mes.gastos, deudas, '2026-11');

  assert.equal(deudas[0].saldo, 1000000);
});

test('libre: sin deudas no hay nada que simular', function () {
  const mes = mesCon(2000000, 1000000);
  const resultado = simularLibreDeDeudas(mes.ingresos, mes.gastos, [], '2026-11');

  assert.equal(resultado.estado, 'sin-deudas');
  assert.equal(resultado.periodoLibre, null);
});

test('libre: las deudas con saldo en cero se ignoran', function () {
  const mes = mesCon(2000000, 1000000);
  const resultado = simularLibreDeDeudas(mes.ingresos, mes.gastos, [
    deuda('Saldada con abonos', 0, 30, 50000)
  ], '2026-11');

  assert.equal(resultado.estado, 'sin-deudas');
});

test('libre: sin ingresos registrados no hay fecha posible', function () {
  const mes = mesCon(0, 0);
  const resultado = simularLibreDeDeudas(mes.ingresos, mes.gastos, [
    deuda('Tarjeta', 1000000, 40, 50000)
  ], '2026-11');

  assert.equal(resultado.estado, 'insuficiente');
  assert.equal(resultado.faltante, 50000);
  assert.deepEqual(resultado.cronograma, []);
});

test('libre: si la capacidad no cubre los minimos no hay fecha posible', function () {
  const mes = mesCon(2000000, 1900000);
  const resultado = simularLibreDeDeudas(mes.ingresos, mes.gastos, [
    deuda('Tarjeta', 1000000, 40, 150000)
  ], '2026-11');

  assert.equal(resultado.estado, 'insuficiente');
  assert.equal(resultado.faltante, 50000);
});

test('libre: si el interes supera el pago la deuda no se termina', function () {
  // 10.000.000 al 40% E.A. generan unos 284.000 de interes al mes: los 200.000
  // de capacidad no alcanzan a bajar el saldo.
  const mes = mesCon(1200000, 1000000);
  const resultado = simularLibreDeDeudas(mes.ingresos, mes.gastos, [
    deuda('Credito', 10000000, 40, 100000)
  ], '2026-11');

  assert.equal(resultado.estado, 'no-termina');
  assert.equal(resultado.motivo, 'intereses');
  assert.equal(resultado.periodoLibre, null);
  assert.ok(resultado.cronograma[0].interes > resultado.cronograma[0].pagado);
});

test('libre: con capacidad y minimo en cero la deuda no se termina', function () {
  const mes = mesCon(1000000, 1000000);
  const resultado = simularLibreDeDeudas(mes.ingresos, mes.gastos, [
    deuda('Prestamo familiar', 500000, 10, 0)
  ], '2026-11');

  assert.equal(resultado.estado, 'no-termina');
  assert.equal(resultado.motivo, 'intereses');
});

test('libre: si tardaria mas de 50 anios se corta y lo dice', function () {
  // Pago de 99.100 y 1% mensual sobre lo que queda (9.900.900): 99.009 de
  // interes. El saldo baja, pero tardaria unos 59 anios.
  const mes = mesCon(1099100, 1000000);
  const resultado = simularLibreDeDeudas(mes.ingresos, mes.gastos, [
    deuda('Hipoteca', 10000000, EA_UNO_POR_CIENTO_MENSUAL, 50000)
  ], '2026-11');

  assert.equal(resultado.estado, 'no-termina');
  assert.equal(resultado.motivo, 'plazo');
  assert.equal(resultado.meses, 600);
});

test('libre: un pago apenas mayor al interes termina antes de 50 anios', function () {
  // Mismo caso con 99.500 de pago: termina en unos 44 anios y medio
  const mes = mesCon(1099500, 1000000);
  const resultado = simularLibreDeDeudas(mes.ingresos, mes.gastos, [
    deuda('Hipoteca', 10000000, EA_UNO_POR_CIENTO_MENSUAL, 50000)
  ], '2026-11');

  assert.equal(resultado.estado, 'libre');
  assert.ok(resultado.meses > 500 && resultado.meses < 600);
});

test('sumarMesesAPeriodo cruza de anio', function () {
  assert.equal(sumarMesesAPeriodo('2026-11', 0), '2026-11');
  assert.equal(sumarMesesAPeriodo('2026-11', 2), '2027-01');
  assert.equal(sumarMesesAPeriodo('2026-01', 24), '2028-01');
});
