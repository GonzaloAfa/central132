# Central132

Herramientas para operar con el sistema de despacho de emergencias [central132.cl](https://central132.cl).

## Estructura

```
extensions/chrome/   Extensión de Chrome para traducir claves radiales
frontend/            (próximamente) Interfaz web
backend/             Lambda + Supabase para recolección de datos
```

## Extensión de Chrome

Traduce claves radiales en los popups de central132.cl a lenguaje ciudadano.

Ver [extensions/chrome/README.md](extensions/chrome/README.md) para instalación y detalles.

## Backend

Lambda (Python) que consulta la API de central132.cl cada 15 minutos y almacena incidentes en Supabase (PostgreSQL + PostGIS). Guarda el dato raw completo + campos extraídos para consultas directas, con historial de cambios cuando se actualizan los carros despachados.

### Setup

1. Crear proyecto en [Supabase](https://supabase.com) y ejecutar `backend/sql/schema.sql`.
2. Configurar variables de entorno en Lambda: `SUPABASE_HOST`, `SUPABASE_PASSWORD`, `SUPABASE_PORT` (6543).
3. Deployar `backend/lambda_function.py` con dependencias de `backend/requirements.txt`.
4. Crear regla EventBridge: `rate(15 minutes)` apuntando a la Lambda.
