// Lógica del simulador de deuda (método avalancha simplificado)
const rangoAbono = document.getElementById('abono-extra');
const valorAbono = document.getElementById('abono-valor');
const resultadoMeses = document.getElementById('resultado-meses');
const resultadoAhorro = document.getElementById('resultado-ahorro');

if (rangoAbono) {
  const deudaBase = 3000000; // supuesto: deuda promedio en tarjeta de crédito
  const tasaMensual = 0.035; // ~42% EA aprox mensualizada
  const pagoMinimo = 150000;

  function calcularMeses(abonoExtra) {
    let saldo = deudaBase;
    let meses = 0;
    const pago = pagoMinimo + abonoExtra;
    while (saldo > 0 && meses < 120) {
      saldo += saldo * tasaMensual;
      saldo -= pago;
      meses++;
    }
    return meses;
  }

  function actualizarSimulador() {
    const abono = Number(rangoAbono.value);
    valorAbono.textContent = `$${abono.toLocaleString('es-CO')} COP/mes`;

    const mesesConExtra = calcularMeses(abono);
    const mesesSinExtra = calcularMeses(0);
    const ahorro = Math.max(0, (mesesSinExtra - mesesConExtra) * pagoMinimo);

    resultadoMeses.textContent = `${mesesConExtra} meses`;
    resultadoAhorro.textContent = `$${ahorro.toLocaleString('es-CO')}`;
  }

  rangoAbono.addEventListener('input', actualizarSimulador);
  actualizarSimulador();
}
