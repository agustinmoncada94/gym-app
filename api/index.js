const express = require('express');
const { createClient } = require('redis');

const app = express();

// CONFIGURACIÓN DE REDIS
const client = createClient({
    url: process.env.REDIS_URL,
    socket: {
        connectTimeout: 10000
    }
});

client.on('error', err => console.error('Redis Client Error', err));

async function connectRedis() {
    if (!client.isOpen) {
        await client.connect();
    }
}

app.use(express.static('public'));
app.use(express.json());

// --- RUTA: REGISTRAR SOCIO ---
app.post('/api/registrar', async (req, res) => {
    const { nombre, dni, nacimiento, direccion, telefono } = req.body;
    if (!dni || !nombre) return res.status(400).json({ error: "Faltan datos" });

    try {
        await connectRedis();
        const nuevoSocio = {
            nombre, dni, nacimiento, direccion, telefono,
            fechaPago: new Date().toISOString()
        };
        await client.set(`socio:${dni}`, JSON.stringify(nuevoSocio));
        res.status(201).json({ message: "Socio registrado con éxito" });
    } catch (error) {
        res.status(500).json({ error: "Error en el servidor" });
    }
});

// --- RUTA: OBTENER TODOS LOS SOCIOS (La que estaba fallando) ---
app.get('/api/socios/todos', async (req, res) => {
    try {
        await connectRedis();
        const keys = await client.keys('socio:*');
        
        if (!keys || keys.length === 0) return res.json([]);

        const socios = await Promise.all(
            keys.map(async (key) => {
                const data = await client.get(key);
                return JSON.parse(data);
            })
        );

        // Ordenar por nombre
        socios.sort((a, b) => a.nombre.localeCompare(b.nombre));
        res.json(socios);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener socios" });
    }
});

// --- RUTA: ELIMINAR SOCIO ---
app.delete('/api/socios/:dni', async (req, res) => {
    try {
        await connectRedis();
        await client.del(`socio:${req.params.dni}`);
        res.json({ message: "Socio eliminado" });
    } catch (error) {
        res.status(500).json({ error: "Error al eliminar" });
    }
});

// --- RUTA: CHECK-IN (Pantalla Socio) ---
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
        res.status(500).json({ error: "Error en check-in" });
    }
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
}

module.exports = app;