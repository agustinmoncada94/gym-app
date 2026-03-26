const express = require('express');
const { createClient } = require('redis');
const app = express();

app.use(express.json());

const client = createClient({
    url: process.env.REDIS_URL,
    socket: {
        reconnectStrategy: retries => Math.min(retries * 50, 500)
    }
});

client.on('error', err => console.error('Redis Error:', err));

async function conectar() {
    try {
        if (!client.isOpen) await client.connect();
    } catch (e) {
        console.error("Error conexión:", e);
    }
}

app.get('/api/socios/todos', async (req, res) => {
    try {
        await conectar();
        const keys = await client.keys('socio:*');
        const socios = await Promise.all(
            keys.map(async (key) => JSON.parse(await client.get(key)))
        );
        res.json(socios.sort((a, b) => a.nombre.localeCompare(b.nombre)));
    } catch (error) {
        res.status(500).json({ error: "Fallo Redis" });
    }
});

app.post('/api/registrar', async (req, res) => {
    try {
        await conectar();
        const socio = req.body;
        socio.fechaPago = new Date().toISOString();
        await client.set(`socio:${socio.dni}`, JSON.stringify(socio));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Fallo al guardar" });
    }
});

app.delete('/api/socios/:dni', async (req, res) => {
    try {
        await conectar();
        await client.del(`socio:${req.params.dni}`);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Fallo al borrar" });
    }
});

module.exports = app;