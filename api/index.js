const express = require('express');
const { createClient } = require('redis'); // Cambiamos la librería aquí

const app = express();

// CONFIGURACIÓN DE CONEXIÓN
const client = createClient({
    url: process.env.REDIS_URL // Aquí usa tu redis:// de Vercel directamente
});

client.on('error', err => console.error('Redis Client Error', err));

// Conexión inicial (Vercel la maneja, pero esto asegura que esté lista)
async function connectRedis() {
    if (!client.isOpen) await client.connect();
}

app.use(express.static('public'));
app.use(express.json());

// --- RUTA 1: Registro de Socios ---
app.post('/api/registrar', async (req, res) => {
    const { nombre, dni, nacimiento, direccion, telefono } = req.body;

    if (!dni || !nombre) {
        return res.status(400).json({ error: "Faltan datos obligatorios" });
    }

    try {
        await connectRedis();
        const nuevoSocio = {
            nombre, dni, nacimiento, direccion, telefono,
            fechaPago: new Date().toISOString()
        };

        // Guardamos como string
        await client.set(`socio:${dni}`, JSON.stringify(nuevoSocio));
        res.status(201).json({ message: "Socio registrado con éxito" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error de conexión con la base de datos" });
    }
});

// --- RUTA 2: Check-in ---
app.get('/api/checkin/:dni', async (req, res) => {
    const { dni } = req.params;
    
    try {
        await connectRedis();
        const data = await client.get(`socio:${dni}`);

        if (!data) return res.status(404).json({ message: "DNI no encontrado" });

        const socio = JSON.parse(data);
        const hoy = new Date();
        const vencimiento = new Date(socio.fechaPago);
        vencimiento.setDate(vencimiento.getDate() + 30);

        if (hoy > vencimiento) {
            res.json({ estado: "VENCIDO", message: `Cuota vencida el ${vencimiento.toLocaleDateString()}.` });
        } else {
            res.json({ estado: "OK", message: `¡Hola ${socio.nombre}! Acceso concedido.` });
        }
    } catch (error) {
        res.status(500).json({ error: "Error al consultar datos" });
    }
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
}

module.exports = app;