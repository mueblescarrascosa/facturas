/* Cruce entre las notas mensuales de Multibett y la app de partes.
   Lógica sin pantalla: todo cuelga de window.CRUCE. Si este archivo falla, la app de facturas sigue igual. */
(function (root) {
  'use strict';
  var CRUCE = root.CRUCE || {};

  var MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  CRUCE.MESES = MESES;

  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function lista(v) { return Array.isArray(v) ? v : []; }

  CRUCE.normRef = function (s) { return String(s === null || s === undefined ? '' : s).replace(/\s+/g, '').toUpperCase(); };

  // Un solo carácter de diferencia (cambiado, de más o de menos). Con menos de 6 caracteres no se considera errata.
  CRUCE.casiIgual = function (a, b) {
    a = CRUCE.normRef(a); b = CRUCE.normRef(b);
    if (a === b || a.length < 6 || b.length < 6 || Math.abs(a.length - b.length) > 1) return false;
    var i = 0, j = 0, fallos = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++fallos > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return true;
  };

  // Igual que importeLineaNum de index.html.
  CRUCE.baseLinea = function (l) {
    var d = num(l && l.dto); if (d < 0) d = 0; if (d > 100) d = 100;
    return num(l && l.cant) * num(l && l.precio) * (1 - d / 100);
  };

  // Un parte en la nota = la línea con referencia y las siguientes hasta la próxima referencia.
  CRUCE.bloquesDe = function (lineas) {
    var out = [], actual = null;
    lista(lineas).forEach(function (l, i) {
      var ref = CRUCE.normRef(l && l.refParte);
      if (!actual || ref) {
        actual = { ref: ref, refOriginal: (l && l.refParte) || '', dir: (l && l.dirParte) || '', inicio: i, fin: i, lineas: [], base: 0 };
        out.push(actual);
      }
      actual.lineas.push(l); actual.fin = i + 1; actual.base += CRUCE.baseLinea(l);
    });
    out.forEach(function (b) { b.base = r2(b.base); });
    return out;
  };

  CRUCE.mesDeNota = function (doc) {
    if (!doc) return null;
    if (doc.mes_factura) return doc.mes_factura;
    var palabra = String(doc.referencia || '').trim().toUpperCase().split(/\s+/)[0], m = MESES.indexOf(palabra), an = String(doc.fecha || '').slice(0, 4);
    if (m < 0 || !/^\d{4}$/.test(an)) return null;
    return an + '-' + (m < 9 ? '0' : '') + (m + 1);
  };
  // Una factura repite las líneas de su nota: no cuenta como otra nota del mes.
  CRUCE.esNotaMultibett = function (doc) { return !!doc && doc.tipo !== 'FACTURA' && /multibet/i.test(doc.cliente_nombre || '') && CRUCE.mesDeNota(doc) !== null; };

  CRUCE.mesEfectivo = function (p) {
    if (!p) return '';
    if (p.mes_factura) return p.mes_factura;
    if (!p.realizado_at) return '';
    return new Date(p.realizado_at).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(0, 7);
  };
  CRUCE.esFacturable = function (p) { return !!p && p.tipo !== 'conexion' && !p.borrado_at && !(p.cierre && !p.cierre.facturar); };
  CRUCE.estaTerminado = function (p) { return !!p && p.estado === 'realizado'; };

  CRUCE.lineasDeParte = function (p) {
    if (p && lista(p.lineas_realizadas).length) return p.lineas_realizadas;
    if (p && lista(p.lineas_autorizadas).length) return p.lineas_autorizadas;
    if (p && lista(p.lineas_valoracion).length) return p.lineas_valoracion;
    return [];
  };

  function baseLineasParte(ls) {
    return r2(lista(ls).reduce(function (s, l) { return s + num(l.cantidad) * num(l.precio) * (1 - num(l.dto) / 100); }, 0));
  }
  // Mismo orden que importeParte de la app de partes.
  CRUCE.importeParte = function (p) {
    if (p.cierre) return p.cierre.facturar ? baseLineasParte(p.lineas_realizadas) : 0;
    if (lista(p.lineas_autorizadas).length) return baseLineasParte(p.lineas_autorizadas);
    if (p.importe_autorizado !== null && p.importe_autorizado !== undefined) return Number(p.importe_autorizado);
    if (lista(p.lineas_realizadas).length) return baseLineasParte(p.lineas_realizadas);
    if (lista(p.lineas_valoracion).length) return baseLineasParte(p.lineas_valoracion);
    if (p.importe_valorado !== null && p.importe_valorado !== undefined) return Number(p.importe_valorado);
    return null;
  };

  CRUCE.emparejar = function (ref, partes) {
    var r = CRUCE.normRef(ref);
    if (!r) return { tipo: 'ninguno', partes: [] };
    var vivos = lista(partes).filter(function (p) { return !p.borrado_at; });
    var exactos = vivos.filter(function (p) { return CRUCE.normRef(p.expediente) === r; });
    if (exactos.length === 1) return { tipo: 'exacto', partes: exactos };
    if (exactos.length > 1) return { tipo: 'varios', partes: exactos };
    var casi = vivos.filter(function (p) { return CRUCE.casiIgual(p.expediente, r); });
    return casi.length ? { tipo: 'errata', partes: casi } : { tipo: 'ninguno', partes: [] };
  };

  // Bloques con referencia de una nota; si una referencia sale dos veces, se juntan.
  function bloquesConRef(nota) {
    var porRef = {}, out = [];
    CRUCE.bloquesDe(nota.lineas).forEach(function (b) {
      if (!b.ref) return;
      if (porRef[b.ref]) { porRef[b.ref].base = r2(porRef[b.ref].base + b.base); porRef[b.ref].lineas = porRef[b.ref].lineas.concat(b.lineas); return; }
      porRef[b.ref] = b; out.push(b);
    });
    return out;
  }

  CRUCE.cruzar = function (o) {
    var nota = o.nota, partes = lista(o.partes), mes = CRUCE.mesDeNota(nota);
    var ign = {}; lista(o.ignoradas).forEach(function (x) { ign[CRUCE.normRef(x)] = 1; });
    var r = { mes: mes, coinciden: [], faltan: [], enOtra: [], pendientesMover: [], sinTerminar: [], erratas: [], varios: [], noExisten: [], diferencias: [] };
    var enEsta = {}, enOtras = {};

    lista(o.notas).forEach(function (n) {
      if (n === nota || (n.id !== undefined && n.id !== null && n.id === nota.id) || !CRUCE.esNotaMultibett(n)) return;
      bloquesConRef(n).forEach(function (b) {
        var e = CRUCE.emparejar(b.ref, partes);
        e.partes.forEach(function (p) { if (!enOtras[p.id]) enOtras[p.id] = { nota: n, bloque: b }; });
      });
    });

    bloquesConRef(nota).forEach(function (b) {
      if (ign[b.ref]) return;
      var e = CRUCE.emparejar(b.ref, partes), p = e.partes[0];
      e.partes.forEach(function (x) { enEsta[x.id] = 1; });
      if (e.tipo === 'ninguno') { r.noExisten.push({ bloque: b }); return; }
      if (e.tipo === 'errata') { r.erratas.push({ bloque: b, parte: p, partes: e.partes }); return; }
      if (e.tipo === 'varios') { r.varios.push({ bloque: b, partes: e.partes }); return; }
      if (p.mes_factura && p.mes_factura !== mes) { r.pendientesMover.push({ parte: p, nota: nota, bloque: b, mesDestino: p.mes_factura }); return; }
      if (CRUCE.estaTerminado(p)) r.coinciden.push({ bloque: b, parte: p, otroMes: CRUCE.mesEfectivo(p) !== mes });
      else r.sinTerminar.push({ bloque: b, parte: p });
      var imp = CRUCE.importeParte(p);
      if (imp !== null && Math.abs(imp - b.base) > 0.01) r.diferencias.push({ bloque: b, parte: p, basePartes: imp, baseNota: b.base });
    });

    if (mes) partes.forEach(function (p) {
      if (enEsta[p.id] || !CRUCE.esFacturable(p)) return;
      var donde = enOtras[p.id];
      if (p.mes_factura === mes && donde) { r.pendientesMover.push({ parte: p, nota: donde.nota, bloque: donde.bloque, mesDestino: mes }); return; }
      if (!CRUCE.estaTerminado(p) || CRUCE.mesEfectivo(p) !== mes) return;
      if (!donde) r.faltan.push(p);
      else if (!p.mes_factura) r.enOtra.push({ parte: p, nota: donde.nota, bloque: donde.bloque });
    });
    return r;
  };

  // Líneas para meter un parte en la nota. Solo la primera lleva referencia y dirección.
  CRUCE.bloqueDesdeParte = function (p, iva) {
    var dir = [p.direccion, p.poblacion].filter(function (x) { return x && String(x).trim(); }).join(', ');
    var txt = function (v) { return v === null || v === undefined || v === 0 ? '' : String(v); };
    var ls = CRUCE.lineasDeParte(p).map(function (l) {
      return { tipo: 'linea', cod: l.codigo || '', refParte: '', dirParte: '', desc: l.descripcion || '', cant: txt(l.cantidad), precio: txt(l.precio), dto: txt(l.dto), iva: iva };
    });
    if (!ls.length) ls = [{ tipo: 'linea', cod: '', refParte: '', dirParte: '', desc: '', cant: '', precio: '', dto: '', iva: iva }];
    ls[0].refParte = CRUCE.normRef(p.expediente); ls[0].dirParte = dir;
    return ls;
  };

  // Igual que calcTotales de index.html, para notas que no están abiertas.
  CRUCE.totalDoc = function (doc) {
    var ls = lista(doc.lineas), sub = ls.reduce(function (s, l) { return s + CRUCE.baseLinea(l); }, 0);
    var d = num(doc.descuento); if (d < 0) d = 0; if (d > 100) d = 100;
    var f = sub > 0 ? 1 - d / 100 : 1, general = doc.iva_pct === '' || doc.iva_pct === undefined || isNaN(parseFloat(doc.iva_pct)) ? 21 : parseFloat(doc.iva_pct);
    return ls.reduce(function (s, l) {
      var tipo = l.iva === undefined || l.iva === null ? general : parseFloat(l.iva);
      return s + CRUCE.baseLinea(l) * f * (1 + tipo / 100);
    }, 0);
  };

  function lineaVacia(l) { return l.tipo !== 'titulo' && !l.refParte && !l.dirParte && !l.desc && !l.cod && !l.cant && !l.precio; }
  CRUCE.lineaVacia = lineaVacia;

  // Dónde acaban de verdad las líneas de un parte dentro de su bloque.
  CRUCE.finParte = function (lineas, b) {
    var fin = b.inicio;
    while (fin < b.fin && lineas[fin].tipo !== 'titulo') fin++;
    while (fin > b.inicio + 1 && lineaVacia(lineas[fin - 1])) fin--;
    return fin;
  };

  // Saca de una nota todos los bloques de una referencia y los pone al final de la otra. Un título y las vacías del final no son del parte.
  CRUCE.moverBloque = function (origen, destino, ref) {
    var r = CRUCE.normRef(ref), bloques = CRUCE.bloquesDe(origen.lineas).filter(function (b) { return b.ref === r; });
    if (!bloques.length) throw new Error('No encuentro el parte ' + r + ' en la nota');
    var sale = {}, mueve = [];
    bloques.forEach(function (b) {
      var fin = CRUCE.finParte(origen.lineas, b);
      for (var i = b.inicio; i < fin; i++) { sale[i] = 1; mueve.push(origen.lineas[i]); }
    });
    var quedan = lista(destino.lineas).map(function (l) { return Object.assign({}, l); });
    while (quedan.length && lineaVacia(quedan[quedan.length - 1])) quedan.pop();
    var id = quedan.reduce(function (m, l) { return Math.max(m, num(l.id)); }, -1) + 1;
    var o = Object.assign({}, origen, { lineas: origen.lineas.filter(function (l, i) { return !sale[i]; }).map(function (l) { return Object.assign({}, l); }) });
    var d = Object.assign({}, destino, { lineas: quedan.concat(mueve.map(function (l) { return Object.assign({}, l, { id: id++ }); })) });
    o.total = CRUCE.totalDoc(o); d.total = CRUCE.totalDoc(d);
    return { origen: o, destino: d };
  };

  CRUCE.notasDelMes = function (notas, mes) { return lista(notas).filter(function (n) { return CRUCE.esNotaMultibett(n) && CRUCE.mesDeNota(n) === mes; }); };

  CRUCE.crearNotaMes = function (mes, p) {
    var n = { tipo: 'NOTA DE TRABAJO', estado: 'PENDIENTE', numero: '', fecha: mes + '-01', referencia: MESES[+mes.split('-')[1] - 1], lineas: [], imagenes: [], descuento: '', anticipo: '', observaciones: '', notas_internas: '', vinculo: null, total: 0 };
    ['cliente_nombre', 'cliente_dir', 'cliente_pob', 'cliente_nif', 'cliente_tel', 'cliente_num', 'cliente_email', 'idioma_pdf', 'iva_pct', 'forma_pago', 'texto_legal', 'validez_dias'].forEach(function (k) { n[k] = p[k]; });
    return n;
  };

  CRUCE.lineasParaPartes = function (b) {
    return lista(b.lineas).filter(function (l) { return (l.desc || l.cod || l.cant || l.precio) && l.tipo !== 'titulo'; })
      .map(function (l) { return { codigo: l.cod || '', descripcion: l.desc || '', cantidad: num(l.cant), precio: num(l.precio), dto: num(l.dto) }; });
  };
  CRUCE.puedeRellenar = function (p) { return !lista(p.lineas_realizadas).length && !p.factura_ref; };

  // Partes de esta nota cuyas líneas se pueden pasar a la app de partes: emparejados sin duda, vacíos allí y con importe aquí.
  CRUCE.candidatosRelleno = function (o) {
    var ign = {}; lista(o.ignoradas).forEach(function (x) { ign[CRUCE.normRef(x)] = 1; });
    var out = [];
    bloquesConRef(o.nota).forEach(function (b) {
      var e = CRUCE.emparejar(b.ref, o.partes), p = e.partes[0];
      if (ign[b.ref] || e.tipo !== 'exacto' || !b.base || !CRUCE.esFacturable(p) || !CRUCE.puedeRellenar(p)) return;
      out.push({ parte: p, bloque: b, lineas: CRUCE.lineasParaPartes(b) });
    });
    return out;
  };

  // La aseguradora sale de la forma del expediente. Lo que no encaje no se puede crear (texto libre, conexiones A…).
  CRUCE.aseguradoraDe = function (ref) {
    var r = CRUCE.normRef(ref);
    if (/^IM\d{6,}$/.test(r)) return 'Iris Global';
    if (/^V\d{6,}$/.test(r)) return 'Mapfre';
    if (/^91\d{5,}$/.test(r)) return 'Santalucía';
    if (/^AS\.\d/.test(r)) return 'Asyrep';
    return null;
  };

  // Alta de un parte ya hecho, a partir de su bloque en la nota.
  CRUCE.parteDesdeBloque = function (b, o) {
    var dia = String(o.fecha || '').indexOf(o.mes) === 0 ? o.fecha : o.mes + '-01';
    return { expediente: b.ref, aseguradora: CRUCE.aseguradoraDe(b.ref), tipo: 'siniestro', estado: 'realizado', realizado_at: dia + 'T12:00:00Z', mes_factura: o.mes, direccion: b.dir || null, lineas_realizadas: CRUCE.lineasParaPartes(b), creado_por: o.creado_por };
  };

  // Segunda sesión, contra el proyecto de Supabase de la app de partes. La contraseña no se guarda nunca.
  var CLAVE_SESION = 'mc_partes_session', TAM_BLOQUE = 1000;
  var COLUMNAS = 'id,updated_at,mes_factura,tipo,estado,expediente,direccion,poblacion,realizado_at,factura_ref,cierre,lineas_realizadas,lineas_autorizadas,lineas_valoracion,importe_autorizado,importe_valorado';
  function fallo(codigo) { var e = new Error(codigo); e.codigo = codigo; return e; }

  CRUCE.crearClientePartes = function (o) {
    var url = o.url, clave = o.clave, red = o.fetch, st = o.storage, ses = null;
    try { ses = JSON.parse(st.getItem(CLAVE_SESION) || 'null'); } catch (e) { ses = null; }

    function guardar(d) { ses = { access_token: d.access_token, refresh_token: d.refresh_token, user_id: d.user ? d.user.id : (ses && ses.user_id) }; st.setItem(CLAVE_SESION, JSON.stringify(ses)); }
    function olvidar() { ses = null; st.removeItem(CLAVE_SESION); }
    function cabeceras() { return { apikey: clave, Authorization: 'Bearer ' + ses.access_token, 'Content-Type': 'application/json' }; }

    function renovar() {
      return red(url + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: clave, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: ses.refresh_token }) })
        .then(function (r) { return r.json().then(function (d) { if (r.ok && d.access_token) { guardar(d); return true; } return false; }); });
    }
    // Una petición a la API con su sesión; si ha caducado, renueva y reintenta una sola vez.
    function pedir(ruta, op, reintento) {
      if (!ses) return Promise.reject(fallo('sin_sesion'));
      return red(url + ruta, Object.assign({}, op, { headers: Object.assign(cabeceras(), (op && op.headers) || {}) }))
        .catch(function () { throw fallo('red'); })
        .then(function (r) {
          if (r.status === 401 && !reintento) {
            return renovar().catch(function () { throw fallo('red'); }).then(function (bien) {
              if (bien) return pedir(ruta, op, true);
              olvidar(); throw fallo('sin_sesion');
            });
          }
          if (r.status === 401) { olvidar(); throw fallo('sin_sesion'); }
          if (r.status === 403) throw fallo('sin_permiso');
          if (!r.ok) throw fallo('red');
          return r.json();
        });
    }

    return {
      haySesion: function () { return !!(ses && ses.access_token); },
      // Las sesiones abiertas antes de guardar el usuario lo llevan dentro del token.
      usuario: function () {
        if (!ses) return null;
        if (ses.user_id) return ses.user_id;
        try { return JSON.parse(atob(ses.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub || null; } catch (e) { return null; }
      },
      crearParte: function (fila) {
        return pedir('/rest/v1/partes?select=' + COLUMNAS, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(fila) }).then(function (filas) { return filas[0]; });
      },
      salir: olvidar,
      entrar: function (email, password) {
        return red(url + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: clave, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, password: password }) })
          .then(function (r) {
            return r.json().then(function (d) {
              if (!r.ok || !d.access_token) return { ok: false, error: d.error_description || d.msg || 'Correo o contraseña incorrectos' };
              guardar(d);
              return pedir('/rest/v1/miembros?select=solo_lectura,es_admin&user_id=eq.' + encodeURIComponent(d.user.id)).then(function (filas) {
                if (filas[0] && !filas[0].solo_lectura) return { ok: true };
                olvidar();
                return { ok: false, error: 'Hace falta la cuenta de administrador de la app de partes' };
              });
            });
          })
          .catch(function () { olvidar(); return { ok: false, error: 'No hay conexión a internet' }; });
      },
      // Solo escribe si el parte sigue como se leyó; si otro lo cambió, no pisa nada.
      escribirParte: function (id, cambios, updated_at) {
        return pedir('/rest/v1/partes?select=' + COLUMNAS + '&id=eq.' + encodeURIComponent(id) + '&updated_at=eq.' + encodeURIComponent(updated_at), { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(cambios) })
          .then(function (filas) { return filas.length ? { ok: true, parte: filas[0] } : { ok: false, conflicto: true }; });
      },
      anotarEvento: function (parte_id, nota, estado) {
        return pedir('/rest/v1/eventos', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ parte_id: parte_id, nota: nota, estado: estado || null }) });
      },
      // Supabase corta cada consulta en 1.000 filas sin avisar: se lee por bloques.
      leerPartes: function () {
        var todas = [];
        function bloque(desde) {
          return pedir('/rest/v1/partes?select=' + COLUMNAS + '&borrado_at=is.null&order=id&limit=' + TAM_BLOQUE + '&offset=' + desde).then(function (filas) {
            todas = todas.concat(filas);
            return filas.length === TAM_BLOQUE ? bloque(desde + TAM_BLOQUE) : todas;
          });
        }
        return bloque(0).then(function (t) { if (!t.length) throw fallo('sin_permiso'); return t; });
      }
    };
  };

  root.CRUCE = CRUCE;
  if (typeof module !== 'undefined' && module.exports) module.exports = CRUCE;
})(typeof window !== 'undefined' ? window : globalThis);
