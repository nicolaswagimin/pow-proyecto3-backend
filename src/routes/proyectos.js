import { Router } from 'express';
import { z } from 'zod';
import * as repositorio from '../proyectos/repositorio.js';

// Proyectos del usuario con todas sus versiones (en árbol: cada versión guarda su base).
// Todo se filtra por usuario: uno ajeno responde 404, igual que uno inexistente.

export const MAX_HTML_VERSION = 150_000;

const esquemaVersion = z.object(
  {
    orden: z.string().trim().min(1, 'Cada versión necesita la orden que la creó.').max(2000, 'La orden es demasiado larga.'),
    tipo: z.enum(['crear', 'editar'], { message: 'El tipo de versión debe ser crear o editar.' }),
    html: z.string().min(1, 'Falta el HTML de la versión.').max(MAX_HTML_VERSION, 'La página supera 150 000 caracteres.'),
  },
  { message: 'Falta la versión.' },
);

const nombre = z.string().trim().min(1, 'El proyecto necesita un nombre.').max(120, 'El nombre puede tener hasta 120 caracteres.');
const esquemaCrear = z.object({ nombre, version: esquemaVersion });
const esquemaRenombrar = z.object({ nombre });
const esquemaNuevaVersion = esquemaVersion.extend({ base_id: z.number().int().positive().nullable() });

const NO_EXISTE = { error: 'Ese proyecto no existe o no es tuyo.' };

function validar(esquema, cuerpo, res) {
  const r = esquema.safeParse(cuerpo ?? {});
  if (r.success) return r.data;
  res.status(400).json({ error: r.error.issues[0].message });
  return null;
}

function idDe(req, res) {
  const id = Number(req.params.id);
  if (Number.isInteger(id) && id > 0) return id;
  res.status(400).json({ error: 'El id no es válido.' });
  return null;
}

export function rutasProyectos({ repo = repositorio } = {}) {
  const router = Router();
  const seguro = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ error: 'No se pudieron guardar los proyectos. Revisa la base de datos.' });
    }
  };

  router.get('/', seguro(async (req, res) => res.json(await repo.listar(req.usuario.id))));

  router.post('/', seguro(async (req, res) => {
    const datos = validar(esquemaCrear, req.body, res);
    if (datos) res.status(201).json(await repo.crear(req.usuario.id, datos.nombre, datos.version));
  }));

  router.get('/:id', seguro(async (req, res) => {
    const id = idDe(req, res);
    if (!id) return;
    const p = await repo.obtener(req.usuario.id, id);
    p ? res.json(p) : res.status(404).json(NO_EXISTE);
  }));

  router.patch('/:id', seguro(async (req, res) => {
    const id = idDe(req, res);
    const datos = id && validar(esquemaRenombrar, req.body, res);
    if (!datos) return;
    const p = await repo.renombrar(req.usuario.id, id, datos.nombre);
    p ? res.json(p) : res.status(404).json(NO_EXISTE);
  }));

  router.delete('/:id', seguro(async (req, res) => {
    const id = idDe(req, res);
    if (!id) return;
    (await repo.eliminar(req.usuario.id, id)) ? res.status(204).end() : res.status(404).json(NO_EXISTE);
  }));

  router.post('/:id/versiones', seguro(async (req, res) => {
    const id = idDe(req, res);
    const datos = id && validar(esquemaNuevaVersion, req.body, res);
    if (!datos) return;
    const v = await repo.agregarVersion(req.usuario.id, id, datos);
    if (!v) return res.status(404).json(NO_EXISTE);
    if (v.baseInvalida) return res.status(400).json({ error: 'La versión base no es de este proyecto.' });
    res.status(201).json(v);
  }));

  return router;
}
