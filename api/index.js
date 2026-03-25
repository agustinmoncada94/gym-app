const express = require('express');
const { createClient } = require('redis');

const app = express();

// CONFIGURACIÓN DE CONEXIÓN
const client = createClient({
    url: process.env.REDIS_URL
});

client.on('error', err => console.error('Redis Client Error', err));

async function connectRedis() {
    if (!client.isOpen) await client.connect();
}

app.use(express.static('public'));
app.use(express.json());

// --- RUTA 1: Registro de Socios ---
app.post('/api/registrar', async (req, res) => {
    const { nombre, dni, nacimiento, direccion, telefono } = req.body;
    if (!dni || !nombre) return res.status(400).json({ error: "Faltan datos obligatorios" });

    try {
        await connectRedis();
        const nuevoSocio = {
            nombre, dni, nacimiento, direccion, telefono,
            fechaPago: new Date().toISOString()
        };
        await client.set(`socio:${dni}`, JSON.stringify(nuevoSocio));
        res.status(201).json({ message: "Socio registrado con éxito" });
    } catch (error) {
        res.status(500).json({ error: "Error de conexión" });
    }
});

// --- NUEVA RUTA: Obtener todos los socios (Para la pestaña Socios) ---
app.get('/api/socios/todos', async (req, res) => {
    try {
        await connectRedis();
        // Buscamos todas las llaves que empiezan con "socio:"
        const keys = await client.keys('socio:*');
        
        if (keys.length === 0) return res.json([]);

        // Traemos los datos de cada llave encontrada
        const socios = await Promise.all(
            keys.map(async (key) => {
                const data = await client.get(key);
                return JSON.parse(data);
            })
        );

        // Los ordenamos por nombre para que la lista se vea pro
        socios.sort((a, b) => a.nombre.localeCompare(b.nombre));
        
        res.json(socios);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener la lista" });
    }
});

// --- NUEVA RUTA: Eliminar Socio ---
app.delete('/api/socios/:dni', async (req, res) => {
    try {
        await connectRedis();
        await client.del(`socio:${req.params.dni}`);
        res.json({ message: "Socio eliminado" });
    } catch (error) {
        res.status(500).json({ error: "Error al eliminar" });
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
// Comentario para forzar subida