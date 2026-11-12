# Lectura y respuestas de Lumi

El guardia valida usuario y medidor antes de cada operación. El navegador no puede enviar contexto ni identidad. read recibe eventId y read booleano; label recibe eventId, labels y otherEquipment opcional. Se validan tipo, identificador, catálogo, exclusividad y longitud antes de llamar al servicio privado firmado. SQLite valida nuevamente pertenencia por usuario/medidor/evento.

Las mutaciones read/label no consultan mediciones ni ejecutan analítica: devuelven el snapshot actualizado. Así un guardado no depende de volver a analizar 60 días. Los errores no se presentan como éxito.

No hay variables nuevas ni SQL Supabase adicional. Desplegar el servicio Python actualizado con volumen SQLite durable, luego backend y frontend.

## Chat por intención

El backend realiza una preparación firmada en ML antes de leer mediciones. Los mensajes introductorios o que requieren aclaración devuelven snapshot de conversación sin consultar getLumiReadings/getLatestReading. Solo ante needsReadings=true obtiene las mediciones y completa el turno. El contrato público rechaza prepare, contexto e identidad enviados por el cliente. La selección del medidor se verifica en cada solicitud.

## Memoria y conocimiento v2
Acciones adicionales: memory (list/update/delete, id y text acotados), supplyProfile (enums declarados), recommendation (kettle-water, adopted). requireMeter sigue resolviendo identidad y permisos antes de cada acción. La evidencia, memoria y contexto están vinculados al usuario y medidor autorizados. Ver el informe IMPLEMENTATION-v2.md del proyecto ML.
