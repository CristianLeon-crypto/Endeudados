// =============================================================================
// CAPA DE DATOS del modulo Ingresos y Gastos
//
// Este archivo es el UNICO punto de contacto con los datos. La pantalla
// (inGas.js) nunca habla con Supabase ni con localStorage: solo llama las
// funciones publicas de aca.
//
// HOY: todo se guarda en el localStorage del navegador, con datos de prueba
// sembrados la primera vez, para poder usar y mostrar la pantalla sin backend.
//
// PARA CONECTAR SUPABASE: reemplazar el cuerpo de cada funcion publica por el
// stub comentado que esta justo debajo de ella. Como todas son async, la UI no
// cambia en absoluto.
//
// -----------------------------------------------------------------------------
// CONTRATO
// -----------------------------------------------------------------------------
//
// Reglas generales
//   - Todas las funciones son async (devuelven Promise), igual que el SDK.
//   - Si algo falla lanzan un Error; la pantalla lo atrapa y muestra el mensaje.
//     Aca adentro nunca se toca el DOM.
//   - Las funciones "obtener" devuelven un arreglo (vacio si no hay nada).
//   - Las funciones "agregar" devuelven el registro ya guardado, con su id.
//   - Las funciones "eliminar" no devuelven nada.
//   - id: uuid (texto). monto/saldo/pagoMinimo: numero entero de pesos (COP).
//     tasaEA: numero en porcentaje anual (42.5 = 42,5% E.A.). fecha: ISO 8601.
//   - periodo (opcional): texto 'AAAA-MM'. Si se pasa, la funcion devuelve solo
//     los registros de ese mes; si se omite, devuelve todos.
//
// API
//   getUsuarioActual()                -> { id, nombre, email } | null
//   obtenerCategorias()               -> [ categoria ]
//   obtenerIngresos(periodo?)         -> [ ingreso ]
//   agregarIngreso(datos)             -> ingreso        datos: { concepto, monto }
//   eliminarIngreso(id)               -> void
//   obtenerGastos(periodo?)           -> [ gasto ]
//   agregarGasto(datos)               -> gasto          datos: { concepto, categoria, monto }
//   eliminarGasto(id)                 -> void
//   obtenerGastosHormiga(periodo?)    -> [ gastoHormiga ]
//   agregarGastoHormiga(datos)        -> gastoHormiga   datos: { concepto, montoMensual }
//   eliminarGastoHormiga(id)          -> void
//   obtenerDeudas()                   -> [ deuda ]
//   agregarDeuda(datos)               -> deuda          datos: { nombre, saldo, tasaEA, pagoMinimo }
//   eliminarDeuda(id)                 -> void
//
// Modelos
//   usuario      { id, nombre, email }
//   categoria    { id, nombre }                       id en minuscula y sin tildes
//   ingreso      { id, concepto, monto, fecha }
//   gasto        { id, concepto, categoria, monto, fecha }
//   gastoHormiga { id, concepto, montoMensual, fecha }
//   deuda        { id, nombre, saldo, tasaEA, pagoMinimo, fecha }
//
// Tablas y columnas esperadas en Supabase (nombres sugeridos; si en la base
// quedan distintos, se traducen aca adentro y el resto del modulo ni se entera)
//
//   ingresos         id uuid pk | usuario_id uuid | concepto text | monto numeric | fecha timestamptz
//   gastos           id uuid pk | usuario_id uuid | concepto text | categoria text | monto numeric | fecha timestamptz
//   gastos_hormiga   id uuid pk | usuario_id uuid | concepto text | monto_mensual numeric | fecha timestamptz
//   deudas           id uuid pk | usuario_id uuid | nombre text | saldo numeric | tasa_ea numeric | pago_minimo numeric | fecha timestamptz
//   categorias_gasto id text pk | nombre text          (opcional: hoy van fijas aca)
//
//   Mapeo de nombres: montoMensual <-> monto_mensual, tasaEA <-> tasa_ea,
//   pagoMinimo <-> pago_minimo. Los demas campos se llaman igual.
//
//   usuario_id: uuid del usuario autenticado (auth.users.id). No se manda como
//   parametro desde la UI; se toma de la sesion o lo pone un default en la
//   tabla. Con RLS activo (politicas sobre auth.uid() = usuario_id) cada quien
//   ve y escribe solo sus filas.
//
// Pasos para pasar a Supabase
//   1. En inGas.html, antes de datos.js, cargar el SDK y el cliente compartido:
//        <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//        <script src="../shared/supabase.js"></script>
//   2. Reemplazar el cuerpo de cada funcion publica por su stub comentado.
//   3. Borrar el bloque "SOLO PRUEBAS" del final (localStorage y semilla).
// =============================================================================

const _CLAVES = {
  ingresos: 'endeudados.ingresos',
  gastos: 'endeudados.gastos',
  gastosHormiga: 'endeudados.gastosHormiga',
  deudas: 'endeudados.deudas'
};

// ---------------------------------------------------------------------------
// Usuario / sesion
// ---------------------------------------------------------------------------

// HOY devuelve siempre un usuario simulado, asi que la pantalla entra directo.
// Devolver null es lo que hace que la pantalla mande a LoginRegistro.
//
// Version real con Supabase:
//
//   async function getUsuarioActual() {
//     const { data, error } = await sbClient.auth.getSession();
//     if (error) throw error;
//     const usuario = data.session?.user;
//     if (!usuario) return null;   // sin sesion -> la pantalla redirige al login
//     return {
//       id: usuario.id,
//       nombre: usuario.user_metadata?.nombre || usuario.email,
//       email: usuario.email
//     };
//   }
async function getUsuarioActual() {
  return { id: '00000000-0000-4000-8000-000000000001', nombre: 'Invitada', email: 'invitada@endeudados.co' };
}

// ---------------------------------------------------------------------------
// Categorias de gasto esencial
// ---------------------------------------------------------------------------

// IMPORTANTE: estos id y nombres DEBEN coincidir exactamente con las
// categorias que se configuren en Supabase (mismo id, mismas tildes y
// mayusculas). Si no coinciden, los gastos guardados quedan con una categoria
// que la pantalla no reconoce y la validacion rechaza categorias validas.
//
// Version real (si se crea la tabla categorias_gasto):
//
//   async function obtenerCategorias() {
//     const { data, error } = await sbClient
//       .from('categorias_gasto')
//       .select('id, nombre')
//       .order('nombre');
//     if (error) throw error;
//     return data;
//   }
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

// ---------------------------------------------------------------------------
// Ingresos (EN-4)
// ---------------------------------------------------------------------------

//   async function obtenerIngresos(periodo) {
//     let consulta = sbClient.from('ingresos').select('id, concepto, monto, fecha');
//     if (periodo) {
//       const { desde, hasta } = _rangoDelPeriodo(periodo);
//       consulta = consulta.gte('fecha', desde).lt('fecha', hasta);
//     }
//     const { data, error } = await consulta;
//     if (error) throw error;
//     return data;
//   }
async function obtenerIngresos(periodo) {
  return _filtrarPorPeriodo(_leer(_CLAVES.ingresos), periodo);
}

//   async function agregarIngreso(datos) {
//     const { data, error } = await sbClient
//       .from('ingresos')
//       .insert({ concepto: datos.concepto, monto: datos.monto, fecha: new Date().toISOString() })
//       .select('id, concepto, monto, fecha')
//       .single();
//     if (error) throw error;
//     return data;
//   }
async function agregarIngreso(datos) {
  return _agregar(_CLAVES.ingresos, {
    concepto: datos.concepto,
    monto: datos.monto
  });
}

//   async function eliminarIngreso(id) {
//     const { error } = await sbClient.from('ingresos').delete().eq('id', id);
//     if (error) throw error;
//   }
async function eliminarIngreso(id) {
  _eliminar(_CLAVES.ingresos, id);
}

// ---------------------------------------------------------------------------
// Gastos esenciales (EN-5)
// ---------------------------------------------------------------------------

//   async function obtenerGastos(periodo) {
//     let consulta = sbClient.from('gastos').select('id, concepto, categoria, monto, fecha');
//     if (periodo) {
//       const { desde, hasta } = _rangoDelPeriodo(periodo);
//       consulta = consulta.gte('fecha', desde).lt('fecha', hasta);
//     }
//     const { data, error } = await consulta;
//     if (error) throw error;
//     return data;
//   }
async function obtenerGastos(periodo) {
  return _filtrarPorPeriodo(_leer(_CLAVES.gastos), periodo);
}

//   async function agregarGasto(datos) {
//     const { data, error } = await sbClient
//       .from('gastos')
//       .insert({
//         concepto: datos.concepto,
//         categoria: datos.categoria,
//         monto: datos.monto,
//         fecha: new Date().toISOString()
//       })
//       .select('id, concepto, categoria, monto, fecha')
//       .single();
//     if (error) throw error;
//     return data;
//   }
async function agregarGasto(datos) {
  return _agregar(_CLAVES.gastos, {
    concepto: datos.concepto,
    categoria: datos.categoria,
    monto: datos.monto
  });
}

//   async function eliminarGasto(id) {
//     const { error } = await sbClient.from('gastos').delete().eq('id', id);
//     if (error) throw error;
//   }
async function eliminarGasto(id) {
  _eliminar(_CLAVES.gastos, id);
}

// ---------------------------------------------------------------------------
// Gastos hormiga
// ---------------------------------------------------------------------------

// Ojo con el mapeo de nombres: en la base la columna es monto_mensual y aca el
// campo es montoMensual. La traduccion se hace en esta funcion.
//
//   async function obtenerGastosHormiga(periodo) {
//     let consulta = sbClient.from('gastos_hormiga').select('id, concepto, monto_mensual, fecha');
//     if (periodo) {
//       const { desde, hasta } = _rangoDelPeriodo(periodo);
//       consulta = consulta.gte('fecha', desde).lt('fecha', hasta);
//     }
//     const { data, error } = await consulta;
//     if (error) throw error;
//     return data.map(function (fila) {
//       return { id: fila.id, concepto: fila.concepto, montoMensual: fila.monto_mensual, fecha: fila.fecha };
//     });
//   }
async function obtenerGastosHormiga(periodo) {
  return _filtrarPorPeriodo(_leer(_CLAVES.gastosHormiga), periodo);
}

//   async function agregarGastoHormiga(datos) {
//     const { data, error } = await sbClient
//       .from('gastos_hormiga')
//       .insert({ concepto: datos.concepto, monto_mensual: datos.montoMensual, fecha: new Date().toISOString() })
//       .select('id, concepto, monto_mensual, fecha')
//       .single();
//     if (error) throw error;
//     return { id: data.id, concepto: data.concepto, montoMensual: data.monto_mensual, fecha: data.fecha };
//   }
async function agregarGastoHormiga(datos) {
  return _agregar(_CLAVES.gastosHormiga, {
    concepto: datos.concepto,
    montoMensual: datos.montoMensual
  });
}

//   async function eliminarGastoHormiga(id) {
//     const { error } = await sbClient.from('gastos_hormiga').delete().eq('id', id);
//     if (error) throw error;
//   }
async function eliminarGastoHormiga(id) {
  _eliminar(_CLAVES.gastosHormiga, id);
}

// ---------------------------------------------------------------------------
// Deudas
// ---------------------------------------------------------------------------

// Las deudas no se filtran por mes: son un saldo vigente, no un movimiento del
// periodo. Por eso obtenerDeudas() no recibe periodo.
//
//   async function obtenerDeudas() {
//     const { data, error } = await sbClient
//       .from('deudas')
//       .select('id, nombre, saldo, tasa_ea, pago_minimo, fecha');
//     if (error) throw error;
//     return data.map(function (fila) {
//       return {
//         id: fila.id, nombre: fila.nombre, saldo: fila.saldo,
//         tasaEA: fila.tasa_ea, pagoMinimo: fila.pago_minimo, fecha: fila.fecha
//       };
//     });
//   }
async function obtenerDeudas() {
  return _leer(_CLAVES.deudas);
}

//   async function agregarDeuda(datos) {
//     const { data, error } = await sbClient
//       .from('deudas')
//       .insert({
//         nombre: datos.nombre,
//         saldo: datos.saldo,
//         tasa_ea: datos.tasaEA,
//         pago_minimo: datos.pagoMinimo,
//         fecha: new Date().toISOString()
//       })
//       .select('id, nombre, saldo, tasa_ea, pago_minimo, fecha')
//       .single();
//     if (error) throw error;
//     return {
//       id: data.id, nombre: data.nombre, saldo: data.saldo,
//       tasaEA: data.tasa_ea, pagoMinimo: data.pago_minimo, fecha: data.fecha
//     };
//   }
async function agregarDeuda(datos) {
  return _agregar(_CLAVES.deudas, {
    nombre: datos.nombre,
    saldo: datos.saldo,
    tasaEA: datos.tasaEA,
    pagoMinimo: datos.pagoMinimo
  });
}

//   async function eliminarDeuda(id) {
//     const { error } = await sbClient.from('deudas').delete().eq('id', id);
//     if (error) throw error;
//   }
async function eliminarDeuda(id) {
  _eliminar(_CLAVES.deudas, id);
}

// =============================================================================
// SOLO PRUEBAS: almacenamiento en localStorage y datos sembrados.
// Todo lo de aca abajo se puede borrar al conectar Supabase (menos
// _rangoDelPeriodo, que le sirve a las consultas por mes).
// =============================================================================

// Si localStorage no esta disponible (navegacion privada, bloqueado por el
// navegador) los datos quedan en memoria mientras la pagina este abierta.
const _memoria = {};
const _hayLocalStorage = (function () {
  try {
    localStorage.setItem('endeudados.prueba', '1');
    localStorage.removeItem('endeudados.prueba');
    return true;
  } catch (error) {
    return false;
  }
})();

function _leer(clave) {
  if (!_hayLocalStorage) {
    return (_memoria[clave] || []).slice();
  }
  try {
    const lista = JSON.parse(localStorage.getItem(clave) || '[]');
    return Array.isArray(lista) ? lista : [];
  } catch (error) {
    // Dato corrupto en el navegador: se ignora en vez de romper la pantalla
    return [];
  }
}

function _guardar(clave, lista) {
  if (!_hayLocalStorage) {
    _memoria[clave] = lista;
    return;
  }
  try {
    localStorage.setItem(clave, JSON.stringify(lista));
  } catch (error) {
    throw new Error('No se pudo guardar el registro en este navegador.');
  }
}

// Agrega el id y la fecha, que en Supabase pondria la base
function _agregar(clave, campos) {
  const registro = Object.assign({ id: _nuevoId() }, campos, { fecha: new Date().toISOString() });
  _guardar(clave, _leer(clave).concat(registro));
  return registro;
}

function _eliminar(clave, id) {
  _guardar(clave, _leer(clave).filter(function (registro) { return registro.id !== id; }));
}

function _nuevoId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Compara con la fecha local del usuario, no con la de UTC
function _filtrarPorPeriodo(registros, periodo) {
  if (!periodo) {
    return registros;
  }
  return registros.filter(function (registro) {
    const fecha = new Date(registro.fecha);
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    return `${fecha.getFullYear()}-${mes}` === periodo;
  });
}

// '2026-09' -> { desde: inicio de septiembre, hasta: inicio de octubre } en ISO,
// util para filtrar por rango de fechas en la consulta a la base.
function _rangoDelPeriodo(periodo) {
  const [anio, mes] = periodo.split('-').map(Number);
  return {
    desde: new Date(anio, mes - 1, 1).toISOString(),
    hasta: new Date(anio, mes, 1).toISOString()
  };
}

// ---------------------------------------------------------------------------
// Semilla de datos de prueba
//
// Se siembra una sola vez por navegador (queda la marca 'endeudados.sembrado'),
// y solo si las cuatro entidades estan vacias. Asi la pantalla se ve llena para
// probar tablas y calculos, pero no reaparecen registros que el usuario borro.
//
// Para volver a sembrar desde la consola del navegador:
//   localStorage.clear(); location.reload();
// ---------------------------------------------------------------------------

const _CLAVE_SEMBRADO = 'endeudados.sembrado';

// Fecha del dia indicado del mes actual, sin pasarse de hoy
function _fechaDelMes(dia) {
  const hoy = new Date();
  const fecha = new Date(hoy.getFullYear(), hoy.getMonth(), Math.min(dia, hoy.getDate()), 9, 0, 0);
  return fecha.toISOString();
}

function _sembrarDatosDePrueba() {
  const yaSembro = _hayLocalStorage && localStorage.getItem(_CLAVE_SEMBRADO) === '1';
  const hayAlgo = Object.keys(_CLAVES).some(function (entidad) {
    return _leer(_CLAVES[entidad]).length > 0;
  });

  if (yaSembro || hayAlgo) {
    return;
  }

  const semilla = {
    ingresos: [
      { concepto: 'Salario', monto: 3200000, fecha: _fechaDelMes(1) },
      { concepto: 'Clases particulares', monto: 380000, fecha: _fechaDelMes(8) },
      { concepto: 'Freelance diseño', monto: 650000, fecha: _fechaDelMes(15) }
    ],
    gastos: [
      { concepto: 'Arriendo', categoria: 'vivienda', monto: 1100000, fecha: _fechaDelMes(2) },
      { concepto: 'Mercado del mes', categoria: 'alimentacion', monto: 620000, fecha: _fechaDelMes(3) },
      { concepto: 'Transmilenio', categoria: 'transporte', monto: 160000, fecha: _fechaDelMes(5) },
      { concepto: 'Luz, agua e internet', categoria: 'servicios', monto: 185000, fecha: _fechaDelMes(10) },
      { concepto: 'EPS y medicamentos', categoria: 'salud', monto: 120000, fecha: _fechaDelMes(12) }
    ],
    gastosHormiga: [
      { concepto: 'Café de la mañana', montoMensual: 190000, fecha: _fechaDelMes(4) },
      { concepto: 'Suscripciones de streaming', montoMensual: 95000, fecha: _fechaDelMes(6) },
      { concepto: 'Domicilios de comida', montoMensual: 140000, fecha: _fechaDelMes(11) }
    ],
    deudas: [
      { nombre: 'Tarjeta de crédito', saldo: 2400000, tasaEA: 42.5, pagoMinimo: 180000, fecha: _fechaDelMes(1) },
      { nombre: 'Compra del celular a cuotas', saldo: 1150000, tasaEA: 28.4, pagoMinimo: 130000, fecha: _fechaDelMes(1) },
      { nombre: 'Crédito educativo', saldo: 6800000, tasaEA: 12.9, pagoMinimo: 250000, fecha: _fechaDelMes(1) }
    ]
  };

  Object.keys(semilla).forEach(function (entidad) {
    const registros = semilla[entidad].map(function (campos) {
      return Object.assign({ id: _nuevoId() }, campos);
    });
    _guardar(_CLAVES[entidad], registros);
  });

  if (_hayLocalStorage) {
    localStorage.setItem(_CLAVE_SEMBRADO, '1');
  }
}

_sembrarDatosDePrueba();
