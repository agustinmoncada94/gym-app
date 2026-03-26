const express = require('express');
const { createClient } = require('redis');
const app = express();
app.use(express.json());

const client = createClient({
    url: process.env.REDIS_URL
});

client.on('error', err => console.log('Redis Error:', err));

async function conectar() {
    if (!client.isOpen) await client.connect();
}

// --- RUTA QUE YA TE FUNCIONABA (Check-in) ---
app.get('/api/checkin/:dni', async (req, res) => {
    try {
        await conectar();
        const data = await client.get(`socio:${req.params.dni}`);
        if (!data) return res.status(404).json({ message: "No encontrado" });
        
        const socio = JSON.parse(data);
        res.json({
            estado: "OK",
            message: `¡Hola ${socio.nombre}! Acceso concedido.`
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- RUTAS NUEVAS PARA EL ADMINISTRADOR ---

// Obtener todos para la tabla
app.get('/api/socios/todos', async (req, res) => {
    try {
        await conectar();
        const keys = await client.keys('socio:*');
        if (!keys.length) return res.json([]);
        const socios = await Promise.all(keys.map(async k => JSON.parse(await client.get(k))));
        res.json(socios.sort((a, b) => a.nombre.localeCompare(b.nombre)));
    } catch (e) { res.status(500).json({ error: "Error en base de datos" }); }
});

// Registrar nuevo (con todos los campos)
app.post('/api/registrar', async (req, res) => {
    try {
        await conectar();
        const socio = req.body;
        // Guardamos el objeto completo (nombre, dni, nacimiento, direccion, telefono)
        await client.set(`socio:${socio.dni}`, JSON.stringify(socio));
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Error al guardar" }); }
});

// Borrar socio
app.delete('/api/socios/:dni', async (req, res) => {
    try {
        await conectar();
        await client.del(`socio:${req.params.dni}`);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Error al borrar" }); }
});

module.exports = app;