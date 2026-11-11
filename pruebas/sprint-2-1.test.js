// Pruebas automatizadas del Sprint 2-1 (EN Sprint 2, 11 al 17 de septiembre).
//
// Historias cubiertas:
//   EN-4   registrar ingresos
//   EN-5   registrar gastos esenciales
//   EN-6   ver el resumen de ingresos y gastos
//   EN-7   crear una cuenta
//   EN-18  iniciar sesion
//   EN-14 / EN-17  olvide mi contrasena
//   EN-15 / EN-16  conexion con la base de datos (usuario de la sesion)
//   EN-20  registros duplicados (cedula ya registrada)
//
// Nada de esto toca Supabase ni abre un navegador: el cliente de Supabase y el
// DOM son falsos (ver pruebas/apoyo/entorno.js) y anotan lo que se les pidio.
// Se corren con el resto:  node --test

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  crearSupabaseFalso, paso, crearDocumentoFalso, crearUbicacionFalsa,
  crearFechaFija, cargarScript, plano
} = require('./apoyo/entorno');

const HOY = '2026-09-15T10:00:00';
const SESION = { data: { session: { user: { id: 'auth-123', email: 'ana@correo.co' } } }, error: null };
const PERFIL = { id: 7, nombre: 'Ana', email: 'ana@correo.co' };

function calculos() {
  return cargarScript('IngresosGastos/calculos.js', {});
}

// Capa de datos con un Supabase falso. `filas` dice que devuelve cada tabla.
function capaDeDatos(opciones) {
  const config = opciones || {};
  const sb = crearSupabaseFalso({
    auth: { getSession: config.sesion || SESION },
    responder: function (consulta) {
      if (consulta.tabla === 'usuarios') {
        return config.perfil || { data: PERFIL, error: null };
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

// Pantalla de login y registro (loRe.js + auth.js) con DOM y Supabase falsos
function pantallaLogin(auth) {
  const sb = crearSupabaseFalso({ auth });
  const documento = crearDocumentoFalso();
  const ubicacion = crearUbicacionFalsa({ pathname: '/LoginRegistro/loRe.html' });
  cargarScript(['LoginRegistro/loRe.js', 'LoginRegistro/auth.js'], {
    document: documento,
    window: { location: ubicacion },
    performance: { getEntriesByType: function () { return [{ type: 'navigate' }]; } },
    supabase: { createClient: function () { return sb.cliente; } }
  });
  const el = function (id) { return documento.getElementById(id); };
  return { sb, el, ubicacion };
}

function llenar(el, valores) {
  Object.keys(valores).forEach(function (id) { el(id).value = valores[id]; });
}

const REGISTRO_VALIDO = {
  'reg-nombre': '  Ana Pérez ',
  'reg-cedula': '1.020.304.050',
  'reg-email': ' ana@correo.co ',
  'reg-password': 'secreta123'
};

// Pantalla de recuperacion (shared/supabase.js + recPass.js)
function pantallaRecuperar(opciones) {
  const config = opciones || {};
  const sb = crearSupabaseFalso({ auth: config.auth });
  const documento = crearDocumentoFalso();
  const ubicacion = crearUbicacionFalsa({ pathname: '/RecuperarPassword/recPass.html', hash: config.hash || '' });
  const historial = { reemplazos: [] };
  const temporizadores = [];
  cargarScript(['shared/supabase.js', 'RecuperarPassword/recPass.js'], {
    document: documento,
    window: { location: ubicacion },
    history: { replaceState: function () { historial.reemplazos.push(Array.from(arguments)); } },
    setTimeout: function (fn, ms) { temporizadores.push({ fn, ms }); },
    URLSearchParams,
    supabase: { createClient: function () { return sb.cliente; } }
  });
  const el = function (id) { return documento.getElementById(id); };
  return { sb, el, ubicacion, historial, temporizadores };
}

// ===========================================================================
// EN-4  Registrar ingresos
// ===========================================================================

test('EN-4: acepta el monto con o sin puntos de miles y con signo de pesos', function () {
  const app = calculos();
  ['1500000', '1.500.000', '$ 1.500.000'].forEach(function (texto) {
    const r = app.validarIngreso({ concepto: '  Salario ', monto: texto });
    assert.equal(r.valido, true, texto);
    assert.deepEqual(plano(r.datos), { concepto: 'Salario', monto: 1500000 });
  });
});

test('EN-4: rechaza ingresos sin concepto, con centavos, en cero o con ceros de mas', function () {
  const app = calculos();
  const casos = [
    [{ concepto: '', monto: '100' }, 'concepto', 'Escribe un concepto.'],
    [{ concepto: 'x'.repeat(61), monto: '100' }, 'concepto', 'El concepto puede tener máximo 60 caracteres.'],
    [{ concepto: 'Salario', monto: '' }, 'monto', 'Escribe el monto.'],
    [{ concepto: 'Salario', monto: '1,5' }, 'monto', 'Escribe el monto en pesos, solo números y sin centavos. Ej. 1.500.000'],
    [{ concepto: 'Salario', monto: '1.50.000' }, 'monto', 'Escribe el monto en pesos, solo números y sin centavos. Ej. 1.500.000'],
    [{ concepto: 'Salario', monto: '0' }, 'monto', 'El monto debe ser mayor que cero.'],
    [{ concepto: 'Salario', monto: '1000000001' }, 'monto', 'Ese monto es demasiado alto. Revisa que no sobren ceros.']
  ];
  casos.forEach(function ([entrada, campo, mensaje]) {
    const r = app.validarIngreso(entrada);
    assert.equal(r.valido, false, JSON.stringify(entrada));
    assert.equal(r.errores[campo], mensaje);
  });
});

test('EN-4: guarda el ingreso con el usuario de la sesion y la fecha de hoy', async function () {
  const { app, sb } = capaDeDatos({
    filas: { ingresos: { data: { id: 1, descripcion: 'Salario', monto: '1500000.00', fecha: '2026-09-15' }, error: null } }
  });

  const guardado = await app.agregarIngreso({ concepto: 'Salario', monto: 1500000 });

  const [insert] = consultasA(sb, 'ingresos');
  assert.deepEqual(plano(paso(insert, 'insert')[0]), {
    usuario_id: 7, descripcion: 'Salario', monto: 1500000, fecha: '2026-09-15'
  });
  // La base devuelve numeric como texto: la pantalla recibe un numero
  assert.deepEqual(plano(guardado), { id: 1, concepto: 'Salario', monto: 1500000, fecha: '2026-09-15' });
});

test('EN-4: trae solo los ingresos del mes pedido', async function () {
  const { app, sb } = capaDeDatos({
    filas: { ingresos: { data: [{ id: 1, descripcion: 'Salario', monto: '2000000', fecha: '2026-09-01' }], error: null } }
  });

  const ingresos = await app.obtenerIngresos('2026-09');
  await app.obtenerIngresos('2026-12');

  const [septiembre, diciembre] = consultasA(sb, 'ingresos');
  assert.deepEqual(paso(septiembre, 'gte'), ['fecha', '2026-09-01']);
  assert.deepEqual(paso(septiembre, 'lt'), ['fecha', '2026-10-01']);
  // Diciembre cierra en enero del anio siguiente
  assert.deepEqual(paso(diciembre, 'lt'), ['fecha', '2027-01-01']);
  assert.deepEqual(plano(ingresos), [{ id: 1, concepto: 'Salario', monto: 2000000, fecha: '2026-09-01' }]);
});

test('EN-4: si la base rechaza el ingreso el error llega a la pantalla', async function () {
  const { app } = capaDeDatos({
    filas: { ingresos: { data: null, error: new Error('violates row-level security policy') } }
  });

  await assert.rejects(app.agregarIngreso({ concepto: 'Salario', monto: 1 }), /row-level security/);
});

// ===========================================================================
// EN-5  Registrar gastos esenciales
// ===========================================================================

test('EN-5: hay seis categorias fijas de gasto esencial', async function () {
  const { app } = capaDeDatos();
  const categorias = await app.obtenerCategorias();

  assert.deepEqual(plano(categorias).map(function (c) { return c.id; }),
    ['vivienda', 'alimentacion', 'transporte', 'servicios', 'salud', 'educacion']);
});

test('EN-5: el gasto necesita una categoria que exista', async function () {
  const { app } = capaDeDatos();
  const categorias = await app.obtenerCategorias();

  const sinCategoria = app.validarGasto({ concepto: 'Arriendo', categoria: '', monto: '900.000' }, categorias);
  const inventada = app.validarGasto({ concepto: 'Arriendo', categoria: 'lujos', monto: '900.000' }, categorias);
  const valida = app.validarGasto({ concepto: 'Arriendo', categoria: 'vivienda', monto: '900.000' }, categorias);

  assert.equal(sinCategoria.errores.categoria, 'Selecciona una categoría.');
  assert.equal(inventada.errores.categoria, 'Selecciona una categoría.');
  assert.equal(valida.valido, true);
  assert.deepEqual(plano(valida.datos), { concepto: 'Arriendo', categoria: 'vivienda', monto: 900000 });
});

test('EN-5: el gasto se guarda como esencial y la lista no mezcla los gastos hormiga', async function () {
  const { app, sb } = capaDeDatos({
    filas: {
      gastos: function (consulta) {
        const fila = { id: 3, descripcion: 'Arriendo', categoria: 'vivienda', monto: '900000', fecha: '2026-09-15' };
        return { data: paso(consulta, 'insert') ? fila : [fila], error: null };
      }
    }
  });

  await app.agregarGasto({ concepto: 'Arriendo', categoria: 'vivienda', monto: 900000 });
  await app.obtenerGastos('2026-09');
  await app.obtenerGastosHormiga('2026-09');

  const [insert, esenciales, hormiga] = consultasA(sb, 'gastos');
  assert.deepEqual(plano(paso(insert, 'insert')[0]), {
    usuario_id: 7, descripcion: 'Arriendo', categoria: 'vivienda', monto: 900000, fecha: '2026-09-15', tipo: 'esencial'
  });
  assert.deepEqual(paso(esenciales, 'eq'), ['tipo', 'esencial']);
  assert.deepEqual(paso(hormiga, 'eq'), ['tipo', 'hormiga']);
});

test('EN-5: el gasto hormiga suma su impacto en el anio', function () {
  const app = calculos();
  const resumen = app.calcularResumenHormiga([
    { concepto: 'Cafe', montoMensual: 60000 },
    { concepto: 'Domicilios', montoMensual: 90000 }
  ]);

  assert.deepEqual(plano(resumen), { cantidad: 2, totalMensual: 150000, impactoAnual: 1800000 });
});

// ===========================================================================
// EN-6  Ver el resumen de ingresos y gastos
// ===========================================================================

test('EN-6: el resumen suma ingresos y gastos y calcula lo disponible', function () {
  const app = calculos();
  const r = app.calcularResumen(
    [{ monto: 1500000 }, { monto: 500000 }],
    [{ monto: 900000 }, { monto: 300000 }]
  );

  assert.deepEqual(plano(r), {
    totalIngresos: 2000000, totalGastos: 1200000, disponible: 800000, porcentajeGastos: 60, estado: 'normal'
  });
});

test('EN-6: el resumen distingue vacio, sin ingresos, excedido y justo', function () {
  const app = calculos();
  const estado = function (ingresos, gastos) {
    return app.calcularResumen(ingresos.map(function (m) { return { monto: m }; }), gastos.map(function (m) { return { monto: m }; }));
  };

  assert.equal(estado([], []).estado, 'vacio');
  assert.equal(estado([], [100]).estado, 'sin-ingresos');
  // Sin ingresos el porcentaje no existe: no se divide por cero
  assert.equal(estado([], [100]).porcentajeGastos, null);
  assert.equal(estado([100], [150]).estado, 'excedido');
  assert.equal(estado([100], [150]).disponible, -50);
  assert.equal(estado([100], [100]).estado, 'justo');
});

test('EN-6: los montos y porcentajes se muestran en formato colombiano', function () {
  const app = calculos();

  assert.match(app.formatearPesos(1500000), /^\$\s1\.500\.000$/);
  assert.equal(app.formatearMiles(1500000), '1.500.000');
  assert.equal(app.formatearPorcentaje(60), '60%');
  // Un gasto chico no aparece como "0 %"
  assert.equal(app.formatearPorcentaje(2.345), '2,3%');
  assert.equal(app.formatearPorcentaje(null), 'Sin datos');
  assert.equal(app.nombreDelPeriodo('2026-09'), 'septiembre de 2026');
});

// ===========================================================================
// EN-15 / EN-16  Conexion con la base: el usuario de la sesion
// ===========================================================================

test('EN-15: sin sesion no hay usuario y no se consulta la tabla usuarios', async function () {
  const { app, sb } = capaDeDatos({ sesion: { data: { session: null }, error: null } });

  assert.equal(await app.getUsuarioActual(), null);
  assert.equal(consultasA(sb, 'usuarios').length, 0);
});

test('EN-15: el id que usan las tablas es el del perfil, buscado por auth_id', async function () {
  const { app, sb } = capaDeDatos();

  const usuario = await app.getUsuarioActual();
  await app.getUsuarioActual();

  const consultas = consultasA(sb, 'usuarios');
  assert.deepEqual(paso(consultas[0], 'eq'), ['auth_id', 'auth-123']);
  assert.deepEqual(plano(usuario), { id: 7, nombre: 'Ana', email: 'ana@correo.co' });
  // La segunda llamada sale del cache: no repite la consulta
  assert.equal(consultas.length, 1);
});

test('EN-15: si el perfil no tiene nombre se muestra el correo', async function () {
  const { app } = capaDeDatos({ perfil: { data: { id: 7, nombre: null, email: null }, error: null } });

  const usuario = await app.getUsuarioActual();

  assert.equal(usuario.nombre, 'ana@correo.co');
  assert.equal(usuario.email, 'ana@correo.co');
});

test('EN-16: si falla la consulta del perfil el error llega a la pantalla', async function () {
  const { app } = capaDeDatos({ perfil: { data: null, error: new Error('JWT expired') } });

  await assert.rejects(app.getUsuarioActual(), /JWT expired/);
});

// ===========================================================================
// EN-7  Crear una cuenta  /  EN-20  cedula ya registrada
// ===========================================================================

test('EN-7: con campos vacios no intenta registrar', async function () {
  const { sb, el } = pantallaLogin();
  llenar(el, Object.assign({}, REGISTRO_VALIDO, { 'reg-email': '   ' }));

  await el('form-registro').disparar('submit');

  assert.equal(el('reg-error').textContent, 'Completa todos los campos.');
  assert.equal(el('reg-error').visible(), true);
  assert.equal(sb.llamadasAuth.length, 0);
});

test('EN-7: la cedula se limpia de puntos y debe tener entre 6 y 10 digitos', async function () {
  const { sb, el } = pantallaLogin();
  llenar(el, Object.assign({}, REGISTRO_VALIDO, { 'reg-cedula': '12.345' }));

  await el('form-registro').disparar('submit');

  assert.equal(el('reg-error').textContent, 'La cédula debe tener entre 6 y 10 dígitos.');
  assert.equal(sb.llamadasAuth.length, 0);
});

test('EN-7: un registro valido manda nombre y cedula dentro del signUp', async function () {
  const { sb, el } = pantallaLogin({ signUp: { data: { user: { id: 'nuevo' } }, error: null } });
  llenar(el, REGISTRO_VALIDO);

  await el('form-registro').disparar('submit');

  const [llamada] = sb.llamadasAuth;
  assert.equal(llamada.metodo, 'signUp');
  assert.deepEqual(plano(llamada.args[0]), {
    email: 'ana@correo.co',
    password: 'secreta123',
    options: {
      data: { nombre: 'Ana Pérez', cedula: '1020304050' },
      emailRedirectTo: 'https://endeudados.test/LoginRegistro/loRe.html'
    }
  });
  assert.match(el('reg-success').textContent, /^Registro exitoso/);
  assert.equal(el('reg-success').visible(), true);
  assert.equal(el('form-registro').reseteado, true);
});

test('EN-7: si se mandaron demasiados correos lo dice', async function () {
  const { el } = pantallaLogin({ signUp: { data: { user: null }, error: { status: 429, message: 'rate limit' } } });
  llenar(el, REGISTRO_VALIDO);

  await el('form-registro').disparar('submit');

  assert.equal(el('reg-error').textContent,
    'Se enviaron demasiados correos en poco tiempo. Espera unos minutos e intenta de nuevo.');
});

test('EN-20: con la cedula ya registrada no dice cual dato existe', async function () {
  // El trigger de la base rechaza la cedula repetida y Supabase responde 500
  const { el } = pantallaLogin({ signUp: { data: { user: null }, error: { status: 500, message: 'Database error saving new user' } } });
  llenar(el, REGISTRO_VALIDO);

  await el('form-registro').disparar('submit');

  assert.equal(el('reg-error').textContent,
    'No se pudo crear la cuenta. Revisa que la cédula y el correo sean correctos y no estén registrados.');
  assert.doesNotMatch(el('reg-error').textContent, /Database error/);
  assert.equal(el('form-registro').reseteado, false);
});

test('EN-20: si Supabase no devuelve usuario no da el registro por hecho', async function () {
  const { el } = pantallaLogin({ signUp: { data: { user: null }, error: null } });
  llenar(el, REGISTRO_VALIDO);

  await el('form-registro').disparar('submit');

  assert.equal(el('reg-error').textContent, 'No se pudo crear la cuenta. Intenta nuevamente.');
  assert.equal(el('reg-success').visible(), false);
});

// ===========================================================================
// EN-18  Iniciar sesion
// ===========================================================================

test('EN-18: sin correo o contrasena no intenta entrar', async function () {
  const { sb, el } = pantallaLogin();
  llenar(el, { 'login-email': 'ana@correo.co', 'login-password': '' });

  await el('form-login').disparar('submit');

  assert.equal(el('login-error').textContent, 'Escribe tu correo y tu contraseña.');
  assert.equal(sb.llamadasAuth.length, 0);
});

test('EN-18: con credenciales correctas entra a Ingresos y Gastos', async function () {
  const { sb, el, ubicacion } = pantallaLogin({ signInWithPassword: { data: { user: { id: 'auth-123' } }, error: null } });
  llenar(el, { 'login-email': '  ana@correo.co ', 'login-password': 'secreta123' });

  await el('form-login').disparar('submit');

  assert.deepEqual(plano(sb.llamadasAuth[0].args[0]), { email: 'ana@correo.co', password: 'secreta123' });
  assert.equal(ubicacion.href, '../IngresosGastos/inGas.html');
});

test('EN-18: con credenciales incorrectas no entra ni dice cual de los dos fallo', async function () {
  const { el, ubicacion } = pantallaLogin({ signInWithPassword: { data: {}, error: { status: 400, message: 'Invalid login credentials' } } });
  llenar(el, { 'login-email': 'ana@correo.co', 'login-password': 'mala' });

  await el('form-login').disparar('submit');

  assert.equal(el('login-error').textContent, 'Correo o contraseña incorrectos.');
  assert.equal(ubicacion.href, '');
});

test('EN-18: con el correo sin confirmar pide confirmarlo', async function () {
  const { el, ubicacion } = pantallaLogin({ signInWithPassword: { data: {}, error: { status: 400, message: 'Email not confirmed' } } });
  llenar(el, { 'login-email': 'ana@correo.co', 'login-password': 'secreta123' });

  await el('form-login').disparar('submit');

  assert.match(el('login-info').textContent, /^Debes confirmar tu correo/);
  assert.equal(el('login-info').visible(), true);
  assert.equal(ubicacion.href, '');
});

// ===========================================================================
// EN-14 / EN-17  Olvide mi contrasena
// ===========================================================================

test('EN-14: sin correo no pide el enlace', async function () {
  const { sb, el } = pantallaRecuperar();
  el('rec-email').value = '  ';

  await el('form-solicitar').disparar('submit');

  assert.equal(el('solicitar-error').textContent, 'Escribe tu correo electrónico.');
  assert.equal(sb.llamadasAuth.length, 0);
});

test('EN-17: pide el enlace apuntando a la pantalla de recuperacion del sitio actual', async function () {
  const { sb, el } = pantallaRecuperar();
  el('rec-email').value = ' ana@correo.co ';

  await el('form-solicitar').disparar('submit');

  const [llamada] = sb.llamadasAuth;
  assert.equal(llamada.metodo, 'resetPasswordForEmail');
  assert.equal(llamada.args[0], 'ana@correo.co');
  assert.deepEqual(plano(llamada.args[1]), { redirectTo: 'https://endeudados.test/RecuperarPassword/recPass.html' });
  // Mismo mensaje exista o no el correo: no deja averiguar quien esta registrado
  assert.match(el('solicitar-ok').textContent, /^Si ese correo está registrado/);
  assert.equal(el('form-solicitar').reseteado, true);
  assert.equal(el('btn-solicitar').disabled, false);
});

test('EN-17: si pidio muchos enlaces seguidos le pide esperar', async function () {
  const { el } = pantallaRecuperar({ auth: { resetPasswordForEmail: { data: {}, error: { status: 429 } } } });
  el('rec-email').value = 'ana@correo.co';

  await el('form-solicitar').disparar('submit');

  assert.equal(el('solicitar-error').textContent, 'Pediste varios enlaces muy seguido. Espera un minuto e intenta de nuevo.');
});

test('EN-17: al llegar desde el correo muestra el paso de la contrasena nueva y borra el token de la URL', function () {
  const { el, historial } = pantallaRecuperar({ hash: '#access_token=abc&type=recovery' });

  assert.equal(el('paso-nueva').visible(), true);
  assert.equal(el('paso-solicitar').visible(), false);
  assert.equal(el('paso-invalido').visible(), false);
  assert.deepEqual(historial.reemplazos, [[null, '', '/RecuperarPassword/recPass.html']]);
});

test('EN-17: con el enlace vencido muestra el aviso con el detalle', function () {
  const { el } = pantallaRecuperar({ hash: '#error=access_denied&error_description=Email+link+is+invalid+or+has+expired' });

  assert.equal(el('paso-invalido').visible(), true);
  assert.equal(el('invalido-detalle').textContent, 'Email link is invalid or has expired');
});

test('EN-17: la contrasena nueva debe coincidir y tener al menos 6 caracteres', async function () {
  const { sb, el } = pantallaRecuperar({ hash: '#type=recovery' });

  llenar(el, { 'rec-password': 'secreta1', 'rec-password2': 'secreta2' });
  await el('form-nueva').disparar('submit');
  assert.equal(el('nueva-error').textContent, 'Las dos contraseñas no coinciden.');

  llenar(el, { 'rec-password': '123', 'rec-password2': '123' });
  await el('form-nueva').disparar('submit');
  assert.equal(el('nueva-error').textContent, 'La contraseña debe tener al menos 6 caracteres.');

  assert.equal(sb.llamadasAuth.length, 0);
});

test('EN-17: guarda la contrasena, cierra la sesion temporal y vuelve al login', async function () {
  const { sb, el, ubicacion, temporizadores } = pantallaRecuperar({ hash: '#type=recovery' });
  llenar(el, { 'rec-password': 'nueva123', 'rec-password2': 'nueva123' });

  await el('form-nueva').disparar('submit');

  assert.deepEqual(sb.llamadasAuth.map(function (l) { return l.metodo; }), ['updateUser', 'signOut']);
  assert.deepEqual(plano(sb.llamadasAuth[0].args[0]), { password: 'nueva123' });
  assert.match(el('nueva-ok').textContent, /^Listo/);

  temporizadores[0].fn();
  assert.equal(ubicacion.reemplazadaPor, '../LoginRegistro/loRe.html');
});

test('EN-17: sin sesion de recuperacion no deja cambiar la contrasena', async function () {
  const { el } = pantallaRecuperar({
    auth: { updateUser: { data: {}, error: { message: 'Auth session missing!' } } }
  });
  llenar(el, { 'rec-password': 'nueva123', 'rec-password2': 'nueva123' });

  await el('form-nueva').disparar('submit');

  assert.equal(el('paso-invalido').visible(), true);
  assert.equal(el('nueva-ok').textContent, '');
});
