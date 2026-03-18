const express = require('express');
// Cambiamos la forma de importar KV para configurar el cliente manualmente
const { createClient } = require('@vercel/kv');

const app = express();

// Configuración manual del cliente KV (Plan B)
const kv = createClient({
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
        // Usamos el cliente configurado arriba
        await kv.set(`socio:${dni}`, nuevoSocio);
        res.status(201).json({ message: "Socio registrado con éxito" });
    } catch (error) {
        console.error("Error detallado de KV:", error);
        res.status(500).json({ error: "Error de conexión con la base de datos KV" });
    }
});

// --- RUTA 2: Check-in ---
app.get('/api/checkin/:dni', async (req, res) => {
    const { dni } = req.params;
    
    try {
        const socio = await kv.get(`socio:${dni}`);

        if (!socio) {
            return res.status(404).json({ message: "DNI no encontrado" });
        }

        const hoy = new Date();
        const fechaPago = new Date(socio.fechaPago);
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
                message: `¡Hola ${socio.nombre}! Acceso concedido.` 
            });
        }
    } catch (error) {
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