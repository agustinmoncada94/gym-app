const express = require('express');
const { kv } = require('@vercel/kv');
const app = express();
app.use(express.static('public'));
// Esto permite que tu servidor entienda cuando le envías datos en formato JSON
app.use(express.json());

// --- RUTA 1: Registro de Socios (Para el Admin) ---
app.post('/api/registrar', async (req, res) => {
    const { nombre, dni, nacimiento, direccion, telefono } = req.body;

    const nuevoSocio = {
        nombre,
        dni,
        nacimiento,
        direccion,
        telefono,
        fechaPago: new Date().toISOString(), // Fecha de hoy
        activo: true
    };

    try {
        // Guardamos en la base de datos de Vercel
        await kv.set(`socio:${dni}`, nuevoSocio);
        res.status(201).json({ mensaje: "Socio registrado con éxito" });
    } catch (error) {
        res.status(500).json({ error: "Error al guardar en la base de datos" });
    }
});

// --- RUTA 2: Check-in (Para el Usuario) ---
app.get('/api/checkin/:dni', async (req, res) => {
    const { dni } = req.params;
    
    try {
        const socio = await kv.get(`socio:${dni}`);

        if (!socio) {
            return res.status(404).json({ mensaje: "DNI no encontrado" });
        }

        // Lógica de 30 días
        const hoy = new Date();
        const fechaPago = new Date(socio.fechaPago);
        const vencimiento = new Date(fechaPago);
        vencimiento.setDate(vencimiento.getDate() + 30);

        if (hoy > vencimiento) {
            res.json({ estado: "VENCIDO", mensaje: "Tu cuota ha vencido." });
        } else {
            res.json({ estado: "OK", mensaje: `¡Hola ${socio.nombre}! Acceso concedido.` });
        }
    } catch (error) {
        res.status(500).json({ error: "Error al consultar datos" });
    }
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor listo en http://localhost:${PORT}`);
});

module.exports = app;