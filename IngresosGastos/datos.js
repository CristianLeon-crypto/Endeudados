// ====
// CAPA DE DATOS del modulo Ingresos y Gastos (Supabase)
//
// Unico punto de contacto con los datos. La pantalla (inGas.js) solo llama
// las funciones publicas de aca; no habla con Supabase ni con localStorage.
//
// Tablas reales de la base:
//   ingresos  id int8 | usuario_id | descripcion | monto | fecha | creado_en
//   gastos    id int8 | usuario_id | descripcion | categoria | monto | fecha | tipo ('esencial'|'hormiga') | creado_en
//   deudas    id int8 | usuario_id | nombre | saldo | tasa_ea | pago_minimo | fecha | creado_en
//   usuarios  id uuid | auth_id -> auth.users.id | cedula | nombre | email
//
// Mapeo pantalla <-> base (se traduce SOLO aca):
//   concepto     <-> descripcion
//   montoMensual <-> monto (gastos con tipo = 'hormiga')
//   tasaEA       <-> tasa_ea
//   pagoMinimo   <-> pago_minimo
//
// El usuario_id se resuelve con la sesion: auth.users -> usuarios.auth_id.
// Con RLS activo cada quien ve y escribe solo sus filas.
// ====

let _usuario = null;

// ----
// Usuario / sesion
// ----

async function getUsuarioActual() {
  if (_usuario) {
    return _usuario;
  }

  const { data: sesion, error: errorSesion } = await sbClient.auth.getSession();
  if (errorSesion) throw errorSesion;

  const user = sesion.session?.user;
  if (!user) return null; // sin sesion -> la pantalla redirige al login

  // El id que usan las tablas es el de la fila en usuarios, no el de auth
  const { data, error } = await sbClient
    .from('usuarios')
    .select('id, nombre, email')
    .eq('auth_id', user.id)
    .single();

  if (error) throw error;

  _usuario = { id: data.id, nombre: data.nombre || user.email, email: data.email || user.email };
  return _usuario;
}

// ----
// Categorias de gasto esencial (fijas en codigo; no hay tabla)
// ----

async function obtenerCategorias() {
  return [
    { id: 'vivienda', nombre: 'Vivienda' },
    { id: 'alimentacion', nombre: 'Alimentación' },
    { id: 'transporte', nombre: 'Transporte' },
    { id: 'servicios', nombre: 'Servicios públicos' },
    { id: 'salud', nombre: 'Salud' },
    { id: 'educacion', nombre: 'Educación' }
  ];
}

// ----
// Ingresos (EN-4)
// ----

async function obtenerIngresos(periodo) {
  let consulta = sbClient.from('ingresos').select('id, descripcion, monto, fecha');
  if (periodo) {
    const { desde, hasta } = _rangoDelPeriodo(periodo);
    consulta = consulta.gte('fecha', desde).lt('fecha', hasta);
  }
  const { data, error } = await consulta;
  if (error) throw error;
  return data.map(function (fila) {
    return { id: fila.id, concepto: fila.descripcion, monto: Number(fila.monto), fecha: fila.fecha };
  });
}

async function agregarIngreso(datos) {
  const usuario = await getUsuarioActual();
  const { data, error } = await sbClient
    .from('ingresos')
    .insert({
      usuario_id: usuario.id,
      descripcion: datos.concepto,
      monto: datos.monto,
      fecha: _fechaDeHoy()
    })
    .select('id, descripcion, monto, fecha')
    .single();
  if (error) throw error;
  return { id: data.id, concepto: data.descripcion, monto: Number(data.monto), fecha: data.fecha };
}

async function eliminarIngreso(id) {
  const { error } = await sbClient.from('ingresos').delete().eq('id', id);
  if (error) throw error;
}

// ----
// Gastos esenciales (EN-5) y gastos hormiga (misma tabla, columna tipo)
// ----

async function obtenerGastos(periodo) {
  let consulta = sbClient.from('gastos').select('id, descripcion, categoria, monto, fecha').eq('tipo', 'esencial');
  if (periodo) {
    const { desde, hasta } = _rangoDelPeriodo(periodo);
    consulta = consulta.gte('fecha', desde).lt('fecha', hasta);
  }
  const { data, error } = await consulta;
  if (error) throw error;
  return data.map(function (fila) {
    return { id: fila.id, concepto: fila.descripcion, categoria: fila.categoria, monto: Number(fila.monto), fecha: fila.fecha };
  });
}

async function agregarGasto(datos) {
  const usuario = await getUsuarioActual();
  const { data, error } = await sbClient
    .from('gastos')
    .insert({
      usuario_id: usuario.id,
      descripcion: datos.concepto,
      categoria: datos.categoria,
      monto: datos.monto,
      fecha: _fechaDeHoy(),
      tipo: 'esencial'
    })
    .select('id, descripcion, categoria, monto, fecha')
    .single();
  if (error) throw error;
  return { id: data.id, concepto: data.descripcion, categoria: data.categoria, monto: Number(data.monto), fecha: data.fecha };
}

async function eliminarGasto(id) {
  const { error } = await sbClient.from('gastos').delete().eq('id', id);
  if (error) throw error;
}

async function obtenerGastosHormiga(periodo) {
  let consulta = sbClient.from('gastos').select('id, descripcion, monto, fecha').eq('tipo', 'hormiga');
  if (periodo) {
    const { desde, hasta } = _rangoDelPeriodo(periodo);
    consulta = consulta.gte('fecha', desde).lt('fecha', hasta);
  }
  const { data, error } = await consulta;
  if (error) throw error;
  return data.map(function (fila) {
    return { id: fila.id, concepto: fila.descripcion, montoMensual: Number(fila.monto), fecha: fila.fecha };
  });
}

async function agregarGastoHormiga(datos) {
  const usuario = await getUsuarioActual();
  const { data, error } = await sbClient
    .from('gastos')
    .insert({
      usuario_id: usuario.id,
      descripcion: datos.concepto,
      monto: datos.montoMensual,
      fecha: _fechaDeHoy(),
      tipo: 'hormiga'
    })
    .select('id, descripcion, monto, fecha')
    .single();
  if (error) throw error;
  return { id: data.id, concepto: data.descripcion, montoMensual: Number(data.monto), fecha: data.fecha };
}

async function eliminarGastoHormiga(id) {
  const { error } = await sbClient.from('gastos').delete().eq('id', id);
  if (error) throw error;
}

// ----
// Deudas (no se filtran por mes: son un saldo vigente)
// ----

async function obtenerDeudas() {
  const { data, error } = await sbClient
    .from('deudas')
    .select('id, nombre, saldo, tasa_ea, pago_minimo, fecha');
  if (error) throw error;
  return data.map(function (fila) {
    return {
      id: fila.id,
      nombre: fila.nombre,
      saldo: Number(fila.saldo),
      tasaEA: Number(fila.tasa_ea),
      pagoMinimo: Number(fila.pago_minimo),
      fecha: fila.fecha
    };
  });
}

async function agregarDeuda(datos) {
  const usuario = await getUsuarioActual();
  const { data, error } = await sbClient
    .from('deudas')
    .insert({
      usuario_id: usuario.id,
      nombre: datos.nombre,
      saldo: datos.saldo,
      tasa_ea: datos.tasaEA,
      pago_minimo: datos.pagoMinimo,
      fecha: _fechaDeHoy()
    })
    .select('id, nombre, saldo, tasa_ea, pago_minimo, fecha')
    .single();
  if (error) throw error;
  return {
    id: data.id,
    nombre: data.nombre,
    saldo: Number(data.saldo),
    tasaEA: Number(data.tasa_ea),
    pagoMinimo: Number(data.pago_minimo),
    fecha: data.fecha
  };
}

async function eliminarDeuda(id) {
  const { error } = await sbClient.from('deudas').delete().eq('id', id);
  if (error) throw error;
}

// ----
// Helpers de fecha (columna date: 'AAAA-MM-DD', con hora local, no UTC)
// ----

function _aDia(fecha) {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

function _fechaDeHoy() {
  return _aDia(new Date());
}

// '2026-09' -> { desde: '2026-09-01', hasta: '2026-10-01' } para la consulta
function _rangoDelPeriodo(periodo) {
  const [anio, mes] = periodo.split('-').map(Number);
  return {
    desde: _aDia(new Date(anio, mes - 1, 1)),
    hasta: _aDia(new Date(anio, mes, 1))
  };
}