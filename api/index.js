const express = require('express');
const { createClient } = require('redis');
const app = express();
app.use(express.json());

// Esto nos dirá en los logs de Vercel si la URL está llegando bien
console.log("Intentando conectar a:", process.env.REDIS_URL ? "URL detectada" : "URL NO DETECTADA");

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

app.get('/api/socios/todos', async (req, res) => {
    try {
        await conectar();
        const keys = await client.keys('socio:*');
        const socios = await Promise.all(keys.map(async k => JSON.parse(await client.get(k))));
        res.json(socios);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

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

// Incluimos la ruta de checkin que SI funciona para que todo esté en un solo lugar
app.get('/api/checkin/:dni', async (req, res) => {
    try {
        await conectar();
        const data = await client.get(`socio:${req.params.dni}`);
        if (!data) return res.status(404).json({ message: "No encontrado" });
        res.json({ estado: "OK", message: `¡Hola ${JSON.parse(data).nombre}!` });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
// RUTA PARA EDITAR (Es igual a registrar, pero pisa los datos existentes)
app.put('/api/socios/:dni', async (req, res) => {
    try {
        await conectar();
        const datosActualizados = req.body;
        // Usamos SET para sobreescribir el JSON del socio con los nuevos datos
        await client.set(`socio:${req.params.dni}`, JSON.stringify(datosActualizados));
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "No se pudo actualizar" });
    }
});
module.exports = app;