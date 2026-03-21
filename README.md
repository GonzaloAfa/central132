# Central132

Herramientas para operar con el sistema de despacho de emergencias [central132.cl](https://central132.cl).

## Estructura

```
extensions/chrome/   Extensión de Chrome para traducir claves radiales
frontend/            (próximamente) Interfaz web
backend/             Lambda + MongoDB para recolección de datos
```

## Extensión de Chrome

Traduce claves radiales en los popups de central132.cl a lenguaje ciudadano.

Ver [extensions/chrome/README.md](extensions/chrome/README.md) para instalación y detalles.

## Backend

Lambda (TypeScript) que consulta la API de central132.cl cada 15 minutos y almacena incidentes en MongoDB Atlas. Guarda el documento GeoJSON completo con índices geoespaciales, con historial de cambios cuando se actualizan los carros despachados.

### Setup

1. Crear cluster en [MongoDB Atlas](https://www.mongodb.com/atlas) (free tier).
2. Configurar secret `MONGODB_URI` en GitHub Actions.
3. Push a `main` con cambios en `backend/` triggerea deploy automático a Lambda.
