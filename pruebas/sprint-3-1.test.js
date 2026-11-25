// Pruebas automatizadas del Sprint 3-1 (EN Sprint 5).
//
// Historias cubiertas:
//   EN-106 el mismo menu en todas las pantallas internas
//   EN-97  marcar una deuda como pagada y que se note
//   EN-95  ver cuanto se ha pagado y cuanto falta
//
// Se corren con el resto:  node --test

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  crearDocumentoFalso, crearUbicacionFalsa, cargarScript, plano
} = require('./apoyo/entorno');

const RAIZ = path.join(__dirname, '..');

const PAGINAS = [
  'IngresosGastos/inGas.html',
  'Deudas/deudas.html',
  'PlanPagos/plan.html',
  'Perfil/perfil.html'
];

const DEUDA_PAGADA = { id: 1, nombre: 'Tarjeta', saldo: 0, tasaEA: 42.5, pagoMinimo: 180000 };
const DEUDA_ACTIVA = { id: 2, nombre: 'Crédito', saldo: 2400000, tasaEA: 30, pagoMinimo: 200000 };

function calculos() {
  return cargarScript('IngresosGastos/calculos.js', {});
}

function menu() {
  return cargarScript('shared/menu.js', {});
}

function leer(pagina) {
  return fs.readFileSync(path.join(RAIZ, pagina), 'utf8');
}

// ---------------------------------------------------------------------------
// EN-106: un solo menu en todas las pantallas internas
// ---------------------------------------------------------------------------

test('EN-106: cada pantalla interna marca su opcion en el menu', function () {
  const { menuActual } = menu();

  assert.equal(menuActual('/IngresosGastos/inGas.html', ''), 'resumen');
  assert.equal(menuActual('/IngresosGastos/inGas.html', '#resumen'), 'resumen');
  assert.equal(menuActual('/IngresosGastos/inGas.html', '#ingresos'), 'ingresos');
  assert.equal(menuActual('/IngresosGastos/inGas.html', '#deudas'), 'ingresos');
  assert.equal(menuActual('/Deudas/deudas.html', ''), 'deudas');
  assert.equal(menuActual('/Deudas/deudas.html', '#abonos'), 'deudas');
  assert.equal(menuActual('/PlanPagos/plan.html', ''), 'plan');
  assert.equal(menuActual('/Perfil/perfil.html', ''), 'perfil');
});

test('EN-106: el menu pinta las mismas opciones en el mismo orden', function () {
  const { pintarMenu } = menu();
  const documento = crearDocumentoFalso();
  const contenedor = documento.createElement('header');

  pintarMenu(contenedor, crearUbicacionFalsa({ pathname: '/PlanPagos/plan.html' }), documento);

  const nav = contenedor.children[1];
  assert.equal(nav.className, 'nav-links');
  assert.deepEqual(nav.children.map(function (enlace) { return enlace.textContent; }), [
    'Resumen',
    'Ingresos y gastos',
    'Deudas y abonos',
    'Plan de pagos',
    'Mi perfil'
  ]);

  const marcados = nav.children.filter(function (enlace) {
    return enlace.getAttribute('aria-current') === 'page';
  });
  assert.equal(marcados.length, 1);
  assert.equal(marcados[0].textContent, 'Plan de pagos');

  const botones = contenedor.children[2];
  assert.equal(botones.children[1].id, 'btn-cerrar-sesion');
});

test('EN-106: cerrar sesion funciona desde cualquier pantalla', async function () {
  const ubicacion = crearUbicacionFalsa({ pathname: '/Deudas/deudas.html' });
  const llamadas = [];
  const sbClient = {
    auth: {
      signOut: async function () {
        llamadas.push('signOut');
        return { error: null };
      }
    }
  };
  const { pintarMenu } = cargarScript('shared/menu.js', { sbClient, window: { location: ubicacion } });
  const documento = crearDocumentoFalso();
  const contenedor = documento.createElement('header');

  pintarMenu(contenedor, ubicacion, documento);
  const boton = documento.getElementById('btn-cerrar-sesion');
  await boton.disparar('click');

  assert.deepEqual(llamadas, ['signOut']);
  assert.equal(ubicacion.reemplazadaPor, '../LoginRegistro/loRe.html');
});

test('EN-106: si cerrar sesion falla, el boton vuelve y se avisa', async function () {
  const ubicacion = crearUbicacionFalsa({ pathname: '/Perfil/perfil.html' });
  const sbClient = {
    auth: {
      signOut: async function () {
        return { error: new Error('sin red') };
      }
    }
  };
  const { pintarMenu } = cargarScript('shared/menu.js', { sbClient, window: { location: ubicacion } });
  const documento = crearDocumentoFalso();
  const contenedor = documento.createElement('header');

  pintarMenu(contenedor, ubicacion, documento);
  const boton = documento.getElementById('btn-cerrar-sesion');
  await boton.disparar('click');

  assert.equal(boton.disabled, false);
  assert.equal(documento.getElementById('menu-error').visible(), true);
  assert.equal(ubicacion.reemplazadaPor, null);
});

test('EN-106: las pantallas internas usan el menu compartido, no una copia', function () {
  PAGINAS.forEach(function (pagina) {
    const html = leer(pagina);
    assert.match(html, /<header class="navbar" data-menu><\/header>/, pagina);
    assert.match(html, /<script src="\.\.\/shared\/menu\.js"><\/script>/, pagina);
    assert.doesNotMatch(html, /<nav class="nav-links"/, pagina);
  });
});

test('EN-106: cada pagina se llama igual en el menu y en su titulo', function () {
  const titulos = {
    'IngresosGastos/inGas.html': 'Ingresos y gastos',
    'Deudas/deudas.html': 'Deudas y abonos',
    'PlanPagos/plan.html': 'Plan de pagos',
    'Perfil/perfil.html': 'Mi perfil'
  };

  Object.keys(titulos).forEach(function (pagina) {
    const titulo = leer(pagina).match(/<title>([^<]+)<\/title>/)[1];
    assert.ok(titulo.includes(titulos[pagina]), `${pagina}: ${titulo}`);
  });
});

// ---------------------------------------------------------------------------
// EN-97: marcar una deuda como pagada y que se note
// ---------------------------------------------------------------------------

test('EN-97: una deuda en cero queda pagada y sale del plan', function () {
  const { separarDeudasPorEstado, calcularPlanPagos } = calculos();

  const separadas = plano(separarDeudasPorEstado([DEUDA_PAGADA, DEUDA_ACTIVA]));
  assert.equal(separadas.activas.length, 1);
  assert.equal(separadas.pagadas.length, 1);
  assert.equal(separadas.pagadas[0].nombre, 'Tarjeta');

  const plan = calcularPlanPagos([{ monto: 3000000 }], [{ monto: 1000000 }], [DEUDA_PAGADA]);
  assert.equal(plan.estado, 'sin-deudas');
  assert.equal(plan.pagos.length, 0);
  assert.equal(plan.pagoMinimoTotal, 0);
});

test('EN-97: el plan recalcula con el minimo que libera la deuda pagada', function () {
  const { calcularPlanPagos } = calculos();

  const plan = calcularPlanPagos(
    [{ monto: 3000000 }],
    [{ monto: 1000000 }],
    [DEUDA_PAGADA, DEUDA_ACTIVA]
  );

  assert.equal(plan.estado, 'plan');
  assert.equal(plan.pagoMinimoTotal, 200000);
  assert.equal(plan.pagos.length, 1);
  assert.equal(plan.pagos[0].deuda.nombre, 'Crédito');
  assert.equal(plan.pagos[0].minimo, 200000);
});

test('EN-97: al saldar la deuda se calculan los intereses que se evitaron', function () {
  const { calcularAvanceDeudas, calcularInteresesEvitados } = calculos();

  const avance = calcularAvanceDeudas([DEUDA_PAGADA], [{ deudaId: 1, monto: 1000000 }]).porDeuda[0];
  assert.equal(avance.saldoInicial, 1000000);

  const intereses = calcularInteresesEvitados(
    Object.assign({}, DEUDA_PAGADA, { saldoInicial: avance.saldoInicial }),
    '2026-11'
  );
  assert.ok(intereses > 0, `intereses evitados: ${intereses}`);
});

test('EN-97: sin pago minimo no se inventa un ahorro de intereses', function () {
  const { calcularInteresesEvitados } = calculos();

  const intereses = calcularInteresesEvitados(
    { id: 1, nombre: 'Tarjeta', saldo: 0, tasaEA: 42.5, pagoMinimo: 0, saldoInicial: 1000000 },
    '2026-11'
  );
  assert.equal(intereses, null);
});

// ---------------------------------------------------------------------------
// EN-95: ver cuanto se ha pagado y cuanto falta
// ---------------------------------------------------------------------------

test('EN-95: el avance compara lo abonado con el saldo inicial', function () {
  const { calcularAvanceDeudas } = calculos();

  const deudas = [
    { id: 1, nombre: 'Tarjeta', saldo: 0, tasaEA: 42.5, pagoMinimo: 180000 },
    { id: 2, nombre: 'Crédito', saldo: 1500000, tasaEA: 30, pagoMinimo: 200000 }
  ];
  const abonos = [
    { deudaId: 1, monto: 600000 },
    { deudaId: 1, monto: 400000 },
    { deudaId: 2, monto: 500000 }
  ];

  const avance = plano(calcularAvanceDeudas(deudas, abonos));

  assert.equal(avance.totalAbonado, 1500000);
  assert.equal(avance.saldoInicialTotal, 3000000);
  assert.equal(avance.saldoTotal, 1500000);
  assert.equal(avance.porcentajeTotal, 50);

  assert.equal(avance.porDeuda[0].saldoInicial, 1000000);
  assert.equal(avance.porDeuda[0].porcentaje, 100);
  assert.equal(avance.porDeuda[0].pagada, true);

  assert.equal(avance.porDeuda[1].saldoInicial, 2000000);
  assert.equal(avance.porDeuda[1].porcentaje, 25);
  assert.equal(avance.porDeuda[1].pagada, false);
});

test('EN-95: sin deudas el avance queda en cero', function () {
  const { calcularAvanceDeudas } = calculos();

  const avance = plano(calcularAvanceDeudas([], []));
  assert.equal(avance.totalAbonado, 0);
  assert.equal(avance.saldoInicialTotal, 0);
  assert.equal(avance.porcentajeTotal, 0);
  assert.deepEqual(avance.porDeuda, []);
});
