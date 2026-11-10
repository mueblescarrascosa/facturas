/* Panel de la nota mensual de Multibett: cruza sus líneas con la app de partes.
   Usa de la app: capturarEstado, getHistorial, cruceDoc, lineas, lineasId, documentoEnEdicion y las funciones de pintado. */
(function (root) {
  'use strict';
  var URL_PARTES = 'https://kseyndjbmkaflpoqitsj.supabase.co', CLAVE_PARTES = 'sb_publishable_CbwajQX7DgAoK3fV6GVU5g_18CWeqMG';
  var S = { partes: null, cargando: false, error: null, aviso: '', elegidos: {}, cliente: null, huella: {}, cola: Promise.resolve(), pendientes: [], num: 0, msg: '' };

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
      + '.cr-acc{display:flex;flex-wrap:wrap;gap:6px;align-items:center}'
      + '.cr-acc input{font:inherit;font-size:13px;padding:3px 4px;border:1px solid var(--border-strong);border-radius:5px;background:transparent;color:var(--text);max-width:150px}'
      + '.cr-ok{color:var(--green);padding:4px 0}'
      + '.cr-aviso{color:var(--text-muted);margin:4px 0}'
      + '@media print{#crucePanel{display:none}}';
    document.head.appendChild(e);
  }

  function boton(cruce, texto, datos, prin) {
    var a = ''; Object.keys(datos || {}).forEach(function (k) { a += ' data-' + k + '="' + eh(datos[k]) + '"'; });
    return '<button type="button" data-cruce="' + cruce + '"' + a + (prin ? ' class="cr-prin"' : '') + '>' + eh(texto) + '</button>';
  }
  function fila(html, acciones) { return '<div class="cr-fila"><div class="cr-txt">' + html + '</div>' + (acciones ? '<div class="cr-acc">' + acciones + '</div>' : '') + '</div>'; }
  function claveDif(x) { return x.baseNota + '|' + x.basePartes; }
  function difVisibles(r) { var ac = cruceDoc.cruce_aceptadas || {}; return r.diferencias.filter(function (x) { return ac[x.bloque.ref] !== claveDif(x); }); }
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

  function candidatos(d) { return CRUCE.candidatosRelleno({ nota: d, partes: partesCruce(), ignoradas: cruceDoc.cruce_ignoradas || [] }); }
  function plural(n) { return n + (n === 1 ? ' parte' : ' partes'); }

  // El mes de la nota donde ya está el parte, o '' si es el mismo de la nota abierta.
  function mesOtraNota(r, x) { var m = CRUCE.mesDeNota(x.nota); return m && m !== r.mes ? m : ''; }

  function htmlGrupos(r, nPasar) {
    var ign = cruceDoc.cruce_ignoradas || [], difs = difVisibles(r);
    var problemas = r.faltan.length + r.sinTerminar.length + r.erratas.length + r.varios.length + r.enOtra.length + r.pendientesMover.length + difs.length + r.noExisten.length + S.pendientes.length;
    var h = problemas ? '' : '<div class="cr-ok">✓ Todo cuadra con la app de partes</div>';
    if (nPasar) h += '<div class="cr-fila"><div class="cr-txt"><small>' + plural(nPasar) + ' sin líneas en la app de partes</small></div>' + boton('pasarImportes', 'Pasar importes a partes (' + nPasar + ')', {}, true) + '</div>';
    h += grupo('pendientesEscribir', 'Sin pasar a la app de partes', S.pendientes.map(function (x) { return fila('<b>' + eh(x.expediente) + '</b> <small>' + eh(x.nota) + '</small>', boton('reintentar', 'Reintentar', { num: x.num }, true)); }), true);
    h += grupo('faltan', 'Faltan en la nota', r.faltan.map(function (p) {
      return fila(datosParte(p), boton('anadir', 'Añadir', { id: p.id }, true) + '<input type="month" title="Llevar a otro mes" aria-label="Llevar a otro mes" data-cruce="otroMes" data-id="' + eh(p.id) + '">');
    }), true, r.faltan.length > 1 ? '<div class="cr-fila">' + boton('anadirTodos', 'Añadir todos', {}, true) + '</div>' : '');
    h += grupo('sinTerminar', 'En la nota, con el parte sin terminar', r.sinTerminar.map(function (x) { return fila(datosBloque(x.bloque, 'en partes: ' + eh(x.parte.estado)), boton('terminar', 'Marcar terminado', { id: x.parte.id })); }), true);
    h += grupo('erratas', 'Posibles erratas', r.erratas.map(function (x) {
      return fila(datosBloque(x.bloque, 'en partes pone <b>' + eh(x.parte.expediente) + '</b>'), boton('erratanota', 'Corregir la nota', { id: x.parte.id, ref: x.bloque.ref }) + boton('erratapartes', 'Corregir partes', { id: x.parte.id, ref: x.bloque.ref }));
    }), true);
    h += grupo('varios', 'Referencias con varios partes', r.varios.map(function (x) {
      return fila(datosBloque(x.bloque, '¿cuál es?'), x.partes.map(function (p) { return boton('elegir', [p.direccion, p.poblacion].filter(Boolean).join(', ') || p.estado, { id: p.id, ref: x.bloque.ref }); }).join(''));
    }), true);
    var aOtroMes = r.enOtra.filter(function (x) { return mesOtraNota(r, x); });
    h += grupo('enOtra', 'Están en la nota de otro mes', r.enOtra.map(function (x) {
      var m = mesOtraNota(r, x);
      return fila(datosParte(x.parte) + ' <small>· en ' + eh(x.nota.numero) + ' (' + eh(x.nota.referencia) + ')</small>', (m ? boton('aMesNota', 'Pasar a ' + nombreMes(m), { id: x.parte.id }, true) : '') + boton('traer', 'Traer a esta', { id: x.parte.id, ref: x.bloque.ref, nota: x.nota.id }));
    }), true, aOtroMes.length > 1 ? '<div class="cr-fila">' + boton('aMesNotaTodos', 'Pasar todos al mes de su nota (' + aOtroMes.length + ')', {}, true) + '</div>' : '');
    h += grupo('pendientesMover', 'Pendientes de mover', r.pendientesMover.map(function (x) {
      return fila(datosParte(x.parte) + ' <small>· de ' + eh(x.nota.referencia) + ' a ' + eh(nombreMes(x.mesDestino)) + '</small>', boton('mover', 'Mover', { id: x.parte.id, ref: x.bloque.ref, nota: x.nota.id === undefined || x.nota.id === null ? '' : x.nota.id, mes: x.mesDestino }, true));
    }), true);
    h += grupo('diferencias', 'Importes distintos', difs.map(function (x) {
      return fila(datosBloque(x.bloque, 'nota ' + euros(x.baseNota) + ' · partes ' + euros(x.basePartes)), boton('usarNota', 'Vale la nota', { id: x.parte.id, ref: x.bloque.ref })
        + (CRUCE.lineasDeParte(x.parte).length ? boton('usarPartes', 'Valen las de partes', { id: x.parte.id, ref: x.bloque.ref }) : ''));
    }), true);
    var crear = r.noExisten.filter(function (x) { return CRUCE.aseguradoraDe(x.bloque.ref); });
    h += grupo('noExisten', 'No existen en partes', r.noExisten.map(function (x) {
      return fila(datosBloque(x.bloque), (CRUCE.aseguradoraDe(x.bloque.ref) ? boton('crearParte', 'Crear en partes', { ref: x.bloque.ref }, true) : '') + boton('ignorar', 'Ignorar en esta nota', { ref: x.bloque.ref }));
    }), true, crear.length > 1 ? '<div class="cr-fila">' + boton('crearTodos', 'Crear todos en partes (' + crear.length + ')', {}, true) + '</div>' : '');
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
    c.innerHTML = abre + cab + '<span class="cr-mes">Mes <input data-cruce="mes" type="month" value="' + eh(r.mes) + '"></span>'
      + boton('enviada', cruceDoc.enviada_multibett ? '✓ Enviada a Multibett el ' + fecha(cruceDoc.enviada_multibett) : 'Marcar enviada a Multibett') + boton('actualizar', 'Actualizar') + '</div>'
      + (S.msg ? '<div data-cruce="aviso" class="cr-aviso">' + eh(S.msg) + '</div>' : '') + htmlGrupos(r, candidatos(d).length) + cierra;
    c.dataset.listo = '1';
  }

  function parte(id) { return (S.partes || []).filter(function (p) { return p.id === id; })[0]; }

  // Las escrituras van de una en una: cada una necesita la fecha que dejó la anterior.
  function escribir(p, cambios, nota, fase, pendiente) {
    return cliente().escribirParte(p.id, cambios, p.updated_at).then(function (x) {
      if (!x.ok) {
        S.msg = 'El parte ' + p.expediente + ' ha cambiado en la app de partes y no lo he tocado. He vuelto a leer los datos: revísalo y repite.';
        S.partes = null; pintar();
        return false;
      }
      Object.assign(p, x.parte);
      return cliente().anotarEvento(p.id, nota, fase).catch(function () { return null; }).then(function () { pintar(); return true; });
    }).catch(function () {
      if (!pendiente) S.pendientes.push({ num: ++S.num, id: p.id, expediente: p.expediente, cambios: cambios, nota: nota, fase: fase });
      pintar();
      return false;
    });
  }
  function aPartes(p, cambios, nota, fase, pendiente) {
    S.cola = S.cola.then(function () { return escribir(p, cambios, nota, fase, pendiente); });
    return S.cola;
  }
  function textoMes(mes) { return 'Mes de factura: ' + nombreMes(mes).toLowerCase() + ' (desde la app de facturas)'; }
  function confirmaEnviada(docs) {
    if (!docs.some(function (d) { return d.enviada_multibett; })) return true;
    return confirm('Esta nota ya está marcada como enviada a Multibett.\n\nSi la cambias, dejará de coincidir con lo que tienen ellos. ¿Seguir?');
  }

  function confirmaFacturado(lista) {
    var f = lista.filter(function (p) { return p.factura_ref; });
    return !f.length || confirm('En la app de partes ' + (f.length === 1 ? 'el parte ' + f[0].expediente + ' ya está en la factura ' + f[0].factura_ref : 'hay ' + f.length + ' partes ya facturados') + '.\n\n¿Cambiarlo igualmente?');
  }

  function anadir(ids) {
    var d = documento(), faltan = calcular(d).faltan.filter(function (p) { return !ids || ids.indexOf(p.id) >= 0; }), mes = CRUCE.mesDeNota(d);
    if (!faltan.length || !confirmaEnviada([d]) || !confirmaFacturado(faltan)) return;
    while (lineas.length && CRUCE.lineaVacia(lineas[lineas.length - 1])) lineas.pop();
    faltan.forEach(function (p) {
      CRUCE.bloqueDesdeParte(p, ivaPorDefecto()).forEach(function (l) { l.id = lineasId++; lineas.push(l); });
    });
    document.body.classList.add('modo-parte');
    actualizarBotonModoParte();
    renderLineas(); actualizarTotales(); actualizarPreview();
    guardarEnHistorial();
    faltan.forEach(function (p) { if (p.mes_factura !== mes) aPartes(p, { mes_factura: mes }, textoMes(mes)); });
    pintar();
  }

  // Elige la nota del mes de destino. Devuelve null si hay que crearla y false si el usuario cancela.
  function notaDestino(h, origen, mes) {
    var c = CRUCE.notasDelMes(h, mes).filter(function (n) { return n.id !== origen.id; });
    if (c.length < 2) return c[0] || null;
    var num = prompt('Hay varias notas de ' + nombreMes(mes) + ': ' + c.map(function (n) { return n.numero; }).join(', ') + '.\n\n¿A cuál lo paso?', c[0].numero);
    if (num === null) return false;
    var e = c.filter(function (n) { return n.numero === num.trim(); })[0];
    if (!e) { mostrarToast('No encuentro esa nota'); return false; }
    return e;
  }

  // Pasa los bloques de una referencia a otra nota y avisa a partes. Con hastaAbierta, el destino es la nota abierta.
  function mover(idOrigen, ref, p, mes, hastaAbierta) {
    guardarEnHistorial();
    var abierta = documentoEnEdicion, h = getHistorial(), idO = idOrigen === '' || idOrigen === undefined ? abierta : Number(idOrigen);
    var origen = h.filter(function (n) { return n.id === idO; })[0];
    if (!origen) return;
    var destino = hastaAbierta ? h.filter(function (n) { return n.id === abierta; })[0] : notaDestino(h, origen, mes);
    if (destino === false) return;
    var nueva = !destino;
    if (nueva) { destino = CRUCE.crearNotaMes(mes, origen); destino.id = Date.now(); destino.numero = numeroSiguiente(destino.tipo); }
    if (!confirmaEnviada([origen, destino]) || (p && !confirmaFacturado([p]))) return;
    var r = CRUCE.moverBloque(origen, destino, ref), ahora = new Date().toISOString();
    r.origen.guardadoEn = ahora; r.destino.guardadoEn = ahora;
    h = h.map(function (n) { return n.id === r.origen.id ? r.origen : n.id === r.destino.id ? r.destino : n; });
    if (nueva) h.unshift(r.destino);
    saveHistorial(h);
    var ab = h.filter(function (n) { return n.id === abierta; })[0];
    if (ab) cargarEstado(ab);
    renderAccesoRapido();
    if (p && p.mes_factura !== mes) aPartes(p, { mes_factura: mes }, textoMes(mes));
    pintar();
    mostrarToast('Parte pasado a ' + nombreMes(mes), true);
  }

  function aceptarDiferencia(ref) {
    var x = calcular(documento()).diferencias.filter(function (y) { return y.bloque.ref === ref; })[0];
    if (!x) return;
    cruceDoc.cruce_aceptadas = Object.assign({}, cruceDoc.cruce_aceptadas); cruceDoc.cruce_aceptadas[ref] = claveDif(x);
    guardarEnHistorial(); pintar();
  }
  function usarNota(p, ref) {
    if (p.factura_ref && !confirm('Este parte ya está en la factura ' + p.factura_ref + '. ¿Cambiar sus líneas con las de la nota?')) return;
    var bl = CRUCE.bloquesDe(lineas).filter(function (b) { return b.ref === ref; }), ls = [];
    bl.forEach(function (b) { ls = ls.concat(CRUCE.lineasParaPartes(b)); });
    aPartes(p, { lineas_realizadas: ls }, 'Líneas actualizadas con las de la nota ' + (documento().numero || '')).then(function (bien) { if (bien) aceptarDiferencia(ref); });
  }
  function usarPartes(p, ref) {
    var bl = CRUCE.bloquesDe(lineas).filter(function (b) { return b.ref === ref; });
    if (!bl.length) return;
    var nuevas = CRUCE.bloqueDesdeParte(p, ivaPorDefecto());
    nuevas[0].dirParte = bl[0].dir || nuevas[0].dirParte;
    nuevas.forEach(function (l) { l.id = lineasId++; });
    bl.slice().reverse().forEach(function (b, i) { lineas.splice.apply(lineas, [b.inicio, CRUCE.finParte(lineas, b) - b.inicio].concat(i === bl.length - 1 ? nuevas : [])); });
    renderLineas(); actualizarTotales(); actualizarPreview(); guardarEnHistorial();
    aceptarDiferencia(ref); pintar();
  }
  function terminar(p, mes) {
    if (!confirm('¿Marcar el parte ' + p.expediente + ' como terminado en la app de partes?')) return;
    aPartes(p, { estado: 'realizado', realizado_at: new Date().toISOString(), mes_factura: mes }, 'Terminado desde la nota de facturas', 'realizado');
  }
  function erratanota(p, ref) {
    lineas.forEach(function (l) { if (CRUCE.normRef(l.refParte) === ref) l.refParte = CRUCE.normRef(p.expediente); });
    renderLineas(); actualizarPreview(); guardarEnHistorial(); pintar();
  }
  function erratapartes(p, ref) {
    if (!confirm('¿Cambiar el expediente ' + p.expediente + ' por ' + ref + ' en la app de partes?')) return;
    aPartes(p, { expediente: ref }, 'Expediente corregido desde la nota de facturas: antes ponía ' + p.expediente);
  }

  function pasarImportes() {
    var d = documento(), c = candidatos(d);
    if (!c.length || !confirm('¿Pasar las líneas de esta nota a ' + plural(c.length) + ' que no las tienen en la app de partes?')) return;
    fijarHuella(); // ya van aquí: que el guardado no los pase otra vez
    guardarEnHistorial();
    c.forEach(function (x) { aPartes(x.parte, { lineas_realizadas: x.lineas }, 'Líneas traídas de la nota ' + (d.numero || '')); });
  }

  function crearUno(b, d, mes, uid) {
    return cliente().crearParte(CRUCE.parteDesdeBloque(b, { mes: mes, fecha: d.fecha, creado_por: uid })).then(function (n) {
      if (S.partes) S.partes.push(n);
      return cliente().anotarEvento(n.id, 'Creado desde la nota ' + (d.numero || ''), 'realizado').catch(function () { return null; }).then(pintar);
    }).catch(function () {
      // No se sabe si llegó a crearse: se relee para no duplicarlo.
      S.msg = 'No he podido confirmar el alta del parte ' + b.ref + '. He vuelto a leer los datos: comprueba si está antes de repetir.';
      S.partes = null; pintar();
    });
  }
  function crearPartes(bloques) {
    var d = documento(), mes = CRUCE.mesDeNota(d), uid = cliente().usuario();
    if (!bloques.length) return;
    if (!uid) { S.msg = 'Sal y vuelve a entrar con tu cuenta de partes para poder crear partes.'; return pintar(); }
    if (!confirm('¿Crear ' + plural(bloques.length) + ' en la app de partes, como terminados y facturados en ' + nombreMes(mes) + '?')) return;
    guardarEnHistorial();
    bloques.forEach(function (b) { S.cola = S.cola.then(function () { return crearUno(b, d, mes, uid); }); });
  }

  // Deja el parte en el mes de la nota donde ya está: solo cambia partes, las notas se quedan igual.
  function aMesNota(id) {
    var r = calcular(documento()), c = r.enOtra.filter(function (x) { return mesOtraNota(r, x) && (!id || x.parte.id === id); });
    if (!c.length) return;
    if (!id && !confirm('¿Pasar ' + plural(c.length) + ' al mes de la nota en la que están? Las notas no cambian.')) return;
    if (!confirmaFacturado(c.map(function (x) { return x.parte; }))) return;
    c.forEach(function (x) { var m = mesOtraNota(r, x); aPartes(x.parte, { mes_factura: m }, textoMes(m)); });
  }

  function fijarHuella() { var h = {}; CRUCE.bloquesDe(lineas).forEach(function (b) { if (b.ref) h[b.ref] = JSON.stringify(CRUCE.lineasParaPartes(b)); }); S.huella = h; }

  // Tras guardar: solo los partes cuyo bloque se ha tocado reciben las líneas, y solo si en partes están vacías.
  function trasGuardar() {
    var antes = S.huella; fijarHuella();
    if (!S.partes) return;
    var numero = documento().numero || '';
    CRUCE.bloquesDe(lineas).forEach(function (b) {
      if (!b.ref || antes[b.ref] === S.huella[b.ref]) return;
      var e = CRUCE.emparejar(b.ref, partesCruce()), ls = CRUCE.lineasParaPartes(b);
      if (e.tipo === 'exacto' && ls.length && CRUCE.puedeRellenar(e.partes[0])) aPartes(e.partes[0], { lineas_realizadas: ls }, 'Líneas traídas de la nota ' + numero);
    });
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
    if (q === 'enviada') {
      if (cruceDoc.enviada_multibett) delete cruceDoc.enviada_multibett; else cruceDoc.enviada_multibett = new Date().toISOString();
      guardarEnHistorial(); return pintar();
    }
    if (q === 'reintentar') {
      var pe = S.pendientes.filter(function (x) { return String(x.num) === b.dataset.num; })[0], pa = pe && parte(pe.id);
      if (!pa) return;
      return aPartes(pa, pe.cambios, pe.nota, pe.fase, true).then(function (bien) { if (bien) S.pendientes = S.pendientes.filter(function (x) { return x !== pe; }); pintar(); });
    }
    if (q === 'pasarImportes') return pasarImportes();
    if (q === 'aMesNota') return aMesNota(b.dataset.id);
    if (q === 'aMesNotaTodos') return aMesNota(null);
    if (q === 'crearParte' || q === 'crearTodos') {
      return crearPartes(calcular(documento()).noExisten.map(function (x) { return x.bloque; }).filter(function (bl) {
        return CRUCE.aseguradoraDe(bl.ref) && (q === 'crearTodos' || bl.ref === b.dataset.ref);
      }));
    }
    var p = parte(b.dataset.id), mes = CRUCE.mesDeNota(documento());
    if (!p) return;
    if (q === 'traer') return mover(b.dataset.nota, b.dataset.ref, p, mes, true);
    if (q === 'mover') return mover(b.dataset.nota, b.dataset.ref, p, b.dataset.mes, b.dataset.mes === mes);
    if (q === 'usarNota') return usarNota(p, b.dataset.ref);
    if (q === 'usarPartes') return usarPartes(p, b.dataset.ref);
    if (q === 'terminar') return terminar(p, mes);
    if (q === 'erratanota') return erratanota(p, b.dataset.ref);
    if (q === 'erratapartes') return erratapartes(p, b.dataset.ref);
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
      if (ev.target.dataset.cruce === 'otroMes') {
        var p = parte(ev.target.dataset.id), v = ev.target.value;
        // Mientras se teclea el año, el campo da valores como 0202-11.
        if (p && /^20\d{2}-\d{2}$/.test(v) && confirmaFacturado([p])) aPartes(p, { mes_factura: v }, textoMes(v));
        return;
      }
      if (ev.target.dataset.cruce !== 'mes') return;
      if (ev.target.value) cruceDoc.mes_factura = ev.target.value; else delete cruceDoc.mes_factura;
      pintar();
    });
    c.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && ev.target.dataset.cruce === 'pass') { ev.preventDefault(); entrar(c); } });
    document.addEventListener('change', alCambiarDocumento);
    setTimeout(pintar, 0);
  });

  root.CRUCE_PANEL = { pintar: pintar, trasGuardar: trasGuardar, alCargar: function () { fijarHuella(); S.msg = ''; pintar(); } };
})(window);
