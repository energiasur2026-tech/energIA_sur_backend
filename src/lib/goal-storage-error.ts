export class GoalStorageError extends Error {
  constructor(public code:string,message:string,public status=503){super(message);}
}

export function goalStorageError(error:{code?:string;message?:string}) {
  if(['42P01','42703','PGRST204','PGRST205'].includes(error.code??''))
    return new GoalStorageError('GOAL_SCHEMA_MISSING','Falta completar la tabla de objetivos personales en Supabase. Aplicá la migración 0019 o restore_personal_goals.sql. Tu objetivo anterior y el valor ingresado se conservan.');
  if(['42501','28000','PGRST301'].includes(error.code??''))
    return new GoalStorageError('GOAL_STORAGE_PERMISSION','El backend no tiene acceso para guardar el objetivo en Supabase. Revisá su configuración de acceso.');
  if(/fetch failed|network|eacces|timeout|timed out/i.test(error.message??''))
    return new GoalStorageError('GOAL_STORAGE_UNAVAILABLE','El servidor no pudo conectarse a Supabase para guardar el objetivo. Conservé el valor ingresado para reintentar.');
  return new GoalStorageError('GOAL_STORAGE_FAILED','No se pudo guardar el objetivo personal. Conservé el valor ingresado para reintentar.');
}
