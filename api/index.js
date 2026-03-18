const express = require('express');
const { Redis } = require('@upstash/redis');

const app = express();

// Configuración corregida para usar las variables de entorno de Vercel
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

app.use(express.static('public'));
app.use(express.json());

// --- RUTA 1: Registro de Socios ---
app.post('/api/registrar', async (req, res) => {
    const { nombre, dni, nacimiento, direccion, telefono } = req.body;

    if (!dni || !nombre) {
        return res.status(400).json({ error: "Faltan datos obligatorios (Nombre y DNI)" });
    }

    const nuevoSocio = {
        nombre,
        dni,
        nacimiento,
        direccion,
        telefono,
        fechaPago: new Date().toISOString(),
        activo: true
    };

    try {
        // Guardamos el objeto como string JSON
        await redis.set(`socio:${dni}`, JSON.stringify(nuevoSocio));
        res.status(201).json({ message: "Socio registrado con éxito" });
    } catch (error) {
        console.error("Error Redis:", error);
        res.status(500).json({ error: "Error de conexión con la base de datos" });
    }
});

// --- RUTA 2: Check-in ---
app.get('/api/checkin/:dni', async (req, res) => {
    const { dni } = req.params;
    
    try {
        const socio = await redis.get(`socio:${dni}`);

        if (!socio) {
            return res.status(404).json({ message: "DNI no encontrado" });
        }

        // Si Redis devuelve un string, lo convertimos a objeto
        const datosSocio = typeof socio === 'string' ? JSON.parse(socio) : socio;

        const hoy = new Date();
        const fechaPago = new Date(datosSocio.fechaPago);
        const vencimiento = new Date(fechaPago);
        vencimiento.setDate(vencimiento.getDate() + 30);

        if (hoy > vencimiento) {
            res.json({ 
                estado: "VENCIDO", 
                message: `Cuota vencida el ${vencimiento.toLocaleDateString()}.` 
            });
        } else {
            res.json({ 
                estado: "OK", 
                message: `¡Hola ${datosSocio.nombre}! Acceso concedido.` 
            });
        }
    } catch (error) {
        console.error("Error Checkin:", error);
        res.status(500).json({ error: "Error al consultar datos" });
    }
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Servidor listo en http://localhost:${PORT}`);
    });
}

module.exports = app;