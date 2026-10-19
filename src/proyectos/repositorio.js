import { pool } from '../db.js';

// Consultas de proyectos y versiones. Todas filtran por usuario_id (docs/base-de-datos.md).

const COLUMNAS_VERSION = 'id, proyecto_id, base_id, orden, tipo, html, creado_en';

export async function listar(usuarioId) {
  const { rows } = await pool.query(
    `SELECT p.id, p.nombre, p.creado_en, p.actualizado_en,
            COUNT(v.id)::int AS versiones,
            (SELECT orden FROM versiones WHERE proyecto_id = p.id ORDER BY id DESC LIMIT 1) AS ultima_orden
       FROM proyectos p LEFT JOIN versiones v ON v.proyecto_id = p.id
      WHERE p.usuario_id = $1
      GROUP BY p.id
      ORDER BY p.actualizado_en DESC, p.id DESC`,
    [usuarioId],
  );
  return rows;
}

export async function crear(usuarioId, nombre, version) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows: [proyecto] } = await cliente.query(
      'INSERT INTO proyectos (usuario_id, nombre) VALUES ($1, $2) RETURNING id, nombre, creado_en, actualizado_en',
      [usuarioId, nombre],
    );
    const { rows: [v] } = await cliente.query(
      `INSERT INTO versiones (proyecto_id, base_id, orden, tipo, html) VALUES ($1, NULL, $2, $3, $4) RETURNING ${COLUMNAS_VERSION}`,
      [proyecto.id, version.orden, version.tipo, version.html],
    );
    await cliente.query('COMMIT');
    return { ...proyecto, versiones: [v] };
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

export async function obtener(usuarioId, id) {
  const { rows: [proyecto] } = await pool.query(
    'SELECT id, nombre, creado_en, actualizado_en FROM proyectos WHERE id = $1 AND usuario_id = $2',
    [id, usuarioId],
  );
  if (!proyecto) return null;
  const { rows } = await pool.query(`SELECT ${COLUMNAS_VERSION} FROM versiones WHERE proyecto_id = $1 ORDER BY id`, [id]);
  return { ...proyecto, versiones: rows };
}

export async function renombrar(usuarioId, id, nombre) {
  const { rows } = await pool.query(
    'UPDATE proyectos SET nombre = $3, actualizado_en = NOW() WHERE id = $1 AND usuario_id = $2 RETURNING id, nombre, creado_en, actualizado_en',
    [id, usuarioId, nombre],
  );
  return rows[0] ?? null;
}

export async function eliminar(usuarioId, id) {
  const { rowCount } = await pool.query('DELETE FROM proyectos WHERE id = $1 AND usuario_id = $2', [id, usuarioId]);
  return rowCount > 0;
}

// null si el proyecto no es del usuario; { baseInvalida } si la base no es de este proyecto.
export async function agregarVersion(usuarioId, id, { base_id, orden, tipo, html }) {
  const { rows: [proyecto] } = await pool.query('SELECT id FROM proyectos WHERE id = $1 AND usuario_id = $2', [id, usuarioId]);
  if (!proyecto) return null;
  if (base_id !== null) {
    const { rowCount } = await pool.query('SELECT 1 FROM versiones WHERE id = $1 AND proyecto_id = $2', [base_id, id]);
    if (!rowCount) return { baseInvalida: true };
  }
  const { rows: [v] } = await pool.query(
    `INSERT INTO versiones (proyecto_id, base_id, orden, tipo, html) VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNAS_VERSION}`,
    [id, base_id, orden, tipo, html],
  );
  await pool.query('UPDATE proyectos SET actualizado_en = NOW() WHERE id = $1', [id]);
  return v;
}
