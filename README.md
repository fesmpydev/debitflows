# ◈ DebtFlow — Control de Deudas Mensuales

> Aplicación web para registrar, monitorear y optimizar tus deudas mensuales. Sin dependencias externas. Sin backend. 100% en el navegador.

![HTML](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)

---

## ✦ Funcionalidades

| Módulo | Descripción |
|--------|-------------|
| **Dashboard** | Resumen visual de salario, comprometido, disponible y deudas próximas |
| **Registro de deudas** | Alta, edición y eliminación de deudas con categoría, monto, día de vencimiento y prioridad |
| **Control de pagos** | Marca deudas como pagadas; el saldo disponible se actualiza automáticamente |
| **Alertas** | Notificaciones del navegador (Push API) a 7 días, 3 días y el mismo día del vencimiento |
| **Recomendaciones** | Clasificador automático de gastos innecesarios basado en prioridad y categoría |
| **Configuración** | Moneda, salario, exportar/importar datos JSON, reiniciar mes |

---

## 🗂 Estructura del proyecto

```
debt-tracker/
├── index.html   — Markup semántico, vistas, modales
├── styles.css   — Design tokens, componentes, responsive
├── app.js       — Lógica: estado, CRUD, renderizado, notificaciones
└── README.md
```

---

## 💾 Almacenamiento

Todos los datos se guardan en `localStorage` del navegador. No se envía ningún dato a servidores externos.

Claves usadas:
- `debtflow_debts` — lista de deudas
- `debtflow_salary` — salario mensual
- `debtflow_settings` — preferencias (moneda, alertas)
- `debtflow_alert_log` — historial de alertas

---

## 🔔 Notificaciones

La app usa la **Web Notifications API**. Para activarlas:
1. Ve a **Alertas** en el menú lateral.
2. Haz clic en **Solicitar permiso** y acepta en el navegador.
3. Las alertas se comprueban al cargar la app y cada hora automáticamente.

> Para producción se puede escalar a **Service Workers** + **Push API** con un backend mínimo (Node/Supabase) para notificaciones cuando la app está cerrada.

---

## 📐 Arquitectura del código

```
app.js
├── state          — Objeto central de estado
├── Storage        — Persistencia localStorage (CRUD)
├── Utils          — Formateo, cálculos de fechas, badges
├── Calc           — Métricas financieras derivadas
├── Toast          — Sistema de notificaciones in-app
├── Notifications  — Web Notifications API
├── Render         — Funciones de renderizado DOM
├── Modal          — Control de modales (deuda / salario)
├── Debts          — CRUD de deudas
├── Nav            — Navegación entre vistas
└── bindEvents()   — Event delegation centralizado
```

---

## 🗺 Roadmap (escalabilidad futura)

- [ ] Service Worker + PWA (installable, offline)
- [ ] Backend con Supabase (sync multi-dispositivo)
- [ ] Push Notifications reales (cuando app está cerrada)
- [ ] Gráficos de tendencia mensual
- [ ] Exportar a PDF / CSV
- [ ] Categorías personalizadas
- [ ] Multi-cuenta / usuarios

---

## 📄 Licencia

MIT — libre uso, modificación y distribución.
