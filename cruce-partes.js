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

  // Segunda sesión, contra el proyecto de Supabase de la app de partes. La contraseña no se guarda nunca.
  var CLAVE_SESION = 'mc_partes_session', TAM_BLOQUE = 1000;
  var COLUMNAS = 'id,updated_at,tipo,estado,expediente,direccion,poblacion,realizado_at,factura_ref,cierre,lineas_realizadas,lineas_autorizadas,lineas_valoracion,importe_autorizado,importe_valorado';
  function fallo(codigo) { var e = new Error(codigo); e.codigo = codigo; return e; }

  CRUCE.crearClientePartes = function (o) {
    var url = o.url, clave = o.clave, red = o.fetch, st = o.storage, ses = null;
    try { ses = JSON.parse(st.getItem(CLAVE_SESION) || 'null'); } catch (e) { ses = null; }

    function guardar(d) { ses = { access_token: d.access_token, refresh_token: d.refresh_token }; st.setItem(CLAVE_SESION, JSON.stringify(ses)); }
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
