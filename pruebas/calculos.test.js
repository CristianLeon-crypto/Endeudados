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
