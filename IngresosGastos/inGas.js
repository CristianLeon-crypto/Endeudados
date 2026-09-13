// Si la página fue recargada (F5), devolver al usuario a la landing
if (performance.getEntriesByType('navigation')[0]?.type === 'reload') {
  window.location.replace('../index.html');
}
