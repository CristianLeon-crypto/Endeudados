// Capa de datos del modulo Ingresos y Gastos.
//
// HOY: los registros se guardan en el localStorage del navegador. Son datos de
// prueba para poder usar la pantalla sin backend.
//
// PARA CONECTAR SUPABASE: reemplazar el cuerpo de las funciones publicas de
// este archivo (las que no empiezan con "_"). inGas.js y calculos.js no
// necesitan cambios mientras se respete este contrato:
//
//   - Todas las funciones son async, igual que las del SDK de Supabase.
//   - Si algo falla, lanzan un Error. La pantalla lo atrapa y muestra un
//     mensaje; no hay que manejar la UI desde aca.
//   - periodo es un texto 'AAAA-MM' (ej. '2026-09').
//   - monto es un numero entero de pesos (COP), nunca un texto.
//   - fecha es un texto ISO 8601.
//   - Un ingreso: { id, concepto, monto, fecha }
//   - Un gasto:   { id, concepto, categoria, monto, fecha }
//                 donde categoria es el id de una de obtenerCategorias().
//   - Una categoria: { id, nombre }
//   - crearIngreso / crearGasto devuelven el registro ya guardado, con su id.
//
// Si las columnas de la tabla se llaman distinto, se traducen aca adentro
// (ej. created_at -> fecha) para que el resto del modulo no se entere.
//
// Ejemplo de referencia (nombres de tabla y columnas por confirmar):
//
//   async function obtenerIngresos(periodo) {
//     const { desde, hasta } = _rangoDelPeriodo(periodo);
//     const { data, error } = await sbClient
//       .from('ingresos')
//       .select('id, concepto, monto, fecha')
//       .gte('fecha', desde)
//       .lt('fecha', hasta);
//     if (error) throw error;
//     return data;
//   }
//
// El usuario no se pasa como parametro: con sesion iniciada, las politicas de
// RLS de la base ya limitan las filas a las del usuario autenticado.

const _CLAVE_INGRESOS = 'endeudados.ingresos';
const _CLAVE_GASTOS = 'endeudados.gastos';

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

// ---------------------------------------------------------------------------
// Categorias de gasto esencial
// ---------------------------------------------------------------------------

// IMPORTANTE: estos id y nombres DEBEN coincidir exactamente con las
// categorias que se configuren en Supabase (mismo id, mismas tildes y
// mayusculas). Si no coinciden, los gastos guardados quedan con una categoria
// que la pantalla no reconoce y la validacion rechaza categorias validas.
// Al conectar la base, lo ideal es leerlas de la tabla en vez de dejarlas aca.
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

async function obtenerIngresos(periodo) {
  return _filtrarPorPeriodo(_leer(_CLAVE_INGRESOS), periodo);
}

async function crearIngreso(datos) {
  const ingreso = {
    id: _nuevoId(),
    concepto: datos.concepto,
    monto: datos.monto,
    fecha: new Date().toISOString()
  };
  _guardar(_CLAVE_INGRESOS, _leer(_CLAVE_INGRESOS).concat(ingreso));
  return ingreso;
}

async function eliminarIngreso(id) {
  _guardar(_CLAVE_INGRESOS, _leer(_CLAVE_INGRESOS).filter(function (r) { return r.id !== id; }));
}

// ---------------------------------------------------------------------------
// Gastos esenciales (EN-5)
// ---------------------------------------------------------------------------

async function obtenerGastos(periodo) {
  return _filtrarPorPeriodo(_leer(_CLAVE_GASTOS), periodo);
}

async function crearGasto(datos) {
  const gasto = {
    id: _nuevoId(),
    concepto: datos.concepto,
    categoria: datos.categoria,
    monto: datos.monto,
    fecha: new Date().toISOString()
  };
  _guardar(_CLAVE_GASTOS, _leer(_CLAVE_GASTOS).concat(gasto));
  return gasto;
}

async function eliminarGasto(id) {
  _guardar(_CLAVE_GASTOS, _leer(_CLAVE_GASTOS).filter(function (r) { return r.id !== id; }));
}

// ---------------------------------------------------------------------------
// Auxiliares del almacenamiento de prueba. Se pueden borrar al conectar
// Supabase (salvo _rangoDelPeriodo, si sirve para las consultas).
// ---------------------------------------------------------------------------

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

function _nuevoId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Compara con la fecha local del usuario, no con la de UTC
function _filtrarPorPeriodo(registros, periodo) {
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
