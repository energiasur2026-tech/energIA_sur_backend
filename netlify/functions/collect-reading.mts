import type { Config } from '@netlify/functions';

/**
 * Recolector programado del medidor.
 *
 * Corre cada 5 minutos en la infraestructura de Netlify, con independencia de
 * que alguien tenga el sitio abierto. Sin esto, el histórico solo crecería
 * mientras hubiera un navegador sondeando.
 *
 * No lee el medidor por su cuenta: invoca el endpoint de la app, que ya
 * concentra la lógica de lectura y persistencia. Así hay una sola
 * implementación, y esta función no necesita las credenciales de Tuya ni de
 * Supabase — solo el secreto compartido.
 */
const collectReading = async () => {
  const secret = process.env.COLLECTOR_SECRET;
  // URL la define Netlify con la dirección del sitio publicado.
  const siteUrl = process.env.URL;

  if (!secret || !siteUrl) {
    console.error('[collect-reading] Falta COLLECTOR_SECRET o URL en el entorno.');
    return;
  }

  try {
    const response = await fetch(`${siteUrl}/api/meter/collect`, {
      method: 'POST',
      headers: { 'x-collector-secret': secret },
    });

    if (!response.ok) {
      console.error(`[collect-reading] El endpoint respondió HTTP ${response.status}.`);
      return;
    }

    const result = await response.json();
    const failed = (result.results ?? []).filter(
      (r: { persisted: string }) => r.persisted === 'failed'
    ).length;
    console.log(
      `[collect-reading] ${result.meters} medidor(es) · ${result.collected} evaluado(s) · ` +
        `${result.skipped} sin cumplir su intervalo · ${failed} fallido(s)`
    );
  } catch (error) {
    console.error('[collect-reading] Falló la recolección:', error);
  }
};

export default collectReading;

export const config: Config = {
  schedule: '*/5 * * * *',
};
