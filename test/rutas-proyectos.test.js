import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { rutasProyectos } from '../src/routes/proyectos.js';

// Repositorio en memoria con la misma interfaz que src/proyectos/repositorio.js.
function repoFalso() {
  const proyectos = [];
  const versiones = [];
  let id = 0;
  const de = (usuarioId, pid) => proyectos.find((p) => p.id === pid && p.usuario_id === usuarioId);
  return {
    async listar(usuarioId) {
      return proyectos.filter((p) => p.usuario_id === usuarioId).map((p) => ({ ...p, versiones: versiones.filter((v) => v.proyecto_id === p.id).length }));
    },
    async crear(usuarioId, nombre, version) {
      const p = { id: ++id, usuario_id: usuarioId, nombre };
      proyectos.push(p);
      const v = { id: ++id, proyecto_id: p.id, base_id: null, ...version };
      versiones.push(v);
      return { ...p, versiones: [v] };
    },
    async obtener(usuarioId, pid) {
      const p = de(usuarioId, pid);
      return p ? { ...p, versiones: versiones.filter((v) => v.proyecto_id === pid) } : null;
    },
    async renombrar(usuarioId, pid, nombre) {
      const p = de(usuarioId, pid);
      if (p) p.nombre = nombre;
      return p ?? null;
    },
    async eliminar(usuarioId, pid) {
      const i = proyectos.findIndex((p) => p.id === pid && p.usuario_id === usuarioId);
      if (i === -1) return false;
      proyectos.splice(i, 1);
      return true;
    },
    async agregarVersion(usuarioId, pid, version) {
      if (!de(usuarioId, pid)) return null;
      if (version.base_id !== null && !versiones.some((v) => v.id === version.base_id && v.proyecto_id === pid)) {
        return { baseInvalida: true };
      }
      const v = { id: ++id, proyecto_id: pid, ...version };
      versiones.push(v);
      return v;
    },
  };
}

async function levantar(repo, usuario = 1) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    req.usuario = { id: usuario };
    next();
  });
  app.use('/api/proyectos', rutasProyectos({ repo }));
  const servidor = await new Promise((ok) => {
    const s = app.listen(0, () => ok(s));
  });
  const base = `http://localhost:${servidor.address().port}/api/proyectos`;
  const pedir = async (metodo, ruta, cuerpo) => {
    const r = await fetch(base + ruta, { method: metodo, headers: { 'content-type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    return { estado: r.status, datos: r.status === 204 ? null : await r.json() };
  };
  return { pedir, cerrar: () => servidor.close() };
}

const version = { orden: 'una cafetería', tipo: 'crear', html: '<!DOCTYPE html><html><body>x</body></html>' };

test('crear, listar, abrir con todas sus versiones, renombrar y borrar', async (t) => {
  const s = await levantar(repoFalso());
  t.after(s.cerrar);
  const creado = await s.pedir('POST', '', { nombre: 'Café Pasto', version });
  assert.equal(creado.estado, 201);
  assert.equal(creado.datos.versiones.length, 1);
  const pid = creado.datos.id;
  const v1 = creado.datos.versiones[0].id;

  const v2 = await s.pedir('POST', `/${pid}/versiones`, { base_id: v1, orden: 'título azul', tipo: 'editar', html: version.html });
  assert.equal(v2.estado, 201);
  assert.equal(v2.datos.base_id, v1);

  assert.equal((await s.pedir('GET', '')).datos[0].versiones, 2);
  assert.equal((await s.pedir('GET', `/${pid}`)).datos.versiones.length, 2);
  assert.equal((await s.pedir('PATCH', `/${pid}`, { nombre: 'Café Real' })).datos.nombre, 'Café Real');
  assert.equal((await s.pedir('DELETE', `/${pid}`)).estado, 204);
  assert.equal((await s.pedir('GET', `/${pid}`)).estado, 404);
});

test('valida con Zod: nombre, orden, tipo y tamaño del HTML', async (t) => {
  const s = await levantar(repoFalso());
  t.after(s.cerrar);
  for (const malo of [
    { nombre: '', version },
    { nombre: 'x'.repeat(121), version },
    { nombre: 'x', version: { ...version, tipo: 'borrar' } },
    { nombre: 'x', version: { ...version, orden: '' } },
    { nombre: 'x', version: { ...version, html: 'x'.repeat(150_001) } },
    { nombre: 'x' },
  ]) {
    const r = await s.pedir('POST', '', malo);
    assert.equal(r.estado, 400, JSON.stringify(malo).slice(0, 80));
    assert.ok(r.datos.error);
  }
});

test('una versión con una base de otro proyecto es 400', async (t) => {
  const repo = repoFalso();
  const s = await levantar(repo);
  t.after(s.cerrar);
  const a = (await s.pedir('POST', '', { nombre: 'A', version })).datos;
  const b = (await s.pedir('POST', '', { nombre: 'B', version })).datos;
  const r = await s.pedir('POST', `/${b.id}/versiones`, { base_id: a.versiones[0].id, orden: 'x', tipo: 'editar', html: version.html });
  assert.equal(r.estado, 400);
});

test('un proyecto ajeno responde 404, igual que uno inexistente; un id inválido, 400', async (t) => {
  const repo = repoFalso();
  const duena = await levantar(repo, 1);
  t.after(duena.cerrar);
  const p = (await duena.pedir('POST', '', { nombre: 'Mío', version })).datos;
  const otra = await levantar(repo, 2);
  t.after(otra.cerrar);
  assert.equal((await otra.pedir('GET', `/${p.id}`)).estado, 404);
  assert.equal((await otra.pedir('DELETE', `/${p.id}`)).estado, 404);
  assert.equal((await otra.pedir('POST', `/${p.id}/versiones`, { base_id: null, orden: 'x', tipo: 'editar', html: 'x' })).estado, 404);
  assert.equal((await otra.pedir('GET', '/abc')).estado, 400);
  assert.equal((await otra.pedir('GET', '')).datos.length, 0);
});
