/* Panel de la nota mensual de Multibett: cruza sus líneas con la app de partes.
   Usa de la app: capturarEstado, getHistorial, cruceDoc, lineas, lineasId, documentoEnEdicion y las funciones de pintado. */
(function (root) {
  'use strict';
  var URL_PARTES = 'https://kseyndjbmkaflpoqitsj.supabase.co', CLAVE_PARTES = 'sb_publishable_CbwajQX7DgAoK3fV6GVU5g_18CWeqMG';
  var S = { partes: null, cargando: false, error: null, aviso: '', elegidos: {}, cliente: null };

  function cliente() {
    if (!S.cliente) S.cliente = CRUCE.crearClientePartes({ url: URL_PARTES, clave: CLAVE_PARTES, fetch: root.fetch.bind(root), storage: root.localStorage });
    return S.cliente;
  }
  // La función esc de la app solo cubre comillas; aquí entran textos de otra base de datos.
  function eh(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function euros(n) { return Number(n).toFixed(2).replace('.', ',') + ' €'; }
  function fecha(iso) { return iso ? new Date(iso).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' }) : ''; }
  function nombreMes(m) { var p = String(m || '').split('-'), n = CRUCE.MESES[+p[1] - 1]; return n ? n.charAt(0) + n.slice(1).toLowerCase() + ' ' + p[0] : ''; }

  function documento() { var d = capturarEstado(); d.id = documentoEnEdicion; return d; }
  // Si el usuario ha dicho cuál de los repetidos es, el otro no participa en el cruce.
  function partesCruce() {
    return S.partes.filter(function (p) { var e = S.elegidos[CRUCE.normRef(p.expediente)]; return !e || e === p.id; });
  }
  function calcular(d) { return CRUCE.cruzar({ nota: d, notas: getHistorial(), partes: partesCruce(), ignoradas: cruceDoc.cruce_ignoradas || [] }); }

  function estilos() {
    if (document.getElementById('cruceEstilos')) return;
    var e = document.createElement('style'); e.id = 'cruceEstilos';
    e.textContent = '#crucePanel{margin:0 0 12px;font-size:13px;color:var(--text)}'
      + '#crucePanel:empty{display:none}'
      + '.cr-caja{border:1px solid var(--border-strong);border-radius:8px;padding:10px 12px;background:var(--surface)}'
      + '.cr-cab{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:6px}'
      + '.cr-cab b{font-size:14px}'
      + '.cr-mes{display:flex;gap:6px;align-items:center;font-size:12px;color:var(--text-muted)}'
      + '.cr-mes input,.cr-form input{font:inherit;font-size:16px;padding:4px 6px;border:1px solid var(--border-strong);border-radius:5px;background:transparent;color:var(--text);max-width:100%;box-sizing:border-box}'
      + '.cr-form{display:flex;flex-wrap:wrap;gap:6px;align-items:center}'
      + '.cr-form input{flex:1 1 150px;min-width:0}'
      + '#crucePanel button{font:inherit;font-size:12px;padding:5px 10px;border-radius:14px;border:1px solid var(--border-strong);background:transparent;color:var(--text);cursor:pointer}'
      + '#crucePanel button.cr-prin{background:var(--green);border-color:var(--green);color:#fff}'
      + '#crucePanel details{border-top:1px solid var(--border);padding:6px 0}'
      + '#crucePanel summary{cursor:pointer;font-weight:600}'
      + '.cr-fila{display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:space-between;padding:5px 0 5px 8px}'
      + '.cr-txt{flex:1 1 200px;min-width:0;overflow-wrap:anywhere}'
      + '.cr-txt small{color:var(--text-muted)}'
      + '.cr-ok{color:var(--green);padding:4px 0}'
      + '.cr-aviso{color:var(--text-muted);margin:4px 0}'
      + '@media print{#crucePanel{display:none}}';
    document.head.appendChild(e);
  }

  function boton(cruce, texto, datos, prin) {
    var a = ''; Object.keys(datos || {}).forEach(function (k) { a += ' data-' + k + '="' + eh(datos[k]) + '"'; });
    return '<button type="button" data-cruce="' + cruce + '"' + a + (prin ? ' class="cr-prin"' : '') + '>' + eh(texto) + '</button>';
  }
  function fila(html, acciones) { return '<div class="cr-fila"><div class="cr-txt">' + html + '</div>' + (acciones || '') + '</div>'; }
  function grupo(id, titulo, filas, abierto, cab) {
    return '<details data-grupo="' + id + '" data-n="' + filas.length + '"' + (filas.length ? '' : ' hidden') + (abierto ? ' open' : '') + '><summary>' + eh(titulo) + ' (' + filas.length + ')</summary>' + (cab || '') + filas.join('') + '</details>';
  }
  function datosParte(p) {
    var imp = CRUCE.importeParte(p), trozos = [p.direccion, p.poblacion].filter(Boolean).map(eh);
    if (p.realizado_at) trozos.push('terminado ' + fecha(p.realizado_at));
    if (imp !== null) trozos.push(euros(imp));
    return '<b>' + eh(p.expediente) + '</b> <small>' + trozos.join(' · ') + '</small>';
  }
  function datosBloque(b, extra) { return '<b>' + eh(b.refOriginal.trim()) + '</b> <small>' + [eh(b.dir), extra].filter(Boolean).join(' · ') + '</small>'; }

  function htmlGrupos(r) {
    var ign = cruceDoc.cruce_ignoradas || [];
    var problemas = r.faltan.length + r.sinTerminar.length + r.erratas.length + r.varios.length + r.enOtra.length + r.pendientesMover.length + r.diferencias.length + r.noExisten.length;
    var h = problemas ? '' : '<div class="cr-ok">✓ Todo cuadra con la app de partes</div>';
    h += grupo('faltan', 'Faltan en la nota', r.faltan.map(function (p) { return fila(datosParte(p), boton('anadir', 'Añadir', { id: p.id }, true)); }), true,
      r.faltan.length > 1 ? '<div class="cr-fila">' + boton('anadirTodos', 'Añadir todos', {}, true) + '</div>' : '');
    h += grupo('sinTerminar', 'En la nota, con el parte sin terminar', r.sinTerminar.map(function (x) { return fila(datosBloque(x.bloque, 'en partes: ' + eh(x.parte.estado))); }), true);
    h += grupo('erratas', 'Posibles erratas', r.erratas.map(function (x) { return fila(datosBloque(x.bloque, 'en partes pone <b>' + eh(x.parte.expediente) + '</b>')); }), true);
    h += grupo('varios', 'Referencias con varios partes', r.varios.map(function (x) {
      return fila(datosBloque(x.bloque, '¿cuál es?'), x.partes.map(function (p) { return boton('elegir', [p.direccion, p.poblacion].filter(Boolean).join(', ') || p.estado, { id: p.id, ref: x.bloque.ref }); }).join(''));
    }), true);
    h += grupo('enOtra', 'Están en la nota de otro mes', r.enOtra.map(function (x) { return fila(datosParte(x.parte) + ' <small>· en ' + eh(x.nota.numero) + ' (' + eh(x.nota.referencia) + ')</small>'); }), true);
    h += grupo('pendientesMover', 'Pendientes de mover', r.pendientesMover.map(function (x) { return fila(datosParte(x.parte) + ' <small>· va a ' + eh(nombreMes(x.mesDestino)) + '</small>'); }), true);
    h += grupo('diferencias', 'Importes distintos', r.diferencias.map(function (x) { return fila(datosBloque(x.bloque, 'nota ' + euros(x.baseNota) + ' · partes ' + euros(x.basePartes))); }), false);
    h += grupo('noExisten', 'No existen en partes', r.noExisten.map(function (x) { return fila(datosBloque(x.bloque), boton('ignorar', 'Ignorar en esta nota', { ref: x.bloque.ref })); }), true);
    h += grupo('ignoradas', 'Ignoradas en esta nota', ign.map(function (x) { return fila('<b>' + eh(x) + '</b>', boton('recuperar', 'Recuperar', { ref: x })); }), false);
    h += grupo('coinciden', 'Coinciden', r.coinciden.map(function (x) { return fila(datosParte(x.parte) + (x.otroMes ? ' <small>· terminado en ' + eh(nombreMes(CRUCE.mesEfectivo(x.parte))) + '</small>' : '')); }), false);
    return h;
  }

  function cargar() {
    S.cargando = true; S.error = null;
    cliente().leerPartes().then(function (t) { S.partes = t; }).catch(function (e) { S.partes = null; S.error = e.codigo || 'red'; })
      .then(function () { S.cargando = false; pintar(); });
  }

  var ERRORES = {
    sin_permiso: 'Esta cuenta no puede leer los partes. Entra con la cuenta de administrador de la app de partes.',
    red: 'Sin conexión con la app de partes. La nota funciona igual; reintenta cuando tengas conexión.'
  };

  function pintar() {
    var c = document.getElementById('crucePanel');
    if (!c || !root.CRUCE) return;
    var d = documento();
    if (!CRUCE.esNotaMultibett(d)) { c.innerHTML = ''; c.dataset.listo = ''; return; }
    estilos();
    c.dataset.listo = '';
    var abre = '<div class="cr-caja">', cab = '<div class="cr-cab"><b>🔗 Cruce con partes</b>', cierra = '</div>';
    if (!cliente().haySesion()) {
      c.innerHTML = abre + cab + '</div>' + (S.error === 'sin_sesion' ? '<div class="cr-aviso">La sesión ha caducado.</div>' : '')
        + (S.aviso ? '<div class="cr-aviso">' + eh(S.aviso) + '</div>' : '<div class="cr-aviso">Entra con tu cuenta de administrador de la app de partes.</div>')
        + '<div class="cr-form"><input data-cruce="email" type="email" placeholder="Correo" autocomplete="username"><input data-cruce="pass" type="password" placeholder="Contraseña" autocomplete="current-password">'
        + boton('entrar', 'Entrar', {}, true) + '</div>' + cierra;
      return;
    }
    if (S.error) {
      c.innerHTML = abre + cab + '</div><div data-cruce="error" class="cr-aviso">' + eh(ERRORES[S.error] || ERRORES.red) + '</div><div class="cr-form">' + boton('actualizar', 'Reintentar') + boton('salir', 'Cambiar de cuenta') + '</div>' + cierra;
      return;
    }
    if (!S.partes) {
      c.innerHTML = abre + cab + '</div><div class="cr-aviso">Leyendo los partes…</div>' + cierra;
      if (!S.cargando) cargar();
      return;
    }
    var r = calcular(d);
    c.innerHTML = abre + cab + '<span class="cr-mes">Mes <input data-cruce="mes" type="month" value="' + eh(r.mes) + '"></span>' + boton('actualizar', 'Actualizar') + '</div>' + htmlGrupos(r) + cierra;
    c.dataset.listo = '1';
  }

  function vacia(l) { return l.tipo !== 'titulo' && !l.refParte && !l.dirParte && !l.desc && !l.cod && !l.cant && !l.precio; }

  function anadir(ids) {
    var faltan = calcular(documento()).faltan.filter(function (p) { return !ids || ids.indexOf(p.id) >= 0; });
    if (!faltan.length) return;
    while (lineas.length && vacia(lineas[lineas.length - 1])) lineas.pop();
    faltan.forEach(function (p) {
      CRUCE.bloqueDesdeParte(p, ivaPorDefecto()).forEach(function (l) { l.id = lineasId++; lineas.push(l); });
    });
    document.body.classList.add('modo-parte');
    actualizarBotonModoParte();
    renderLineas(); actualizarTotales(); actualizarPreview(); pintar();
    mostrarToast(faltan.length === 1 ? 'Parte añadido a la nota. Recuerda guardarla' : faltan.length + ' partes añadidos a la nota. Recuerda guardarla', true);
  }

  function entrar(c) {
    var email = c.querySelector('[data-cruce="email"]').value.trim(), pass = c.querySelector('[data-cruce="pass"]').value;
    if (!email || !pass) return;
    S.aviso = 'Comprobando…';
    cliente().entrar(email, pass).then(function (r) {
      S.aviso = r.ok ? '' : r.error; S.error = null; S.partes = null; pintar();
    });
  }

  function alClic(ev) {
    var b = ev.target.closest('button[data-cruce]'); if (!b) return;
    var q = b.dataset.cruce, c = document.getElementById('crucePanel');
    if (q === 'entrar') return entrar(c);
    if (q === 'anadir') return anadir([b.dataset.id]);
    if (q === 'anadirTodos') return anadir(null);
    if (q === 'elegir') { S.elegidos[b.dataset.ref] = b.dataset.id; return pintar(); }
    if (q === 'actualizar') { S.partes = null; S.error = null; return pintar(); }
    if (q === 'salir') { cliente().salir(); S.partes = null; S.error = null; return pintar(); }
    if (q === 'ignorar') { cruceDoc.cruce_ignoradas = (cruceDoc.cruce_ignoradas || []).concat([b.dataset.ref]); return pintar(); }
    if (q === 'recuperar') { cruceDoc.cruce_ignoradas = (cruceDoc.cruce_ignoradas || []).filter(function (x) { return x !== b.dataset.ref; }); return pintar(); }
  }

  var espera = null;
  function alCambiarDocumento(ev) {
    if (ev.target.closest && ev.target.closest('#crucePanel')) return;
    clearTimeout(espera); espera = setTimeout(pintar, 300);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var c = document.getElementById('crucePanel'); if (!c) return;
    c.addEventListener('click', alClic);
    c.addEventListener('change', function (ev) {
      if (ev.target.dataset.cruce !== 'mes') return;
      if (ev.target.value) cruceDoc.mes_factura = ev.target.value; else delete cruceDoc.mes_factura;
      pintar();
    });
    c.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && ev.target.dataset.cruce === 'pass') { ev.preventDefault(); entrar(c); } });
    document.addEventListener('change', alCambiarDocumento);
    setTimeout(pintar, 0);
  });

  root.CRUCE_PANEL = { pintar: pintar };
})(window);
