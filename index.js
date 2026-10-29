const rangoAbono = document.getElementById('abono-extra');
const valorAbono = document.getElementById('abono-valor');
const resultadoMeses = document.getElementById('resultado-meses');
const resultadoAhorro = document.getElementById('resultado-ahorro');

const inputSaldo = document.getElementById('deuda-saldo');
const inputTasaEA = document.getElementById('deuda-tasa-ea');
const inputPagoMinimo = document.getElementById('deuda-pago-minimo');

if (rangoAbono && inputSaldo && inputTasaEA && inputPagoMinimo) {
  const maximoMeses = 600;

  // Valores iniciales de ejemplo
  inputSaldo.value = 3000000;
  inputTasaEA.value = 42;
  inputPagoMinimo.value = 150000;

  function simular(saldoInicial, tasaEA, pagoMinimo, abonoExtra) {
    const tasaMensual = Math.pow(1 + tasaEA, 1 / 12) - 1;
    const pago = pagoMinimo + abonoExtra;

    // Si el pago no supera los intereses iniciales, el saldo no se reduce.
    if (pago <= saldoInicial * tasaMensual) {
      return { estado: 'no_amortiza' };
    }

    let saldo = saldoInicial;
    let meses = 0;
    let interesesTotales = 0;

    while (saldo > 0 && meses < maximoMeses) {
      const interes = saldo * tasaMensual;
      interesesTotales += interes;
      saldo += interes;
      saldo -= Math.min(pago, saldo);
      meses++;
    }

    if (saldo > 0) {
      return { estado: 'limite' };
    }

    return { estado: 'pagada', meses, interesesTotales };
  }

  function actualizarSimulador() {
    const abono = Number(rangoAbono.value);
    const saldoInicial = Number(inputSaldo.value);
    const tasaEA = Number(inputTasaEA.value) / 100; // el input viene en %
    const pagoMinimo = Number(inputPagoMinimo.value);

    valorAbono.textContent =
      `$${abono.toLocaleString('es-CO')} COP/mes`;

    if (!(saldoInicial > 0) || !(tasaEA > 0) || !(pagoMinimo >= 0)) {
      resultadoMeses.textContent = 'Completa los datos de la deuda';
      resultadoAhorro.textContent = 'No disponible';
      return;
    }

    const conExtra = simular(saldoInicial, tasaEA, pagoMinimo, abono);
    const sinExtra = simular(saldoInicial, tasaEA, pagoMinimo, 0);

    if (conExtra.estado === 'pagada') {
      resultadoMeses.textContent = `${conExtra.meses} meses`;
    } else if (conExtra.estado === 'no_amortiza') {
      resultadoMeses.textContent = 'El pago no cubre los intereses';
    } else {
      resultadoMeses.textContent =
        `No se termina en ${maximoMeses} meses`;
    }

    if (conExtra.estado === 'pagada' && sinExtra.estado === 'pagada') {
      const ahorro = Math.max(
        0,
        sinExtra.interesesTotales - conExtra.interesesTotales
      );

      resultadoAhorro.textContent =
        `$${ahorro.toLocaleString('es-CO')}`;
    } else {
      resultadoAhorro.textContent = 'No disponible';
    }
  }

  rangoAbono.addEventListener('input', actualizarSimulador);
  [inputSaldo, inputTasaEA, inputPagoMinimo].forEach(function (input) {
    input.addEventListener('input', actualizarSimulador);
  });

  actualizarSimulador();
}