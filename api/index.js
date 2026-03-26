const express = require('express');
const { createClient } = require('redis');
const app = express();
app.use(express.json());

const client = createClient({
    url: process.env.REDIS_URL,
    socket: {
        connectTimeout: 10000,
        reconnectStrategy: retries => Math.min(retries * 100, 3000)
    }
});

client.on('error', err => console.error('Error de Redis:', err));

async function conectar() {
    if (!client.isOpen) await client.connect();
}

// OBTENER TODOS LOS SOCIOS (Para la tabla)
app.get('/api/socios/todos', async (req, res) => {
    try {
        await conectar();
        const keys = await client.keys('socio:*');
        const socios = await Promise.all(keys.map(async k => JSON.parse(await client.get(k))));
        res.json(socios.sort((a, b) => a.nombre.localeCompare(b.nombre)));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// REGISTRAR NUEVO SOCIO
app.post('/api/registrar', async (req, res) => {
    try {
        await conectar();
        const socio = req.body;
        await client.set(`socio:${socio.dni}`, JSON.stringify(socio));
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// EDITAR SOCIO EXISTENTE
app.put('/api/socios/:dni', async (req, res) => {
    try {
        await conectar();
        const datos = req.body;
        await client.set(`socio:${req.params.dni}`, JSON.stringify(datos));
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "No se pudo actualizar" });
    }
});

// ELIMINAR SOCIO
app.delete('/api/socios/:dni', async (req, res) => {
    try {
        await conectar();
        await client.del(`socio:${req.params.dni}`);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "No se pudo eliminar" });
    }
});

// CHECK-IN (Para la pantalla de entrada)
app.get('/api/checkin/:dni', async (req, res) => {
    try {
        await conectar();
        const data = await client.get(`socio:${req.params.dni}`);
        if (!data) return res.status(404).json({ message: "No encontrado" });
        const socio = JSON.parse(data);
        res.json({ estado: "OK", message: `¡Hola ${socio.nombre}!` });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = app;