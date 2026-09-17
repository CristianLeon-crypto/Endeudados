// Logica pura del modulo Ingresos y Gastos: calculos, validaciones y formato.
//
// Nada de aca toca el DOM ni sabe de donde vienen los datos. Recibe listas de
// registros { concepto, monto, ... } y devuelve numeros o textos, asi que
// funciona igual con los datos de prueba de hoy que con los de Supabase.

// Tope de seguridad para un monto: 1 billon de pesos. Evita que un error de
// tipeo (ceros de mas) dispare los totales.
const MONTO_MAXIMO = 1000000000000;
const LARGO_MAXIMO_CONCEPTO = 60;

const formatoPesos = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

const formatoMiles = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

// ---------------------------------------------------------------------------
// Calculos (EN-6)
// ---------------------------------------------------------------------------

function sumarMontos(registros) {
  return registros.reduce(function (total, registro) {
    return total + registro.monto;
  }, 0);
}

// Todo lo que muestra la seccion de resumen sale de aca.
//
// estado:
//   'vacio'         no hay ingresos ni gastos
//   'sin-ingresos'  hay gastos pero ningun ingreso (el porcentaje no existe)
//   'excedido'      los gastos esenciales superan los ingresos
//   'justo'         los gastos se comen exactamente todo el ingreso
//   'normal'        queda dinero disponible
function calcularResumen(ingresos, gastos) {
  const totalIngresos = sumarMontos(ingresos);
  const totalGastos = sumarMontos(gastos);
  const disponible = totalIngresos - totalGastos;

  // Con ingresos en cero el porcentaje seria una division por cero: se deja en
  // null y la pantalla muestra un texto en vez de un numero.
  const porcentajeGastos = totalIngresos > 0 ? (totalGastos / totalIngresos) * 100 : null;

  let estado = 'normal';
  if (totalIngresos === 0 && totalGastos === 0) {
    estado = 'vacio';
  } else if (totalIngresos === 0) {
    estado = 'sin-ingresos';
  } else if (disponible < 0) {
    estado = 'excedido';
  } else if (disponible === 0) {
    estado = 'justo';
  }

  return { totalIngresos, totalGastos, disponible, porcentajeGastos, estado };
}

// ---------------------------------------------------------------------------
// Validaciones (EN-4, EN-5)
// ---------------------------------------------------------------------------

// Convierte lo que el usuario escribio en un numero de pesos.
// Acepta "1500000", "1.500.000" y "$ 1.500.000". Rechaza centavos y cualquier
// otra cosa devolviendo NaN, para no adivinar que quiso decir con "1,5".
function parsearMonto(texto) {
  const limpio = String(texto).replace(/[\s$]/g, '');
  const soloDigitos = /^\d+$/;
  const conPuntosDeMiles = /^\d{1,3}(\.\d{3})+$/;

  if (!soloDigitos.test(limpio) && !conPuntosDeMiles.test(limpio)) {
    return NaN;
  }
  return Number(limpio.replace(/\./g, ''));
}

function validarConcepto(texto) {
  const concepto = String(texto).trim();
  if (!concepto) {
    return { error: 'Escribe un concepto.' };
  }
  if (concepto.length > LARGO_MAXIMO_CONCEPTO) {
    return { error: `El concepto puede tener máximo ${LARGO_MAXIMO_CONCEPTO} caracteres.` };
  }
  return { valor: concepto };
}

function validarMonto(texto) {
  if (!String(texto).trim()) {
    return { error: 'Escribe el monto.' };
  }
  const monto = parsearMonto(texto);
  if (Number.isNaN(monto)) {
    return { error: 'Escribe el monto en pesos, solo números y sin centavos. Ej. 1.500.000' };
  }
  if (monto <= 0) {
    return { error: 'El monto debe ser mayor que cero.' };
  }
  if (monto > MONTO_MAXIMO) {
    return { error: 'Ese monto es demasiado alto. Revisa que no sobren ceros.' };
  }
  return { valor: monto };
}

// Junta los resultados de cada campo en { valido, errores, datos }.
// errores tiene una llave por campo con problema; datos trae los valores ya
// limpios, listos para mandar a la capa de datos.
function armarResultado(campos) {
  const errores = {};
  const datos = {};

  Object.keys(campos).forEach(function (nombre) {
    if (campos[nombre].error) {
      errores[nombre] = campos[nombre].error;
    } else {
      datos[nombre] = campos[nombre].valor;
    }
  });

  return { valido: Object.keys(errores).length === 0, errores, datos };
}

function validarIngreso(entrada) {
  return armarResultado({
    concepto: validarConcepto(entrada.concepto),
    monto: validarMonto(entrada.monto)
  });
}

// categorias: lista de { id, nombre } tal como la devuelve la capa de datos.
function validarGasto(entrada, categorias) {
  const existe = categorias.some(function (categoria) {
    return categoria.id === entrada.categoria;
  });

  return armarResultado({
    concepto: validarConcepto(entrada.concepto),
    categoria: existe ? { valor: entrada.categoria } : { error: 'Selecciona una categoría.' },
    monto: validarMonto(entrada.monto)
  });
}

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

function formatearPesos(valor) {
  return formatoPesos.format(valor);
}

// "1500000" -> "1.500.000", para mostrar dentro del input
function formatearMiles(valor) {
  return formatoMiles.format(valor);
}

// Menos de 10% se muestra con un decimal para que un gasto pequeño no aparezca
// como "0 %".
function formatearPorcentaje(porcentaje) {
  if (porcentaje === null) {
    return 'Sin datos';
  }
  const decimales = porcentaje > 0 && porcentaje < 10 ? 1 : 0;
  return porcentaje.toLocaleString('es-CO', { maximumFractionDigits: decimales }) + '%';
}

// Periodo en formato 'AAAA-MM' segun la hora local del usuario (no UTC: a las
// 8 p. m. del 30 en Colombia ya es el dia 1 en UTC).
function periodoDeFecha(fecha) {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}`;
}

// '2026-09' -> 'septiembre de 2026'
function nombreDelPeriodo(periodo) {
  const [anio, mes] = periodo.split('-').map(Number);
  return new Date(anio, mes - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
}
