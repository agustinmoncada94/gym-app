const express = require('express');
const { createClient } = require('redis');

const app = express();
app.use(express.json());

// CONFIGURACIÓN PARA REDIS CLOUD
const client = createClient({
    url: process.env.REDIS_URL,
    socket: {
        reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
        connectTimeout: 10000
    }
});

client.on('error', err => console.error('Redis Error:', err));

async function conectar() {
    if (!client.isOpen) {
        try {
            await client.connect();
            console.log("Conectado a Redis Cloud");
        } catch (err) {
            console.error("Error al conectar Redis:", err);
        }
    }
}

// RUTA: LISTAR TODOS
app.get('/api/socios/todos', async (req, res) => {
    try {
        await conectar();
        const keys = await client.keys('socio:*');
        if (!keys || keys.length === 0) return res.json([]);

        const socios = await Promise.all(
            keys.map(async (key) => {
                const data = await client.get(key);
                return JSON.parse(data);
            })
        );
        
        socios.sort((a, b) => a.nombre.localeCompare(b.nombre));
        res.json(socios);
    } catch (error) {
        res.status(500).json({ error: "Error en el servidor", detalle: error.message });
    }
});

// RUTA: REGISTRAR
app.post('/api/registrar', async (req, res) => {
    try {
        await conectar();
        const socio = req.body;
        socio.fechaPago = new Date().toISOString();
        await client.set(`socio:${socio.dni}`, JSON.stringify(socio));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Error al registrar" });
    }
});

// RUTA: ELIMINAR
app.delete('/api/socios/:dni', async (req, res) => {
    try {
        await conectar();
        await client.del(`socio:${req.params.dni}`);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Error al eliminar" });
    }
});

module.exports = app;