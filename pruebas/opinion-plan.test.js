// Pruebas de EN-108: "¿Este plan te sirve?" en Plan de pagos (Happiness del GSM).
//
// Criterio de la historia:
//   - debajo del plan aparece la pregunta con Si / No
//   - la respuesta se guarda por usuario, una por mes (con RLS en la base)
//   - el % de si sale con una consulta (supabase/EN-108-opiniones-plan.sql)
//
// La base no se toca: datos.js habla con un Supabase falso y plan.js corre
// con un DOM falso. Las politicas RLS y el unique (usuario_id, periodo) viven
// en la base; aca se revisa que la app pida lo correcto.
// Se corren con el resto:  node --test

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  crearSupabaseFalso, paso, crearDocumentoFalso, crearUbicacionFalsa, crearFechaFija, cargarScript, plano
} = require('./apoyo/entorno');

const HOY = '2026-11-22T10:00:00';
const SESION = { data: { session: { user: { id: 'auth-123', email: 'ana@correo.co' } } }, error: null };
const PERFIL = { id: 7, nombre: 'Ana', email: 'ana@correo.co' };

// Con estos datos sale un plan: capacidad 1.000.000, minimos 150.000
const FILAS_CON_PLAN = {
  ingresos: { data: [{ id: 1, descripcion: 'Salario', monto: '2000000', fecha: '2026-11-01' }], error: null },
  gastos: { data: [{ id: 1, descripcion: 'Arriendo', categoria: 'vivienda', monto: '1000000', fecha: '2026-11-01' }], error: null },
  deudas: {
    data: [
      { id: 1, nombre: 'Tarjeta', saldo: '3000000', tasa_ea: '38', pago_minimo: '100000', fecha: '2026-11-01' },
      { id: 2, nombre: 'Celular', saldo: '800000', tasa_ea: '20', pago_minimo: '50000', fecha: '2026-11-01' }
    ],
    error: null
  }
};

function supabase(filas) {
  return crearSupabaseFalso({
    auth: { getSession: SESION },
    responder: function (consulta) {
      if (consulta.tabla === 'usuarios') {
        return { data: PERFIL, error: null };
      }
      const respuesta = filas[consulta.tabla];
      if (typeof respuesta === 'function') {
        return respuesta(consulta);
      }
      return respuesta || { data: [], error: null };
    }
  });
}

function consultasA(sb, tabla) {
  return sb.consultas.filter(function (c) { return c.tabla === tabla; });
}

function capaDeDatos(filas) {
  const sb = supabase(filas || {});
  const app = cargarScript(
    ['IngresosGastos/calculos.js', 'IngresosGastos/datos.js'],
    { sbClient: sb.cliente, Date: crearFechaFija(HOY) }
  );
  return { app, sb };
}

// ---------------------------------------------------------------------------
// DOM falso para plan.js
// ---------------------------------------------------------------------------

// plan.js arma tablas y listas; para estas pruebas basta con que esos metodos
// existan. Lo que se revisa es la tarjeta de la opinion.
function completar(elemento) {
  const atributos = {};
  return Object.assign(elemento, {
    // Para la <template> de cada pago
    content: { get firstElementChild() { return completar(crearDocumentoFalso().getElementById('x')); } },
    dataset: elemento.dataset || {},
    atributos,
    setAttribute: function (nombre, valor) { atributos[nombre] = valor; },
    getAttribute: function (nombre) { return atributos[nombre]; },
    append: function () {},
    replaceChildren: function () {},
    remove: function () {},
    querySelector: function () { return completar(crearDocumentoFalso().getElementById('x')); },
    querySelectorAll: function () { return []; },
    cloneNode: function () { return completar(crearDocumentoFalso().getElementById('x')); }
  });
}

function crearPantalla() {
  const base = crearDocumentoFalso();
  const botones = ['si', 'no'].map(function (sirve) {
    const boton = completar(crearDocumentoFalso().getElementById('opinion-' + sirve));
    boton.dataset.sirve = sirve;
    return boton;
  });

  const documento = {
    elementos: base.elementos,
    getElementById: function (id) {
      const existe = base.elementos[id];
      const elemento = base.getElementById(id);
      return existe ? elemento : completar(elemento);
    },
    querySelectorAll: function (selector) {
      return selector === '.opinion-boton' ? botones : [];
    },
    createElement: function () {
      return completar(crearDocumentoFalso().getElementById('nuevo'));
    }
  };
  return { documento, botones };
}

// Las consultas responden en microtareas: con un turno del reloj ya terminaron
function esperar() {
  return new Promise(function (resolver) { setTimeout(resolver, 5); });
}

async function abrirPlan(filas) {
  const sb = supabase(filas);
  const { documento, botones } = crearPantalla();
  cargarScript(
    ['IngresosGastos/calculos.js', 'IngresosGastos/datos.js', 'PlanPagos/plan.js'],
    {
      sbClient: sb.cliente,
      Date: crearFechaFija(HOY),
      document: documento,
      window: { location: crearUbicacionFalsa() }
    }
  );
  await esperar();
  const tarjeta = documento.getElementById('bloque-opinion');
  const mensaje = documento.getElementById('opinion-mensaje');
  const [si, no] = botones;
  return { sb, tarjeta, mensaje, si, no };
}

// ===========================================================================
// Capa de datos
// ===========================================================================

test('EN-108: la respuesta del mes se busca por usuario y periodo', async function () {
  const { app, sb } = capaDeDatos({ opiniones_plan: { data: { sirve: true }, error: null } });

  const opinion = await app.obtenerOpinionPlan('2026-11');

  const [consulta] = consultasA(sb, 'opiniones_plan');
  assert.deepEqual(paso(consulta, 'select'), ['sirve']);
  assert.deepEqual(consulta.pasos.filter(function (p) { return p.metodo === 'eq'; }).map(function (p) { return p.args; }),
    [['usuario_id', 7], ['periodo', '2026-11']]);
  assert.ok(paso(consulta, 'maybeSingle'), 'si no ha respondido no debe ser error');
  assert.equal(opinion, true);
});

test('EN-108: si no ha respondido este mes la opinion es null', async function () {
  const { app } = capaDeDatos({ opiniones_plan: { data: null, error: null } });

  assert.equal(await app.obtenerOpinionPlan('2026-11'), null);
});

test('EN-108: guardar hace upsert por usuario y mes, para que quede una sola respuesta', async function () {
  const { app, sb } = capaDeDatos({ opiniones_plan: { data: { sirve: false }, error: null } });

  const guardada = await app.guardarOpinionPlan('2026-11', false);

  const [consulta] = consultasA(sb, 'opiniones_plan');
  const [valores, opciones] = paso(consulta, 'upsert');
  assert.deepEqual(plano(valores), { usuario_id: 7, periodo: '2026-11', sirve: false });
  assert.deepEqual(plano(opciones), { onConflict: 'usuario_id,periodo' });
  assert.equal(paso(consulta, 'insert'), undefined, 'un insert duplicaria la respuesta del mes');
  assert.equal(guardada, false);
});

test('EN-108: si la base rechaza la respuesta el error llega a la pantalla', async function () {
  const { app } = capaDeDatos({
    opiniones_plan: { data: null, error: new Error('new row violates row-level security policy') }
  });

  await assert.rejects(app.guardarOpinionPlan('2026-11', true), /row-level security/);
});

// ===========================================================================
// Pantalla de Plan de pagos
// ===========================================================================

test('EN-108: con plan aparece la pregunta, sin nada marcado si no ha respondido', async function () {
  const { tarjeta, mensaje, si, no } = await abrirPlan(Object.assign({}, FILAS_CON_PLAN, {
    opiniones_plan: { data: null, error: null }
  }));

  assert.ok(tarjeta.visible());
  assert.equal(si.atributos['aria-pressed'], 'false');
  assert.equal(no.atributos['aria-pressed'], 'false');
  assert.match(mensaje.textContent, /nos ayuda a saber/);
});

test('EN-108: si ya respondio este mes se marca su respuesta', async function () {
  const { si, no, mensaje } = await abrirPlan(Object.assign({}, FILAS_CON_PLAN, {
    opiniones_plan: { data: { sirve: false }, error: null }
  }));

  assert.equal(si.atributos['aria-pressed'], 'false');
  assert.equal(no.atributos['aria-pressed'], 'true');
  assert.match(mensaje.textContent, /Gracias por contarnos/);
});

test('EN-108: al tocar Si se guarda, se marca y da las gracias', async function () {
  const { sb, si, no, mensaje } = await abrirPlan(Object.assign({}, FILAS_CON_PLAN, {
    opiniones_plan: function (consulta) {
      return paso(consulta, 'upsert')
        ? { data: { sirve: true }, error: null }
        : { data: null, error: null };
    }
  }));

  await si.disparar('click');
  await esperar();

  const upsert = consultasA(sb, 'opiniones_plan').find(function (c) { return paso(c, 'upsert'); });
  assert.deepEqual(plano(paso(upsert, 'upsert')[0]), { usuario_id: 7, periodo: '2026-11', sirve: true });
  assert.equal(si.atributos['aria-pressed'], 'true');
  assert.equal(no.atributos['aria-pressed'], 'false');
  assert.equal(si.disabled, false);
  assert.match(mensaje.textContent, /Nos alegra que te sirva/);
});

test('EN-108: si no se puede guardar avisa y deja la respuesta que ya estaba', async function () {
  const { si, no, mensaje } = await abrirPlan(Object.assign({}, FILAS_CON_PLAN, {
    opiniones_plan: function (consulta) {
      return paso(consulta, 'upsert')
        ? { data: null, error: new Error('sin conexion') }
        : { data: { sirve: false }, error: null };
    }
  }));

  await si.disparar('click');
  await esperar();

  assert.equal(no.atributos['aria-pressed'], 'true');
  assert.equal(si.atributos['aria-pressed'], 'false');
  assert.match(mensaje.textContent, /No pudimos guardar/);
  assert.ok(mensaje.classList.contains('error-msg'));
});

test('EN-108: sin deudas no hay plan que calificar y no se pregunta', async function () {
  const { tarjeta } = await abrirPlan({
    ingresos: FILAS_CON_PLAN.ingresos,
    gastos: FILAS_CON_PLAN.gastos,
    opiniones_plan: { data: null, error: null }
  });

  assert.equal(tarjeta.visible(), false);
});

test('EN-108: si no alcanza para los minimos no se pregunta', async function () {
  const { tarjeta } = await abrirPlan({
    ingresos: { data: [{ id: 1, descripcion: 'Salario', monto: '1000000', fecha: '2026-11-01' }], error: null },
    gastos: { data: [{ id: 1, descripcion: 'Arriendo', categoria: 'vivienda', monto: '950000', fecha: '2026-11-01' }], error: null },
    deudas: FILAS_CON_PLAN.deudas,
    opiniones_plan: { data: null, error: null }
  });

  assert.equal(tarjeta.visible(), false);
});

test('EN-108: si la tabla aun no existe el plan se ve igual, sin la pregunta', async function () {
  const { tarjeta } = await abrirPlan(Object.assign({}, FILAS_CON_PLAN, {
    opiniones_plan: { data: null, error: new Error('relation "public.opiniones_plan" does not exist') }
  }));

  assert.equal(tarjeta.visible(), false);
});
